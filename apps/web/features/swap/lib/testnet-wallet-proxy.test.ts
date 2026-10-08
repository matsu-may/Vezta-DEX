import { expect, it, vi } from "vitest";
import { reviewedFixture } from "./testnet-wallet.test-helper";
import { createTestnetWalletProxy, testnetDemoEnabled } from "./testnet-wallet-proxy";
const env = { NODE_ENV: "development", DEX_TESTNET_DEMO_ENABLED: "1", DEX_TESTNET_BOUND_HOST: "127.0.0.1" };
const request = (body: unknown, headers: Record<string, string> = {}, suffix = "") => new Request(`http://localhost:3020/api/testnet-wallet/quote${suffix}`, {
  method: "POST", headers: { host: "127.0.0.1:3020", origin: "http://127.0.0.1:3020", "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
it("enables only explicitly bound development mode and validates boundaries before upstream", async () => {
  expect(testnetDemoEnabled(env)).toBe(true);
  for (const bad of [{}, { ...env, NODE_ENV: "production" }, { ...env, DEX_TESTNET_BOUND_HOST: "0.0.0.0" }]) expect(testnetDemoEnabled(bad)).toBe(false);
  const f = await reviewedFixture(); const fetcher = vi.fn(); const proxy = createTestnetWalletProxy(env, fetcher);
  for (const headers of [{ origin: "https://evil.example" }, { host: "localhost:3020" }, { "x-forwarded-for": "192.0.2.1" }, { forwarded: "for=evil" }, { "content-type": "text/plain" }] as Record<string, string>[])
    expect((await proxy(request(f.f.request.intent, headers), "quote")).status).toBe(403);
  expect((await proxy(request(f.f.request.intent, {}, "?x=1"), "quote")).status).toBe(400);
  expect((await proxy(request({ ...f.f.request.intent, signature: "extra" }), "quote")).status).toBe(400);
  expect((await proxy(request({ junk: "x".repeat(5000) }), "quote")).status).toBe(413);
  expect((await proxy(request({}), "send")).status).toBe(404); expect(fetcher).not.toHaveBeenCalled();
});
it("forwards actual backend shapes, strips secret fields and keeps normal dev read-only", async () => {
  const f = await reviewedFixture(); const quoted = { ...f.f.quoted, qualification: { ...f.f.quoted.qualification, executionEnabled: true } };
  const fetcher = vi.fn(async () => Response.json(quoted));
  const proxy = createTestnetWalletProxy({}, fetcher, f.f.clock);
  const result = await proxy(request(f.f.request.intent), "quote"); expect(result.status).toBe(200);
  expect((await result.json()).qualification.executionEnabled).toBe(false);
  expect(fetcher).toHaveBeenCalledWith("http://127.0.0.1:3021/api/v1/testnet/base-sepolia/quote", expect.objectContaining({ cache: "no-store", redirect: "error" }));
  const leaked = createTestnetWalletProxy(env, async () => Response.json({ ...quoted, apiKey: "private" }), f.f.clock);
  const rejected = await leaked(request(f.f.request.intent), "quote"); expect(rejected.status).toBe(503); expect(await rejected.text()).not.toContain("private");
  const check = createTestnetWalletProxy(env, async () => Response.json(f.checked), f.f.clock);
  expect((await check(request({ ...f.f.request, kind: "swap" }), "recheck")).status).toBe(200);
});
it("preserves safe upstream codes and bounds active/read budgets without queueing", async () => {
  const f = await reviewedFixture(); let finish: (() => void) | undefined;
  const fetcher = vi.fn(async () => { await new Promise<void>(r => { finish = r; }); return Response.json({ code: "TESTNET_CONTEXT_UNAVAILABLE", error: "secret" }, { status: 410 }); });
  const proxy = createTestnetWalletProxy(env, fetcher, f.f.clock);
  const original = proxy(request(f.f.request.intent), "quote");
  for (let n = 0; n < 20 && !finish; n++) await Promise.resolve();
  expect((await proxy(request(f.f.request.intent), "quote")).status).toBe(429); finish!();
  const response = await original; expect(response.status).toBe(410); expect(await response.text()).not.toContain("secret");
  const bad = createTestnetWalletProxy({ ...env, DEX_API_URL: "https://evil.example" }, fetcher);
  expect((await bad(request(f.f.request.intent), "quote")).status).toBe(503);
});
it("never passes unrecognized upstream error codes to the browser", async () => {
  const f = await reviewedFixture();
  const proxy = createTestnetWalletProxy(env, async () => Response.json({ code: "TESTNET_PRIVATE_SECRET", error: "private" }, { status: 503 }), f.f.clock);
  const body = await (await proxy(request(f.f.request.intent), "quote")).json();
  expect(body.code).toBe("TESTNET_BROWSER_UNAVAILABLE");
});
it("passes only bounded unverified diagnostics through the receipt boundary", async () => {
  const f = await reviewedFixture(); const hash = `0x${"11".repeat(32)}`;
  const observation = { contextId: f.checked.action!.contextId, hash, kind: "swap", chainId: 84532,
    source: "base-sepolia-rpc", observedAt: new Date(f.f.clock()).toISOString(), executionEnabled: false,
    status: "unverified", confirmations: "0", execution: null, diagnostic: "transaction-mismatch" };
  const body = { contextId: observation.contextId, hash };
  const good = createTestnetWalletProxy(env, async () => Response.json({ observation }), f.f.clock);
  expect(await (await good(request(body), "receipt")).json()).toMatchObject({ observation: { diagnostic: "transaction-mismatch" } });
  const bad = createTestnetWalletProxy(env, async () => Response.json({ observation: { ...observation, diagnostic: "private RPC key" } }), f.f.clock);
  const response = await bad(request(body), "receipt"); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
});

it("binds historical reconciliation to the requested owner/hash and fresh read-only observation", async () => {
  const f = await reviewedFixture(); const hash = `0x${"11".repeat(32)}`;
  const { TESTNET_SWAP_POLICY: P } = await import("@vezta-dex/core");
  const reconciliation = {wallet:f.f.request.intent.wallet,hash,chainId:84532,kind:"approve",token:f.f.request.intent.tokenIn,spender:P.router,
    approvedAmount:f.f.request.intent.amountIn,receiptBlockNumber:"124",receiptBlockHash:`0x${"ab".repeat(32)}`,observedAt:new Date(f.f.clock()).toISOString(),
    confirmations:"2",currentAllowance:f.f.request.intent.amountIn,originalReviewAvailable:false,status:"verified-historical-approval",
    executionModel:"metamask-delegation",gasPayer:"0x2222222222222222222222222222222222222222",actualTotalFeeQualified:false,executionEnabled:false};
  const body = {wallet:reconciliation.wallet,hash};
  const good = createTestnetWalletProxy({},async()=>Response.json({reconciliation}),f.f.clock);
  expect((await good(request(body),"historical-approval")).status).toBe(200);
  for(const change of [{wallet:reconciliation.gasPayer},{hash:`0x${"22".repeat(32)}`},{observedAt:new Date(f.f.clock()-30000).toISOString()}]) {
    const proxy = createTestnetWalletProxy(env,async()=>Response.json({reconciliation:{...reconciliation,...change}}),f.f.clock);
    expect((await proxy(request(body),"historical-approval")).status).toBe(503);
  }
});
