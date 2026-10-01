import { BASE_SEPOLIA_CANDIDATE, minimumOutput, type Address } from "@vezta-dex/core";

const C = BASE_SEPOLIA_CANDIDATE;
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const POSITIVE = /^[1-9]\d{0,77}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid testnet quote");
  return value as Record<string, unknown>;
}
function same(a: unknown, b: string): boolean {
  return typeof a === "string" && ADDRESS.test(a) && a.toLowerCase() === b.toLowerCase();
}
function currency(value: unknown, address: string): boolean {
  const token = record(value);
  return (token.chainId === C.chainId || token.chainId === String(C.chainId))
    && same(token.address, address);
}

export interface BaseSepoliaQuoteSummary {
  chainId: typeof C.chainId;
  routing: "CLASSIC";
  poolAddress: Address;
  amountIn: "1000000";
  amountOut: string;
  minimumAmountOut: string;
  requestId: string;
}

/** A read-only diagnostic. It never returns a permit, calldata or signature request. */
export function inspectBaseSepoliaQuote(value: unknown, wallet: string,
  qualifiedPools: readonly string[]): BaseSepoliaQuoteSummary {
  if (!ADDRESS.test(wallet) || qualifiedPools.length === 0) throw new Error("Invalid testnet quote context");
  const outer = record(value);
  const quote = record(outer.quote);
  if (outer.routing !== "CLASSIC" || typeof outer.requestId !== "string"
    || outer.requestId.length === 0 || outer.requestId.length > 256
    || (quote.chainId !== C.chainId && quote.chainId !== String(C.chainId))
    || quote.tradeType !== "EXACT_INPUT" || !same(quote.swapper, wallet)
    || quote.txFailureReason || outer.txFailureReason
    || !Array.isArray(quote.txFailureReasons) || quote.txFailureReasons.length !== 0) {
    throw new Error("Testnet quote identity or execution status mismatch");
  }
  const input = record(quote.input);
  const output = record(quote.output);
  if (!same(input.token, C.USDC.address) || input.amount !== "1000000"
    || !same(output.token, C.WETH.address) || !same(output.recipient, wallet)
    || typeof output.amount !== "string" || !POSITIVE.test(output.amount)
    || typeof output.minimumAmount !== "string" || !POSITIVE.test(output.minimumAmount)) {
    throw new Error("Testnet quote token or amount mismatch");
  }
  const amountOut = BigInt(output.amount);
  const minimum = BigInt(output.minimumAmount);
  if (minimum > amountOut || minimum < minimumOutput(amountOut, 50)) {
    throw new Error("Testnet quote minimum mismatch");
  }
  if (!Array.isArray(quote.route) || quote.route.length !== 1
    || !Array.isArray(quote.route[0]) || quote.route[0].length !== 1) {
    throw new Error("Unsupported testnet quote route");
  }
  const pool = record(quote.route[0][0]);
  if (pool.type !== "v3-pool" || typeof pool.address !== "string" || !ADDRESS.test(pool.address)
    || !qualifiedPools.some(address => same(pool.address, address))
    || !currency(pool.tokenIn, C.USDC.address) || !currency(pool.tokenOut, C.WETH.address)
    || (pool.hooks !== undefined && !same(pool.hooks, "0x0000000000000000000000000000000000000000"))) {
    throw new Error("Testnet route is not the qualified v3 pool");
  }
  return { chainId: C.chainId, routing: "CLASSIC", poolAddress: pool.address as Address,
    amountIn: "1000000", amountOut: output.amount,
    minimumAmountOut: output.minimumAmount, requestId: outer.requestId };
}
