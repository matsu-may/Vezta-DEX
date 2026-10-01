import { existsSync } from "node:fs";
import { probeBaseSepoliaDepth } from "./base-sepolia-depth";
import { BaseSepoliaPreflightError } from "./base-sepolia-preflight";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  try {
    const result = await probeBaseSepoliaDepth(createBaseSepoliaPreflightSource(
      process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"));
    process.stdout.write(`${JSON.stringify({ status: "testnet-depth-read-only", ...result })}\n`);
    if (!result.depthQualified) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof BaseSepoliaPreflightError ? error.code : "RPC_UNAVAILABLE";
    process.stdout.write(`${JSON.stringify({ status: "testnet-depth-read-only", depthQualified: false, code })}\n`);
    process.exitCode = 1;
  }
}

void main();
