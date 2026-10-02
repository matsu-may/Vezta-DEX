import { expect, it } from "vitest";
import { reviewLpForkOutcome } from "./testnet-lp-fork-outcome";
const evidence = { kind: "decrease" as const, before: { USDC: 100n, WETH: 200n, liquidity: 1000n, owed0: 0n, owed1: 0n },
  after: { USDC: 100n, WETH: 200n, liquidity: 500n, owed0: 10n, owed1: 20n }, liquidity: 500n, amount0: 10n, amount1: 20n };
it("decrease accrues owed without wallet payment; rejects wrong liquidity or transferred principal", () => {
  expect(reviewLpForkOutcome(evidence)).toBe(true);
  expect(() => reviewLpForkOutcome({ ...evidence, after: { ...evidence.after, USDC: 110n } })).toThrow();
  expect(() => reviewLpForkOutcome({ ...evidence, after: { ...evidence.after, liquidity: 501n } })).toThrow();
});
it("collect pays exactly recorded tokens and empties owed without changing liquidity", () => {
  const collect = { kind: "collect" as const, before: evidence.after,
    after: { ...evidence.after, USDC: 110n, WETH: 220n, owed0: 0n, owed1: 0n }, amount0: 10n, amount1: 20n, collected0: 10n, collected1: 20n };
  expect(reviewLpForkOutcome(collect)).toBe(true);
  expect(() => reviewLpForkOutcome({ ...collect, after: { ...collect.after, owed0: 1n } })).toThrow();
});

it("uses actual pool payment when the manager Collect event includes rounding dust", () => {
  const before = { USDC: 100n, WETH: 200n, liquidity: 0n, owed0: 10n, owed1: 20n };
  const after = { USDC: 109n, WETH: 218n, liquidity: 0n, owed0: 0n, owed1: 0n };
  expect(reviewLpForkOutcome({ kind: "collect", before, after, amount0: 10n, amount1: 20n, collected0: 9n, collected1: 18n })).toBe(true);
  expect(() => reviewLpForkOutcome({ kind: "collect", before, after, amount0: 10n, amount1: 20n, collected0: 10n, collected1: 20n })).toThrow();
});
