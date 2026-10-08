import { expect, it, vi } from "vitest";
import { buildTestnetSwapTransaction, planTestnetTokenApproval, parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "../../modules/swap/testnet-swap-quote";
import { TESTNET_NOW, TESTNET_HASH, testnetIntent, testnetQuoteSource } from "../../modules/swap/testnet-quote.test-helper";

async function setup() {
  const { prepareForkSend } = await import("./testnet-fork-send");
  let now = TESTNET_NOW;
  const intent = parseTestnetSwapIntent(testnetIntent());
  const quotes = new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => now);
  const q = await quotes.read(intent);
  const study = { transaction: { ...buildTestnetSwapTransaction(q.quote, now), nonce: "7", gas: "180000", gasPrice: "20000000" },
    observedAt: "2026-09-30T20:26:40.000Z", blockNumber: "123", blockHash: TESTNET_HASH, currentAllowance: "1000000" };
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

it("checks an already-consumed recheck context against its original broadcast deadline", async () => {
  const { prepareForkContextSend } = await import("./testnet-fork-send");
  const { TestnetActionStore, TestnetRechecker } = await import("../../modules/transaction/testnet-action");
  const { testnetActionFixture } = await import("../../modules/transaction/testnet-action.test-helper");
  for (const stale of [false, true]) {
    const f = await testnetActionFixture(); const store = new TestnetActionStore(f.clock);
    const r = new TestnetRechecker(f.approvals, f.preparer, f.quotes.store, store);
    const result = await r.read({ ...f.request, kind: "swap" });
    const id = result.action!.contextId;
    const final = await prepareForkContextSend(f.source, store, id, new AbortController().signal, f.clock);
    const overlapping = await prepareForkContextSend(f.source, store, id, new AbortController().signal, f.clock);
    if (stale) { f.setNow(TESTNET_NOW + 30000); expect(() => final()).toThrow(); }
    else {
      final(); expect(() => final()).toThrow(); expect(() => overlapping()).toThrow();
      await expect(prepareForkContextSend(f.source, store, id, new AbortController().signal, f.clock)).rejects.toThrow();
      expect(store.read(id).originalHash).toBeNull(); // A lost send response still cannot authorize retry.
    }
    expect(store.read(id).quoteExpiresAt).toBe("2026-09-30T20:28:40.000Z");
  }
});

it("sends the exact reviewed type-2 envelope on the guarded local transport", async () => {
  const { sendReviewedForkTransaction } = await import("./testnet-fork-send");
  const s = await setup(); const request = vi.fn<(args: { method: string; params?: readonly unknown[] }) => Promise<string>>().mockResolvedValue("0xhash"); const beforeWrite = vi.fn();
  const origin = "http://127.0.0.1:8547";
  const boundary = { transport: { type: "http", url: origin }, request,
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; } };
  const tx = { ...s.study.transaction, feeModel: "eip1559" as const,
    maxFeePerGas: "20000000", maxPriorityFeePerGas: "1000000" };
  await sendReviewedForkTransaction(boundary, origin, tx, beforeWrite);
  expect(request).toHaveBeenCalledWith({ method: "eth_sendTransaction", params: [{
    from: tx.from, to: tx.to, data: tx.data, value: "0x0", nonce: "0x7", gas: "0x2bf20",
    chainId: "0x14a34", type: "0x2", maxFeePerGas: "0x1312d00", maxPriorityFeePerGas: "0xf4240",
  }] });
  expect(beforeWrite).toHaveBeenCalledTimes(1);
});

it("sends historical fees as explicit type 0 and rejects incomplete fee reviews before mutation", async () => {
  const { sendReviewedForkTransaction } = await import("./testnet-fork-send");
  const s = await setup(); const request = vi.fn<(args: { method: string; params?: readonly unknown[] }) => Promise<string>>().mockResolvedValue("0xhash"); const beforeWrite = vi.fn();
  const origin = "http://127.0.0.1:8547";
  const boundary = { transport: { type: "http", url: origin }, request,
    async getChainId() { return 84532; }, async getClientVersion() { return "anvil/v1"; } };
  await sendReviewedForkTransaction(boundary, origin, s.study.transaction, beforeWrite);
  expect(request.mock.calls[0][0]).toMatchObject({ params: [{ type: "0x0", gasPrice: "0x1312d00" }] });
  request.mockClear(); beforeWrite.mockClear();
  await expect(sendReviewedForkTransaction(boundary, origin,
    { ...s.study.transaction, feeModel: "eip1559" }, beforeWrite)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled(); expect(beforeWrite).not.toHaveBeenCalled();
});

it("rejects coupled fee fields that change or become partial at the final send boundary", async () => {
  const s = await setup();
  const tx = Object.assign(s.study.transaction, { feeModel: "eip1559" as const,
    maxFeePerGas: "20000000", maxPriorityFeePerGas: "1000000" });
  const final = await s.call();
  tx.maxPriorityFeePerGas = "2000000";
  expect(() => final()).toThrow();
  tx.maxPriorityFeePerGas = "1000000";
  Reflect.deleteProperty(tx, "maxFeePerGas");
  await expect(s.call()).rejects.toThrow();
});

it("rejects a 29-second-old study at the final boundary even when issued just now", async () => {
  const { prepareForkContextSend } = await import("./testnet-fork-send");
  const { TestnetActionStore } = await import("../../modules/transaction/testnet-action");
  const { testnetActionFixture } = await import("../../modules/transaction/testnet-action.test-helper");
  const f = await testnetActionFixture();
  f.setNow(TESTNET_NOW + 27000);
  const store = new TestnetActionStore(f.clock);
  const id = store.issue(f.input, () => {}).contextId;
  const final = await prepareForkContextSend(f.source, store, id, new AbortController().signal, f.clock);
  f.setNow(TESTNET_NOW + 28000);
  expect(() => final()).toThrow();
  expect(store.read(id).submissionAttempted).toBe(false);
});
