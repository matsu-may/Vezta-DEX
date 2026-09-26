import { POLYGON_CHAIN_ID, TOKENS, type Address, type SwapIntent, type SwapQuote } from "@vezta-dex/core";
import { DexApiError } from "./api";

const UINT_PATTERN = /^[1-9]\d*$/;

export function createQuoteHandler(getQuote: (intent: SwapIntent) => Promise<SwapQuote>) {
  return async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    const chainId = Number(params.get("chainId"));
    const tokenIn = params.get("tokenIn") ?? "";
    const amountIn = params.get("amountIn") ?? "";
    const slippageBps = Number(params.get("slippageBps"));
    const curated = [TOKENS.USDC.address.toLowerCase(), TOKENS.WETH.address.toLowerCase()];
    if (chainId !== POLYGON_CHAIN_ID || !curated.includes(tokenIn.toLowerCase()) ||
      !UINT_PATTERN.test(amountIn) || !Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 300) {
      return Response.json({ error: "Invalid quote request" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const tokenOut = tokenIn.toLowerCase() === TOKENS.USDC.address.toLowerCase() ? TOKENS.WETH.address : TOKENS.USDC.address;
    try {
      const quote = await getQuote({ chainId, tokenIn: tokenIn as Address, tokenOut, amountIn, slippageBps });
      return Response.json({ quote }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const status = error instanceof DexApiError ? error.status : 503;
      return Response.json({ error: status === 409 ? "Quote expired" : "Quote unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
    }
  };
}
