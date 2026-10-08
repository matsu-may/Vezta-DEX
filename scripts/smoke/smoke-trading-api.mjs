import { readFileSync } from "node:fs";
import { TRADING_ROUTING_POLICY, inspectTradingRoute } from "../../packages/core/src/swap/trading-route.ts";
import { summarizePermit } from "./permit-summary.mjs";

const env = readFileSync(new URL("../../apps/api/.env", import.meta.url), "utf8");
const key = env.split(/\r?\n/).find((line) => line.startsWith("UNISWAP_API_KEY="))?.slice("UNISWAP_API_KEY=".length).trim();
if (!key) throw new Error("UNISWAP_API_KEY is missing");

const swapper = process.env.DEX_SMOKE_WALLET ?? "0x1111111111111111111111111111111111111111";
if (!/^0x[0-9a-fA-F]{40}$/.test(swapper)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");
const sameAddress = (value, expected) => typeof value === "string" && value.toLowerCase() === expected.toLowerCase();

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
        routingPreference: "BEST_PRICE", ...TRADING_ROUTING_POLICY, permitAmount: "EXACT",
      }),
      signal: AbortSignal.timeout(12_000),
    });
    let body;
    try { body = await response.json(); } catch { body = {}; }
    const quote = body?.quote;
    const failureReasons = quote?.txFailureReasons;
    const quoteInput = quote?.input;
    const quoteOutput = quote?.output;
    let routePolicySummary;
    try { routePolicySummary = inspectTradingRoute(quote?.route, { chainId: 137, tokenIn, tokenOut }); } catch { /* Print only the failed policy check. */ }
    const validOutputAmounts = typeof quoteOutput?.amount === "string" && /^\d+$/.test(quoteOutput.amount) &&
      typeof quoteOutput?.minimumAmount === "string" && /^\d+$/.test(quoteOutput.minimumAmount) &&
      BigInt(quoteOutput.minimumAmount) > 0n && BigInt(quoteOutput.minimumAmount) <= BigInt(quoteOutput.amount);
    process.stdout.write(JSON.stringify({
      direction,
      status: response.status,
      errorCode: typeof body?.errorCode === "string" ? body.errorCode : undefined,
      routing: typeof body?.routing === "string" ? body.routing : undefined,
      hooksOptions: TRADING_ROUTING_POLICY.hooksOptions,
      routePolicyMatches: Boolean(routePolicySummary),
      routePolicySummary,
      responseFields: body && typeof body === "object" ? Object.keys(body).sort() : [],
      quoteFields: quote && typeof quote === "object" ? Object.keys(quote).sort() : [],
      inputFields: quote?.input && typeof quote.input === "object" ? Object.keys(quote.input).sort() : [],
      outputFields: quote?.output && typeof quote.output === "object" ? Object.keys(quote.output).sort() : [],
      hasPermitData: Boolean(body?.permitData),
      permitDiagnostics: summarizePermit(body?.permitData, { chainId: 137, token: tokenIn, amount }),
      quoteChainId: quote?.chainId,
      quoteTradeType: quote?.tradeType,
      inputMatches: sameAddress(quoteInput?.token, tokenIn) && quoteInput?.amount === amount,
      outputMatches: sameAddress(quoteOutput?.token, tokenOut) && sameAddress(quoteOutput?.recipient, swapper),
      minimumOutputValid: validOutputAmounts,
      failureReasonCount: Array.isArray(failureReasons) ? failureReasons.length : undefined,
      hasTxFailureReason: Boolean(body?.txFailureReason || quote?.txFailureReason || (Array.isArray(failureReasons) ? failureReasons.length : failureReasons)),
    }) + "\n");
    if (response.status === 401 || response.status === 429) break;
  } catch (error) {
    process.stdout.write(JSON.stringify({ direction, networkError: error instanceof Error ? error.name : "unknown" }) + "\n");
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}
