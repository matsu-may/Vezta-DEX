import { describe, expect, it } from "vitest";
import { TOKENS, V3_POOL_500, type SwapQuote } from "@vezta-dex/core";
import { createQuoteHandler } from "../../../lib/quote-route";

const quote: SwapQuote = {
  chainId: 137, protocol: "v3", pool: V3_POOL_500, feeTier: 500,
  tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address,
  amountIn: "100000000", amountOut: "37220700433119377", quoterGasEstimate: "117644",
  blockNumber: "94497119", observedAt: "2026-09-26T19:26:59.000Z", source: "polygon-rpc",
};

describe("same-origin quote route", () => {
  it("forwards a curated integer amount and returns no-store JSON", async () => {
    const handler = createQuoteHandler(async (intent) => {
      expect(intent).toMatchObject({ chainId: 137, tokenIn: TOKENS.USDC.address, amountIn: "100000000", slippageBps: 50 });
      return quote;
    });
    const response = await handler(new Request(`http://localhost/api/quote?chainId=137&tokenIn=${TOKENS.USDC.address}&amountIn=100000000&slippageBps=50`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).quote.pool).toBe(V3_POOL_500);
  });

  it("rejects invalid chain and amount before calling the API", async () => {
    let called = false;
    const handler = createQuoteHandler(async () => { called = true; return quote; });
    const response = await handler(new Request(`http://localhost/api/quote?chainId=1&tokenIn=${TOKENS.USDC.address}&amountIn=1e6&slippageBps=50`));
    expect(response.status).toBe(400);
    expect(called).toBe(false);
  });
});
