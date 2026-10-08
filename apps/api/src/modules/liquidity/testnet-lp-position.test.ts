import { describe, expect, it } from "vitest";
import { TickMath } from "./uniswap-lp-sdk";
import { BASE_SEPOLIA_CANDIDATE as C } from "@vezta-dex/core";
import { TestnetLpPositionReader, calculateLpAmounts } from "./testnet-lp-position";
import { TESTNET_HASH, TESTNET_NOW } from "../swap/testnet-quote.test-helper";
import { lpSource, wallet, position, pool } from "./testnet-lp.test-helper";
const request = () => ({ chainId: 84532, owner: wallet, cursor: "0", limit: 1 });
describe("Base Sepolia LP positions", () => {
  it("computes principal separately from checkpoint fees and mixed stored owed", async () => {
    const page = await new TestnetLpPositionReader(() => lpSource(), () => TESTNET_NOW).read(request());
    expect(page.positions[0]).toMatchObject({ tokenId: "42", inRange: true, state: "active",
      currentAmounts: { USDC: "2995", WETH: "2995" },
      newFeesSinceCheckpoint: { USDC: "1000000", WETH: "2000000" },
      storedOwed: { USDC: "5", WETH: "7" }, collectable: { USDC: "1000005", WETH: "2000007" } });
    expect(page.executionEnabled).toBe(false);
  });
  it("returns empty only after verified reads and preserves filtered scan pagination", async () => {
    const s = lpSource(); s.getPositionCount = async () => 0n;
    expect((await new TestnetLpPositionReader(() => s, () => TESTNET_NOW).read(request())).positions).toEqual([]);
    s.getPositionCount = async () => 2n;
    s.getPosition = async () => ({ ...position(), fee: 500 });
    const page = await new TestnetLpPositionReader(() => s, () => TESTNET_NOW).read(request());
    expect(page).toMatchObject({ positions: [], totalOwned: "2", nextCursor: "1", incomplete: true });
  });
  it("pins subsequent pages to the scan block and rejects changed block hashes", async () => {
    const s = lpSource(); const r = new TestnetLpPositionReader(() => s, () => TESTNET_NOW);
    await expect(r.read({ ...request(), cursor: "1" })).rejects.toThrow("TESTNET_LP_REQUEST_INVALID");
    s.getBlockHash = async () => `0x${"cd".repeat(32)}`;
    await expect(r.read({ ...request(), cursor: "1", snapshot: { number: "123", hash: TESTNET_HASH, observedAt: new Date(TESTNET_NOW - 2000).toISOString() } })).rejects.toThrow("TESTNET_LP_BLOCK_CHANGED");
  });
  it.each(["chain", "owner", "tick", "runtime", "pool", "decimals", "stale"])("rejects %s mismatch", async kind => {
    const s = lpSource();
    if (kind === "chain") s.getChainId = async () => 137;
    if (kind === "owner") s.getPositionOwner = async () => C.USDC.address;
    if (kind === "tick") s.getPosition = async () => ({ ...position(), tickLower: -61 });
    if (kind === "runtime") s.getCode = async () => "0x6000";
    if (kind === "pool") s.getPool = async () => C.USDC.address;
    if (kind === "decimals") s.getDecimals = async () => 18;
    if (kind === "stale") s.getLatestBlock = async () => ({ number: 123n, timestamp: 1n, hash: TESTNET_HASH });
    await expect(new TestnetLpPositionReader(() => s, () => TESTNET_NOW).read(request())).rejects.toThrow();
  });
  it("handles uint256 fee wrap and price at the upper tick without fees labelled principal", () => {
    const p = { ...position(), feeGrowthInside0LastX128: 2n ** 256n - 2n ** 128n };
    const data = calculateLpAmounts(p, pool(), { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n }, { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n });
    expect(data.newFeesSinceCheckpoint.USDC).toBe("2000000");
    const upper = { ...pool(), tick: 60, sqrtPriceX96: BigInt(TickMath.getSqrtRatioAtTick(60).toString()) };
    expect(calculateLpAmounts(position(), upper, { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n }, { feeGrowthOutside0X128: 0n, feeGrowthOutside1X128: 0n }).currentAmounts.USDC).toBe("0");
  });
  it("zero liquidity has no principal and is not an earning active range", async () => {
    const s = lpSource(); s.getPosition = async () => ({ ...position(), liquidity: 0n });
    const page = await new TestnetLpPositionReader(() => s, () => TESTNET_NOW).read(request());
    expect(page.positions[0]).toMatchObject({ state: "empty", currentAmounts: { USDC: "0", WETH: "0" }, newFeesSinceCheckpoint: { USDC: "0", WETH: "0" } });
  });
});
