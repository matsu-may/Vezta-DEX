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
