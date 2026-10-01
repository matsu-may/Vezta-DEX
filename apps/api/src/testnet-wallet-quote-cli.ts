import { existsSync } from "node:fs";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { runTestnetWalletQuoteProbe } from "./testnet-wallet-quote-probe";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

void runTestnetWalletQuoteProbe(process.env.DEX_SMOKE_WALLET, () => new TestnetSwapQuoteReader(signal =>
  createBaseSepoliaPreflightSource(process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org", signal)))
  .then(rows => {
    for (const row of rows) process.stdout.write(`${JSON.stringify(row)}\n`);
    if (rows.length !== 2 || rows.some(row => !("status" in row) || row.status !== "testnet-wallet-quote-read-only")) {
      process.exitCode = 1;
    }
  }).catch(() => {
    process.stdout.write(`${JSON.stringify({ status: "testnet-wallet-quote-unavailable", code: "TESTNET_RPC_UNAVAILABLE" })}\n`);
    process.exitCode = 1;
  });
