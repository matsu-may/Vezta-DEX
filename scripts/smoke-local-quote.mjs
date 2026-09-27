// Read-only check of the local API's stored-quote boundary; never signs or submits.
const apiUrl = process.env.DEX_API_URL ?? "http://127.0.0.1:3021";
const swapper = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(swapper)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");

const pairs = [
  ["USDC_TO_WETH", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "1000000"],
  ["WETH_TO_USDC", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "1000000000000000"],
];
const sameAddress = (value, expected) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase();

for (const [direction, tokenIn, tokenOut, amountIn] of pairs) {
  try {
    const response = await fetch(new URL("/api/v1/trading-quote", apiUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chainId: 137, swapper, tokenIn, tokenOut, amountIn, slippageBps: 50 }),
      signal: AbortSignal.timeout(12_000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    const quote = body?.quote;
    process.stdout.write(JSON.stringify({
      direction,
      status: response.status,
      hasOpaqueQuoteId: typeof body?.quoteId === "string" && /^[0-9a-f]{48}$/.test(body.quoteId),
      quoteChainId: quote?.chainId,
      routing: quote?.routing,
      inputMatches: sameAddress(quote?.tokenIn, tokenIn) && quote?.amountIn === amountIn,
      outputMatches: sameAddress(quote?.tokenOut, tokenOut) && sameAddress(quote?.swapper, swapper),
      hasMinimumOutput: typeof quote?.minimumAmountOut === "string" && /^\d+$/.test(quote.minimumAmountOut) && BigInt(quote.minimumAmountOut) > 0n,
      leaksUpstreamPayload: Boolean(body?.permitData || body?.permitTransaction || body?.route),
      error: response.ok ? undefined : body?.error,
    }) + "\n");
    if (!response.ok) break;
  } catch (error) {
    process.stdout.write(JSON.stringify({ direction, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
