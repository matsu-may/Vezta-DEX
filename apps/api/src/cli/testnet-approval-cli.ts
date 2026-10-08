import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";
import { TestnetSwapQuoteReader } from "../modules/swap/testnet-swap-quote";
import { TestnetApprovalReader } from "../modules/swap/testnet-approval";
import { runTestnetApprovalProbe } from "../tooling/probes/testnet-approval-probe";
import { TestnetRpcDiagnostics } from "../infrastructure/rpc/testnet-rpc-diagnostics";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
let diagnostics = new TestnetRpcDiagnostics();
void runTestnetApprovalProbe(process.env.DEX_SMOKE_WALLET, () => {
  diagnostics = new TestnetRpcDiagnostics();
  const source = (signal: AbortSignal) => diagnostics.wrap(createBaseSepoliaPreflightSource(
    process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal));
  const quotes = new TestnetSwapQuoteReader(source);
  return { quotes, approvals: new TestnetApprovalReader(source, quotes.store) };
}, () => diagnostics.snapshot()).then(rows => {
  for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
  if (rows.length !== 2 || rows.some(row => !("status" in row) || row.status !== "testnet-approval-study")) process.exitCode = 1;
}).catch(() => {
  process.stdout.write(`${JSON.stringify({ status: "testnet-approval-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
  process.exitCode = 1;
});
