import { expect, it } from "vitest";
import { getAddress } from "viem";
import { reviewedFixture, memoryStorage } from "./testnet-wallet.test-helper";
import { TestnetWalletController, type TestnetWalletApi } from "./testnet-wallet-controller";
import { TESTNET_SUBMISSION_KEY } from "./testnet-wallet-storage";
import { readTestnetActivity, TESTNET_ACTIVITY_KEY } from "./testnet-activity";

const hash = `0x${"11".repeat(32)}`;
async function setup(kind: "swap" | "approve" | "reset" = "swap", reverse = false, enabled = true) {
  const r = await reviewedFixture(kind, reverse); const storage = memoryStorage(); const listeners = new Map<string, Set<(v: unknown) => void>>();
  let code = "0x"; let now = r.f.clock(); let reject = false; let lose = false; let grantEvent = false; let receiptFail = false; let paused: (() => void) | undefined;
  const methods: string[] = []; const sends: unknown[][] = []; let account = getAddress(r.f.request.intent.wallet); let chain = "0x14a34";
  const wallet = { on(event: string, fn: (v: unknown) => void) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
    removeListener(event: string, fn: (v: unknown) => void) { listeners.get(event)?.delete(fn); },
    async request({ method, params }: { method: string; params?: unknown[] }) {
      methods.push(method); if (method === "eth_requestAccounts" && grantEvent) for (const fn of listeners.get("accountsChanged") || []) fn([account]);
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [account];
      if (method === "eth_chainId") return chain;
      if (method === "eth_getCode") return code;
      if (method === "eth_sendTransaction") { sends.push(params!); if (reject) throw { code: 4001 }; if (lose) throw new Error("private provider details");
        if (paused) await new Promise<void>(resolve => { paused = resolve; }); return hash; }
      throw new Error("unexpected wallet method");
    } };
  const checked = { ...structuredClone(r.checked), study: { ...structuredClone(r.checked.study), executionEnabled: enabled },
    action: { ...structuredClone(r.checked.action!), executionEnabled: enabled } };
  const quoted = { ...structuredClone(r.f.quoted), qualification: { ...r.f.quoted.qualification, executionEnabled: enabled } };
  const api: TestnetWalletApi = { async call(action) {
    if (action === "quote") return quoted;
    if (action === "recheck") return checked;
    if (action === "receipt" && receiptFail) throw new Error("read unavailable");
    if (action === "receipt") return { observation: { contextId: checked.action!.contextId, hash, kind, chainId: 84532,
      source: "base-sepolia-rpc", observedAt: new Date(now).toISOString(), executionEnabled: false, status: "confirmed", confirmations: "2",
      blockNumber: "124", blockHash: `0x${"cd".repeat(32)}`, execution: { status: "verified",
        amountIn: kind === "swap" ? r.f.request.intent.amountIn : "0", amountOut: kind === "swap" ? r.q.quote.amountOut : "0",
        ...(kind !== "swap" ? { approvedAmount: kind === "reset" ? "0" : r.f.request.intent.amountIn } : {}),
        l2GasCost: "123", actualTotalFeeQualified: false, balances: { USDC: "0", WETH: "0", ETH: "100" },
        tokenAllowance: kind === "approve" ? r.f.request.intent.amountIn : "0", allowanceMatchesExpected: true,
        stateBlockNumber: "125", stateBlockHash: `0x${"ef".repeat(32)}` } } };
    throw new Error("unexpected api");
  } };
  let active = false;
  const coordination = { async run(action: () => Promise<void>) { if (active) throw new Error("busy"); active = true; try { await action(); } finally { active = false; } } };
  const make = (gate = enabled) => new TestnetWalletController(wallet, api, storage, () => now, coordination, () => gate);
  const controller = make();
  const reviewed = async () => { await controller.connect(); await controller.quote(r.f.request.intent); await controller.review(kind === "swap" ? "swap" : "approval"); };
  return { ...r, controller, make, storage, api, checked, quoted, methods, sends, reviewed,
    setCode: (value: string) => { code = value; },
    emitGrant: () => { grantEvent = true; }, failReceipt: () => { receiptFail = true; },
    expire: () => { now += 30000; }, reject: () => { reject = true; }, lose: () => { lose = true; },
    change: (event: string) => { if (event === "accountsChanged") account = "0x1111111111111111111111111111111111111111";
      if (event === "chainChanged") chain = "0x89"; for (const fn of listeners.get(event) || []) fn(event === "accountsChanged" ? [account] : chain); },
    defer: () => { paused = () => {}; }, finish: () => paused?.() };
}

it("uses explicit mocked actions for swap/reset/exact approval and never prompts on construction", async () => {
  for (const reverse of [false, true]) for (const kind of ["swap", "approve", "reset"] as const) {
    const s = await setup(kind, reverse); expect(s.methods).toEqual([]);
    await s.reviewed(); expect(s.controller.snapshot().stage).toBe("action-review");
    expect(s.methods).not.toContain("eth_sendTransaction"); await s.controller.submit();
    expect(s.controller.snapshot().stage).toBe("pending"); await s.controller.observe();
    expect(s.controller.snapshot().stage).toBe("confirmed"); await s.controller.acknowledge();
    expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
  }
});
it("records the original lifecycle independently of recovery and survives optional history failure", async () => {
  const s = await setup(); await s.reviewed(); await s.controller.submit();
  expect(readTestnetActivity(s.storage, s.f.request.intent.wallet).entries[0]).toMatchObject({ hash, status: "pending" });
  await s.controller.observe(); await s.controller.acknowledge();
  expect(readTestnetActivity(s.storage, s.f.request.intent.wallet).entries[0]).toMatchObject({ hash, status: "confirmed", l2GasCost: "123", amountIn: s.f.request.intent.amountIn });
  expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
  const b = await setup(); const write = b.storage.setItem;
  b.storage.setItem = (key, value) => { if (key === TESTNET_ACTIVITY_KEY) throw new Error("history quota"); write(key, value); };
  await b.reviewed(); await b.controller.submit(); await b.controller.observe();
  expect(b.controller.snapshot().stage).toBe("confirmed");
  expect(b.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();
});
it("persists the returned recovery hash before optional activity consumes storage quota", async () => {
  const s = await setup(); const write = s.storage.setItem; let historyWritten = false;
  s.storage.setItem = (key, value) => {
    if (key === TESTNET_ACTIVITY_KEY) historyWritten = true;
    if (key === TESTNET_SUBMISSION_KEY && historyWritten) throw new Error("quota consumed by activity");
    write(key, value);
  };
  await s.reviewed(); await s.controller.submit();
  expect(JSON.parse(s.storage.getItem(TESTNET_SUBMISSION_KEY)!).hash).toBe(hash);
});

it("blocks both execution gates, expiry, changed wallet and malformed responses before any send", async () => {
  for (const change of ["server-gate", "consumer-gate", "expiry", "account", "chain", "calldata"]) {
    const s = await setup("swap", false, change !== "server-gate");
    if (change === "calldata") s.checked.action!.transaction.data = "0x1234";
    await s.reviewed();
    if (change === "expiry") s.expire();
    if (change === "account") s.change("accountsChanged");
    if (change === "chain") s.change("chainChanged");
    const controller = change === "consumer-gate" ? s.make(false) : s.controller;
    if (controller !== s.controller) { await controller.connect(); await controller.quote(s.f.request.intent); await controller.review("swap"); }
    await controller.submit(); expect(s.methods).not.toContain("eth_sendTransaction");
    expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
  }
});

it("persists before a wallet prompt and reload never retries an uncertain original", async () => {
  const s = await setup(); await s.reviewed(); s.lose(); await s.controller.submit();
  expect(s.controller.snapshot().stage).toBe("uncertain");
  const count = s.methods.length; const reloaded = s.make(); expect(reloaded.snapshot().stage).toBe("uncertain");
  await reloaded.submit(); expect(s.methods.length).toBe(count);
  s.expire(); await reloaded.recoverHash(hash); await reloaded.observe();
  expect(reloaded.snapshot().stage).toBe("confirmed"); expect(s.methods.length).toBe(count);
});

it("definitive rejection clears the marker but cannot reuse the consumed review", async () => {
  const s = await setup(); await s.reviewed(); s.reject(); await s.controller.submit();
  expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull(); await s.controller.submit();
  expect(s.methods.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
});

it("fails before prompt on storage errors/conflicts and blocks malformed reloads", async () => {
  const s = await setup(); await s.reviewed(); s.storage.setItem = () => { throw new Error("storage unavailable"); };
  await s.controller.submit(); expect(s.methods).not.toContain("eth_sendTransaction");
  const b = await setup(); await b.reviewed(); b.storage.setItem(TESTNET_SUBMISSION_KEY, "bad");
  await b.controller.submit(); expect(b.methods).not.toContain("eth_sendTransaction"); expect(b.controller.snapshot().stage).toBe("recovery-blocked");
  expect(b.make().snapshot().stage).toBe("recovery-blocked");
});

it("keeps the original hash after wallet changes mid-prompt and prevents overlapping consumers", async () => {
  const s = await setup(); await s.reviewed(); const other = s.make();
  await other.connect(); await other.quote(s.f.request.intent); await other.review("swap");
  s.defer(); const pending = s.controller.submit();
  for (let n = 0; n < 30 && !s.methods.includes("eth_sendTransaction"); n++) await Promise.resolve();
  expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();
  await other.submit(); s.change("accountsChanged"); s.finish(); await pending;
  expect(s.methods.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
  expect(s.controller.snapshot().account).toBeNull();
  expect(s.controller.snapshot().submission?.hash).toBe(hash); await s.controller.observe();
  expect(s.controller.snapshot().stage).toBe("confirmed");
});

it("rejects late quote/recheck results after input changes without another RPC round-trip", async () => {
  for (const action of ["quote", "recheck"]) {
    const s = await setup(); await s.controller.connect(); if (action === "recheck") await s.controller.quote(s.f.request.intent);
    const original = s.api.call; s.api.call = async (name, body) => { const result = await original(name, body); if (name === action) s.controller.invalidate(); return result; };
    if (action === "quote") await s.controller.quote(s.f.request.intent); else await s.controller.review("swap");
    expect(s.controller.snapshot().action).toBeNull(); expect(s.controller.snapshot().quote).toBeNull();
    expect(s.methods).not.toContain("eth_sendTransaction");
  }
});

it("accepts the initial account grant event without accepting a changed review", async () => {
  const s = await setup(); s.emitGrant(); await s.reviewed();
  expect(s.controller.snapshot().stage).toBe("action-review");
});

it("does not acknowledge an earlier success after receipt refresh failure or stale observation", async () => {
  for (const failure of ["rpc", "stale"]) {
    const s = await setup(); await s.reviewed(); await s.controller.submit(); await s.controller.observe();
    expect(s.controller.snapshot().stage).toBe("confirmed");
    if (failure === "rpc") { s.failReceipt(); await s.controller.observe(); } else s.expire();
    await s.controller.acknowledge(); expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).not.toBeNull();
  }
});

it("does not bind a candidate hash when a reorg occurs before original transaction identity is known", async () => {
  const s = await setup(); await s.reviewed(); s.lose(); await s.controller.submit();
  const call = s.api.call;
  s.api.call = async (action, body) => action === "receipt" ? { observation: { contextId: s.checked.action!.contextId,
    hash: `0x${"22".repeat(32)}`, kind: "swap", chainId: 84532, source: "base-sepolia-rpc",
    observedAt: new Date(s.f.clock()).toISOString(), executionEnabled: false, status: "reorged", confirmations: "0", execution: null } } : call(action, body);
  await s.controller.recoverHash(`0x${"22".repeat(32)}`);
  expect(s.controller.snapshot().submission?.hash).toBeNull();
  s.api.call = call; await s.controller.recoverHash(hash); expect(s.controller.snapshot().submission?.hash).toBe(hash);
});

it("repairs only a matching original marker after a post-send storage failure, without another prompt", async () => {
  const s = await setup(); await s.reviewed(); const write = s.storage.setItem;
  let count = 0; s.storage.setItem = (k, v) => { if (++count === 2) throw new Error("temporary storage failure"); write(k, v); };
  await s.controller.submit(); expect(s.controller.snapshot().submission?.hash).toBe(hash);
  await s.controller.observe(); expect(s.controller.snapshot().stage).toBe("confirmed");
  expect(s.methods.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
});
it("explains lost context and receipt timeouts while preserving the original transaction", async () => {
  const { TestnetBrowserError } = await import("./testnet-wallet-client");
  for (const [code, expected] of [["TESTNET_CONTEXT_UNAVAILABLE", "tracking context is unavailable"], ["TESTNET_RECEIPT_TIMEOUT", "Receipt check timed out"]]) {
    const s = await setup("approve"); await s.reviewed(); await s.controller.submit();
    const raw = s.storage.getItem(TESTNET_SUBMISSION_KEY);
    s.api.call = async () => { throw new TestnetBrowserError(503, code); };
    await s.controller.observe(); expect(s.controller.snapshot().message).toContain(expected);
    expect(s.controller.snapshot().message).toContain("do not send again");
    expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBe(raw);
    expect(s.methods.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
  }
});

it("blocks swap review and send when LP recovery is active or corrupt, preserving both original records", async () => {
  const lpKey = "vezta-dex:base-sepolia-lp-submission:v1";
  for (const raw of ["corrupt", JSON.stringify({ hash, contextId: "11".repeat(24) })]) {
    const s = await setup(); await s.reviewed(); s.storage.setItem(lpKey, raw);
    await s.controller.submit();
    expect(s.methods).not.toContain("eth_sendTransaction");
    expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
    expect(s.storage.getItem(lpKey)).toBe(raw);
    expect(s.controller.snapshot().message).toContain("liquidity");
    await s.controller.quote(s.f.request.intent);
    expect(s.controller.snapshot().quote).toBeNull();
  }
});

it("LP recovery cannot prevent checking an already submitted original swap", async () => {
  const s = await setup(); await s.reviewed(); await s.controller.submit();
  s.storage.setItem("vezta-dex:base-sepolia-lp-submission:v1", "corrupt");
  await s.controller.observe(); expect(s.controller.snapshot().stage).toBe("confirmed");
  expect(s.methods.filter(m => m === "eth_sendTransaction")).toHaveLength(1);
});

it("sends the exact explicit reviewed fee envelope and preserves it through reload", async () => {
  for (const dynamic of [false, true]) {
    const s = await setup();
    if (dynamic) {
      const fees = { feeModel: "eip1559", maxFeePerGas: s.checked.action!.transaction.gasPrice, maxPriorityFeePerGas: "1000000" };
      Object.assign(s.checked.action!.transaction, fees); Object.assign(s.checked.study.transaction!, fees); Object.assign(s.checked.study.gas!, fees);
    }
    await s.reviewed(); await s.controller.submit();
    expect(s.controller.snapshot().stage).toBe("pending");
    expect(s.sends).toHaveLength(1);
    const sent = s.sends[0][0] as Record<string, unknown>;
    const tx = s.checked.action!.transaction;
    expect(sent).toEqual({ from: tx.from, to: tx.to, data: tx.data, chainId: "0x14a34", value: "0x0",
      nonce: `0x${BigInt(tx.nonce).toString(16)}`, gas: `0x${BigInt(tx.gas).toString(16)}`,
      ...(dynamic ? { type: "0x2", maxFeePerGas: `0x${BigInt(tx.gasPrice).toString(16)}`, maxPriorityFeePerGas: "0xf4240" }
        : { type: "0x0", gasPrice: `0x${BigInt(tx.gasPrice).toString(16)}` }) });
    expect(sent.type).toBe(dynamic ? "0x2" : "0x0");
    if (dynamic) { expect(sent.maxPriorityFeePerGas).toBe("0xf4240"); expect(sent.maxFeePerGas).toBe(`0x${BigInt(s.checked.action!.transaction.gasPrice).toString(16)}`); expect(sent).not.toHaveProperty("gasPrice"); }
    else { expect(sent).toHaveProperty("gasPrice"); expect(sent).not.toHaveProperty("maxFeePerGas"); }
    expect(s.make().snapshot().submission).toEqual(s.controller.snapshot().submission);
  }
});

it("accepts only the pinned MetaMask delegation indicator and sends the reviewed inner type2 envelope", async () => {
  const s = await setup(); s.setCode("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b");
  const fees = { feeModel: "eip1559", maxFeePerGas: s.checked.action!.transaction.gasPrice, maxPriorityFeePerGas: "1000000" };
  Object.assign(s.checked.action!.transaction, fees); Object.assign(s.checked.study.transaction!, fees); Object.assign(s.checked.study.gas!, fees);
  await s.reviewed(); expect(s.controller.snapshot().stage).toBe("action-review"); await s.controller.submit();
  expect(s.controller.snapshot().stage).toBe("pending"); expect(s.sends).toHaveLength(1);
  expect(s.sends[0][0]).toMatchObject({type:"0x2",from:s.f.request.intent.wallet,to:s.checked.action!.transaction.to,data:s.checked.action!.transaction.data});
});
it("fails closed when unknown delegation code appears after review", async () => {
  for (const code of ["0x00", "0xef01001111111111111111111111111111111111111111", "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b00"]) {
    const s = await setup(); await s.reviewed(); s.setCode(code); await s.controller.submit(); expect(s.sends).toHaveLength(0); expect(s.storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
  }
});

it("does not send if recovery storage crosses the study freshness boundary", async () => {
  const s = await setup(); await s.reviewed();
  const save = s.storage.setItem;
  s.storage.setItem = (key, value) => { save(key, value); if (key === TESTNET_SUBMISSION_KEY) s.expire(); };
  await s.controller.submit();
  expect(s.methods).not.toContain("eth_sendTransaction");
  expect(s.controller.snapshot().stage).toBe("uncertain");
});
it('restores only the expected authorized session without prompts and retains recovery blocking',async()=>{
 const s=await setup();await s.controller.restoreConnection(s.f.request.intent.wallet);expect(s.controller.snapshot().account).toBe(s.f.request.intent.wallet);expect(s.methods).not.toContain('eth_requestAccounts');expect(s.methods).not.toContain('eth_sendTransaction');
 const other=await setup();await other.controller.restoreConnection('0x1111111111111111111111111111111111111111');expect(other.controller.snapshot().account).toBeNull();
 const pending=await setup();await pending.reviewed();await pending.controller.submit();const fresh=pending.make(),count=pending.methods.length;await fresh.restoreConnection(pending.f.request.intent.wallet);expect(fresh.snapshot().account).toBeNull();expect(pending.methods.length).toBe(count);
});
