import { POLYGON_CHAIN_ID, TOKENS, type Address } from "./index";
import { minimumOutput, type SwapIntent } from "./swap";

export const POLYGON_UNIVERSAL_ROUTER_212 = "0xDc264714F68d84CF29BC605589405E78bDBE7C9f" as const;
export const UNIVERSAL_ROUTER_VERSION = "2.1.2" as const;

export interface TradingIntent extends SwapIntent {
  swapper: Address;
}

export interface TradingQuoteSummary {
  chainId: 137;
  swapper: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  slippageBps: number;
  routing: "CLASSIC";
  routerVersion: "2.1.2";
  requestId: string;
  quotedAt: string;
  source: "uniswap-trading-api";
}

export function validateTradingIntent(intent: TradingIntent): void {
  const input = intent.tokenIn.toLowerCase();
  const output = intent.tokenOut.toLowerCase();
  const usdc = TOKENS.USDC.address.toLowerCase();
  const weth = TOKENS.WETH.address.toLowerCase();
  const max = input === usdc ? 10_000n * 10n ** 6n : 5n * 10n ** 18n;
  if (intent.chainId !== POLYGON_CHAIN_ID ||
      !((input === usdc && output === weth) || (input === weth && output === usdc)) ||
      !/^0x[0-9a-fA-F]{40}$/.test(intent.swapper) ||
      !/^[1-9]\d{0,18}$/.test(intent.amountIn) || BigInt(intent.amountIn) > max ||
      !Number.isInteger(intent.slippageBps) || intent.slippageBps < 10 || intent.slippageBps > 300) {
    throw new Error("Unsupported Trading API intent");
  }
}

export function validateTradingQuoteSummary(quote: TradingQuoteSummary, intent: TradingIntent, now: number): void {
  validateTradingIntent(intent);
  if (quote.chainId !== POLYGON_CHAIN_ID || quote.routing !== "CLASSIC" ||
      quote.routerVersion !== UNIVERSAL_ROUTER_VERSION || quote.source !== "uniswap-trading-api" ||
      quote.swapper.toLowerCase() !== intent.swapper.toLowerCase() ||
      quote.tokenIn.toLowerCase() !== intent.tokenIn.toLowerCase() ||
      quote.tokenOut.toLowerCase() !== intent.tokenOut.toLowerCase() ||
      quote.amountIn !== intent.amountIn || quote.slippageBps !== intent.slippageBps ||
      !quote.requestId || quote.requestId.length > 256 ||
      !/^[1-9]\d{0,77}$/.test(quote.amountOut) ||
      !/^[1-9]\d{0,77}$/.test(quote.minimumAmountOut)) {
    throw new Error("Trading API quote does not match intent");
  }
  const output = BigInt(quote.amountOut);
  const minimum = BigInt(quote.minimumAmountOut);
  if (minimum > output || minimum < minimumOutput(output, intent.slippageBps)) {
    throw new Error("Trading API minimum output is invalid");
  }
  const quoted = Date.parse(quote.quotedAt);
  if (!Number.isFinite(quoted) || quoted > now + 5_000 || now - quoted > 30_000) {
    throw new Error("Trading API quote expired");
  }
}
