import test from "node:test";
import assert from "node:assert/strict";
import { minimumFromPreview, reviewForkLifecycleOutcome } from "./lp-fork-lifecycle-outcome.mjs";

const fixture = () => ({
  mintLiquidity: 1000n, addedLiquidity: 500n, afterIncrease: 1500n,
  firstRemoved: 750n, afterPartial: 750n, secondRemoved: 750n, afterFull: 0n,
  owedBefore: { USDC: 0n, WETH: 0n },
  firstWithdrawal: { USDC: 100n, WETH: 200n },
  owedAfterPartial: { USDC: 100n, WETH: 200n },
  secondWithdrawal: { USDC: 100n, WETH: 200n },
  owedAfterFull: { USDC: 200n, WETH: 400n },
  collected: { USDC: 200n, WETH: 400n },
  balancesBeforeCollect: { USDC: 1n, WETH: 2n },
  balancesAfterCollect: { USDC: 201n, WETH: 402n },
  owedAfterCollect: { USDC: 0n, WETH: 0n },
  receiptsSucceeded: true, ownerMatches: true, allowanceResidualMatches: true,
  allowancesCleared: true, burned: true,
});

test("local LP lifecycle review reconciles liquidity, owed amounts and collected wallet deltas", () => {
  assert.equal(reviewForkLifecycleOutcome(fixture()).verified, true);
});

test("local LP lifecycle review rejects double-counted, missing or redirected collections", () => {
  for (const change of [
    { afterIncrease: 1499n }, { afterPartial: 751n }, { afterFull: 1n },
    { owedAfterPartial: { USDC: 99n, WETH: 200n } },
    { owedAfterFull: { USDC: 199n, WETH: 400n } },
    { collected: { USDC: 201n, WETH: 400n } },
    { balancesAfterCollect: { USDC: 200n, WETH: 402n } },
    { owedAfterCollect: { USDC: 1n, WETH: 0n } },
    { allowanceResidualMatches: false }, { allowancesCleared: false }, { ownerMatches: false },
    { burned: false }, { receiptsSucceeded: false },
  ]) assert.equal(reviewForkLifecycleOutcome({ ...fixture(), ...change }).verified, false);
});

test("local preview minimum uses a 50 bps floor and rejects zero output", () => {
  assert.equal(minimumFromPreview(1_000_000n), 995_000n);
  assert.equal(minimumFromPreview(1n), 1n);
  assert.throws(() => minimumFromPreview(0n));
});
