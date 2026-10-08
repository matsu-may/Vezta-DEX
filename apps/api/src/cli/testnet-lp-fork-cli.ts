import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";
import { startOwnedTestnetAnvil } from "../tooling/fork/testnet-fork-process";
import { runTestnetLpFork } from "../tooling/fork/testnet-lp-fork-lifecycle";
import { forkAssert } from "../tooling/fork/testnet-fork";
import { parseBaseSepoliaRpcRps } from "../infrastructure/rpc/testnet-rpc-pacer";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 300000);
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
const report = (row: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(row)}\n`);
let stage = "upstream-read";
async function run() {
  // At 1–2 RPS the unchanged quote+preparation pipeline cannot fit the original 30s TTL.
  forkAssert(parseBaseSepoliaRpcRps(process.env.BASE_SEPOLIA_RPC_RPS) >= 3, "FORK_RPC_BUDGET_LOW");
  const url = process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org";
  const source = createBaseSepoliaPreflightSource(url, controller.signal);
  const [chain, block] = await Promise.all([source.getChainId(), source.getLatestBlock()]);
  const age = Date.now() - Number(block.timestamp) * 1000;
  forkAssert(chain === 84532 && block.number > 0n && /^0x[0-9a-fA-F]{64}$/.test(block.hash)
    && BigInt(block.hash) > 0n && age >= -10000 && age < 30000
    && (await source.getBlockHash(block.number)).toLowerCase() === block.hash.toLowerCase(), "FORK_UPSTREAM_INVALID");
  stage = "anvil-start";
  const fork = await startOwnedTestnetAnvil(controller.signal, { url, block: block.number });
  try {
    stage = "lifecycle";
    await runTestnetLpFork(fork, block, controller.signal, report);
  } finally { await fork.stop(); report({ stage: "owned-anvil-stopped", localOnly: true }); }
}
void run().catch(error => {
  const code = controller.signal.aborted ? "FORK_ABORTED" : error && typeof error === "object" && "code" in error
    && typeof error.code === "string" && /^(FORK|TESTNET)_[A-Z_]+$/.test(error.code) ? error.code : "FORK_UNAVAILABLE";
  report({ status: "testnet-lp-fork-unavailable", stage, code, executionEnabled: false });
  process.exitCode = 1;
}).finally(() => {
  clearTimeout(timer); controller.abort(); process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
});
