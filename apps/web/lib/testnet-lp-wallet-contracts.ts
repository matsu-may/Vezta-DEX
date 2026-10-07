import { z } from "zod";
import { createTestnetLpDomain, type TestnetChainId, type TestnetChainLpIntent, type TestnetChainLpStudy } from "@vezta-dex/core";
import { walletHash } from "./testnet-wallet-contracts";
const bound = (v: unknown) => { if (!v) throw new Error("LP response binding unavailable"); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function createTestnetLpWalletContracts<I extends TestnetChainId>(chainId: I) {
  const {testnetLpIntentSchema, parseTestnetLpStudy, parseTestnetLpReceipt} = createTestnetLpDomain(chainId);
  function parseTestnetLpReview(value: unknown, intent: TestnetChainLpIntent<I>, now: number, original?: TestnetChainLpStudy<I>) {
    const response = z.object({ study: z.unknown() }).strict().parse(value);
    const study = parseTestnetLpStudy(response.study, now);
    bound(same(study.intent, testnetLpIntentSchema.parse(intent)));
    if (original) bound(study.status === "prepared" && study.contextId === original.contextId && study.actionKind === original.actionKind
      && study.approvalToken === original.approvalToken && same(study.transaction, original.transaction) && same(study.plan, original.plan)
      && study.expiresAt === original.expiresAt && study.executionEnabled === original.executionEnabled);
    return study;
  }
  const submission = z.object({ version: z.literal(1), study: z.unknown(), attemptedAt: z.number().int().nonnegative().max(8640000000000000), hash: walletHash.nullable() }).strict();
  function parseTestnetLpSubmission(value: unknown) {
    const rec = submission.parse(value);
    const stamp = z.object({ observedAt: z.iso.datetime() }).parse(rec.study).observedAt;
    const study = parseTestnetLpStudy(rec.study, Date.parse(stamp));
    bound(study.status === "prepared" && study.contextId && study.transaction && study.executionEnabled
      && rec.attemptedAt >= Date.parse(study.observedAt) - 10000 && rec.attemptedAt < Date.parse(study.expiresAt));
    return { ...rec, study };
  }
  type TestnetLpSubmission = ReturnType<typeof parseTestnetLpSubmission>;
  function parseTestnetLpObservation(value: unknown, record: TestnetLpSubmission, now: number) {
    const response = z.object({ observation: z.unknown() }).strict().parse(value);
    const o = parseTestnetLpReceipt(response.observation, now);
    bound(record.hash && o.hash.toLowerCase() === record.hash.toLowerCase() && o.contextId === record.study.contextId
      && o.actionKind === record.study.actionKind && o.approvalToken === record.study.approvalToken && same(o.intent, record.study.intent));
    bound(BigInt(o.blockNumber) >= BigInt(record.study.blockNumber));
    if (o.verified) {
      bound(o.receiptBlockNumber && BigInt(o.receiptBlockNumber) > BigInt(record.study.blockNumber)
        && BigInt(o.blockNumber) >= BigInt(o.receiptBlockNumber!) + 1n);
      if (record.study.intent.kind !== "mint") bound(o.tokenId === record.study.intent.tokenId);
      if (record.study.actionKind === "mint" && o.status === "confirmed") bound(o.tokenId !== null);
      if (o.status === "confirmed" && ["mint", "increase"].includes(record.study.actionKind)) {
        bound(BigInt(o.amount0) >= BigInt(record.study.plan.amount0Minimum) && BigInt(o.amount1) >= BigInt(record.study.plan.amount1Minimum)
          && BigInt(o.amount0) <= BigInt(record.study.plan.amount0Desired) && BigInt(o.amount1) <= BigInt(record.study.plan.amount1Desired));
      }
      if (o.status === "confirmed" && record.study.actionKind === "decrease") bound(BigInt(o.amount0) >= BigInt(record.study.plan.amount0Minimum) && BigInt(o.amount1) >= BigInt(record.study.plan.amount1Minimum));
      if (["approve", "reset", "burn"].includes(record.study.actionKind) || o.status === "reverted") bound(o.amount0 === "0" && o.amount1 === "0");
    }
    return o;
  }
  return Object.freeze({parseTestnetLpReview, parseTestnetLpSubmission, parseTestnetLpObservation});
}
export const {parseTestnetLpReview, parseTestnetLpSubmission, parseTestnetLpObservation} = createTestnetLpWalletContracts(84532);
export type TestnetLpSubmission = ReturnType<ReturnType<typeof createTestnetLpWalletContracts<TestnetChainId>>["parseTestnetLpSubmission"]>;
