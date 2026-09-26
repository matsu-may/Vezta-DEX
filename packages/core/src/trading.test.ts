import { describe, expect, it } from "vitest";
import { POLYGON_CHAIN_ID, TOKENS } from "./index";
import { validateTradingIntent, validateTradingQuoteSummary, type TradingIntent, type TradingQuoteSummary } from "./trading";

const swapper = "0x1111111111111111111111111111111111111111" as const;
const intent: TradingIntent = {
  chainId: POLYGON_CHAIN_ID,
  swapper,
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "100000000",
  slippageBps: 50,
};
const now = Date.parse("2026-09-27T00:00:10.000Z");
const quote: TradingQuoteSummary = {
  ...intent,
  chainId: 137,
  amountOut: "100000000000000000",
  minimumAmountOut: "99500000000000000",
  routing: "CLASSIC",
  routerVersion: "2.1.2",
  requestId: "request-1",
  quotedAt: "2026-09-27T00:00:00.000Z",
  source: "uniswap-trading-api",
};

describe("Trading API intent and summary", () => {
  it("accepts only a curated Polygon pair and bounded amount", () => {
    expect(() => validateTradingIntent(intent)).not.toThrow();
    expect(() => validateTradingIntent({ ...intent, chainId: 1 })).toThrow();
    expect(() => validateTradingIntent({ ...intent, amountIn: "10000000001" })).toThrow();
    expect(() => validateTradingIntent({ ...intent, swapper: "0x123" })).toThrow();
    expect(() => validateTradingIntent({ ...intent, tokenOut: TOKENS.USDC.address })).toThrow();
  });

  it("rejects a stale, changed or weak-minimum quote", () => {
    expect(() => validateTradingQuoteSummary(quote, intent, now)).not.toThrow();
    expect(() => validateTradingQuoteSummary({ ...quote, swapper: "0x2222222222222222222222222222222222222222" }, intent, now)).toThrow();
    expect(() => validateTradingQuoteSummary({ ...quote, minimumAmountOut: "1" }, intent, now)).toThrow();
    expect(() => validateTradingQuoteSummary({ ...quote, routerVersion: "2.0" as "2.1.2" }, intent, now)).toThrow();
    expect(() => validateTradingQuoteSummary(quote, intent, now + 31_000)).toThrow("expired");
  });
});
