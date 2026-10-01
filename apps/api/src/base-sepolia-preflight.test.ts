import { describe, expect, it } from "vitest";
import {
  BASE_SEPOLIA_CANDIDATE, qualifyBaseSepoliaPools,
  type BaseSepoliaPreflightSource,
} from "./base-sepolia-preflight";

const C = BASE_SEPOLIA_CANDIDATE;
const pool = "0x1111111111111111111111111111111111111111" as const;
const block = { number: 123n, timestamp: 1_790_800_000n,
  hash: `0x${"ab".repeat(32)}` as `0x${string}` };
const now = Number(block.timestamp) * 1000 + 2_000;

function source(overrides: Partial<BaseSepoliaPreflightSource> = {}): BaseSepoliaPreflightSource {
  return {
    async getChainId() { return 84532; },
    async getLatestBlock() { return block; },
    async getBlockHash() { return block.hash; },
    async getCode() { return "0x6001"; },
    async getDecimals(token) { return token.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18; },
    async getPool(fee) { return fee === 500 ? pool : "0x0000000000000000000000000000000000000000"; },
    async getPoolState() { return { token0: C.USDC.address, token1: C.WETH.address,
      factory: C.v3Factory, fee: 500, liquidity: 100n, sqrtPriceX96: 2n ** 96n }; },
    async quoteOneUsdc() { return { amountOut: 400_000_000_000_000n, gasEstimate: 120_000n }; },
    ...overrides,
  };
}

describe("Base Sepolia read-only pool qualification", () => {
  it("binds Circle test USDC, official v3 deployments, pool and quote to one stable block", async () => {
    const result = await qualifyBaseSepoliaPools(source(), now);
    expect(result).toMatchObject({ chainId: 84532, blockNumber: "123", readOnlyQualified: true,
      pools: [{ feeTier: 500, address: pool, activeLiquidityPositive: true,
        quoteAvailable: true, oneUsdcAmountOut: "400000000000000" }] });
  });

  it("does not qualify an absent or unquotable pool", async () => {
    const absent = await qualifyBaseSepoliaPools(source({ async getPool() {
      return "0x0000000000000000000000000000000000000000";
    } }), now);
    expect(absent).toMatchObject({ readOnlyQualified: false, pools: [] });
    const unquotable = await qualifyBaseSepoliaPools(source({ async quoteOneUsdc() {
      throw new Error("private provider detail");
    } }), now);
    expect(unquotable.pools[0]).toMatchObject({ quoteAvailable: false });
    expect(unquotable.readOnlyQualified).toBe(false);
    expect(JSON.stringify(unquotable)).not.toContain("private provider detail");
  });

  it("rejects wrong chain, stale block, token decimals, changed block and empty code", async () => {
    await expect(qualifyBaseSepoliaPools(source({ async getChainId() { return 137; } }), now)).rejects.toMatchObject({ code: "WRONG_CHAIN" });
    await expect(qualifyBaseSepoliaPools(source(), now + 601_000)).rejects.toMatchObject({ code: "STALE_BLOCK" });
    await expect(qualifyBaseSepoliaPools(source({ async getDecimals() { return 18; } }), now)).rejects.toMatchObject({ code: "TOKEN_DECIMALS" });
    await expect(qualifyBaseSepoliaPools(source({ async getBlockHash() { return `0x${"cd".repeat(32)}` as `0x${string}`; } }), now))
      .rejects.toMatchObject({ code: "BLOCK_CHANGED" });
    await expect(qualifyBaseSepoliaPools(source({ async getCode() { return "0x"; } }), now)).rejects.toMatchObject({ code: "MISSING_CODE" });
  });

  it("rejects a pool with the wrong pair, fee, factory, initialization or missing code", async () => {
    for (const changed of [
      { token0: C.WETH.address }, { fee: 3000 }, { factory: C.v3PositionManager },
    ]) {
      await expect(qualifyBaseSepoliaPools(source({ async getPoolState() {
        return { token0: C.USDC.address, token1: C.WETH.address,
          factory: C.v3Factory, fee: 500, liquidity: 100n, sqrtPriceX96: 2n ** 96n,
          ...changed };
      } }), now)).rejects.toMatchObject({ code: "POOL_IDENTITY" });
    }
    await expect(qualifyBaseSepoliaPools(source({ async getCode(address) {
      return address.toLowerCase() === pool.toLowerCase() ? "0x" : "0x6001";
    } }), now)).rejects.toMatchObject({ code: "MISSING_CODE" });
  });

  it("skips uninitialized or empty pools while preserving other qualified fees", async () => {
    const other = "0x2222222222222222222222222222222222222222" as const;
    const result = await qualifyBaseSepoliaPools(source({
      async getPool(fee) { return fee === 500 ? pool : fee === 3000 ? other
        : "0x0000000000000000000000000000000000000000"; },
      async getPoolState(address) { return { token0: C.USDC.address, token1: C.WETH.address,
        factory: C.v3Factory, fee: address === pool ? 500 : 3000,
        liquidity: address === pool ? 0n : 100n,
        sqrtPriceX96: address === pool ? 0n : 2n ** 96n }; },
    }), now);
    expect(result.readOnlyQualified).toBe(true);
    expect(result.pools).toMatchObject([
      { feeTier: 500, initialized: false, activeLiquidityPositive: false, quoteAvailable: false },
      { feeTier: 3000, initialized: true, activeLiquidityPositive: true, quoteAvailable: true },
    ]);
  });
});
