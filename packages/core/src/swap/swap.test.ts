import { describe, expect, it } from "vitest";
import { POLYGON_CHAIN_ID, TOKENS } from "../index";
import { V3_POOL_500, minimumOutput, parseExactInput, validateSwapQuote, type SwapQuote } from "./swap";

const observedAt = "2026-09-26T19:26:59.000Z";
const now = Date.parse("2026-09-26T19:27:10.000Z");
const quote: SwapQuote = {
  chainId: POLYGON_CHAIN_ID,
  protocol: "v3",
  pool: V3_POOL_500,
  feeTier: 500,
  tokenIn: TOKENS.USDC.address,
  tokenOut: TOKENS.WETH.address,
  amountIn: "100000000",
  amountOut: "37220700433119377",
  quoterGasEstimate: "117644",
  blockNumber: "94497119",
  observedAt,
  source: "polygon-rpc",
};
const intent = { chainId: 137, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn: "100000000", slippageBps: 50 };

describe("swap arithmetic and quote checks", () => {
  it("converts decimal input without floating point", () => {
    expect(parseExactInput("1.234567", 6)).toBe(1234567n);
    expect(parseExactInput("0.000000000000000001", 18)).toBe(1n);
    expect(() => parseExactInput("1.2345678", 6)).toThrow();
    expect(() => parseExactInput("1e6", 6)).toThrow();
    expect(() => parseExactInput("0", 6)).toThrow();
  });

  it("rounds minimum output down using integer basis points", () => {
    expect(minimumOutput(101n, 100)).toBe(99n);
    expect(minimumOutput(10000n, 50)).toBe(9950n);
    expect(() => minimumOutput(100n, 0)).toThrow();
    expect(() => minimumOutput(100n, 301)).toThrow();
  });

  it("accepts only a fresh quote matching the selected intent", () => {
    expect(() => validateSwapQuote(quote, intent, now)).not.toThrow();
    expect(() => validateSwapQuote({ ...quote, tokenIn: TOKENS.WETH.address }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, pool: "0x1111111111111111111111111111111111111111" }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, amountIn: "100000001" }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, chainId: 1 }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, source: "untrusted" as SwapQuote["source"] }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, blockNumber: "bad" }, intent, now)).toThrow();
    expect(() => validateSwapQuote({ ...quote, quoterGasEstimate: "bad" }, intent, now)).toThrow();
    expect(() => validateSwapQuote(quote, intent, now + 31_000)).toThrow("expired");
  });
});
