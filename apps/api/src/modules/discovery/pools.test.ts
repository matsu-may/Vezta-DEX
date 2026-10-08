import { describe, expect, it } from "vitest";
import { TOKENS, poolKey, type Address } from "@vezta-dex/core";
import { PoolReader, type PoolChainSource } from "./pools";

const POOL_500 = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9" as Address;
const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function source(overrides: Partial<PoolChainSource> = {}): PoolChainSource {
  return {
    getBlock: async () => ({ number: 94497119n, timestamp: 1790450819n }),
    getPoolAddress: async (fee) => (fee === 500 ? POOL_500 : ZERO),
    getPoolState: async () => ({
      token0: TOKENS.USDC.address,
      token1: TOKENS.WETH.address,
      liquidity: 40754944770195441n,
    }),
    ...overrides,
  };
}

describe("PoolReader", () => {
  it("returns only existing curated pools with block timestamp and honest metrics", async () => {
    const pools = await new PoolReader(source()).listCuratedPools();
    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      id: poolKey(137, "v3", POOL_500),
      chainId: 137,
      protocol: "v3",
      feeTier: 500,
      token0: TOKENS.USDC,
      token1: TOKENS.WETH,
      activeLiquidity: "40754944770195441",
      tvlUsd: null,
      volume24hUsd: null,
      source: "polygon-rpc",
      observedAt: "2026-09-26T19:26:59.000Z",
      blockNumber: "94497119",
    });
  });

  it("rejects unexpected token ordering or pair from RPC", async () => {
    const reader = new PoolReader(source({
      getPoolState: async () => ({
        token0: TOKENS.WETH.address,
        token1: TOKENS.USDC.address,
        liquidity: 1n,
      }),
    }));
    await expect(reader.listCuratedPools()).rejects.toThrow("Unexpected pool tokens");
  });

  it("rejects wrong-chain identity before touching RPC", async () => {
    let calls = 0;
    const reader = new PoolReader(source({
      getBlock: async () => { calls++; throw new Error("not expected"); },
    }));
    await expect(reader.getPool("1:v3:" + POOL_500)).rejects.toThrow("Unsupported pool chain");
    expect(calls).toBe(0);
  });

  it("returns null for a well-formed but unsupported pool", async () => {
    const reader = new PoolReader(source());
    expect(await reader.getPool(poolKey(137, "v3", "0x1111111111111111111111111111111111111111"))).toBeNull();
  });
});
