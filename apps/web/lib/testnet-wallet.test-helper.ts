import { testnetActionFixture } from "../../api/src/testnet-action.test-helper";
import { TestnetActionStore, TestnetRechecker } from "../../api/src/testnet-action";
import { parseTestnetWalletQuote, parseTestnetWalletReview } from "./testnet-wallet-contracts";
import { parseTestnetSwapIntent } from "@vezta-dex/core";

export async function reviewedFixture(kind: "swap" | "approve" | "reset" = "swap", reverse = false) {
  const raw = await testnetActionFixture(kind, reverse);
  const f = { ...raw, request: { ...raw.request, intent: parseTestnetSwapIntent(raw.request.intent) } };
  const contexts = new TestnetActionStore(f.clock);
  const checked = await new TestnetRechecker(f.approvals, f.preparer, f.quotes.store, contexts)
    .read({ ...f.request, kind: kind === "swap" ? "swap" : "approval" });
  const q = parseTestnetWalletQuote(f.quoted, f.request.intent, f.clock());
  return { f, q, checked, review: parseTestnetWalletReview(checked, q, kind === "swap" ? "swap" : "approval", f.clock()) };
}
export function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
}
