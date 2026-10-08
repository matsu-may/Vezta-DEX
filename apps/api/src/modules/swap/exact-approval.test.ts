import { describe, expect, it } from "vitest";
import { decodeFunctionData, erc20Abi } from "viem";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { POLYGON_PERMIT2, planExactApproval } from "./exact-approval";

const intent: TradingIntent = {
  chainId: 137,
  swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "1000000",
  slippageBps: 50,
};

describe("exact Permit2 ERC20 approval plan", () => {
  it("prepares only the selected input amount when on-chain allowance is zero", () => {
    const plan = planExactApproval(intent, "0");
    expect(plan.kind).toBe("approve");
    if (plan.kind !== "approve") throw new Error("Expected approval transaction");
    expect(plan.transaction).toMatchObject({ chainId: 137, from: intent.swapper, to: TOKENS.USDC.address, value: "0" });
    const decoded = decodeFunctionData({ abi: erc20Abi, data: plan.transaction.data });
    expect(decoded.functionName).toBe("approve");
    expect(decoded.args).toEqual([POLYGON_PERMIT2, 1_000_000n]);
    expect(plan.transaction.data).not.toContain("ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
  });

  it("uses an already exact allowance without producing another transaction", () => {
    expect(planExactApproval(intent, intent.amountIn)).toEqual({ kind: "ready" });
  });

  it("blocks any other existing allowance instead of silently reusing or replacing it", () => {
    expect(planExactApproval(intent, "1")).toEqual({ kind: "blocked-existing", allowance: "1" });
    const unlimited = ((1n << 256n) - 1n).toString();
    expect(planExactApproval(intent, unlimited)).toEqual({ kind: "blocked-existing", allowance: unlimited });
  });

  it("rejects unsupported intent and invalid allowance before building calldata", () => {
    expect(() => planExactApproval({ ...intent, chainId: 1 }, "0")).toThrow();
    expect(() => planExactApproval({ ...intent, tokenIn: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174" }, "0")).toThrow();
    expect(() => planExactApproval({ ...intent, amountIn: "0" }, "0")).toThrow();
    expect(() => planExactApproval(intent, "-1")).toThrow();
    expect(() => planExactApproval(intent, "not-a-number")).toThrow();
  });
});
