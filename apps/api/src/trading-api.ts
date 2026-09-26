import {
  UNIVERSAL_ROUTER_VERSION,
  validateTradingIntent,
  validateTradingQuoteSummary,
  type TradingIntent,
  type TradingQuoteSummary,
} from "@vezta-dex/core";
import { z } from "zod";

const API_URL = "https://trade-api.gateway.uniswap.org/v1/quote";
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const positiveAmount = z.string().regex(/^[1-9]\d{0,77}$/);
const responseSchema = z.object({
  requestId: z.string().min(1).max(256),
  routing: z.literal("CLASSIC"),
  txFailureReason: z.string().nullish(),
  quote: z.object({
    input: z.object({ token: address, amount: positiveAmount }),
    output: z.object({ token: address, amount: positiveAmount, minimumAmount: positiveAmount, recipient: address }),
    swapper: address.optional(),
    txFailureReason: z.string().nullish(),
  }),
});

export class TradingApiInputError extends Error {}
export class TradingApiUnavailableError extends Error {}

export class TradingApiQuoteReader {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {
    if (!apiKey.trim()) throw new Error("UNISWAP_API_KEY is required");
  }

  async getQuote(intent: TradingIntent): Promise<TradingQuoteSummary> {
    try {
      validateTradingIntent(intent);
    } catch {
      throw new TradingApiInputError("Unsupported Polygon trading quote");
    }
    const requestedAt = this.now();

    let response: Response;
    try {
      response = await this.fetcher(API_URL, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "x-universal-router-version": UNIVERSAL_ROUTER_VERSION,
          "x-agent-info": JSON.stringify({ integration_name: "swap-integration", decision_origin: "human_mediated", version: "1.6.0" }),
        },
        body: JSON.stringify({
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
          protocols: ["V2", "V3", "V4"],
          permitAmount: "EXACT",
        }),
        signal: AbortSignal.timeout(8_000),
      });
    } catch {
      throw new TradingApiUnavailableError("Trading API is unavailable");
    }
    if (!response.ok) throw new TradingApiUnavailableError("Trading API is unavailable");

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new TradingApiUnavailableError("Invalid Trading API response");
    }
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.txFailureReason || parsed.data.quote.txFailureReason) {
      throw new TradingApiUnavailableError("Invalid Trading API response");
    }
    const { quote, requestId } = parsed.data;
    if (quote.input.token.toLowerCase() !== intent.tokenIn.toLowerCase() ||
        quote.input.amount !== intent.amountIn ||
        quote.output.token.toLowerCase() !== intent.tokenOut.toLowerCase() ||
        quote.output.recipient.toLowerCase() !== intent.swapper.toLowerCase() ||
        (quote.swapper && quote.swapper.toLowerCase() !== intent.swapper.toLowerCase())) {
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
    return summary;
  }
}
