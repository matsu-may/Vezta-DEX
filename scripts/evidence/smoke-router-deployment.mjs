import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { inspectDeploymentEvidence, ROUTER_ADDRESS } from "./router-deployment.mjs";

// Network reads only; --save persists public source/bytecode evidence, never RPC URL or credentials.
const artifact = new URL("../../.superpowers/sdd/2026-09-28-eoa-swap-preparation/router-deployment-public.json", import.meta.url);
const allowedErrors = ["INVALID_OPTION", "INVALID_RPC_URL", "NETWORK_UNAVAILABLE", "SOURCE_NOT_FOUND", "HTTP_UNAVAILABLE", "OVERSIZED_RESPONSE", "INVALID_DEPLOYMENT_EVIDENCE", "RPC_UNAVAILABLE", "RPC_CHAIN_MISMATCH", "RPC_SNAPSHOT_CHANGED", "RPC_STALE_BLOCK"];
let id = 0;

async function readJson(url, options = {}) {
  let response;
  try { response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) }); }
  catch { throw new Error("NETWORK_UNAVAILABLE"); }
  if (!response.ok) throw new Error(response.status === 404 ? "SOURCE_NOT_FOUND" : "HTTP_UNAVAILABLE");
  if (!response.body) throw new Error("INVALID_DEPLOYMENT_EVIDENCE");
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 4_000_000) { await reader.cancel(); throw new Error("OVERSIZED_RESPONSE"); }
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { reader.releaseLock(); }
}

try {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--save")) throw new Error("INVALID_OPTION");
  const env = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(env)) process.loadEnvFile(env);
  const rpcUrl = new URL(process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com");
  if (rpcUrl.protocol !== "https:" && !(rpcUrl.protocol === "http:" && ["localhost", "127.0.0.1"].includes(rpcUrl.hostname))) throw new Error("INVALID_RPC_URL");
  const rpc = async (method, params) => {
    const requestId = ++id;
    const body = await readJson(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }) });
    if (body?.id !== requestId || body.error || !Object.hasOwn(body, "result")) throw new Error("RPC_UNAVAILABLE");
    return body.result;
  };
  const chain = await rpc("eth_chainId", []);
  if (typeof chain !== "string" || !/^0x[0-9a-fA-F]+$/.test(chain) || BigInt(chain) !== 137n) throw new Error("RPC_CHAIN_MISMATCH");
  const block = await rpc("eth_getBlockByNumber", ["latest", false]);
  if (!block || !/^0x[0-9a-fA-F]+$/.test(block.number ?? "") || !/^0x[0-9a-fA-F]+$/.test(block.timestamp ?? "") || !/^0x[0-9a-fA-F]{64}$/.test(block.hash ?? "")) throw new Error("RPC_UNAVAILABLE");
  const time = Number(BigInt(block.timestamp)) * 1000;
  if (!Number.isSafeInteger(time) || time > Date.now() + 5000 || Date.now() - time > 120_000) throw new Error("RPC_STALE_BLOCK");
  const bytecode = await rpc("eth_getCode", [ROUTER_ADDRESS, block.number]);
  const rechecked = await rpc("eth_getBlockByNumber", [block.number, false]);
  if (rechecked?.hash !== block.hash) throw new Error("RPC_SNAPSHOT_CHANGED");
  const snapshot = { chainId: 137, address: ROUTER_ADDRESS, blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp, bytecode };
  const contract = await readJson(`https://sourcify.dev/server/v2/contract/137/${ROUTER_ADDRESS}?fields=all`);
  const summary = inspectDeploymentEvidence(contract, snapshot);
  if (args.includes("--save")) {
    mkdirSync(new URL(".", artifact), { recursive: true });
    writeFileSync(artifact, JSON.stringify({ recordedAt: new Date().toISOString(), rpcSnapshot: snapshot, sourcify: contract }, null, 2) + "\n");
  }
  process.stdout.write(JSON.stringify({ status: "evidence-read", ...summary, evidenceSaved: args.includes("--save") }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "unavailable", code: allowedErrors.includes(error?.message) ? error.message : "INVALID_DEPLOYMENT_EVIDENCE" }) + "\n");
  process.exitCode = 1;
}
