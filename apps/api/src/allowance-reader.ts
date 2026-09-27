import { validateTradingIntent, type Address, type TradingIntent } from "@vezta-dex/core";
import { planExactApproval, POLYGON_PERMIT2, type ExactApprovalPlan } from "./exact-approval";

export interface AllowanceChainSource {
  getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
  getTokenAllowance(token: Address, owner: Address, spender: Address, blockNumber: bigint): Promise<bigint>;
}

export interface AllowancePlanResult {
  chainId: 137;
  blockNumber: string;
  observedAt: string;
  currentAllowance: string;
  plan: ExactApprovalPlan;
}

export class ApprovalInputError extends Error {}

export class AllowanceReader {
  constructor(private readonly chain: AllowanceChainSource, private readonly now: () => number = Date.now) {}

  async getPlan(intent: TradingIntent): Promise<AllowancePlanResult> {
    try { validateTradingIntent(intent); }
    catch { throw new ApprovalInputError("Unsupported Polygon approval intent"); }
    const block = await this.chain.getBlock();
    const observed = Number(block.timestamp) * 1_000;
    if (!Number.isFinite(observed) || observed > this.now() + 5_000 || this.now() - observed > 120_000) {
      throw new Error("Polygon allowance block is stale");
    }
    const allowance = await this.chain.getTokenAllowance(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, block.number);
    const currentAllowance = allowance.toString();
    return {
      chainId: 137,
      blockNumber: block.number.toString(),
      observedAt: new Date(observed).toISOString(),
      currentAllowance,
      plan: planExactApproval(intent, currentAllowance),
    };
  }
}
