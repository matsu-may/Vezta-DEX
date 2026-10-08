import { validateTradingIntent, type Address, type TradingIntent } from "@vezta-dex/core";
import { planExactApproval, POLYGON_PERMIT2, type ExactApprovalPlan } from "./exact-approval";

export interface AllowanceChainSource {
  /** Implementations must verify Polygon chain ID before returning a block. */
  getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
  /** Raw eth_getCode hex; missing data is never an empty EOA. */
  getAccountCode(owner: Address, blockNumber: bigint): Promise<string>;
  getTokenAllowance(token: Address, owner: Address, spender: Address, blockNumber: bigint): Promise<bigint>;
}

interface AllowancePlanProvenance {
  chainId: 137;
  blockNumber: string;
  observedAt: string;
}

export type AllowancePlanResult = AllowancePlanProvenance & (
  | { currentAllowance: string; plan: ExactApprovalPlan }
  | { currentAllowance: null; plan: { kind: "blocked-account" } }
);

export class ApprovalInputError extends Error {}

function checkBlock(block: { number: bigint; timestamp: bigint }, now: number): number {
  const observed = Number(block.timestamp) * 1_000;
  if (typeof block.number !== "bigint" || typeof block.timestamp !== "bigint"
    || block.number < 0n || block.timestamp < 0n || !Number.isSafeInteger(observed)
    || !Number.isSafeInteger(now) || now < 0 || observed > now + 5_000 || now - observed > 120_000) {
    throw new Error("Polygon allowance block is stale");
  }
  return observed;
}

export class AllowanceReader {
  constructor(private readonly chain: AllowanceChainSource, private readonly now: () => number = Date.now) {}

  async getPlan(value: TradingIntent): Promise<AllowancePlanResult> {
    const intent = { ...value };
    try { validateTradingIntent(intent); }
    catch { throw new ApprovalInputError("Unsupported Polygon approval intent"); }
    const block = await this.chain.getBlock();
    checkBlock(block, this.now());
    const code = await this.chain.getAccountCode(intent.swapper, block.number);
    const codeObserved = checkBlock(block, this.now());
    if (typeof code !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(code)) throw new Error("Invalid Polygon account code");
    if (code !== "0x") return {
      chainId: 137, blockNumber: block.number.toString(), observedAt: new Date(codeObserved).toISOString(),
      currentAllowance: null, plan: { kind: "blocked-account" },
    };
    const allowance = await this.chain.getTokenAllowance(intent.tokenIn, intent.swapper, POLYGON_PERMIT2, block.number);
    const observed = checkBlock(block, this.now());
    if (typeof allowance !== "bigint" || allowance < 0n || allowance >= 1n << 256n) throw new Error("Invalid Polygon token allowance");
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
