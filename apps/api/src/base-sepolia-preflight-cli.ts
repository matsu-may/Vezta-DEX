import { existsSync } from "node:fs";
import { qualifyBaseSepoliaPools, BaseSepoliaPreflightError } from "./base-sepolia-preflight";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  try {
    const source = createBaseSepoliaPreflightSource(
      process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org");
    const result = await qualifyBaseSepoliaPools(source);
    process.stdout.write(`${JSON.stringify({ status: "read-only-preflight", ...result })}\n`);
    if (!result.readOnlyQualified) process.exitCode = 1;
  } catch (error) {
    const code = error instanceof BaseSepoliaPreflightError ? error.code : "RPC_UNAVAILABLE";
    process.stdout.write(`${JSON.stringify({ status: "read-only-preflight", readOnlyQualified: false, code })}\n`);
    process.exitCode = 1;
  }
}

void main();
