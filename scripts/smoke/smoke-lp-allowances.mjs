// Read-only Polygon allowance probe. It never prints allowances, RPC URLs or transaction data.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const MAX = (1n << 256n) - 1n;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const allowanceAbi = [{ type: "function", name: "allowance", stateMutability: "view",
  inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] }];
const allowanceValid = value => typeof value === "bigint" && value >= 0n && value <= MAX;
const kind = value => value === 0n ? "zero" : value === MAX ? "unlimited" : "finite";

export async function probeLpAllowances({ client, wallet, now = Date.now, write = line => process.stdout.write(line + "\n") }) {
  if (!ADDRESS.test(wallet ?? "")) {
    write(JSON.stringify({ errorKind: "NOT_CONFIGURED" }));
    return false;
  }
  let stage = "chain";
  try {
    if (await client.getChainId() !== 137) {
      write(JSON.stringify({ errorKind: "WRONG_CHAIN" }));
      return false;
    }
    stage = "block";
    const before = await client.getBlock({ blockTag: "latest" });
    if (typeof before.number !== "bigint" || before.number <= 0n || typeof before.timestamp !== "bigint" || !HASH.test(before.hash ?? "")) {
      throw new Error("Invalid Polygon block");
    }
    const timestampMs = Number(before.timestamp) * 1000;
    const fresh = () => {
      const checkedAt = now();
      return Number.isSafeInteger(timestampMs) && Number.isSafeInteger(checkedAt)
        && timestampMs <= checkedAt + 5_000 && checkedAt - timestampMs <= 120_000;
    };
    let blockFresh = fresh();
    let code = null;
    let usdc = null;
    let weth = null;
    let after = null;
    if (blockFresh) {
      stage = "account";
      code = await client.request({ method: "eth_getCode", params: [wallet, `0x${before.number.toString(16)}`] });
      if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new Error("Invalid account code");
      if (code === "0x") {
        stage = "allowances";
        [usdc, weth] = await Promise.all([USDC, WETH].map(address => client.readContract({
          address, abi: allowanceAbi, functionName: "allowance", args: [wallet, MANAGER], blockNumber: before.number,
        })));
      }
      stage = "confirmation";
      after = await client.getBlock({ blockNumber: before.number });
      blockFresh = fresh();
    }
    stage = "validation";
    const checks = {
      blockFresh,
      blockStable: Boolean(after && after.number === before.number && after.timestamp === before.timestamp
        && HASH.test(after.hash ?? "") && after.hash.toLowerCase() === before.hash.toLowerCase()),
      accountEoa: code === "0x",
      allowanceShapeValid: allowanceValid(usdc) && allowanceValid(weth),
    };
    const verified = Object.values(checks).every(Boolean);
    write(JSON.stringify({ chainId: 137, blockNumber: before.number.toString(), observedAt: new Date(timestampMs).toISOString(),
      checks, allowances: { USDC: allowanceValid(usdc) ? kind(usdc) : "unavailable",
        WETH: allowanceValid(weth) ? kind(weth) : "unavailable" },
      bothZero: verified && usdc === 0n && weth === 0n, verified }));
    return verified;
  } catch {
    write(JSON.stringify({ errorKind: "RPC_UNAVAILABLE", stage }));
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  let success = false;
  try {
    const rpcUrl = process.env.POLYGON_RPC_URL;
    if (!rpcUrl) throw new Error("No RPC URL");
    const url = new URL(rpcUrl);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid RPC URL");
    const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
    const { createPublicClient, http } = require("viem");
    const { polygon } = require("viem/chains");
    success = await probeLpAllowances({ client: createPublicClient({ chain: polygon, transport: http(rpcUrl, { timeout: 8_000, retryCount: 1 }) }),
      wallet: process.env.DEX_SMOKE_WALLET });
  } catch {
    process.stdout.write(JSON.stringify({ errorKind: "NOT_CONFIGURED" }) + "\n");
  }
  if (!success) process.exitCode = 1;
}
