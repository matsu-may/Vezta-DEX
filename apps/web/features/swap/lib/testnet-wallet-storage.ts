import { type TestnetChainId, testnetChainConfig } from "@vezta-dex/core";
import { parseHistoricalTestnetApproval, type HistoricalTestnetApproval } from "./testnet-wallet-historical";
import { createTestnetWalletContracts, parseTestnetSubmission, type TestnetSubmission } from "./testnet-wallet-contracts";
export const TESTNET_SUBMISSION_KEY = "vezta-dex:base-sepolia-submission:v1";
export type TestnetSubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function createTestnetSubmissionStorageDomain(chainId: TestnetChainId) {
  const config = testnetChainConfig(chainId);
  const TESTNET_SUBMISSION_KEY = `vezta-dex:${chainId === 84532 ? "base-sepolia" : "unichain-sepolia"}-submission:v1`;
  const {parseTestnetSubmission} = createTestnetWalletContracts(config.policy.chainId);
  function readTestnetSubmission(storage: Pick<Storage, "getItem">): { kind: "empty" } | { kind: "invalid" } | { kind: "record"; record: TestnetSubmission } {
    try {
      const raw = storage.getItem(TESTNET_SUBMISSION_KEY);
      if (raw === null) return { kind: "empty" };
      if (raw.length > 8192) return { kind: "invalid" };
      return { kind: "record", record: parseTestnetSubmission(JSON.parse(raw)) };
    } catch { return { kind: "invalid" }; }
  }
  function sameTestnetSubmission(a: TestnetSubmission | null, b: TestnetSubmission | null) {
    return a === null || b === null ? a === b : JSON.stringify(parseTestnetSubmission(a)) === JSON.stringify(parseTestnetSubmission(b));
  }
  function owns(storage: TestnetSubmissionStorage, expected: TestnetSubmission | null) {
    const current = readTestnetSubmission(storage);
    if (current.kind === "invalid" || !sameTestnetSubmission(current.kind === "record" ? current.record : null, expected)) throw new Error("Original testnet recovery changed");
  }
  // Call under the origin-wide nonqueued Web Lock, without an await between compare and mutation.
  function writeTestnetSubmission(storage: TestnetSubmissionStorage, record: TestnetSubmission, expected: TestnetSubmission | null = null) {
    owns(storage, expected); const raw = JSON.stringify(parseTestnetSubmission(record));
    if (raw.length > 8192) throw new Error("Testnet recovery too large");
    storage.setItem(TESTNET_SUBMISSION_KEY, raw);
  }
  function clearTestnetSubmission(storage: TestnetSubmissionStorage, expected: TestnetSubmission) {
    owns(storage, expected); storage.removeItem(TESTNET_SUBMISSION_KEY);
  }

  return Object.freeze({readTestnetSubmission, sameTestnetSubmission, writeTestnetSubmission, clearTestnetSubmission});
}
export const {readTestnetSubmission, sameTestnetSubmission, writeTestnetSubmission, clearTestnetSubmission} = createTestnetSubmissionStorageDomain(84532);
function owns(storage: TestnetSubmissionStorage, expected: TestnetSubmission | null) {
  const current = readTestnetSubmission(storage);
  if (current.kind === "invalid" || !sameTestnetSubmission(current.kind === "record" ? current.record : null, expected)) throw new Error("Original testnet recovery changed");
}

export const TESTNET_MANUAL_REVIEW_KEY = "vezta-dex:base-sepolia-manual-review:v1";
// Separate unresolved history; archiving does not mark execution as verified.
export function readTestnetApprovalHistory(storage: Pick<Storage, "getItem">): TestnetSubmission[] {
  const raw = storage.getItem(TESTNET_MANUAL_REVIEW_KEY);
  if (raw === null) return [];
  if (raw.length > 131072) throw new Error("Invalid manual review history");
  const items: unknown = JSON.parse(raw);
  if (!Array.isArray(items) || items.length > 16) throw new Error("Invalid manual review history");
  return items.map(item => {
    const record = parseTestnetSubmission(item);
    if (!record.hash || record.action.kind === "swap") throw new Error("Invalid manual review history");
    return record;
  });
}
export function archiveTestnetApproval(storage: TestnetSubmissionStorage, expected: TestnetSubmission) {
  owns(storage, expected);
  if (!expected.hash || expected.action.kind === "swap") throw new Error("Cannot archive this action");
  const items = readTestnetApprovalHistory(storage);
  if (!items.some(item => sameTestnetSubmission(item, expected))) items.push(parseTestnetSubmission(expected));
  if (items.length > 16) throw new Error("Manual review history full");
  // Save and validate before clearing active recovery. Any write failure leaves it active.
  storage.setItem(TESTNET_MANUAL_REVIEW_KEY, JSON.stringify(items));
  if (!readTestnetManualReview(storage).some(item => sameTestnetSubmission(item, expected))) throw new Error("Archive write failed");
  clearTestnetSubmission(storage, expected);
  return items;
}

export const TESTNET_HISTORICAL_ACK_KEY = "vezta-dex:base-sepolia-historical-approval-ack:v1";
export function readTestnetHistoricalAcknowledgments(storage: Pick<Storage, "getItem">) {
  const raw = storage.getItem(TESTNET_HISTORICAL_ACK_KEY);
  if (raw === null) return [];
  if (raw.length > 196608) throw new Error("Invalid historical acknowledgment history");
  const values: unknown = JSON.parse(raw);
  if (!Array.isArray(values) || values.length > 16) throw new Error("Invalid historical acknowledgment history");
  const history = readTestnetApprovalHistory(storage);
  return values.map(value => {
    if (!value || typeof value !== "object" || Object.keys(value).sort().join(",") !== "acknowledgedAt,reconciliation,record") throw new Error("Invalid acknowledgment");
    const v = value as {record: unknown; reconciliation: unknown; acknowledgedAt: number};
    if (!Number.isSafeInteger(v.acknowledgedAt) || v.acknowledgedAt < 0 || v.acknowledgedAt > 8640000000000000) throw new Error("Invalid acknowledgment time");
    const record = parseTestnetSubmission(v.record);
    const reconciliation = parseHistoricalTestnetApproval({reconciliation:v.reconciliation},record,v.acknowledgedAt);
    if (!history.some(h => sameTestnetSubmission(h,record))) throw new Error("Missing retained history");
    return {record,reconciliation,acknowledgedAt:v.acknowledgedAt};
  });
}
export function readTestnetManualReview(storage: Pick<Storage,"getItem">) {
  const history = readTestnetApprovalHistory(storage), resolved = readTestnetHistoricalAcknowledgments(storage);
  return history.filter(record => !resolved.some(ack => sameTestnetSubmission(record,ack.record)));
}
export function acknowledgeTestnetHistoricalApproval(storage:TestnetSubmissionStorage,record:TestnetSubmission,reconciliation:HistoricalTestnetApproval,now:number) {
  const checked = parseHistoricalTestnetApproval({reconciliation},record,now);
  const saved = readTestnetSubmission(storage);
  if (saved.kind === "invalid") throw new Error("Invalid active recovery");
  const active = saved.kind === "record" ? saved.record : null;
  if (active && !sameTestnetSubmission(active,record)) throw new Error("Conflicting active recovery");
  const history = readTestnetApprovalHistory(storage), acks = readTestnetHistoricalAcknowledgments(storage);
  if (!history.some(h=>sameTestnetSubmission(h,record))) {
    if (!active || history.length >= 16) throw new Error("Historical record unavailable");
    history.push(parseTestnetSubmission(record));
    storage.setItem(TESTNET_MANUAL_REVIEW_KEY,JSON.stringify(history));
    if (!readTestnetApprovalHistory(storage).some(h=>sameTestnetSubmission(h,record))) throw new Error("History write failed");
  }
  if (!acks.some(a=>sameTestnetSubmission(a.record,record))) {
    if (acks.length >= 16) throw new Error("Acknowledgment history full");
    acks.push({record:parseTestnetSubmission(record),reconciliation:checked,acknowledgedAt:now});
    storage.setItem(TESTNET_HISTORICAL_ACK_KEY,JSON.stringify(acks));
    if (!readTestnetHistoricalAcknowledgments(storage).some(a=>sameTestnetSubmission(a.record,record))) throw new Error("Acknowledgment write failed");
  }
  if (active) clearTestnetSubmission(storage,record);
}
