import { expect, it } from "vitest";
import type { TestnetLpIntent, TestnetLpReceipt, TestnetLpStudy } from "@vezta-dex/core";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";
const owner = "0x1111111111111111111111111111111111111111" as const;
async function runner() {
  const forkSteps = await import("./testnet-lp-wallet-fork-steps").catch(() => undefined);
  expect(forkSteps?.runTestnetLpWalletForkSteps).toBeTypeOf("function");
  return forkSteps!.runTestnetLpWalletForkSteps;
}
it("runs bounded approvals and the complete requested LP lifecycle, using the created NFT", async () => {
  const run = await runner(); const f = await testnetLpWalletFixture(); const seen: string[] = []; let approvals = 0;
  const study = async (intent: TestnetLpIntent) => ({ ...f.study, intent, actionKind: intent.kind === "mint" && approvals++ < 2 ? "approve" : intent.kind }) as TestnetLpStudy;
  const execute = async (s: TestnetLpStudy) => { seen.push(s.actionKind); return { intent: s.intent, actionKind: s.actionKind, contextId: s.contextId, verified: true,
    status: "confirmed", tokenId: "42", actualTotalFeeQualified: false, executionEnabled: false } as TestnetLpReceipt; };
  expect(await run({ owner, study, execute })).toBe("42");
  expect(seen).toEqual(["approve", "approve", "mint", "increase", "decrease", "decrease", "collect", "burn"]);
});
it("stops on failed qualification, changed NFT identity or unbounded approval loops", async () => {
  const run = await runner(); const f = await testnetLpWalletFixture();
  for (const failure of ["receipt", "nft", "loop"]) {
    const study = async (intent: TestnetLpIntent) => ({ ...f.study, intent, actionKind: failure === "loop" ? "approve" : intent.kind }) as TestnetLpStudy;
    const execute = async (s: TestnetLpStudy) => ({ intent: s.intent, actionKind: s.actionKind, contextId: s.contextId,
      status: "confirmed", verified: failure !== "receipt", tokenId: failure === "nft" && s.actionKind !== "mint" ? "999" : "42",
      actualTotalFeeQualified: false, executionEnabled: false }) as TestnetLpReceipt;
    await expect(run({ owner, study, execute })).rejects.toThrow(/^FORK_LP_WALLET_/);
  }
});

it("accepts canonical schema property order instead of treating the same intent as different", async () => {
  const run = await runner(); const f = await testnetLpWalletFixture();
  const { testnetLpIntentSchema } = await import("@vezta-dex/core");
  const study = async (intent: TestnetLpIntent) => ({ ...f.study, intent: testnetLpIntentSchema.parse(intent), actionKind: intent.kind }) as TestnetLpStudy;
  const execute = async (s: TestnetLpStudy) => ({ intent: s.intent, actionKind: s.actionKind, contextId: s.contextId,
    verified: true, status: "confirmed", tokenId: "42", actualTotalFeeQualified: false, executionEnabled: false }) as TestnetLpReceipt;
  expect(await run({ owner, study, execute })).toBe("42");
});
