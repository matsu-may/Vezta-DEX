import { BASE_SEPOLIA_CANDIDATE as C, parseTestnetSwapIntent, buildTestnetSwapTransaction } from "@vezta-dex/core";
import { TestnetQuoteError, type TestnetSwapQuoteReader } from "./testnet-swap-quote";

export async function runTestnetWalletQuoteProbe(wallet: unknown, createReader: () => TestnetSwapQuoteReader,
  now = Date.now) {
  const inputs = [
    { direction: "USDC_TO_WETH", tokenIn: C.USDC.address, tokenOut: C.WETH.address, amountIn: "1000000" },
    { direction: "WETH_TO_USDC", tokenIn: C.WETH.address, tokenOut: C.USDC.address, amountIn: "100000000000000" },
  ];
  let intents;
  try { intents = inputs.map(({ tokenIn, tokenOut, amountIn }) => parseTestnetSwapIntent({
    chainId: 84532, wallet, tokenIn, tokenOut, amountIn, slippageBps: 50,
  })); } catch { return [{ status: "testnet-wallet-quote-unavailable", code: "TESTNET_INTENT_INVALID" }]; }
  const rows: object[] = [];
  for (const [index, intent] of intents.entries()) {
    try {
      const reader = createReader();
      const result = await reader.read(intent);
      const stored = reader.store.read(result.quoteId, intent);
      buildTestnetSwapTransaction(stored, now()); // Only an encoding/expiry check; never sent or logged.
      const { quote } = result;
      rows.push({ status: "testnet-wallet-quote-read-only", direction: inputs[index].direction,
        chainId: quote.chainId, feeTier: quote.feeTier, blockNumber: quote.blockNumber,
        observedAt: quote.observedAt, expiresAt: new Date(Date.parse(quote.observedAt) + 30000).toISOString(),
        amountIn: quote.amountIn, amountOut: quote.amountOut, minimumAmountOut: quote.minimumAmountOut,
        priceImpactBps: result.priceImpactBps,
        checks: { intentMatches: stored.wallet === intent.wallet && stored.tokenIn === intent.tokenIn
          && stored.tokenOut === intent.tokenOut && stored.amountIn === intent.amountIn,
          minimumValid: BigInt(quote.minimumAmountOut) === BigInt(quote.amountOut) * 9950n / 10000n,
          quoteFresh: true, opaqueQuoteId: /^[a-f0-9]{48}$/.test(result.quoteId), ...result.qualification } });
    } catch (error) {
      rows.push({ status: "testnet-wallet-quote-unavailable", direction: inputs[index].direction,
        code: error instanceof TestnetQuoteError ? error.code : "TESTNET_RPC_UNAVAILABLE" });
      break;
    }
  }
  return rows;
}
