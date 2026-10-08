import { expect, it } from "vitest";
import { readTestnetLpSubmission } from "./testnet-lp-wallet-storage";
import { TESTNET_LP_SUBMISSION_KEY } from "../../../lib/testnet-cross-flow";
it("fails closed on corrupt or unavailable LP recovery without reading wallet state", () => {
  expect(readTestnetLpSubmission({ getItem: () => null })).toEqual({ kind: "empty" });
  for (const raw of ["", "null", "{}", "bad", "x".repeat(20000)]) expect(readTestnetLpSubmission({ getItem: key => key === TESTNET_LP_SUBMISSION_KEY ? raw : null })).toEqual({ kind: "invalid" });
  expect(readTestnetLpSubmission({ getItem() { throw new Error("denied"); } })).toEqual({ kind: "invalid" });
});
it("compares the exact original marker before hash update or acknowledgment and detects silent writes", async () => {
  const {lpWalletFixture,LP_NOW,LP_HASH}=await import("./testnet-lp-wallet.test-helper"); const {memoryStorage}=await import("../../swap/lib/testnet-wallet.test-helper");
  const {writeTestnetLpSubmission,clearTestnetLpSubmission}=await import("./testnet-lp-wallet-storage");const f=lpWalletFixture();const storage=memoryStorage();const rec={version:1 as const,study:f.study,hash:null,attemptedAt:LP_NOW};
  writeTestnetLpSubmission(storage,rec);expect(()=>writeTestnetLpSubmission(storage,{...rec,hash:LP_HASH})).toThrow();
  writeTestnetLpSubmission(storage,{...rec,hash:LP_HASH},rec);expect(()=>clearTestnetLpSubmission(storage,rec)).toThrow();
  clearTestnetLpSubmission(storage,{...rec,hash:LP_HASH});expect(storage.getItem(TESTNET_LP_SUBMISSION_KEY)).toBeNull();
  storage.setItem=()=>{};expect(()=>writeTestnetLpSubmission(storage,rec)).toThrow();
});
