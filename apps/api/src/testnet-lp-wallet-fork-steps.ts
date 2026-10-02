import type { Address } from "viem";
import { testnetLpIntentSchema, type TestnetLpIntent, type TestnetLpReceipt, type TestnetLpStudy } from "@vezta-dex/core";
import { forkAssert } from "./testnet-fork";
export interface LpWalletForkSteps {
  owner: Address;
  study(intent: TestnetLpIntent): Promise<TestnetLpStudy>;
  execute(study: TestnetLpStudy): Promise<TestnetLpReceipt>;
}
/** Bounded local-fixture sequence. Each action uses the actual study/recheck/receipt implementation. */
export async function runTestnetLpWalletForkSteps(io: LpWalletForkSteps): Promise<string> {
  let tokenId: string | null = null;
  const perform = async (value: TestnetLpIntent) => {
    const intent = testnetLpIntentSchema.parse(value);
    for (let round = 0; round < 5; round++) {
      const s = await io.study(intent);
      forkAssert(s.status === "prepared" && s.contextId && s.transaction && JSON.stringify(s.intent) === JSON.stringify(intent), "FORK_LP_WALLET_STUDY_INVALID");
      forkAssert(s.actionKind === intent.kind || ((intent.kind === "mint" || intent.kind === "increase") && ["reset", "approve"].includes(s.actionKind)), "FORK_LP_WALLET_ACTION_INVALID");
      const o = await io.execute(s);
      forkAssert(o.verified && o.status === "confirmed" && o.contextId === s.contextId && o.actionKind === s.actionKind
        && JSON.stringify(o.intent) === JSON.stringify(intent) && !o.executionEnabled && !o.actualTotalFeeQualified, "FORK_LP_WALLET_RECEIPT_INVALID");
      if (s.actionKind !== intent.kind) continue;
      if (intent.kind === "mint") {
        forkAssert(o.tokenId && /^[1-9][0-9]*$/.test(o.tokenId), "FORK_LP_WALLET_NFT_INVALID"); tokenId = o.tokenId;
      } else forkAssert(o.tokenId === tokenId && intent.tokenId === tokenId, "FORK_LP_WALLET_NFT_INVALID");
      return;
    }
    forkAssert(false, "FORK_LP_WALLET_APPROVAL_LOOP");
  };
  const base = { chainId: 84532 as const, wallet: io.owner };
  await perform({ ...base, kind: "mint", amount0Cap: "1000000", amount1Cap: "50000000000000000" });
  forkAssert(tokenId, "FORK_LP_WALLET_NFT_INVALID");
  await perform({ ...base, kind: "increase", tokenId, amount0Cap: "100000", amount1Cap: "50000000000000000" });
  await perform({ ...base, kind: "decrease", tokenId, percentage: 50 });
  await perform({ ...base, kind: "decrease", tokenId, percentage: 100 });
  await perform({ ...base, kind: "collect", tokenId });
  await perform({ ...base, kind: "burn", tokenId });
  return tokenId;
}
