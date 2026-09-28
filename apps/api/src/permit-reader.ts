import {
  PERMIT2_POLICY, POLYGON_UNIVERSAL_ROUTER_212, UNIVERSAL_ROUTER_VERSION,
  inspectTradingRoute, validatePermit2Data, validateTradingIntent, validateTradingQuoteSummary,
  type Address, type Permit2Data, type TradingIntent,
} from "@vezta-dex/core";
import { QuoteStore } from "./quote-store";

export interface PermitChainSource {
  /** Implementations must verify Polygon chain ID before returning a block. */
  getBlock(): Promise<{ number: bigint; timestamp: bigint }>;
  getPermitAllowance(token: Address, owner: Address, spender: Address, blockNumber: bigint): Promise<{ amount: bigint; expiration: bigint; nonce: bigint }>;
}

export interface PermitPlanResult {
  chainId: 137;
  quoteId: string;
  quoteExpiresAt: string;
  blockNumber: string;
  observedAt: string;
  permit:
    | { kind: "sign"; data: Permit2Data; allowanceExpiresAt: string; signatureDeadline: string }
    | { kind: "ready" }
    | { kind: "blocked-existing" };
}

export class PermitInputError extends Error {}

function checkBlock(block: { number: bigint; timestamp: bigint }, now: number): number {
  const observed = Number(block.timestamp) * 1_000;
  if (block.number < 0n || block.timestamp < 0n || !Number.isSafeInteger(observed) || observed > now + 5_000 || now - observed > 120_000) {
    throw new Error("Polygon permit block is stale");
  }
  return observed;
}

export class PermitReader {
  constructor(private readonly chain: PermitChainSource, private readonly store: QuoteStore, private readonly now: () => number = Date.now) {}

  private read(intent: TradingIntent, quoteId: string) {
    try {
      validateTradingIntent(intent);
      if (!/^[0-9a-f]{48}$/.test(quoteId)) throw new Error("Invalid ID");
      return this.store.read(quoteId, intent, UNIVERSAL_ROUTER_VERSION);
    } catch {
      throw new PermitInputError("Invalid permit plan request");
    }
  }

  async getPlan(intent: TradingIntent, quoteId: string): Promise<PermitPlanResult> {
    this.read(intent, quoteId);
    const block = await this.chain.getBlock();
    checkBlock(block, this.now());
    const state = await this.chain.getPermitAllowance(intent.tokenIn, intent.swapper, POLYGON_UNIVERSAL_ROUTER_212, block.number);
    for (const [value, bits] of [[state.amount, 160n], [state.expiration, 48n], [state.nonce, 48n]] as const) {
      if (typeof value !== "bigint" || value < 0n || value >= 1n << bits) throw new Error("Invalid Polygon permit state");
    }
    // Neither the RPC snapshot nor reading a quote reserves it. Recheck after every async read.
    const { summary, payload, expiresAt } = this.read(intent, quoteId);
    const now = this.now();
    const observed = checkBlock(block, now);
    validateTradingQuoteSummary(summary, intent, now);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Invalid stored permit quote");
    const raw = payload as Record<string, unknown>;
    if (raw.routing !== "CLASSIC" || raw.permitTransaction != null || !Object.hasOwn(raw, "permitData")) throw new Error("Unsupported permit flow");
    if (!raw.quote || typeof raw.quote !== "object" || Array.isArray(raw.quote)) throw new Error("Invalid stored route");
    inspectTradingRoute((raw.quote as Record<string, unknown>).route, intent);

    let permit: PermitPlanResult["permit"];
    const seconds = BigInt(Math.floor(now / 1_000));
    if (raw.permitData === null) {
      const ready = state.amount === BigInt(intent.amountIn) && state.expiration > seconds && state.expiration > block.timestamp &&
        state.expiration <= seconds + BigInt(PERMIT2_POLICY.maxAllowanceSeconds);
      permit = { kind: ready ? "ready" : "blocked-existing" };
    } else {
      const data = validatePermit2Data(raw.permitData, intent, state.nonce, now);
      if (BigInt(data.values.details.expiration) <= block.timestamp || BigInt(data.values.sigDeadline) <= block.timestamp) throw new Error("Permit expired at Polygon block");
      permit = {
        kind: "sign", data,
        allowanceExpiresAt: new Date(Number(data.values.details.expiration) * 1_000).toISOString(),
        signatureDeadline: new Date(Number(data.values.sigDeadline) * 1_000).toISOString(),
      };
    }
    return { chainId: 137, quoteId, quoteExpiresAt: new Date(expiresAt).toISOString(), blockNumber: block.number.toString(), observedAt: new Date(observed).toISOString(), permit };
  }
}
