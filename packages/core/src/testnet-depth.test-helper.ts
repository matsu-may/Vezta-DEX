// Deterministic test fixture; never exported by the production package.
export function depthFixture(nowMs = Date.now()) {
  const inputs = ["100000", "1000000", "5000000", "10000000000000", "100000000000000", "1000000000000000"];
  return {
    chainId: 84532, source: "base-sepolia-rpc", blockNumber: "123",
    blockHash: `0x${"ab".repeat(32)}`, observedAt: new Date(nowMs - 2000).toISOString(),
    maxPriceImpactBps: 100, depthQualified: true, candidateFeeTiers: [500],
    pools: [{ address: `0x${"11".repeat(20)}`, feeTier: 500, depthQualified: true,
      samples: inputs.map((amountIn, i) => ({
        direction: i < 3 ? "USDC_TO_WETH" : "WETH_TO_USDC", amountIn,
        available: true, amountOut: "99500", spotAmountOutAfterFee: "100000",
        priceImpactBps: 50, quoterGasEstimate: "120000", initializedTicksCrossed: 0,
        withinImpactLimit: true,
      })) }],
  };
}
