import { POLYGON_CHAIN_ID, TOKENS, type Address } from "../index";

export const V3_POOL_500 = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9" as const;
export const V3_QUOTER = "0x61fFE014bA17989E743c5F6cB21bF9697530B21e" as const;
export const V3_SWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564" as const;

export interface SwapQuote {
  chainId: number;
  protocol: "v3";
  pool: Address;
  feeTier: 500;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  amountOut: string;
  quoterGasEstimate: string;
  blockNumber: string;
  observedAt: string;
  source: "polygon-rpc";
}

export interface SwapIntent {
  chainId: number;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: string;
  slippageBps: number;
}

const MAX_UINT256 = (1n << 256n) - 1n;
const UINT_PATTERN = /^(0|[1-9]\d*)$/;

export function parseExactInput(value: string, decimals: number): bigint {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) throw new Error("Invalid token decimals");
  const text = value.trim();
  if (!/^(0|[1-9]\d*)(?:\.\d+)?$/.test(text)) throw new Error("Invalid decimal amount");
  const [whole, fraction = ""] = text.split(".");
  if (fraction.length > decimals) throw new Error("Amount exceeds token precision");
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (amount <= 0n || amount > MAX_UINT256) throw new Error("Amount outside uint256 range");
  return amount;
}

export function minimumOutput(quotedAmount: bigint, slippageBps: number): bigint {
  if (quotedAmount <= 0n || !Number.isInteger(slippageBps) || slippageBps < 10 || slippageBps > 300) {
    throw new Error("Invalid quote or slippage");
  }
  const minimum = quotedAmount * BigInt(10_000 - slippageBps) / 10_000n;
  if (minimum <= 0n) throw new Error("Minimum output rounds to zero");
  return minimum;
}

export function validateSwapQuote(quote: SwapQuote, intent: SwapIntent, now: number): void {
  if (intent.chainId !== POLYGON_CHAIN_ID || quote.chainId !== POLYGON_CHAIN_ID || quote.protocol !== "v3" || quote.feeTier !== 500) {
    throw new Error("Unsupported swap route");
  }
  const tokenIn = intent.tokenIn.toLowerCase();
  const tokenOut = intent.tokenOut.toLowerCase();
  const isPair = (tokenIn === TOKENS.USDC.address.toLowerCase() && tokenOut === TOKENS.WETH.address.toLowerCase()) ||
    (tokenIn === TOKENS.WETH.address.toLowerCase() && tokenOut === TOKENS.USDC.address.toLowerCase());
  if (!isPair || quote.tokenIn.toLowerCase() !== tokenIn || quote.tokenOut.toLowerCase() !== tokenOut ||
      quote.pool.toLowerCase() !== V3_POOL_500.toLowerCase() || quote.amountIn !== intent.amountIn) {
    throw new Error("Quote does not match swap intent");
  }
  if (!UINT_PATTERN.test(quote.amountIn) || !UINT_PATTERN.test(quote.amountOut) || BigInt(quote.amountIn) <= 0n || BigInt(quote.amountOut) <= 0n) {
    throw new Error("Invalid quote amounts");
  }
  if (quote.source !== "polygon-rpc" || !UINT_PATTERN.test(quote.blockNumber) ||
      !UINT_PATTERN.test(quote.quoterGasEstimate) || BigInt(quote.blockNumber) <= 0n ||
      BigInt(quote.quoterGasEstimate) <= 0n) {
    throw new Error("Invalid quote provenance");
  }
  minimumOutput(BigInt(quote.amountOut), intent.slippageBps);
  const observed = Date.parse(quote.observedAt);
  if (!Number.isFinite(observed) || observed > now + 5_000 || now - observed > 30_000) {
    throw new Error("Quote expired");
  }
}
