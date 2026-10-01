// Reconcile disposable-fork position accounting. Owed amounts are a liability until collected.
const valid = value => typeof value === "bigint" && value >= 0n;
const tokens = ["USDC", "WETH"];
const allTokens = (objects, predicate) => tokens.every(token => objects.every(object => valid(object?.[token]))
  && predicate(token));

export function minimumFromPreview(amount) {
  if (!valid(amount) || amount === 0n) throw new Error("No positive local preview output");
  const minimum = amount * 995n / 1000n;
  return minimum > 0n ? minimum : 1n;
}

export function reviewForkLifecycleOutcome(e) {
  const checks = {
    liquidityProgression: valid(e.mintLiquidity) && e.mintLiquidity > 0n
      && valid(e.addedLiquidity) && e.addedLiquidity > 0n
      && e.afterIncrease === e.mintLiquidity + e.addedLiquidity
      && valid(e.firstRemoved) && e.firstRemoved > 0n
      && e.firstRemoved < e.afterIncrease
      && e.afterPartial === e.afterIncrease - e.firstRemoved
      && e.secondRemoved === e.afterPartial && e.afterFull === 0n,
    owedAccrualMatches: allTokens([e.owedBefore, e.firstWithdrawal, e.owedAfterPartial,
      e.secondWithdrawal, e.owedAfterFull], token =>
      e.owedAfterPartial[token] === e.owedBefore[token] + e.firstWithdrawal[token]
      && e.owedAfterFull[token] === e.owedAfterPartial[token] + e.secondWithdrawal[token]),
    collectedMatchesOwed: allTokens([e.owedAfterFull, e.collected, e.owedAfterCollect], token =>
      e.collected[token] === e.owedAfterFull[token] && e.owedAfterCollect[token] === 0n),
    walletCollectionMatches: allTokens([e.balancesBeforeCollect, e.balancesAfterCollect, e.collected],
      token => e.balancesAfterCollect[token] === e.balancesBeforeCollect[token] + e.collected[token]),
    receiptsSucceeded: e.receiptsSucceeded === true,
    ownerMatches: e.ownerMatches === true,
    allowanceResidualMatches: e.allowanceResidualMatches === true,
    allowancesCleared: e.allowancesCleared === true,
    burned: e.burned === true,
  };
  return { ...checks, verified: Object.values(checks).every(Boolean) };
}
