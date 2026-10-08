import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "../infrastructure/rpc/base-sepolia-source";
import { TestnetWalletStateReader } from "../modules/wallet/testnet-wallet-state";
import { runTestnetWalletStateProbe } from "../tooling/probes/testnet-wallet-state-probe";

const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

void runTestnetWalletStateProbe(process.env.DEX_SMOKE_WALLET, () => new TestnetWalletStateReader(signal =>
  createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal)))
  .then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== "testnet-wallet-state-read-only") process.exitCode = 1;
  }).catch(() => {
    process.stdout.write(`${JSON.stringify({ status: "testnet-wallet-state-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
    process.exitCode = 1;
  });
