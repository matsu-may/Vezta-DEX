import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";
import { TestnetSwapQuoteReader } from "../modules/swap/testnet-swap-quote";
import { runTestnetWalletQuoteProbe } from "../tooling/probes/testnet-wallet-quote-probe";
import { TestnetRpcDiagnostics } from "../infrastructure/rpc/testnet-rpc-diagnostics";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

let diagnostics = new TestnetRpcDiagnostics();
void runTestnetWalletQuoteProbe(process.env.DEX_SMOKE_WALLET, () => {
  diagnostics = new TestnetRpcDiagnostics();
  return new TestnetSwapQuoteReader(signal => diagnostics.wrap(
    createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal)));
}, Date.now, () => diagnostics.snapshot())
  .then(rows => {
    for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
    if (rows.length !== 2 || rows.some(row => !("status" in row) || row.status !== "testnet-wallet-quote-read-only")) {
      process.exitCode = 1;
    }
  }).catch(() => {
    process.stdout.write(`${JSON.stringify({ status: "testnet-wallet-quote-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
    process.exitCode = 1;
  });
