import { describe, expect, it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { probeBaseSepoliaDepth, type BaseSepoliaDepthSource } from "./base-sepolia-depth";

const pool = "0x1111111111111111111111111111111111111111" as const;
const block = { number: 123n, timestamp: 1_790_800_000n,
  hash: `0x${"ab".repeat(32)}` as `0x${string}` };
const now = Number(block.timestamp) * 1000 + 2000;
const sqrt = (2n ** 96n) * 20_000n;

function source(overrides: Partial<BaseSepoliaDepthSource> = {}): BaseSepoliaDepthSource {
  return {
    async getChainId() { return 84532; },
    async getLatestBlock() { return block; },
    async getBlockHash() { return block.hash; },
    async getCode() { return "0x6001"; },
    async getDecimals(token) { return token.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18; },
    async getPool(fee) { return fee === 500 ? pool : "0x0000000000000000000000000000000000000000"; },
    async getPoolState() { return { token0: C.USDC.address, token1: C.WETH.address,
      factory: C.v3Factory, fee: 500, liquidity: 100n, sqrtPriceX96: sqrt }; },
    async quoteOneUsdc() { return { amountOut: 399_800_000_000_000n, gasEstimate: 120_000n }; },
    async quoteExactInput(tokenIn, tokenOut, amountIn, fee, number) {
      expect(fee).toBe(500);
      expect(number).toBe(123n);
      const forward = tokenIn === C.USDC.address;
      expect(tokenOut).toBe(forward ? C.WETH.address : C.USDC.address);
      // Hand-computed for raw spot ratio 400,000,000 and fee 0.05%.
      const outputs = forward
        ? new Map([[100_000n, 39_980_000_000_000n], [1_000_000n, 399_800_000_000_000n], [5_000_000n, 1_999_000_000_000_000n]])
        : new Map([[10_000_000_000_000n, 24_987n], [100_000_000_000_000n, 249_875n], [1_000_000_000_000_000n, 2_498_750n]]);
      const amountOut = outputs.get(amountIn);
      if (amountOut === undefined) throw new Error("Unexpected input size");
      return { amountOut, gasEstimate: 120_000n, initializedTicksCrossed: 0,
        sqrtPriceX96After: forward ? sqrt - 1n : sqrt + 1n };
    },
    ...overrides,
  };
}

describe("Base Sepolia RPC depth study", () => {
  it("reports six reciprocal fee-adjusted samples at a stable pinned block", async () => {
    const result = await probeBaseSepoliaDepth(source(), now);
    expect(result).toMatchObject({ chainId: 84532, blockNumber: "123", blockHash: block.hash,
      depthQualified: true, candidateFeeTiers: [500], maxPriceImpactBps: 100 });
    expect(result.pools[0].samples).toHaveLength(6);
    expect(result.pools[0].samples[1]).toMatchObject({ direction: "USDC_TO_WETH", amountIn: "1000000",
      amountOut: "399800000000000", spotAmountOutAfterFee: "399800000000000", priceImpactBps: 0,
      withinImpactLimit: true });
    expect(result.pools[0].samples[4]).toMatchObject({ direction: "WETH_TO_USDC", amountIn: "100000000000000",
      amountOut: "249875", spotAmountOutAfterFee: "249875", priceImpactBps: 0 });
  });

  it("rounds impact up and excludes a pool when one sample exceeds 100 bps", async () => {
    const original = source();
    for (const [amountOut, impact, qualifies] of [
      [395_802_000_000_000n, 100, true], [395_801_999_999_999n, 101, false],
    ] as const) {
      const result = await probeBaseSepoliaDepth(source({ async quoteExactInput(...args) {
        const quoted = await original.quoteExactInput(...args);
        return args[0] === C.USDC.address && args[2] === 1_000_000n ? { ...quoted, amountOut } : quoted;
      } }), now);
      expect(result.pools[0].samples[1]).toMatchObject({ priceImpactBps: impact, withinImpactLimit: qualifies });
      expect(result.depthQualified).toBe(qualifies);
    }
  });

  it("keeps quote failures bounded and never qualifies an incomplete study", async () => {
    const result = await probeBaseSepoliaDepth(source({ async quoteExactInput() {
      throw new Error("private RPC credential");
    } }), now);
    expect(result.depthQualified).toBe(false);
    expect(result.candidateFeeTiers).toEqual([]);
    expect(result.pools[0].samples.every(sample => sample.code === "QUOTE_UNAVAILABLE")).toBe(true);
    expect(JSON.stringify(result)).not.toContain("private RPC credential");
  });

  it("rejects invalid output, gas, price direction and extreme-price partial-fill quotes", async () => {
    const original = source();
    for (const change of [
      { amountOut: 0n }, { amountOut: 400_000_000_000_000n }, { gasEstimate: 0n },
      { sqrtPriceX96After: sqrt + 1n }, { sqrtPriceX96After: 4295128740n },
      { initializedTicksCrossed: -1 },
    ]) {
      const result = await probeBaseSepoliaDepth(source({ async quoteExactInput(...args) {
        const quoted = await original.quoteExactInput(...args);
        return args[0] === C.USDC.address && args[2] === 1_000_000n ? { ...quoted, ...change } : quoted;
      } }), now);
      expect(result.pools[0].samples[1]).toMatchObject({ available: false, code: "QUOTE_INVALID" });
      expect(result.depthQualified).toBe(false);
    }
  });

  it("rejects changed block identity after depth sampling", async () => {
    let reads = 0;
    await expect(probeBaseSepoliaDepth(source({ async getBlockHash() {
      reads += 1;
      return reads === 1 ? block.hash : `0x${"cd".repeat(32)}` as `0x${string}`;
    } }), now)).rejects.toMatchObject({ code: "BLOCK_CHANGED" });
  });

  it("rejects pool identity drift and inherits wrong-chain and freshness gates", async () => {
    let reads = 0;
    const original = source();
    await expect(probeBaseSepoliaDepth(source({ async getPoolState(...args) {
      reads += 1;
      return { ...await original.getPoolState(...args), fee: reads === 1 ? 500 : 3000 };
    } }), now)).rejects.toMatchObject({ code: "POOL_IDENTITY" });
    await expect(probeBaseSepoliaDepth(source({ async getChainId() { return 137; } }), now))
      .rejects.toMatchObject({ code: "WRONG_CHAIN" });
    await expect(probeBaseSepoliaDepth(source(), now + 601_000)).rejects.toMatchObject({ code: "STALE_BLOCK" });
  });
});
