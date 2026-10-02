import { expect, it, vi } from "vitest";
import { TESTNET_NOW } from "./testnet-quote.test-helper";
import { testnetActionFixture } from "./testnet-action.test-helper";

it("issues immutable bound contexts, retains original deadline and expires tracking separately", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const store = new TestnetActionStore(s.clock);
  const issued = store.issue(s.input, () => s.quotes.store.consume(s.quoted.quoteId, s.request.intent));
  expect(issued).toMatchObject({ contextId: expect.stringMatching(/^[a-f0-9]{48}$/), kind: "swap", chainId: 84532,
    quoteExpiresAt: "2026-09-30T20:27:10.000Z", executionEnabled: false });
  const saved = store.read(issued.contextId);
  s.input.transaction.nonce = "8"; saved.transaction.nonce = "9";
  expect(store.read(issued.contextId).transaction.nonce).toBe("7");
  s.setNow(TESTNET_NOW + 30000);
  expect(store.read(issued.contextId).transaction.nonce).toBe("7");
  s.setNow(TESTNET_NOW + 86400000);
  expect(() => store.read(issued.contextId)).toThrow();
});

it("rejects altered semantics, expired quotes and capacity before consuming", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  for (const change of ["payload", "nonce", "intent", "block", "deadline", "capacity"]) {
    const s = await testnetActionFixture(); const store = new TestnetActionStore(s.clock, 1); const consume = vi.fn();
    if (change === "payload") s.input.transaction.data = "0x1234";
    if (change === "nonce") s.input.transaction.nonce = "-1";
    if (change === "intent") s.input.intent.amountIn = "100000";
    if (change === "block") s.input.blockNumber = "122";
    if (change === "deadline") s.setNow(TESTNET_NOW + 30000);
    if (change === "capacity") store.issue(s.input, () => {});
    expect(() => store.issue(s.input, consume)).toThrow(); expect(consume).not.toHaveBeenCalled();
  }
});

it("binds a validated original hash once and rejects context loss/hash substitution", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture("reset"); const store = new TestnetActionStore(s.clock);
  const id = store.issue(s.input, () => {}).contextId;
  const hash = `0x${"ab".repeat(32)}`;
  store.bindHash(id, hash); store.bindHash(id, hash.toUpperCase().replace("0X", "0x"));
  expect(() => store.bindHash(id, `0x${"cd".repeat(32)}`)).toThrow();
  expect(() => new TestnetActionStore(s.clock).read(id)).toThrow();
  expect(() => store.bindHash(id, "0x" + "0".repeat(64))).toThrow();
});

it.each(["swap", "approve", "reset"] as const)("rechecks %s once using real funded readers", async kind => {
  const { TestnetActionStore, TestnetRechecker } = await import("./testnet-action");
  const s = await testnetActionFixture(kind); const store = new TestnetActionStore(s.clock);
  const r = new TestnetRechecker(s.approvals, s.preparer, s.quotes.store, store);
  const request = { ...s.request, kind: kind === "swap" ? "swap" : "approval" };
  const result = await r.read(request);
  expect(result.action).toMatchObject({ kind, executionEnabled: false });
  expect(result.study).toMatchObject({ status: "unsigned-prepared", runtimeVerified: true });
  await expect(r.read(request)).rejects.toThrow();
});

it("does not consume blocked/ready/late or overlapping work", async () => {
  const { TestnetActionStore, TestnetRechecker } = await import("./testnet-action");
  const s = await testnetActionFixture(); const store = new TestnetActionStore(s.clock);
  const r = new TestnetRechecker(s.approvals, s.preparer, s.quotes.store, store);
  s.source.getTokenBalance = async () => 0n;
  expect(await r.read({ ...s.request, kind: "swap" })).toMatchObject({ action: null, study: { status: "blocked" } });
  s.source.getTokenBalance = async () => 10n ** 18n;
  expect(await r.read({ ...s.request, kind: "approval" })).toMatchObject({ action: null, study: { status: "allowance-ready" } });
  const original = s.source.getPendingNonce; let release!: () => void;
  s.source.getPendingNonce = async () => { await new Promise<void>(resolve => { release = resolve; }); return 7n; };
  const running = r.read({ ...s.request, kind: "swap" });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await expect(r.read({ ...s.request, kind: "swap" })).rejects.toMatchObject({ code: "TESTNET_RECHECK_BUSY" });
  s.source.getPendingNonce = original; s.setNow(TESTNET_NOW + 30000); release();
  await expect(running).rejects.toThrow(); expect(store.size).toBe(0);
});
