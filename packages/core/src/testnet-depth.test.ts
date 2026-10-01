import { describe, expect, it } from "vitest";
import { parseTestnetDepth } from "./testnet-depth";
import { depthFixture } from "./testnet-depth.test-helper";

describe("testnet discovery boundary", () => {
  it("accepts a complete depth study and a genuine empty candidate result", () => {
    expect(parseTestnetDepth(depthFixture()).candidateFeeTiers).toEqual([500]);
    expect(parseTestnetDepth({ ...depthFixture(), pools: [], depthQualified: false, candidateFeeTiers: [] }).depthQualified).toBe(false);
  });

  it("rejects wrong chain/source, stale/future provenance, overflow, duplicate pools and extra payloads", () => {
    const f = depthFixture();
    const samples = f.pools[0].samples;
    for (const value of [
      { ...f, chainId: 137 }, { ...f, source: "uniswap-trading-api" },
      { ...f, observedAt: new Date(Date.now() - 601000).toISOString() },
      { ...f, observedAt: new Date(Date.now() + 61000).toISOString() },
      { ...f, blockNumber: "0" }, { ...f, blockHash: "0xab" }, { ...f, rawQuote: {} },
      { ...f, pools: [f.pools[0], f.pools[0]] },
      { ...f, pools: [{ ...f.pools[0], feeTier: 42 }] },
      { ...f, pools: [{ ...f.pools[0], address: `0x${"00".repeat(20)}` }] },
      { ...f, pools: [{ ...f.pools[0], samples: [{ ...samples[0], amountOut: (2n ** 256n).toString() }, ...samples.slice(1)] }] },
    ]) expect(() => parseTestnetDepth(value)).toThrow();
  });

  it("rejects forged qualification, impact or sample identities and accepts bounded failed samples", () => {
    const f = depthFixture();
    const samples = f.pools[0].samples;
    for (const change of [
      { amountIn: "100001" }, { direction: "WETH_TO_USDC" }, { amountOut: "100001" },
      { priceImpactBps: 49 }, { withinImpactLimit: false }, { amountOut: null },
      { quoterGasEstimate: "0" }, { code: "QUOTE_INVALID" },
    ]) expect(() => parseTestnetDepth({ ...f, pools: [{ ...f.pools[0], samples: [{ ...samples[0], ...change }, ...samples.slice(1)] }] })).toThrow();
    expect(() => parseTestnetDepth({ ...f, candidateFeeTiers: [] })).toThrow();
    expect(() => parseTestnetDepth({ ...f, depthQualified: false })).toThrow();
    const failed = { ...samples[0], available: false, amountOut: null, spotAmountOutAfterFee: null,
      priceImpactBps: null, quoterGasEstimate: null, initializedTicksCrossed: null,
      withinImpactLimit: false, code: "QUOTE_UNAVAILABLE" };
    const result = { ...f, depthQualified: false, candidateFeeTiers: [], pools: [
      { ...f.pools[0], depthQualified: false, samples: [failed, ...samples.slice(1)] },
    ] };
    expect(parseTestnetDepth(result).pools[0].depthQualified).toBe(false);
    expect(() => parseTestnetDepth({ ...result, pools: [{ ...result.pools[0], depthQualified: true }] })).toThrow();
  });
});
