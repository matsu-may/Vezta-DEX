import { parseTestnetSubmission, type TestnetSubmission } from "./testnet-wallet-contracts";
export const TESTNET_SUBMISSION_KEY = "vezta-dex:base-sepolia-submission:v1";
export type TestnetSubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readTestnetSubmission(storage: Pick<Storage, "getItem">): { kind: "empty" } | { kind: "invalid" } | { kind: "record"; record: TestnetSubmission } {
  try {
    const raw = storage.getItem(TESTNET_SUBMISSION_KEY);
    if (raw === null) return { kind: "empty" };
    if (raw.length > 8192) return { kind: "invalid" };
    return { kind: "record", record: parseTestnetSubmission(JSON.parse(raw)) };
  } catch { return { kind: "invalid" }; }
}
export function sameTestnetSubmission(a: TestnetSubmission | null, b: TestnetSubmission | null) {
  return a === null || b === null ? a === b : JSON.stringify(parseTestnetSubmission(a)) === JSON.stringify(parseTestnetSubmission(b));
}
function owns(storage: TestnetSubmissionStorage, expected: TestnetSubmission | null) {
  const current = readTestnetSubmission(storage);
  if (current.kind === "invalid" || !sameTestnetSubmission(current.kind === "record" ? current.record : null, expected)) throw new Error("Original testnet recovery changed");
}
// Call under the origin-wide nonqueued Web Lock, without an await between compare and mutation.
export function writeTestnetSubmission(storage: TestnetSubmissionStorage, record: TestnetSubmission, expected: TestnetSubmission | null = null) {
  owns(storage, expected); const raw = JSON.stringify(parseTestnetSubmission(record));
  if (raw.length > 8192) throw new Error("Testnet recovery too large");
  storage.setItem(TESTNET_SUBMISSION_KEY, raw);
}
export function clearTestnetSubmission(storage: TestnetSubmissionStorage, expected: TestnetSubmission) {
  owns(storage, expected); storage.removeItem(TESTNET_SUBMISSION_KEY);
}

export const TESTNET_MANUAL_REVIEW_KEY = "vezta-dex:base-sepolia-manual-review:v1";
// Separate unresolved history; archiving does not mark execution as verified.
export function readTestnetManualReview(storage: Pick<Storage, "getItem">): TestnetSubmission[] {
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
  const items = readTestnetManualReview(storage);
  if (!items.some(item => sameTestnetSubmission(item, expected))) items.push(parseTestnetSubmission(expected));
  if (items.length > 16) throw new Error("Manual review history full");
  // Save and validate before clearing active recovery. Any write failure leaves it active.
  storage.setItem(TESTNET_MANUAL_REVIEW_KEY, JSON.stringify(items));
  if (!readTestnetManualReview(storage).some(item => sameTestnetSubmission(item, expected))) throw new Error("Archive write failed");
  clearTestnetSubmission(storage, expected);
  return items;
}
