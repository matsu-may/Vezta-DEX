import { existsSync } from "node:fs";
import { BASE_SEPOLIA_CANDIDATE } from "@vezta-dex/core";
import { qualifyBaseSepoliaPools, BaseSepoliaPreflightError } from "./base-sepolia-preflight";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { inspectBaseSepoliaQuote, summarizeBaseSepoliaQuoteFailure } from "./base-sepolia-quote-probe";
import { TradingApiClient } from "./trading-client";
import { readBoundedJson } from "./trading-api";

const envFile = new URL("../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);
const C = BASE_SEPOLIA_CANDIDATE;
const TEST_WALLET = "0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1";

async function main() {
  try {
    const apiKey = process.env.UNISWAP_API_KEY?.trim();
    if (!apiKey) throw new Error("API_KEY_MISSING");
    const preflight = await qualifyBaseSepoliaPools(createBaseSepoliaPreflightSource(
      process.env.BASE_SEPOLIA_RPC_URL ?? "https://sepolia.base.org"));
    if (!preflight.readOnlyQualified) throw new Error("POOL_UNQUALIFIED");
    const allowedPools = preflight.pools.filter(pool => pool.quoteAvailable).map(pool => pool.address);
    const response = await new TradingApiClient(apiKey).post("/quote", {
      type: "EXACT_INPUT", amount: "1000000",
      tokenInChainId: C.chainId, tokenOutChainId: C.chainId,
      tokenIn: C.USDC.address, tokenOut: C.WETH.address,
      swapper: TEST_WALLET, recipient: TEST_WALLET,
      slippageTolerance: 0.5, routingPreference: "BEST_PRICE",
      protocols: ["V3"], permitAmount: "EXACT", generatePermitAsTransaction: false,
    }, "preview");
    if (!response.ok) {
      process.stdout.write(`${JSON.stringify(await summarizeBaseSepoliaQuoteFailure(response))}\n`);
      process.exitCode = 1;
      return;
    }
    const quote = inspectBaseSepoliaQuote(await readBoundedJson(response), TEST_WALLET, allowedPools);
    process.stdout.write(`${JSON.stringify({ status: "testnet-quote-read-only", blockNumber: preflight.blockNumber,
      ...quote })}\n`);
  } catch (error) {
    const code = error instanceof BaseSepoliaPreflightError ? error.code
      : error instanceof Error && ["API_KEY_MISSING", "POOL_UNQUALIFIED"].includes(error.message)
        ? error.message : "TESTNET_QUOTE_UNAVAILABLE";
    process.stdout.write(`${JSON.stringify({ status: "testnet-quote-unavailable", code })}\n`);
    process.exitCode = 1;
  }
}

void main();
