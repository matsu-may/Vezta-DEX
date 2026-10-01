// Pure review of local-fork mint economics. No RPC, wallet or transaction submission.
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const nonnegative = value => typeof value === "bigint" && value >= 0n;
const spendBounded = (actual, minimum, maximum) => nonnegative(actual) && nonnegative(minimum)
  && nonnegative(maximum) && minimum > 0n && actual >= minimum && actual <= maximum;
const exactDelta = (before, after, amount) => nonnegative(before) && nonnegative(after)
  && nonnegative(amount) && before >= after && before - after === amount;

export function reviewForkMintOutcome({ wallet, desired, minimum, simulation, receiptStatus,
  mintedTokenId, position, balancesBefore, balancesAfter }) {
  const checks = {
    receiptSuccess: receiptStatus === "success",
    tokenIdMatches: typeof simulation?.tokenId === "bigint" && simulation.tokenId > 0n
      && mintedTokenId === simulation.tokenId,
    ownerMatches: sameAddress(position?.owner, wallet),
    poolIdentityMatches: sameAddress(position?.token0, USDC) && sameAddress(position?.token1, WETH)
      && position?.fee === 500 && position?.tickLower === -887270 && position?.tickUpper === 887270,
    liquidityMatches: typeof simulation?.liquidity === "bigint" && simulation.liquidity > 0n
      && position?.liquidity === simulation.liquidity,
    simulatedSpendBounded: spendBounded(simulation?.USDC, minimum?.USDC, desired?.USDC)
      && spendBounded(simulation?.WETH, minimum?.WETH, desired?.WETH),
    balanceDeltasMatch: exactDelta(balancesBefore?.USDC, balancesAfter?.USDC, simulation?.USDC)
      && exactDelta(balancesBefore?.WETH, balancesAfter?.WETH, simulation?.WETH),
  };
  return { ...checks, verified: Object.values(checks).every(Boolean) };
}
