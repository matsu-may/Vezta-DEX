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
      route: [[{
        type: "v3-pool", address: "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9",
        tokenIn: { chainId: 137, address: intent.tokenIn },
        tokenOut: { chainId: 137, address: intent.tokenOut },
      }]],
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
  it.each([
    [401, "TRADING_API_AUTH_FAILED"],
    [403, "TRADING_API_AUTH_FAILED"],
    [429, "TRADING_API_RATE_LIMITED"],
    [500, "TRADING_API_HTTP_ERROR"],
  ])("reports a safe diagnostic code for upstream HTTP %s", async (status, code) => {
    const reader = new TradingApiQuoteReader(new TradingApiClient("private-key", async () => new Response("secret-upstream", { status })));
    try {
      await reader.getQuote(intent);
      expect.fail("must reject the upstream error");
    } catch (error) {
      expect(error).toMatchObject({ code, upstreamStatus: status });
      expect(JSON.stringify(error)).not.toContain("private-key");
      expect(JSON.stringify(error)).not.toContain("secret-upstream");
    }
  });

  it.each([
    [new TypeError("private-network-detail"), "TRADING_API_NETWORK_ERROR"],
    [new DOMException("private-timeout-detail", "TimeoutError"), "TRADING_API_TIMEOUT"],
  ])("distinguishes a network error from timeout with only a fixed code", async (cause, code) => {
    const reader = new TradingApiQuoteReader(new TradingApiClient("private-key", async () => { throw cause; }));
    await expect(reader.getQuote(intent)).rejects.toMatchObject({ code });
  });

  it.each([
    [new DOMException("private-body-timeout", "TimeoutError"), "TRADING_API_TIMEOUT"],
    [new TypeError("private-body-network-error"), "TRADING_API_NETWORK_ERROR"],
  ])("identifies failures while reading the HTTP response body", async (cause, code) => {
    const response = new Response(new ReadableStream({ start(controller) { controller.error(cause); } }));
    const reader = new TradingApiQuoteReader(new TradingApiClient("private-key", async () => response));
    await expect(reader.getQuote(intent)).rejects.toMatchObject({ code, upstreamStatus: 200 });
  });

  it.each([
    ["shape", "TRADING_API_INVALID_RESPONSE"],
    ["simulation", "TRADING_API_SIMULATION_FAILED"],
    ["route", "TRADING_API_UNSUPPORTED_ROUTE"],
    ["identity", "TRADING_API_INTENT_MISMATCH"],
    ["minimum", "TRADING_API_INVALID_AMOUNTS"],
  ])("identifies the rejected quote stage %s without exposing the quote", async (kind, code) => {
    const body = apiResponse();
    if (kind === "shape") Object.assign(body.quote, { chainId: 1 });
    if (kind === "simulation") body.quote.txFailureReasons = ["private-simulation-detail"] as never[];
    if (kind === "route") body.quote.route[0][0].type = "unknown-pool";
    if (kind === "identity") body.quote.output.recipient = "0x2222222222222222222222222222222222222222";
    if (kind === "minimum") body.quote.output.minimumAmount = "1";
    const reader = new TradingApiQuoteReader(new TradingApiClient("private-key", async () => Response.json(body)));
    await expect(reader.getQuote(intent)).rejects.toMatchObject({ code });
  });

  it("distinguishes expired quotes from store capacity failure", async () => {
    let now = Date.parse("2026-09-28T00:00:00Z");
    const expired = new TradingApiQuoteReader(new TradingApiClient("test-key", async () => { now += 30_000; return Response.json(apiResponse()); }), () => now);
    await expect(expired.getQuote(intent)).rejects.toMatchObject({ code: "TRADING_API_QUOTE_EXPIRED" });
    const store = new QuoteStore(() => now, { maxEntries: 1 });
    const full = new TradingApiQuoteReader(new TradingApiClient("test-key", async () => Response.json(apiResponse())), () => now, store);
    await full.getQuote(intent);
    await expect(full.getQuote(intent)).rejects.toMatchObject({ code: "TRADING_QUOTE_STORE_UNAVAILABLE" });
  });

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
      generatePermitAsTransaction: false,
      protocols: ["V2", "V3", "V4"],
      hooksOptions: "V4_NO_HOOKS",
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

  it("rejects hooked or unverifiable route metadata before saving a quote", async () => {
    const base = apiResponse().quote.route[0][0];
    for (const route of [undefined, [], [[{ ...base, type: "v4-pool", address: `0x${"1".repeat(64)}`, hooks: intent.swapper }]], [[{ ...base, type: "v4-pool", address: `0x${"1".repeat(64)}` }]], [[{ ...base, type: "unknown-pool" }]]]) {
      const payload = apiResponse({ quote: { ...apiResponse().quote, route } });
      const fetcher = vi.fn(async () => Response.json(payload)) as unknown as typeof fetch;
      const store = new QuoteStore();
      const save = vi.spyOn(store, "save");
      const reader = new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher), Date.now, store);
      await expect(reader.getQuote(intent)).rejects.toThrow();
      expect(save).not.toHaveBeenCalled();
    }
  });

  it("keeps complete hook-free V4 routes server-side", async () => {
    const base = apiResponse().quote.route[0][0];
    const payload = apiResponse({ quote: { ...apiResponse().quote, route: [[{ ...base, type: "v4-pool", address: `0x${"1".repeat(64)}`, hooks: "0x0000000000000000000000000000000000000000" }]] } });
    const fetcher = vi.fn(async () => Response.json(payload)) as unknown as typeof fetch;
    const result = await new TradingApiQuoteReader(new TradingApiClient("test-key", fetcher)).getQuote(intent);
    expect(result.quoteId).toMatch(/^[0-9a-f]{48}$/);
    expect(JSON.stringify(result)).not.toContain("v4-pool");
    expect(JSON.stringify(result)).not.toContain("hooks");
  });
});
