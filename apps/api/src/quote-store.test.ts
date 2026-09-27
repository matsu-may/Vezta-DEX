import { describe, expect, it } from "vitest";
import { TOKENS, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { QuoteStore } from "./quote-store";

const intent: TradingIntent = {
  chainId: 137,
  swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "1000000",
  slippageBps: 50,
};
const summary: TradingQuoteSummary = {
  ...intent,
  chainId: 137,
  amountOut: "1000000000000000",
  minimumAmountOut: "995000000000000",
  routing: "CLASSIC",
  routerVersion: "2.1.2",
  requestId: "upstream-id",
  quotedAt: "2026-09-27T00:00:00.000Z",
  source: "uniswap-trading-api",
};

describe("short-lived Trading API quote store", () => {
  it("returns an opaque single-use ID and keeps the complete upstream payload server-side", () => {
    const now = 1_000;
    const store = new QuoteStore(() => now);
    const payload = { quote: { route: [{ pool: "private-route" }] }, permitData: { typedData: "private-permit" } };
    const id = store.save(intent, summary, payload, now);
    expect(id).toMatch(/^[0-9a-f]{48}$/);
    expect(id).not.toContain(summary.requestId);
    expect(store.consume(id, intent, "2.1.2")).toEqual({ summary, payload });
    expect(() => store.consume(id, intent, "2.1.2")).toThrow();
  });

  it("binds a quote to account, chain, tokens, amount, slippage and router version", () => {
    const store = new QuoteStore(() => 1_000);
    const id = store.save(intent, summary, { quote: {} }, 1_000);
    const mismatches: TradingIntent[] = [
      { ...intent, chainId: 1 },
      { ...intent, swapper: "0x2222222222222222222222222222222222222222" },
      { ...intent, tokenIn: TOKENS.WETH.address },
      { ...intent, tokenOut: TOKENS.USDC.address },
      { ...intent, amountIn: "2000000" },
      { ...intent, slippageBps: 100 },
    ];
    for (const mismatch of mismatches) expect(() => store.consume(id, mismatch, "2.1.2")).toThrow();
    expect(() => store.consume(id, intent, "2.0.0")).toThrow();
    expect(store.consume(id, intent, "2.1.2").summary.requestId).toBe("upstream-id");
  });

  it("expires 30 seconds from quote request start and releases expired capacity", () => {
    let now = 1_000;
    const store = new QuoteStore(() => now, { maxEntries: 1 });
    const old = store.save(intent, summary, { quote: {} }, now);
    expect(() => store.save(intent, summary, { quote: {} }, now)).toThrow();
    now = 31_000;
    expect(() => store.consume(old, intent, "2.1.2")).toThrow();
    const fresh = store.save(intent, summary, { quote: {} }, now);
    expect(fresh).not.toBe(old);
  });

  it("rejects oversized or already-expired payloads before storing them", () => {
    const store = new QuoteStore(() => 31_000, { maxBytes: 64 });
    expect(() => store.save(intent, summary, { large: "x".repeat(100) }, 31_000)).toThrow();
    expect(() => store.save(intent, summary, { quote: {} }, 1_000)).toThrow();
    expect(store.save(intent, summary, { quote: {} }, 31_000)).toMatch(/^[0-9a-f]{48}$/);
  });
});
