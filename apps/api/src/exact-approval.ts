import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { validateTradingIntent, type Address, type TradingIntent } from "@vezta-dex/core";

export const POLYGON_PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3" as const;

export interface ExactApprovalTransaction {
  chainId: 137;
  from: Address;
  to: Address;
  data: Hex;
  value: "0";
}

export type ExactApprovalPlan =
  | { kind: "approve"; transaction: ExactApprovalTransaction }
  | { kind: "ready" }
  | { kind: "blocked-existing"; allowance: string };

/** Pure plan only: the caller must read and recheck on-chain allowance. */
export function planExactApproval(intent: TradingIntent, currentAllowance: string): ExactApprovalPlan {
  validateTradingIntent(intent);
  if (!/^(0|[1-9]\d{0,77})$/.test(currentAllowance) || BigInt(currentAllowance) > (1n << 256n) - 1n) {
    throw new Error("Invalid Permit2 token allowance");
  }
  if (currentAllowance === intent.amountIn) return { kind: "ready" };
  if (currentAllowance !== "0") return { kind: "blocked-existing", allowance: currentAllowance };
  return {
    kind: "approve",
    transaction: {
      chainId: 137,
      from: intent.swapper,
      to: intent.tokenIn,
      data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [POLYGON_PERMIT2, BigInt(intent.amountIn)] }),
      value: "0",
    },
  };
}
