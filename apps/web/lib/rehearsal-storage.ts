import { submissionRecordSchema, type SubmissionRecord } from "./rehearsal-contracts";
export const SUBMISSION_KEY = "vezta-dex:local-submission:v1";
export type SubmissionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export function readSubmission(storage: Pick<Storage, "getItem">): {
  kind: "empty";
} | {
  kind: "invalid";
} | {
  kind: "record";
  record: SubmissionRecord;
} {
  try {
    const raw = storage.getItem(SUBMISSION_KEY);
    if (raw === null)
      return { kind: "empty" };
    if (raw.length > 4096)
      return { kind: "invalid" };
    const parsed = submissionRecordSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { kind: "record", record: parsed.data } : { kind: "invalid" };
  }
  catch {
    return { kind: "invalid" };
  }
}
export function sameSubmission(a: SubmissionRecord | null, b: SubmissionRecord | null): boolean {
  return a === null || b === null ? a === b
    : JSON.stringify(submissionRecordSchema.parse(a)) === JSON.stringify(submissionRecordSchema.parse(b));
}
function assertOwner(storage: SubmissionStorage, expected: SubmissionRecord | null): void {
  const current = readSubmission(storage);
  if (current.kind === "invalid" || !sameSubmission(current.kind === "record" ? current.record : null, expected))
    throw new Error("Recovery record ownership changed");
}
/** Call only while holding the origin-wide exclusive lock; no await between check and mutation. */
export function saveSubmission(storage: SubmissionStorage, record: SubmissionRecord, expected: SubmissionRecord | null = null): void {
  assertOwner(storage, expected);
  storage.setItem(SUBMISSION_KEY, JSON.stringify(submissionRecordSchema.parse(record)));
}
export function clearSubmission(storage: SubmissionStorage, expected: SubmissionRecord): void {
  assertOwner(storage, expected);
  storage.removeItem(SUBMISSION_KEY);
}
