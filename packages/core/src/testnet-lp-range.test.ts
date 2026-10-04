import { expect, it } from "vitest";
import { TickMath } from "../../../apps/api/src/uniswap-lp-sdk";
import { lpRangeFromPrices, lpRangePrices, lpTickSqrtRatioX96, lpUsdcPerWethAtTick } from "./testnet-lp-range";
it("matches pinned SDK 3.31.5 TickMath boundaries, bit multipliers and usable grid", () => {
  const ticks = new Set([-887272,-887220,-1,0,1,887220,887272]);
  for (let bit=0;bit<20;bit++) for (const sign of [-1,1]) ticks.add(sign * (2 ** bit));
  for (let tick=-887220;tick<=887220;tick+=60) ticks.add(tick);
  for (const tick of ticks) expect(lpTickSqrtRatioX96(tick)).toBe(BigInt(TickMath.getSqrtRatioAtTick(tick).toString()));
  expect(() => lpTickSqrtRatioX96(887273)).toThrow();
});
it("inverts tick order and accounts for 6/18 decimals using exact rational prices", () => {
  expect(lpUsdcPerWethAtTick(0)).toEqual({numerator:10n**12n,denominator:1n});
  expect(lpRangePrices({tickLower:0,tickUpper:60})).toMatchObject({lower:"994018262239",upper:"1000000000000"});
  const ratio=lpUsdcPerWethAtTick(60),sqrt=BigInt(TickMath.getSqrtRatioAtTick(60).toString());
  expect(ratio.numerator*sqrt*sqrt).toBe(ratio.denominator*(2n**192n)*10n**12n);
});
it("snaps requested prices outward on the spacing-60 grid and reports actual bounds", () => {
  const range=lpRangeFromPrices("2000", "4000");
  expect(range.tickLower % 60).toBe(0); expect(range.tickUpper % 60).toBe(0);
  const low=lpUsdcPerWethAtTick(range.tickUpper),high=lpUsdcPerWethAtTick(range.tickLower);
  expect(low.numerator<=2000n*low.denominator).toBe(true);expect(high.numerator>=4000n*high.denominator).toBe(true);
  const nextLow=lpUsdcPerWethAtTick(range.tickUpper-60),nextHigh=lpUsdcPerWethAtTick(range.tickLower+60);
  expect(nextLow.numerator>2000n*nextLow.denominator).toBe(true); expect(nextHigh.numerator<4000n*nextHigh.denominator).toBe(true);
  const narrow=lpRangeFromPrices("3000", "3000.000001"); expect(narrow.tickUpper-narrow.tickLower).toBe(60);
});
it.each([["0","10"],["2","1"],["1","1"],["NaN","2"],["1e3","2000"],["-1","2"],["","2"],["0.000000000000000000000000000001","10"],["1","99999999999999999999999999999999999999999999999999999999"]])("rejects invalid or unsupported price bounds %s/%s", (lower,upper) => {
  expect(()=>lpRangeFromPrices(lower,upper)).toThrow();
});
