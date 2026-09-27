import { describe, expect, it, vi } from "vitest";
import { TOKENS, type TradingIntent } from "@vezta-dex/core";
import { TradingApiQuoteReader } from "./trading-api";
import { TradingApiClient } from "./trading-client";
import { QuoteStore } from "./quote-store";

const intent: TradingIntent = {
  chainId: 137,
  swapper: "0x1111111111111111111111111111111111111111",
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "100000000",
  slippageBps: 50,
};

function apiResponse(changes: Record<string, unknown> = {}) {
  return {
    requestId: "request-1",
    routing: "CLASSIC",
    quote: {
      chainId: 137,
      tradeType: "EXACT_INPUT",
      txFailureReasons: [],
      swapper: intent.swapper,
      input: { token: TOKENS.USDC.address, amount: intent.amountIn },
      output: {
        token: TOKENS.WETH.address,
        amount: "100000000000000000",
        minimumAmount: "99500000000000000",
        recipient: intent.swapper,
      },
    },
    ...changes,
  };
}

describe("Trading API quote reader", () => {
  it("posts a bounded exact-input Polygon request without exposing the key", async () => {
    const fetcher = vi.fn(async () => Response.json(apiResponse())) as unknown as typeof fetch;
    const now = Date.parse("2026-09-27T00:00:00Z");
    const store = new QuoteStore(() => now);
    const result = await new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher), () => now, store).getQuote(intent);
    const [url, options] = vi.mocked(fetcher).mock.calls[0];
    expect(String(url)).toBe("https://trade-api.gateway.uniswap.org/v1/quote");
    expect(options?.headers).toMatchObject({ "x-api-key": "test-key", "x-universal-router-version": "2.1.2" });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      tokenInChainId: 137,
      tokenOutChainId: 137,
      amount: "100000000",
      swapper: intent.swapper,
      slippageTolerance: 0.5,
      permitAmount: "EXACT",
      protocols: ["V2", "V3", "V4"],
      routingPreference: "BEST_PRICE",
    });
    expect(result.quote).toMatchObject({ amountOut: "100000000000000000", minimumAmountOut: "99500000000000000", routing: "CLASSIC" });
    expect(result.quoteId).toMatch(/^[0-9a-f]{48}$/);
    expect(store.consume(result.quoteId, intent, "2.1.2").payload).toEqual(apiResponse());
    expect(JSON.stringify(result)).not.toContain("permitData");
    expect(JSON.stringify(result)).not.toContain("test-key");
  });

  it("rejects changed output, unsupported route and failed simulation", async () => {
    const bad = [
      apiResponse({ quote: { ...apiResponse().quote, output: { ...apiResponse().quote.output, recipient: "0x2222222222222222222222222222222222222222" } } }),
      apiResponse({ routing: "CHAINED" }),
      apiResponse({ quote: { ...apiResponse().quote, txFailureReason: "SIMULATION_FAILED" } }),
      apiResponse({ quote: { ...apiResponse().quote, txFailureReasons: ["SIMULATION_FAILED"] } }),
      apiResponse({ quote: { ...apiResponse().quote, chainId: 1 } }),
      apiResponse({ quote: { ...apiResponse().quote, tradeType: "EXACT_OUTPUT" } }),
      apiResponse({ quote: { ...apiResponse().quote, chainId: undefined } }),
      apiResponse({ quote: { ...apiResponse().quote, tradeType: undefined } }),
      apiResponse({ quote: { ...apiResponse().quote, swapper: undefined } }),
      apiResponse({ quote: { ...apiResponse().quote, txFailureReasons: undefined } }),
    ];
    for (const body of bad) {
      const fetcher = vi.fn(async () => Response.json(body)) as unknown as typeof fetch;
      await expect(new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher)).getQuote(intent)).rejects.toThrow();
    }
  });

  it("rejects malformed input before calling the API and hides upstream errors", async () => {
    const fetcher = vi.fn(async () => new Response("secret upstream detail", { status: 401 })) as unknown as typeof fetch;
    const reader = new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher));
    await expect(reader.getQuote({ ...intent, chainId: 1 })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(reader.getQuote(intent)).rejects.toThrow("Trading API is unavailable");
  });

  it("rejects an oversized upstream quote before keeping it in memory", async () => {
    const fetcher = vi.fn(async () => Response.json({ ...apiResponse(), padding: "x".repeat(300_000) })) as unknown as typeof fetch;
    const reader = new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher));
    await expect(reader.getQuote(intent)).rejects.toThrow("Invalid Trading API response");
  });
});
