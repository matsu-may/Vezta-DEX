import {
  UNIVERSAL_ROUTER_VERSION,
  TRADING_ROUTING_POLICY,
  inspectTradingRoute,
  validateTradingIntent,
  validateTradingQuoteSummary,
  type TradingIntent,
  type TradingQuoteSummary,
} from "@vezta-dex/core";
import { z } from "zod";
import { TradingApiClient } from "./trading-client";
import { QuoteStore } from "./quote-store";

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
export class TradingApiUnavailableError extends Error {}

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
    } catch {
      throw new TradingApiUnavailableError("Trading API is unavailable");
    }
    if (!response.ok) throw new TradingApiUnavailableError("Trading API is unavailable");

    let payload: unknown;
    try {
      payload = await readBoundedJson(response);
    } catch {
      throw new TradingApiUnavailableError("Invalid Trading API response");
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.txFailureReason || parsed.data.quote.txFailureReason || parsed.data.quote.txFailureReasons?.length) {
      throw new TradingApiUnavailableError("Invalid Trading API response");
    }
    const { quote, requestId } = parsed.data;
    try {
      inspectTradingRoute(quote.route, intent);
    } catch {
      throw new TradingApiUnavailableError("Unsupported Trading API route");
    }
    if (quote.input.token.toLowerCase() !== intent.tokenIn.toLowerCase() ||
        quote.input.amount !== intent.amountIn ||
        quote.output.token.toLowerCase() !== intent.tokenOut.toLowerCase() ||
        quote.output.recipient.toLowerCase() !== intent.swapper.toLowerCase() ||
        quote.swapper.toLowerCase() !== intent.swapper.toLowerCase()) {
      throw new TradingApiUnavailableError("Trading API quote does not match intent");
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
    try {
      validateTradingQuoteSummary(summary, intent, this.now());
    } catch {
      throw new TradingApiUnavailableError("Invalid Trading API quote amounts");
    }
    try {
      return { quote: summary, quoteId: this.store.save(intent, summary, payload, requestedAt) };
    } catch {
      throw new TradingApiUnavailableError("Trading API quote is unavailable");
    }
  }
}
