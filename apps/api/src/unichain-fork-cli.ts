import { TestnetRpcDiagnostics } from "./testnet-rpc-diagnostics";
import { existsSync } from "node:fs";
import { createTestnetChainSource } from "./base-sepolia-source";
import { startOwnedTestnetAnvil } from "./testnet-fork-process";
import { runTestnetForkLifecycle } from "./testnet-fork-lifecycle";
import { runTestnetLpWalletFork } from "./testnet-lp-wallet-fork-lifecycle";
import { forkAssert } from "./testnet-fork";
const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 900000);
const interrupt = () => controller.abort();
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
const report = (row: Record<string, unknown>) => process.stdout.write(`${JSON.stringify(row)}\n`);
let stage = "upstream-read";
const diagnostics = new TestnetRpcDiagnostics();
async function run() {
  const args = process.argv.slice(2);
  const lpOnly = args.length === 1 && args[0] === "--lp-only";
  if (args.length !== 0 && !lpOnly) throw new Error("Unexpected arguments");
  const url = process.env.UNICHAIN_SEPOLIA_RPC_URL?.trim() || "https://sepolia.unichain.org";
  const source = diagnostics.wrap(createTestnetChainSource(1301, url, controller.signal));
  const chain = await source.getChainId(), block = await source.getLatestBlock();
  const age = Date.now() - Number(block.timestamp) * 1000;
  forkAssert(chain === 1301 && block.number > 0n && /^0x[0-9a-fA-F]{64}$/.test(block.hash) && BigInt(block.hash) > 0n
    && age >= -10000 && age < 30000 && (await source.getBlockHash(block.number)).toLowerCase() === block.hash.toLowerCase(), "FORK_UPSTREAM_INVALID");
  stage = "anvil-start";
  const fork = await startOwnedTestnetAnvil(controller.signal, {url, block: block.number}, 1301);
  try {
    if (!lpOnly) {
      stage = "swap-lifecycle";
      await runTestnetForkLifecycle(fork, block, controller.signal, report, {}, 1301);
    }
    stage = "lp-lifecycle";
    await runTestnetLpWalletFork(fork, block, controller.signal, report, {chainId: 1301, customRange: true});
    report({status: lpOnly ? "unichain-EOA-LP-fork-qualified" : "unichain-EOA-fork-qualified", chainId: 1301, swapBothDirections: !lpOnly, fullLpLifecycle: true,
      localOnly: true, ownerFundsUsed: false, actualTotalFeeQualified: false, executionEnabled: false});
  } finally {await fork.stop(); report({stage: "owned-anvil-stopped", localOnly: true});}
}
void run().catch(error => {
  const code = controller.signal.aborted ? "FORK_ABORTED" : error && typeof error === "object" && "code" in error
    && typeof error.code === "string" && /^(FORK|TESTNET)_[A-Z_]+$/.test(error.code) ? error.code : "FORK_UNAVAILABLE";
  report({status: "unichain-fork-unavailable", stage, code, rpcDiagnostics: diagnostics.snapshot(), executionEnabled: false}); process.exitCode = 1;
}).finally(() => {clearTimeout(timer); controller.abort(); process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);});
