import { buildTestnetSwapTransaction } from "@vezta-dex/core";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { TESTNET_NOW } from "./testnet-quote.test-helper";
import { testnetActionFixture } from "./testnet-action.test-helper";

const directories: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), "testnet-swap-contexts-")); directories.push(path); return path; };
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

it("issues immutable bound contexts, retains original deadline and expires tracking separately", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const store = new TestnetActionStore(s.clock);
  const issued = store.issue(s.input, () => s.quotes.store.consume(s.quoted.quoteId, s.request.intent));
  expect(issued).toMatchObject({ contextId: expect.stringMatching(/^[a-f0-9]{48}$/), kind: "swap", chainId: 84532,
    quoteExpiresAt: "2026-09-30T20:28:40.000Z", executionEnabled: false });
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
    if (change === "deadline") s.setNow(TESTNET_NOW + 118000);
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

it("recovers the issued context, attempt reservation and immutable original hash after the quote expires", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const store = new TestnetActionStore(s.clock, 128, path);
  const id = store.issue(s.input, () => {}).contextId;
  store.markSubmissionAttempted(id);
  const originalHash = `0x${"ab".repeat(32)}`;
  store.bindHash(id, originalHash);
  s.setNow(TESTNET_NOW + 120001);
  const restored = new TestnetActionStore(s.clock, 128, path);
  expect(restored.read(id)).toMatchObject({ originalHash, submissionAttempted: true, transaction: s.input.transaction,
    quoteExpiresAt: "2026-09-30T20:28:40.000Z", trackingExpiresAt: TESTNET_NOW + 86400000 });
  expect(() => restored.markSubmissionAttempted(id)).toThrow("TESTNET_CONTEXT_ATTEMPTED");
  restored.bindHash(id, originalHash);
  expect(() => restored.bindHash(id, `0x${"cd".repeat(32)}`)).toThrow("TESTNET_CONTEXT_HASH_CHANGED");
  expect(new TestnetActionStore(s.clock, 128, path).read(id).originalHash).toBe(originalHash);
  expect(statSync(path).mode & 0o777).toBe(0o700);
  expect(statSync(join(path, `${id}.json`)).mode & 0o777).toBe(0o600);
  expect(readdirSync(path)).toEqual([`${id}.json`]);
  s.setNow(TESTNET_NOW + 86400000);
  expect(new TestnetActionStore(s.clock, 128, path).size).toBe(0);
  expect(readdirSync(path)).toEqual([]);
});

it.each(["calldata", "issuedAt", "tracking", "deadline", "extra", "transactionExtra"])("fails closed when persisted %s is tampered", async change => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const id = new TestnetActionStore(s.clock, 128, path).issue(s.input, () => {}).contextId;
  const file = join(path, `${id}.json`);
  const entry = JSON.parse(readFileSync(file, "utf8"));
  if (change === "calldata") entry.transaction.data = "0x1234";
  if (change === "issuedAt") entry.issuedAt += 60000;
  if (change === "tracking") entry.trackingExpiresAt++;
  if (change === "deadline") entry.quoteExpiresAt = "2026-10-01T20:27:10.000Z";
  if (change === "extra") entry.untrusted = true;
  if (change === "transactionExtra") entry.transaction.authorizationList = [];
  writeFileSync(file, JSON.stringify(entry));
  expect(() => new TestnetActionStore(s.clock, 128, path)).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
});

it.each(["directoryPermissions", "filePermissions", "oversized", "symlink", "unexpected", "capacity", "directorySize"])("rejects unsafe or unbounded %s on startup", async change => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const store = new TestnetActionStore(s.clock, 128, path);
  const id = store.issue(s.input, () => {}).contextId; const file = join(path, `${id}.json`);
  if (change === "directoryPermissions") chmodSync(path, 0o755);
  if (change === "filePermissions") chmodSync(file, 0o644);
  if (change === "oversized") writeFileSync(file, " ".repeat(32769));
  if (change === "symlink") { const contents = readFileSync(file); rmSync(file); const other = join(directory(), "entry.json"); writeFileSync(other, contents, { mode: 0o600 }); symlinkSync(other, file); }
  if (change === "unexpected") writeFileSync(join(path, "unexpected.json"), "{}");
  if (change === "capacity") store.issue(s.input, () => {});
  if (change === "directorySize") for (let i = 0; i < 256; i++) writeFileSync(join(path, `${i}.json`), "{}");
  expect(() => new TestnetActionStore(s.clock, change === "capacity" ? 1 : 128, path)).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
});

it("keeps in-memory hash and attempt unchanged when persistence fails", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const store = new TestnetActionStore(s.clock, 128, path);
  const id = store.issue(s.input, () => {}).contextId;
  const moved = join(directory(), "moved"); renameSync(path, moved); writeFileSync(path, "unavailable");
  expect(() => store.markSubmissionAttempted(id)).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
  expect(store.read(id).submissionAttempted).toBe(false);
  expect(() => store.bindHash(id, `0x${"ab".repeat(32)}`)).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
  expect(store.read(id).originalHash).toBeNull();
  expect(() => store.issue(s.input, () => {})).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
  expect(store.size).toBe(1);
});

it("cleans bounded private orphan temp files after a crash and preserves the last committed context", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const store = new TestnetActionStore(s.clock, 128, path);
  const id = store.issue(s.input, () => {}).contextId;
  store.markSubmissionAttempted(id); store.bindHash(id, `0x${"ab".repeat(32)}`);
  writeFileSync(join(path, `${id}.${"12".repeat(8)}.tmp`), '{"originalHash":', { mode: 0o600 });
  const restored = new TestnetActionStore(s.clock, 128, path);
  expect(restored.read(id)).toMatchObject({ originalHash: `0x${"ab".repeat(32)}`, submissionAttempted: true });
  expect(readdirSync(path)).toEqual([`${id}.json`]);
});

it.each(["permissions", "oversized", "symlink", "name"])("does not accept an unsafe orphan temp %s", async kind => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  const id = new TestnetActionStore(s.clock, 128, path).issue(s.input, () => {}).contextId;
  const temp = join(path, kind === "name" ? "unknown.tmp" : `${id}.${"12".repeat(8)}.tmp`);
  if (kind === "symlink") symlinkSync(join(path, `${id}.json`), temp);
  else writeFileSync(temp, kind === "oversized" ? " ".repeat(32769) : "partial", { mode: kind === "permissions" ? 0o644 : 0o600 });
  expect(() => new TestnetActionStore(s.clock, 128, path)).toThrow("TESTNET_CONTEXT_STORAGE_UNAVAILABLE");
});

it("restores legacy 30-second contexts without upgrading their calldata or expiry", async () => {
  const { TestnetActionStore } = await import("./testnet-action");
  const s = await testnetActionFixture(); const path = directory();
  delete s.input.quote.quoteTtlSeconds; delete (s.input as { observedAt?: string }).observedAt;
  s.input.transaction.data = buildTestnetSwapTransaction(s.input.quote, s.clock()).data;
  const store = new TestnetActionStore(s.clock, 128, path);
  const action = store.issue(s.input, () => {});
  store.markSubmissionAttempted(action.contextId);
  s.setNow(TESTNET_NOW + 35000);
  const restored = new TestnetActionStore(s.clock, 128, path).read(action.contextId);
  expect(restored.quoteExpiresAt).toBe("2026-09-30T20:27:10.000Z");
  expect(restored.quote.quoteTtlSeconds).toBeUndefined();
  expect(restored.transaction.data).toBe(s.input.transaction.data);
  expect(restored.submissionAttempted).toBe(true);
});
