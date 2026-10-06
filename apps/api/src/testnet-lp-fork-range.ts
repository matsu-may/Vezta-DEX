import { testnetLpRangeSchema, type TestnetLpRange } from "@vezta-dex/core";
/** Local fixture only: a finite spacing-60 range centered on the observed tick. */
export function customLpForkRange(tick: number): TestnetLpRange {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272) throw new Error("Invalid fixture tick");
  const center = Math.floor(tick / 60) * 60;
  return testnetLpRangeSchema.parse({ tickLower: Math.max(-887220, Math.min(887160, center - 600)),
    tickUpper: Math.min(887220, Math.max(-887160, center + 660)) });
}
export function parseLpWalletForkOptions(args: readonly string[]) {
  if (args.length === 0) return { customRange: false };
  if (args.length === 1 && args[0] === "--custom-range") return { customRange: true };
  throw new Error("Invalid LP wallet fork options");
}
