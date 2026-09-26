import { validateTradingIntent, type Address, type TradingIntent, type TradingQuoteSummary } from "@vezta-dex/core";
import { z } from "zod";
import { DexApiError } from "./api";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);
const intentSchema = z.object({
  chainId: z.literal(137),
  swapper: address,
  tokenIn: address,
  tokenOut: address,
  amountIn: z.string().regex(/^[1-9]\d{0,18}$/),
  slippageBps: z.number().int().min(10).max(300),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function createTradingQuoteHandler(getQuote: (intent: TradingIntent) => Promise<TradingQuoteSummary>) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body: unknown;
    try {
      const raw = await request.text();
      if (raw.length > 4_096) return json({ error: "Request too large" }, 413);
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid quote request" }, 400);
    }
    const parsed = intentSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid quote request" }, 400);
    try {
      validateTradingIntent(parsed.data);
    } catch {
      return json({ error: "Unsupported Polygon trading quote" }, 400);
    }
    try {
      return json({ quote: await getQuote(parsed.data) });
    } catch (error) {
      const status = error instanceof DexApiError && error.status === 400 ? 400 : 503;
      return json({ error: status === 400 ? "Invalid quote request" : "Trading API quote is unavailable" }, status);
    }
  };
}
