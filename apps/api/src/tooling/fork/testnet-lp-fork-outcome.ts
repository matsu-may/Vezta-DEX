import { forkAssert } from "./testnet-fork";
export interface LpForkBalances { USDC: bigint; WETH: bigint; liquidity: bigint; owed0: bigint; owed1: bigint }
export function reviewLpForkOutcome(e: { kind: "mint" | "increase" | "decrease" | "collect";
  before: LpForkBalances; after: LpForkBalances; amount0: bigint; amount1: bigint; liquidity?: bigint; collected0?: bigint; collected1?: bigint }) {
  const { before: b, after: a } = e;
  forkAssert([...Object.values(b), ...Object.values(a), e.amount0, e.amount1].every(n => typeof n === "bigint" && n >= 0n && n < 2n ** 256n), "FORK_LP_AMOUNT_INVALID");
  if (e.kind === "mint" || e.kind === "increase") {
    forkAssert(e.liquidity !== undefined && e.liquidity > 0n && a.liquidity - b.liquidity === e.liquidity
      && b.USDC - a.USDC === e.amount0 && b.WETH - a.WETH === e.amount1, "FORK_LP_DEPOSIT_INVALID");
  } else if (e.kind === "decrease") {
    forkAssert(e.liquidity !== undefined && e.liquidity > 0n && b.liquidity - a.liquidity === e.liquidity
      && a.USDC === b.USDC && a.WETH === b.WETH && a.owed0 >= b.owed0 + e.amount0 && a.owed1 >= b.owed1 + e.amount1, "FORK_LP_DECREASE_INVALID");
  } else forkAssert(e.collected0 !== undefined && e.collected1 !== undefined && e.collected0 >= 0n && e.collected1 >= 0n
    && e.collected0 <= e.amount0 && e.collected1 <= e.amount1 && a.liquidity === b.liquidity
    && a.USDC - b.USDC === e.collected0 && a.WETH - b.WETH === e.collected1
    && a.owed0 === 0n && a.owed1 === 0n && e.amount0 >= b.owed0 && e.amount1 >= b.owed1, "FORK_LP_COLLECT_INVALID");
  return true;
}
