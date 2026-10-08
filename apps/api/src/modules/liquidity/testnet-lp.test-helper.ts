import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { testnetQuoteSource, TESTNET_HASH, testnetIntent } from "../swap/testnet-quote.test-helper";
export const wallet = testnetIntent().wallet;
export const position = () => ({ token0: C.USDC.address, token1: C.WETH.address, fee: 3000,
  tickLower: -60, tickUpper: 60, liquidity: 1000000n, feeGrowthInside0LastX128: 0n,
  feeGrowthInside1LastX128: 0n, tokensOwed0: 5n, tokensOwed1: 7n });
export const pool = () => ({ token0: C.USDC.address, token1: C.WETH.address, factory: C.v3Factory,
  fee: 3000, liquidity: 100000000n, tick: 0, sqrtPriceX96: 2n ** 96n,
  feeGrowthGlobal0X128: 2n ** 128n, feeGrowthGlobal1X128: 2n ** 129n });
export function lpSource() {
  return { ...testnetQuoteSource(), async getLpBlock() { return { number: 123n, timestamp: 1790800000n, hash: TESTNET_HASH }; }, async getLpPoolState() { return pool(); },
    async getPositionCount() { return 1n; }, async getPositionId() { return 42n; },
    async getPositionOwner() { return wallet as `0x${string}`; }, async getPosition() { return position(); },
    async getFeeGrowthOutside() { return { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n }; } };
}
