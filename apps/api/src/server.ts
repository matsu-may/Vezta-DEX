import { TOKENS, parsePoolKey } from "@vezta-dex/core";
import type { PoolReader } from "./pools";
import { QuoteInputError, type QuoteReader } from "./quote";

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function handleRequest(request: Request, reader: PoolReader, quotes?: QuoteReader): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const pathname = new URL(request.url).pathname;
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
