// Read-only Polygon fork preflight. Starts a disposable Anvil process and never sends a transaction.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { probeLpOnchain } from "./smoke-lp-onchain.mjs";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function inspectForkEvidence({ source, fork, clientVersion, poolVerified, now }) {
  const observedMs = Number(source?.timestamp) * 1000;
  return {
    sameChain: source?.chainId === 137 && fork?.chainId === 137,
    anvilClient: typeof clientVersion === "string" && /\banvil\b/i.test(clientVersion),
    sameBlockNumber: typeof source?.number === "bigint" && source.number > 0n && fork?.number === source.number,
    sameBlockHash: HASH.test(source?.hash ?? "") && HASH.test(fork?.hash ?? "")
      && source.hash.toLowerCase() === fork.hash.toLowerCase(),
    freshSource: Number.isSafeInteger(observedMs) && Number.isSafeInteger(now)
      && observedMs <= now + 5_000 && now - observedMs <= 120_000,
    poolVerified: poolVerified === true,
  };
}

async function unusedLocalPort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local port");
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

export async function probeLpForkPreflight({ rpcUrl, now = Date.now, write = line => process.stdout.write(line + "\n") }) {
  let stage = "configuration";
  let child;
  try {
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      throw new Error("Invalid upstream RPC");
    }
    const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
    const { createPublicClient, http } = require("viem");
    const { polygon } = require("viem/chains");
    stage = "upstream";
    const upstream = createPublicClient({ chain: polygon, transport: http(rpcUrl, { timeout: 8_000, retryCount: 0 }) });
    const chainId = await upstream.getChainId();
    if (chainId !== 137) throw new Error("Wrong chain");
    const sourceBlock = await upstream.getBlock({ blockTag: "latest" });
    if (typeof sourceBlock.number !== "bigint" || !HASH.test(sourceBlock.hash ?? "")) throw new Error("Invalid upstream block");
    const port = await unusedLocalPort();
    stage = "fork-start";
    child = spawn("anvil", ["--fork-url", rpcUrl, "--fork-block-number", sourceBlock.number.toString(),
      "--host", "127.0.0.1", "--port", String(port), "--quiet"], { stdio: "ignore" });
    let spawnError = false;
    child.on("error", () => { spawnError = true; });
    const fork = createPublicClient({ chain: polygon, transport: http(`http://127.0.0.1:${port}`, { timeout: 1_000, retryCount: 0 }) });
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (spawnError || child.exitCode !== null) break;
      try { await fork.getChainId(); ready = true; break; } catch { await pause(500); }
    }
    if (!ready) throw new Error("Anvil did not start");
    stage = "fork-read";
    const [forkChainId, forkBlock, clientVersion] = await Promise.all([
      fork.getChainId(), fork.getBlock({ blockTag: "latest" }), fork.request({ method: "web3_clientVersion" }),
    ]);
    const baseChecks = inspectForkEvidence({ source: { chainId, ...sourceBlock },
      fork: { chainId: forkChainId, ...forkBlock }, clientVersion, poolVerified: false, now: now() });
    if (Object.entries(baseChecks).some(([key, valid]) => key !== "poolVerified" && !valid)) {
      write(JSON.stringify({ status: "fork-read-only", blockNumber: sourceBlock.number.toString(), checks: baseChecks, verified: false }));
      return false;
    }
    stage = "pool";
    const poolVerified = await probeLpOnchain({ client: fork, now, write: () => {} });
    const checks = inspectForkEvidence({ source: { chainId, ...sourceBlock },
      fork: { chainId: forkChainId, ...forkBlock }, clientVersion, poolVerified, now: now() });
    const verified = Object.values(checks).every(Boolean);
    write(JSON.stringify({ status: "fork-read-only", blockNumber: sourceBlock.number.toString(), checks, verified }));
    return verified;
  } catch {
    write(JSON.stringify({ errorKind: "FORK_UNAVAILABLE", stage }));
    return false;
  } finally {
    if (child && child.exitCode === null) child.kill("SIGTERM");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const success = await probeLpForkPreflight({ rpcUrl: process.env.POLYGON_RPC_URL });
  if (!success) process.exitCode = 1;
}
