import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { runTestnetFeesProbe } from "./testnet-fees-probe";
import { TestnetRpcDiagnostics } from "./testnet-rpc-diagnostics";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const diagnostics = new TestnetRpcDiagnostics();
void runTestnetFeesProbe(signal => diagnostics.wrap(createBaseSepoliaPreflightSource(
  process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal)), Date.now, () => diagnostics.snapshot())
  .then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "testnet-fee-model-read-only") process.exitCode = 1;
  }).catch(() => {
    process.stdout.write(`${JSON.stringify({ status: "testnet-fee-model-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
    process.exitCode = 1;
  });
