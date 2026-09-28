import { randomBytes } from "node:crypto";
import type { TradingIntent, TradingQuoteSummary } from "@vezta-dex/core";

interface StoredQuote {
  binding: string;
  summary: TradingQuoteSummary;
  payloadJson: string;
  expiresAt: number;
}

function binding(intent: TradingIntent, routerVersion: string): string {
  return JSON.stringify([
    intent.chainId,
    intent.swapper.toLowerCase(),
    intent.tokenIn.toLowerCase(),
    intent.tokenOut.toLowerCase(),
    intent.amountIn,
    intent.slippageBps,
    routerVersion,
  ]);
}

export class QuoteStore {
  private readonly entries = new Map<string, StoredQuote>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;

  constructor(private readonly now: () => number = Date.now, options: { maxEntries?: number; maxBytes?: number } = {}) {
    this.maxEntries = options.maxEntries ?? 128;
    this.maxBytes = options.maxBytes ?? 256_000;
    if (!Number.isSafeInteger(this.maxEntries) || this.maxEntries < 1 || !Number.isSafeInteger(this.maxBytes) || this.maxBytes < 1) {
      throw new Error("Invalid quote store capacity");
    }
  }

  save(intent: TradingIntent, summary: TradingQuoteSummary, payload: unknown, requestedAt: number): string {
    const now = this.now();
    if (!Number.isFinite(requestedAt) || requestedAt > now || now >= requestedAt + 30_000) throw new Error("Trading quote expired");
    const payloadJson = JSON.stringify(payload);
    if (typeof payloadJson !== "string" || Buffer.byteLength(payloadJson) > this.maxBytes) throw new Error("Trading quote is too large");
    for (const [id, entry] of this.entries) if (now >= entry.expiresAt) this.entries.delete(id);
    if (this.entries.size >= this.maxEntries) throw new Error("Trading quote store is full");
    const id = randomBytes(24).toString("hex");
    this.entries.set(id, { binding: binding(intent, summary.routerVersion), summary: { ...summary }, payloadJson, expiresAt: requestedAt + 30_000 });
    return id;
  }

  read(id: string, intent: TradingIntent, routerVersion: string): { summary: TradingQuoteSummary; payload: unknown; expiresAt: number } {
    const entry = this.entries.get(id);
    if (!entry || this.now() >= entry.expiresAt || entry.binding !== binding(intent, routerVersion)) {
      if (entry && this.now() >= entry.expiresAt) this.entries.delete(id);
      throw new Error("Trading quote is unavailable");
    }
    return { summary: { ...entry.summary }, payload: JSON.parse(entry.payloadJson) as unknown, expiresAt: entry.expiresAt };
  }

  consume(id: string, intent: TradingIntent, routerVersion: string): { summary: TradingQuoteSummary; payload: unknown } {
    const { summary, payload } = this.read(id, intent, routerVersion);
    this.entries.delete(id);
    return { summary, payload };
  }
}
