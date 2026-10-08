import { type TestnetChainId, testnetChainConfig } from "@vezta-dex/core";
import { createTestnetLpWalletContracts, type TestnetLpSubmission } from "./testnet-lp-wallet-contracts";
import type { TestnetSubmissionStorage } from "../../swap/lib/testnet-wallet-storage";
export function createTestnetLpStorageDomain(chainId: TestnetChainId) {
  testnetChainConfig(chainId);
  const TESTNET_LP_SUBMISSION_KEY = `vezta-dex:${chainId === 84532 ? "base-sepolia" : "unichain-sepolia"}-lp-submission:v1`;
  const {parseTestnetLpSubmission} = createTestnetLpWalletContracts(chainId);
  function readTestnetLpSubmission(storage: Pick<Storage, "getItem">): { kind: "empty" } | { kind: "invalid" } | { kind: "record"; record: TestnetLpSubmission } {
    try { const raw = storage.getItem(TESTNET_LP_SUBMISSION_KEY); if (raw === null) return { kind: "empty" };
      if (raw.length > 16384) return { kind: "invalid" }; return { kind: "record", record: parseTestnetLpSubmission(JSON.parse(raw)) };
    } catch { return { kind: "invalid" }; }
  }
  function sameTestnetLpSubmission(a: TestnetLpSubmission | null, b: TestnetLpSubmission | null) {
    return a === null || b === null ? a === b : JSON.stringify(parseTestnetLpSubmission(a)) === JSON.stringify(parseTestnetLpSubmission(b));
  }
  function owns(storage: TestnetSubmissionStorage, expected: TestnetLpSubmission | null) {
    const saved = readTestnetLpSubmission(storage);
    if (saved.kind === "invalid" || !sameTestnetLpSubmission(saved.kind === "record" ? saved.record : null, expected)) throw new Error("LP recovery changed");
  }
  function writeTestnetLpSubmission(storage: TestnetSubmissionStorage, record: TestnetLpSubmission, expected: TestnetLpSubmission | null = null) {
    owns(storage, expected); const raw = JSON.stringify(parseTestnetLpSubmission(record)); if (raw.length > 16384) throw new Error("LP recovery too large");
    storage.setItem(TESTNET_LP_SUBMISSION_KEY, raw);
    if (storage.getItem(TESTNET_LP_SUBMISSION_KEY) !== raw) throw new Error("LP recovery persistence failed");
  }
  function clearTestnetLpSubmission(storage: TestnetSubmissionStorage, expected: TestnetLpSubmission) {
    owns(storage, expected); storage.removeItem(TESTNET_LP_SUBMISSION_KEY);
    if (storage.getItem(TESTNET_LP_SUBMISSION_KEY) !== null) throw new Error("LP recovery clear failed");
  }
  return Object.freeze({readTestnetLpSubmission, sameTestnetLpSubmission, writeTestnetLpSubmission, clearTestnetLpSubmission});
}
export const {readTestnetLpSubmission, sameTestnetLpSubmission, writeTestnetLpSubmission, clearTestnetLpSubmission} = createTestnetLpStorageDomain(84532);
