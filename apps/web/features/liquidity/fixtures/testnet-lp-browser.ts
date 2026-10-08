import type { TestnetLpPage } from "@vezta-dex/core";
export const lpBrowserPage: TestnetLpPage = {
  chainId: 84532, manager: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2", pool: "0x46880b404CD35c165EDdefF7421019F8dD25F4Ad",
  owner: "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e", source: "base-sepolia-rpc",
  snapshot: { number: "123", hash: `0x${"ab".repeat(32)}`, observedAt: "2026-10-02T00:00:00.000Z" },
  cursor: "0", scanned: 1, totalOwned: "1", nextCursor: null, incomplete: false, poolTick: 0, sqrtPriceX96: (2n ** 96n).toString(),
  positions: [{ tokenId: "42", tickLower: -60, tickUpper: 60, liquidity: "1000000", inRange: true, state: "active",
    currentAmounts: { USDC: "2995", WETH: "2995" }, newFeesSinceCheckpoint: { USDC: "1000000", WETH: "2000000" },
    storedOwed: { USDC: "5", WETH: "7" }, collectable: { USDC: "1000005", WETH: "2000007" } }],
  runtimeVerified: true, executionEnabled: false,
};
