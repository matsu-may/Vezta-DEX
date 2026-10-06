import { existsSync } from "node:fs";
import { testnetChainConfig } from "@vezta-dex/core";
import { createTestnetChainSource } from "./base-sepolia-source";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
const env = new URL("../.env", import.meta.url);
if (existsSync(env)) process.loadEnvFile(env);
const C = testnetChainConfig(1301).candidate;
const reader = new TestnetSwapQuoteReader(signal => createTestnetChainSource(1301,
  process.env.UNICHAIN_SEPOLIA_RPC_URL ?? "https://sepolia.unichain.org", signal), undefined, Date.now, 1301);
try {
  for (const reverse of [false,true]) {
    const result=await reader.read({chainId:1301,wallet:process.env.DEX_SMOKE_WALLET,
      tokenIn:reverse?C.WETH.address:C.USDC.address,tokenOut:reverse?C.USDC.address:C.WETH.address,
      amountIn:reverse?"100000000000000":"1000000",slippageBps:50});
    process.stdout.write(JSON.stringify({status:"unichain-quote-read-only",direction:reverse?"WETH_TO_USDC":"USDC_TO_WETH",
      chainId:result.quote.chainId,pool:result.quote.pool,blockNumber:result.quote.blockNumber,blockHash:result.quote.blockHash,
      observedAt:result.quote.observedAt,amountIn:result.quote.amountIn,amountOut:result.quote.amountOut,
      minimumAmountOut:result.quote.minimumAmountOut,priceImpactBps:result.priceImpactBps,...result.qualification})+"\n");
  }
} catch(error) {
  process.stdout.write(JSON.stringify({status:"unichain-quote-unavailable",code:error && typeof error==="object" && "code" in error ? error.code:"TESTNET_RPC_UNAVAILABLE",executionEnabled:false})+"\n");
  process.exitCode=1;
}
