import { expect, it } from "vitest";
it("derives a bounded custom spacing-60 fixture around the current pool tick", async () => {
  const rangeModule = await import("./testnet-lp-fork-range").catch(()=>undefined);
  expect(rangeModule?.customLpForkRange).toBeTypeOf("function");
  for (const tick of [-887271,-600,-1,0,1,251234,887271]) {
    const range = rangeModule!.customLpForkRange(tick);
    expect(Math.abs(range.tickLower % 60)).toBe(0); expect(Math.abs(range.tickUpper % 60)).toBe(0);
    expect(range.tickLower).toBeGreaterThanOrEqual(-887220); expect(range.tickUpper).toBeLessThanOrEqual(887220);
    expect(range.tickUpper).toBeGreaterThan(range.tickLower);
    if(tick>=-887220 && tick<887220) { expect(range.tickLower).toBeLessThanOrEqual(tick); expect(range.tickUpper).toBeGreaterThan(tick); }
  }
});
it("keeps old CLI default and rejects arbitrary range arguments", async()=>{
  const rangeModule = await import("./testnet-lp-fork-range").catch(()=>undefined);
  expect(rangeModule?.parseLpWalletForkOptions).toBeTypeOf("function");
  expect(rangeModule!.parseLpWalletForkOptions([])).toEqual({customRange:false});
  expect(rangeModule!.parseLpWalletForkOptions(["--custom-range"])).toEqual({customRange:true});
  for(const args of [["--custom-range","--custom-range"],["--tick=1"],["--custom-range","extra"]]) expect(()=>rangeModule!.parseLpWalletForkOptions(args)).toThrow();
  for(const tick of [NaN,Infinity,1.5,887273]) expect(()=>rangeModule!.customLpForkRange(tick)).toThrow();
});
