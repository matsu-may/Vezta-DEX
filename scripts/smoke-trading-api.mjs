import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../apps/api/.env", import.meta.url), "utf8");
const key = env.split(/\r?\n/).find((line) => line.startsWith("UNISWAP_API_KEY="))?.slice("UNISWAP_API_KEY=".length).trim();
if (!key) throw new Error("UNISWAP_API_KEY is missing");

const swapper = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(swapper)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");

const pairs = [
  ["USDC_TO_WETH", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "1000000"],
  ["WETH_TO_USDC", "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619", "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", "1000000000000000"],
];

for (const [direction, tokenIn, tokenOut, amount] of pairs) {
  try {
    const response = await fetch("https://trade-api.gateway.uniswap.org/v1/quote", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-api-key": key,
        "x-universal-router-version": "2.1.2",
      },
      body: JSON.stringify({
        type: "EXACT_INPUT", amount, tokenInChainId: 137, tokenOutChainId: 137,
        tokenIn, tokenOut, swapper, recipient: swapper, slippageTolerance: 0.5,
        routingPreference: "BEST_PRICE", protocols: ["V2", "V3", "V4"], permitAmount: "EXACT",
      }),
      signal: AbortSignal.timeout(12_000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    const quote = body?.quote;
    process.stdout.write(JSON.stringify({
      direction,
      status: response.status,
      errorCode: typeof body?.errorCode === "string" ? body.errorCode : undefined,
      routing: typeof body?.routing === "string" ? body.routing : undefined,
      responseFields: body && typeof body === "object" ? Object.keys(body).sort() : [],
      quoteFields: quote && typeof quote === "object" ? Object.keys(quote).sort() : [],
      inputFields: quote?.input && typeof quote.input === "object" ? Object.keys(quote.input).sort() : [],
      outputFields: quote?.output && typeof quote.output === "object" ? Object.keys(quote.output).sort() : [],
      hasPermitData: Boolean(body?.permitData),
      hasTxFailureReason: Boolean(body?.txFailureReason || quote?.txFailureReason),
    }) + "\n");
    if (response.status === 401 || response.status === 429) break;
  } catch (error) {
    process.stdout.write(JSON.stringify({ direction, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
