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
export function saveSubmission(storage: SubmissionStorage, record: SubmissionRecord): void { storage.setItem(SUBMISSION_KEY, JSON.stringify(submissionRecordSchema.parse(record))); }
export function clearSubmission(storage: SubmissionStorage): void { storage.removeItem(SUBMISSION_KEY); }
