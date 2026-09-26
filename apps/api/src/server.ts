import { TOKENS, parsePoolKey, type TradingIntent } from "@vezta-dex/core";
import { z } from "zod";
import type { PoolReader } from "./pools";
import { QuoteInputError, type QuoteReader } from "./quote";
import { TradingApiInputError, type TradingApiQuoteReader } from "./trading-api";

const tradingIntentSchema = z.object({
  chainId: z.literal(137),
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenIn: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenOut: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountIn: z.string().regex(/^[1-9]\d{0,18}$/),
  slippageBps: z.number().int().min(10).max(300),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleRequest(request: Request, reader: PoolReader, quotes?: QuoteReader, trading?: TradingApiQuoteReader): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/v1/trading-quote") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!trading) return json({ error: "Trading API is not configured" }, 503);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid quote request" }, 400);
    }
    const parsed = tradingIntentSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid quote request" }, 400);
    try {
      const quote = await trading.getQuote(parsed.data as TradingIntent);
      return json({ quote });
    } catch (error) {
      return error instanceof TradingApiInputError ? json({ error: error.message }, 400) : json({ error: "Trading API quote is unavailable" }, 503);
    }
  }
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (pathname === "/health") return json({ status: "ok" });
  if (pathname === "/api/v1/tokens") return json({ tokens: [TOKENS.USDC, TOKENS.WETH] });

  if (pathname === "/api/v1/quote") {
    if (!quotes) return json({ error: "Quote service is unavailable" }, 503);
    const params = new URL(request.url).searchParams;
    try {
      const quote = await quotes.getQuote({
        chainId: Number(params.get("chainId")),
        tokenIn: (params.get("tokenIn") ?? "") as `0x${string}`,
        amountIn: params.get("amountIn") ?? "",
      });
      return json({ quote });
    } catch (error) {
      return error instanceof QuoteInputError ? json({ error: error.message }, 400) : json({ error: "Polygon quote is unavailable" }, 503);
    }
  }

  if (pathname === "/api/v1/pools") {
    try {
      return json({ pools: await reader.listCuratedPools() });
    } catch {
      return json({ error: "Polygon pool data is unavailable" }, 503);
    }
  }

  if (pathname.startsWith("/api/v1/pools/")) {
    let key: string;
    try {
      key = decodeURIComponent(pathname.slice("/api/v1/pools/".length));
      parsePoolKey(key);
    } catch {
      return json({ error: "Invalid pool ID" }, 400);
    }
    try {
      const pool = await reader.getPool(key);
      return pool ? json({ pool }) : json({ error: "Pool not found" }, 404);
    } catch {
      return json({ error: "Polygon pool data is unavailable" }, 503);
    }
  }

  return json({ error: "Not found" }, 404);
}
