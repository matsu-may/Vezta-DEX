import { type TestnetChainId, testnetChainConfig } from "@vezta-dex/core";
import { TESTNET_SUBMISSION_KEY } from "./testnet-wallet-storage";
export const TESTNET_LP_SUBMISSION_KEY = "vezta-dex:base-sepolia-lp-submission:v1";
export class OtherTestnetSubmissionError extends Error {
  constructor(readonly other: "swap" | "lp") {
    super(other === "lp"
      ? "A liquidity transaction needs recovery. Open Liquidity and check its original hash before starting another action."
      : "A swap transaction needs recovery. Open Swap and check its original hash before starting another action.");
  }
}
/** Run under the same origin Web Lock used by both controllers. Malformed or unreadable slots also block. */
export function requireNoOtherTestnetSubmission(storage: Pick<Storage, "getItem">, own: "swap" | "lp", chainId: TestnetChainId = 84532) {
  testnetChainConfig(chainId);
  for (const id of [84532, 1301] as const) for (const flow of ["swap", "lp"] as const) {
    if (id === chainId && flow === own) continue;
    const key = id === 84532 ? (flow === "lp" ? TESTNET_LP_SUBMISSION_KEY : TESTNET_SUBMISSION_KEY)
      : `vezta-dex:unichain-sepolia-${flow === "lp" ? "lp-" : ""}submission:v1`;
    try { if (storage.getItem(key) !== null) throw new OtherTestnetSubmissionError(flow); }
    catch { throw new OtherTestnetSubmissionError(flow); }
  }
}
