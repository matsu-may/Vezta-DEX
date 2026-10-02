import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetSwapPreparer } from "./testnet-swap-preparation";
import { runTestnetPrepareProbe } from "./testnet-prepare-probe";
import { TestnetRpcDiagnostics } from "./testnet-rpc-diagnostics";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
let diagnostics = new TestnetRpcDiagnostics();
void runTestnetPrepareProbe(process.env.DEX_SMOKE_WALLET, () => {
  diagnostics = new TestnetRpcDiagnostics();
  const source = (signal: AbortSignal) => diagnostics.wrap(createBaseSepoliaPreflightSource(
    process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal));
  const quotes = new TestnetSwapQuoteReader(source);
  return { quotes, preparer: new TestnetSwapPreparer(source, quotes.store) };
}, () => diagnostics.snapshot()).then(rows => {
  for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  if (rows.length !== 2 || rows.some(row => !("status" in row) || row.status !== "testnet-swap-preparation-study")) process.exitCode = 1;
}).catch(() => {
  process.stdout.write(`${JSON.stringify({ status: "testnet-swap-preparation-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
  process.exitCode = 1;
});
