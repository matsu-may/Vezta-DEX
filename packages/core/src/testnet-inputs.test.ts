import { expect, it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as C } from "./testnet";
import { parseTestnetSwapAmount, parseTestnetSlippage } from "./testnet-inputs";

it("parses token decimal strings exactly and never rounds excess precision", () => {
  expect(parseTestnetSwapAmount("1.234567", C.USDC.address)).toBe("1234567");
  expect(parseTestnetSwapAmount("0.000123456789012345", C.WETH.address)).toBe("123456789012345");
  for (const input of ["", "0", "1.0000001", "1e-6", "-1", " 1", "01", "5.000001", "1,2", "1."]) {
    expect(() => parseTestnetSwapAmount(input, C.USDC.address)).toThrow();
  }
  expect(() => parseTestnetSwapAmount("0.001000000000000001", C.WETH.address)).toThrow();
  expect(() => parseTestnetSwapAmount("1", C.v3Factory)).toThrow();
});
it("parses slippage percentages as exact bounded integer basis points", () => {
  for (const [input, bps] of [["0.05", 5], ["0.25", 25], ["0.5", 50], ["1", 100]] as const) expect(parseTestnetSlippage(input)).toBe(bps);
  for (const input of ["0", "0.04", "1.01", "0.055", "1e-1", "", "NaN", " 0.5"]) expect(() => parseTestnetSlippage(input)).toThrow();
});
