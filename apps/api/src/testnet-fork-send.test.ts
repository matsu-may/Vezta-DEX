import { expect, it, vi } from "vitest";
import { buildTestnetSwapTransaction, planTestnetTokenApproval, parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, TESTNET_HASH, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

async function setup() {
  const { prepareForkSend } = await import("./testnet-fork-send");
  let now = TESTNET_NOW;
  const intent = parseTestnetSwapIntent(testnetIntent());
  const quotes = new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => now);
  const q = await quotes.read(intent);
  const study = { transaction: { ...buildTestnetSwapTransaction(q.quote, now), nonce: "7", gas: "180000", gasPrice: "20000000" },
    blockNumber: "123", blockHash: TESTNET_HASH, currentAllowance: "1000000" };
  const source = { async getPendingNonce() { return 7n; }, async getTokenAllowance() { return 1000000n; },
    async getBlockHash() { return TESTNET_HASH; } };
  const signal = new AbortController().signal;
  const call = (kind: "swap" | "approve" | "reset" = "swap") => prepareForkSend(source, quotes.store,
    { intent, quoteId: q.quoteId }, study, kind, signal, () => now);
  return { call, source, study, quotes, q, intent, setNow: (v: number) => { now = v; } };
}

it("consumes exactly once at the synchronous final send boundary", async () => {
  const s = await setup(); const consume = vi.spyOn(s.quotes.store, "consume");
  const beforeSend = await s.call();
  expect(consume).not.toHaveBeenCalled();
  beforeSend(); expect(consume).toHaveBeenCalledTimes(1);
  expect(() => beforeSend()).toThrow();
  await expect(s.call()).rejects.toThrow();
});

it("blocks changed nonce, allowance, hash, payload and expiry without consuming", async () => {
  for (const change of ["nonce", "allowance", "hash", "payload", "during-reads", "before-send"]) {
    const s = await setup(); const consume = vi.spyOn(s.quotes.store, "consume");
    if (change === "nonce") s.source.getPendingNonce = async () => 8n;
    if (change === "allowance") s.source.getTokenAllowance = async () => 1n;
    if (change === "hash") s.source.getBlockHash = async () => `0x${"cd".repeat(32)}`;
    if (change === "payload") s.study.transaction.data = "0x1234";
    if (change === "during-reads") s.source.getPendingNonce = async () => { s.setNow(TESTNET_NOW + 30000); return 7n; };
    if (change === "before-send") {
      const final = await s.call(); s.setNow(TESTNET_NOW + 30000); expect(() => final()).toThrow();
    } else await expect(s.call()).rejects.toThrow();
    expect(consume).not.toHaveBeenCalled();
  }
});

it("binds reset and exact approvals to the original policy rather than accepting unlimited calldata", async () => {
  for (const [kind, allowance] of [["reset", 1n], ["approve", 0n]] as const) {
    const s = await setup(); s.study.currentAllowance = String(allowance);
    s.source.getTokenAllowance = async () => allowance;
    const plan = planTestnetTokenApproval(s.intent, allowance);
    if (plan.kind === "ready") throw new Error("fixture");
    s.study.transaction = { ...plan.transaction, nonce: "7", gas: "60000", gasPrice: "20000000" };
    const final = await s.call(kind); final();
    expect(() => s.quotes.store.read(s.q.quoteId, s.intent)).toThrow();
  }
});
