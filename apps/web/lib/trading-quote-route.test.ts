import { describe, expect, it } from "vitest";
import { TOKENS, type TradingQuoteSummary } from "@vezta-dex/core";
import { createTradingQuoteHandler } from "./trading-quote-route";

const body = {
  chainId: 137,
  swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "100000000",
  slippageBps: 50,
};

describe("same-origin Trading API quote route", () => {
  it("passes only validated intent to the server client", async () => {
    let calls = 0;
    const handler = createTradingQuoteHandler(async (intent) => {
      calls++;
      expect(intent).toMatchObject(body);
      return { ...intent, chainId: 137, amountOut: "100000000000000000", minimumAmountOut: "99500000000000000", routing: "CLASSIC", routerVersion: "2.1.2", requestId: "request-1", quotedAt: new Date().toISOString(), source: "uniswap-trading-api" } as TradingQuoteSummary;
    });
    const valid = await handler(new Request("http://localhost/api/trading-quote", { method: "POST", body: JSON.stringify(body) }));
    expect(valid.status).toBe(200);
    const invalid = await handler(new Request("http://localhost/api/trading-quote", { method: "POST", body: JSON.stringify({ ...body, chainId: 1 }) }));
    expect(invalid.status).toBe(400);
    expect(calls).toBe(1);
  });
});
