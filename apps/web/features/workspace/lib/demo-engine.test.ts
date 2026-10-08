import { describe, expect, it } from "vitest";
import {
  closeDemoPosition,
  collectDemoPosition,
  commitDemoSwap,
  createDemoPosition,
  creditDemoFees,
  decreaseDemoPosition,
  increaseDemoPosition,
  initialDemoState,
  previewDemoSwap,
} from "./demo-engine";

describe("self-contained DEX demo engine", () => {
  it("starts with a deterministic virtual wallet and no position", () => {
    const state = initialDemoState();
    expect(state.balances).toEqual({ USDC: 1_000_000_000n, WETH: 1_000_000_000_000_000_000n });
    expect(state.position).toBeNull();
    expect(state.revision).toBe(0);
  });

  it("quotes both directions with integer 0.05% fee and a reviewed minimum", () => {
    const state = initialDemoState();
    const usdc = previewDemoSwap(state, "USDC_TO_WETH", "10", 50);
    expect(usdc.amountIn).toBe(10_000_000n);
    expect(usdc.feeAmount).toBe(5_000n);
    expect(usdc.amountOut).toBe(state.reserves.WETH * 9_995_000n / (state.reserves.USDC + 9_995_000n));
    expect(usdc.minimumAmountOut).toBe(usdc.amountOut * 9_950n / 10_000n);
    const weth = previewDemoSwap(state, "WETH_TO_USDC", "0.01", 100);
    expect(weth.amountIn).toBe(10_000_000_000_000_000n);
    expect(weth.feeAmount).toBe(5_000_000_000_000n);
    expect(weth.amountOut).toBeGreaterThan(0n);
  });

  it("rejects invalid precision, zero, insufficient balance and invalid slippage without mutation", () => {
    const state = initialDemoState();
    for (const [direction, amount, bps] of [
      ["USDC_TO_WETH", "0", 50], ["USDC_TO_WETH", "0.0000001", 50],
      ["USDC_TO_WETH", "1001", 50], ["WETH_TO_USDC", "2", 50],
      ["USDC_TO_WETH", "10", 0],
    ] as const) expect(() => previewDemoSwap(state, direction, amount, bps)).toThrow();
    expect(state).toEqual(initialDemoState());
  });

  it("updates virtual balances once and rejects a stale or altered quote", () => {
    const before = initialDemoState();
    const preview = previewDemoSwap(before, "USDC_TO_WETH", "10", 50);
    const after = commitDemoSwap(before, preview);
    expect(after.balances.USDC).toBe(before.balances.USDC - preview.amountIn);
    expect(after.balances.WETH).toBe(before.balances.WETH + preview.amountOut);
    expect(after.reserves.USDC).toBe(before.reserves.USDC + preview.amountIn);
    expect(after.reserves.WETH).toBe(before.reserves.WETH - preview.amountOut);
    expect(after.lastReceipt).toMatchObject({ action: "swap", simulated: true,
      swap: { input: "USDC", output: "WETH", amountIn: preview.amountIn,
        amountOut: preview.amountOut, feeAmount: preview.feeAmount } });
    expect(before).toEqual(initialDemoState());
    expect(() => commitDemoSwap(after, preview)).toThrow();
    expect(() => commitDemoSwap(before, { ...preview, amountOut: preview.amountOut + 1n })).toThrow();
  });

  it("separates principal withdrawal from the example fee and collects exactly once", () => {
    const initial = initialDemoState();
    const created = createDemoPosition(initial);
    expect(created.balances).toEqual({ USDC: 900_000_000n, WETH: 960_000_000_000_000_000n });
    expect(created.position).toMatchObject({ liquidity: 100n, principalUSDC: 100_000_000n,
      principalWETH: 40_000_000_000_000_000n });
    const increased = increaseDemoPosition(created);
    expect(increased.position?.liquidity).toBe(125n);
    const credited = creditDemoFees(increased);
    expect(credited.position).toMatchObject({ owedFeeUSDC: 250_000n, owedFeeWETH: 100_000_000_000_000n });
    expect(() => creditDemoFees(credited)).toThrow();
    const half = decreaseDemoPosition(credited, "half");
    expect(half.position?.liquidity).toBe(63n);
    expect(half.position?.owedPrincipalUSDC).toBe(62_000_000n);
    expect(half.balances).toEqual(credited.balances);
    const collected = collectDemoPosition(half);
    expect(collected.balances.USDC).toBe(half.balances.USDC + 62_000_000n + 250_000n);
    expect(collected.lastReceipt).toMatchObject({ action: "collect", principalUSDC: 62_000_000n,
      feeUSDC: 250_000n, simulated: true });
    expect(() => collectDemoPosition(collected)).toThrow();
    const emptied = decreaseDemoPosition(collected, "all");
    expect(emptied.position?.liquidity).toBe(0n);
    expect(() => closeDemoPosition(emptied)).toThrow();
    const settled = collectDemoPosition(emptied);
    const closed = closeDemoPosition(settled);
    expect(closed.position).toBeNull();
    expect(closed.balances.USDC).toBe(initial.balances.USDC + 250_000n);
    expect(closed.balances.WETH).toBe(initial.balances.WETH + 100_000_000_000_000n);
    expect(closed.lastReceipt).toMatchObject({ action: "close", simulated: true });
  });

  it("blocks impossible LP actions without modifying virtual balances", () => {
    const initial = initialDemoState();
    expect(() => increaseDemoPosition(initial)).toThrow();
    expect(() => decreaseDemoPosition(initial, "half")).toThrow();
    expect(() => collectDemoPosition(initial)).toThrow();
    expect(() => closeDemoPosition(initial)).toThrow();
    const created = createDemoPosition(initial);
    expect(() => createDemoPosition(created)).toThrow();
    expect(() => closeDemoPosition(created)).toThrow();
    expect(initial).toEqual(initialDemoState());
  });
});
