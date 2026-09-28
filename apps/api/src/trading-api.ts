import {
  UNIVERSAL_ROUTER_VERSION,
  TRADING_ROUTING_POLICY,
  inspectTradingRoute,
  validateTradingIntent,
  validateTradingQuoteSummary,
  type TradingIntent,
  type TradingQuoteSummary,
  type TradingQuoteFailureCode,
} from "@vezta-dex/core";
import { z } from "zod";
import { TradingApiClient } from "./trading-client";
import { QuoteStore } from "./quote-store";
import { TradingApiQueueFullError } from "./trading-rate-limit";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const positiveAmount = z.string().regex(/^[1-9]\d{0,77}$/);
const MAX_UPSTREAM_QUOTE_BYTES = 256_000;

async function readBoundedJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error("Empty response");
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_UPSTREAM_QUOTE_BYTES) {
        await reader.cancel();
        throw new Error("Oversized response");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
const responseSchema = z.object({
  requestId: z.string().min(1).max(256),
  routing: z.literal("CLASSIC"),
  txFailureReason: z.string().nullish(),
  quote: z.object({
    chainId: z.union([z.literal(137), z.literal("137")]),
    tradeType: z.literal("EXACT_INPUT"),
    input: z.object({ token: address, amount: positiveAmount }),
    output: z.object({ token: address, amount: positiveAmount, minimumAmount: positiveAmount, recipient: address }),
    swapper: address,
    txFailureReason: z.string().nullish(),
    txFailureReasons: z.array(z.unknown()),
    route: z.unknown(),
  }),
});

export class TradingApiInputError extends Error {}
export class TradingApiUnavailableError extends Error {
  constructor(message: string, readonly code: TradingQuoteFailureCode = "TRADING_API_UNAVAILABLE", readonly upstreamStatus?: number) {
    super(message);
  }
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
}

export class TradingApiQuoteReader {
  constructor(
    private readonly client: TradingApiClient,
    private readonly now: () => number = Date.now,
    private readonly store: QuoteStore = new QuoteStore(now),
  ) {}

  async getQuote(intent: TradingIntent): Promise<{ quote: TradingQuoteSummary; quoteId: string }> {
    try {
      validateTradingIntent(intent);
    } catch {
      throw new TradingApiInputError("Unsupported Polygon trading quote");
    }
    const requestedAt = this.now();

    let response: Response;
    try {
      response = await this.client.post("/quote", {
          type: "EXACT_INPUT",
          amount: intent.amountIn,
          tokenInChainId: 137,
          tokenOutChainId: 137,
          tokenIn: intent.tokenIn,
          tokenOut: intent.tokenOut,
          swapper: intent.swapper,
          recipient: intent.swapper,
          slippageTolerance: intent.slippageBps / 100,
          routingPreference: "BEST_PRICE",
          ...TRADING_ROUTING_POLICY,
          permitAmount: "EXACT",
      }, "preview");
    } catch (error) {
      const code = error instanceof TradingApiQueueFullError ? "TRADING_API_QUEUE_FULL"
        : isTimeout(error) ? "TRADING_API_TIMEOUT"
        : "TRADING_API_NETWORK_ERROR";
      throw new TradingApiUnavailableError("Trading API is unavailable", code);
    }
    if (!response.ok) {
      const code = [401, 403].includes(response.status) ? "TRADING_API_AUTH_FAILED"
        : response.status === 429 ? "TRADING_API_RATE_LIMITED" : "TRADING_API_HTTP_ERROR";
      throw new TradingApiUnavailableError("Trading API is unavailable", code, response.status);
    }

    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch (error) {
      const code = isTimeout(error) ? "TRADING_API_TIMEOUT"
        : error instanceof TypeError ? "TRADING_API_NETWORK_ERROR" : "TRADING_API_INVALID_RESPONSE";
      throw new TradingApiUnavailableError("Invalid Trading API response", code, response.status);
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new TradingApiUnavailableError("Invalid Trading API response", "TRADING_API_INVALID_RESPONSE", response.status);
    }
    if (parsed.data.txFailureReason || parsed.data.quote.txFailureReason || parsed.data.quote.txFailureReasons.length) {
      throw new TradingApiUnavailableError("Invalid Trading API response", "TRADING_API_SIMULATION_FAILED", response.status);
    }
    const { quote, requestId } = parsed.data;
    try {
      inspectTradingRoute(quote.route, intent);
    } catch {
      throw new TradingApiUnavailableError("Unsupported Trading API route", "TRADING_API_UNSUPPORTED_ROUTE", response.status);
    }
    if (quote.input.token.toLowerCase() !== intent.tokenIn.toLowerCase() ||
        quote.input.amount !== intent.amountIn ||
        quote.output.token.toLowerCase() !== intent.tokenOut.toLowerCase() ||
        quote.output.recipient.toLowerCase() !== intent.swapper.toLowerCase() ||
        quote.swapper.toLowerCase() !== intent.swapper.toLowerCase()) {
      throw new TradingApiUnavailableError("Trading API quote does not match intent", "TRADING_API_INTENT_MISMATCH", response.status);
    }
    const summary: TradingQuoteSummary = {
      chainId: 137,
      swapper: intent.swapper,
      tokenIn: intent.tokenIn,
      tokenOut: intent.tokenOut,
      amountIn: intent.amountIn,
      amountOut: quote.output.amount,
      minimumAmountOut: quote.output.minimumAmount,
      slippageBps: intent.slippageBps,
      routing: "CLASSIC",
      routerVersion: UNIVERSAL_ROUTER_VERSION,
      requestId,
      quotedAt: new Date(requestedAt).toISOString(),
      source: "uniswap-trading-api",
    };
    if (this.now() >= requestedAt + 30_000) throw new TradingApiUnavailableError("Trading API quote is unavailable", "TRADING_API_QUOTE_EXPIRED", response.status);
    try {
      validateTradingQuoteSummary(summary, intent, this.now());
    } catch {
      throw new TradingApiUnavailableError("Invalid Trading API quote amounts", "TRADING_API_INVALID_AMOUNTS", response.status);
    }
    try {
      return { quote: summary, quoteId: this.store.save(intent, summary, payload, requestedAt) };
    } catch {
      const code = this.now() >= requestedAt + 30_000 ? "TRADING_API_QUOTE_EXPIRED" : "TRADING_QUOTE_STORE_UNAVAILABLE";
      throw new TradingApiUnavailableError("Trading API quote is unavailable", code, response.status);
    }
  }
}
