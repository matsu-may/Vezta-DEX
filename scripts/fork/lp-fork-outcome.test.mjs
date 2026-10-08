import test from "node:test";
import assert from "node:assert/strict";
import { reviewForkMintOutcome } from "./lp-fork-outcome.mjs";

const WALLET = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const fixture = () => ({ wallet: WALLET, desired: { USDC: 1_000_000n, WETH: 371_000_000_000_000n },
  minimum: { USDC: 995_000n, WETH: 370_200_000_000_000n },
  simulation: { tokenId: 42n, liquidity: 1000n, USDC: 998_000n, WETH: 370_500_000_000_000n },
  receiptStatus: "success", mintedTokenId: 42n,
  position: { owner: WALLET, token0: USDC, token1: WETH, fee: 500, tickLower: -887270, tickUpper: 887270, liquidity: 1000n },
  balancesBefore: { USDC: 1_000_000n, WETH: 371_000_000_000_000n },
  balancesAfter: { USDC: 2_000n, WETH: 500_000_000_000n },
});

test("fork mint review requires NFT ownership, bounded simulated spend and exact balance deltas", () => {
  assert.deepEqual(reviewForkMintOutcome(fixture()), { receiptSuccess: true, tokenIdMatches: true,
    ownerMatches: true, poolIdentityMatches: true, liquidityMatches: true,
    simulatedSpendBounded: true, balanceDeltasMatch: true, verified: true });
});

test("fork mint review rejects wrong NFT owner, over-spend, failed receipt or mismatched economics", () => {
  for (const change of [
    { position: { ...fixture().position, owner: "0x1111111111111111111111111111111111111111" } },
    { simulation: { ...fixture().simulation, USDC: 1_100_000n } },
    { receiptStatus: "reverted" },
    { balancesAfter: { USDC: 3_000n, WETH: 500_000_000_000n } },
    { position: { ...fixture().position, liquidity: 999n } },
    { mintedTokenId: 43n },
  ]) assert.equal(reviewForkMintOutcome({ ...fixture(), ...change }).verified, false);
});
