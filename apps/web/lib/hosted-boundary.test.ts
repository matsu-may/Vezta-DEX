import { expect, it } from "vitest";
import { testnetBrowserAllowed, testnetApiTarget } from "./hosted-boundary";
import { testnetDemoEnabled } from "./testnet-demo-gate";
import { createTestnetWalletProxy } from "../features/swap/lib/testnet-wallet-proxy";
import { createTestnetLpWalletProxy } from "../features/liquidity/lib/testnet-lp-wallet-proxy";
import { createTestnetDepthProxy } from "../features/explore/lib/testnet-depth";
import { createTestnetLpProxy } from "../features/liquidity/lib/testnet-lp";
import { reviewedFixture } from "../features/swap/lib/testnet-wallet.test-helper";
import { lpWalletFixture, LP_NOW } from "../features/liquidity/lib/testnet-lp-wallet.test-helper";
import { depthFixture } from "../../../packages/core/src/discovery/testnet-depth.test-helper";
const env = { NODE_ENV: "production", DEX_HOSTED_MODE: "1", DEX_PUBLIC_ORIGIN: "https://dex.example.com",
  DEX_API_URL: "https://api.example.com", DEX_BFF_TOKEN: "cd".repeat(32) };
const vercelEnv = { ...env, VERCEL: "1" };
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://dex.example.com/api/testnet-wallet/quote", {
  method: "POST", headers: { host: "dex.example.com", origin: "https://dex.example.com", "content-type": "application/json",
    "x-forwarded-host": "dex.example.com", "x-forwarded-proto": "https", "x-forwarded-for": "192.0.2.1", ...headers }, body: JSON.stringify(body) });
it("accepts exact hosted JSON origin independently of client IP and rejects forged headers", () => {
  expect(testnetBrowserAllowed(request({}), env)).toBe(true);
  for (const headers of [{ origin: "https://other.example.com" }, { host: "other.example.com" },
    { "x-forwarded-host": "other.example.com" }, { "x-forwarded-proto": "http" }, { forwarded: "host=evil" },
    { "content-type": "text/plain" }] as Record<string, string>[]) expect(testnetBrowserAllowed(request({}, headers), env)).toBe(false);
  expect(testnetBrowserAllowed(request({}), { ...env, DEX_BFF_TOKEN: "" })).toBe(false);
  expect(testnetDemoEnabled(env)).toBe(false);
  expect(testnetDemoEnabled({ ...env, DEX_HOSTED_WRITES_ENABLED: "1" })).toBe(true);
});
it("requires hosted HTTPS config and only sends server token to the fixed API", () => {
  expect(testnetApiTarget(env)).toMatchObject({ url: new URL("https://api.example.com"), headers: { Authorization: `Bearer ${env.DEX_BFF_TOKEN}` } });
  expect(() => testnetApiTarget({ ...env, DEX_API_URL: "http://127.0.0.1:3021" })).toThrow();
  expect(() => testnetApiTarget({ DEX_HOSTED_MODE: "1" })).toThrow();
});
it("reports a safe rejection reason without exposing configuration or request headers", async () => {
  let fetched = false;
  const fetcher: typeof fetch = async () => { fetched = true; throw new Error("Unexpected upstream request"); };
  for (const [headers, diagnostic] of [
    [{ origin: "https://other.example.com" }, "origin-mismatch"],
    [{ "x-forwarded-host": "other.example.com" }, "forwarded-host-mismatch"],
    [{ "x-forwarded-proto": "http" }, "forwarded-protocol-mismatch"],
    [{ host: "other.example.com", forwarded: "for=unknown" }, "host-mismatch"],
  ] as [Record<string, string>, string][]) {
    const response = await createTestnetWalletProxy(vercelEnv, fetcher)(request({}, headers), "quote");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Same-origin JSON required", code: "TESTNET_BROWSER_ORIGIN", diagnostic });
  }
  const response = await createTestnetWalletProxy({ ...env, DEX_BFF_TOKEN: "" }, fetcher)(request({}), "quote");
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: "Hosted API configuration unavailable", code: "TESTNET_BROWSER_CONFIG", diagnostic: "hosted-configuration-invalid" });
  expect(fetched).toBe(false);
});
it("ignores unused Forwarded metadata only in the configured Vercel runtime", () => {
  for (const forwarded of [
    "for=192.0.2.1", "for=192.0.2.1:1234", "host=other.example.com;proto=http",
    "for=unknown,for=192.0.2.1", "", "x".repeat(2048),
  ]) {
    expect(testnetBrowserAllowed(request({}, { forwarded }), vercelEnv)).toBe(true);
    for (const VERCEL of [undefined, "0", "true", "2", " 1"]) {
      expect(testnetBrowserAllowed(request({}, { forwarded }), { ...env, VERCEL })).toBe(false);
    }
  }
  for (const headers of [
    { origin: "https://other.example.com" }, { host: "other.example.com" },
    { "x-forwarded-host": "other.example.com" }, { "x-forwarded-proto": "http" },
    { "content-type": "text/plain" },
  ] as Record<string, string>[]) {
    expect(testnetBrowserAllowed(request({}, { forwarded: "for=unknown", ...headers }), vercelEnv)).toBe(false);
  }
  expect(testnetBrowserAllowed(request({}, { forwarded: "for=unknown", vercel: "1" }), env)).toBe(false);
  expect(testnetBrowserAllowed(request({}, { forwarded: "for=unknown" }), { ...vercelEnv, DEX_BFF_TOKEN: "" })).toBe(false);
  expect(testnetBrowserAllowed(new Request("http://dex.example.com/api/testnet-wallet/quote", {
    method: "POST", headers: request({}, { forwarded: "for=unknown" }).headers,
  }), vercelEnv)).toBe(false);
  const local = new Request("http://127.0.0.1:3020/api/testnet-wallet/quote", { method: "POST", headers: {
    host: "127.0.0.1:3020", origin: "http://127.0.0.1:3020", "content-type": "application/json",
    forwarded: "for=unknown",
  } });
  expect(testnetBrowserAllowed(local, { VERCEL: "1" })).toBe(false);
});
it("passes production quote through existing validators with writes off and no secret response", async () => {
  const f = await reviewedFixture(); let sent: RequestInit | undefined;
  const response = await createTestnetWalletProxy(vercelEnv, async (url, init) => { expect(String(url)).toBe("https://api.example.com/api/v1/testnet/base-sepolia/quote"); sent = init; return Response.json({ ...f.f.quoted,
    qualification: { ...f.f.quoted.qualification, executionEnabled: true } }); }, f.f.clock)(request(f.f.request.intent, {
      forwarded: "host=attacker.example.com;proto=http", authorization: "Bearer browser-token", cookie: "session=browser-cookie",
    }), "quote");
  expect(response.status).toBe(200); expect((await response.clone().json()).qualification.executionEnabled).toBe(false);
  expect(await response.text()).not.toContain(env.DEX_BFF_TOKEN);
  expect(new Headers(sent?.headers).get("authorization")).toBe(`Bearer ${env.DEX_BFF_TOKEN}`);
  expect(new Headers(sent?.headers).has("forwarded")).toBe(false);
  expect(new Headers(sent?.headers).has("origin")).toBe(false);
  expect(new Headers(sent?.headers).has("cookie")).toBe(false);
  for (const name of ["x-forwarded-host", "x-forwarded-proto", "x-forwarded-for"]) expect(new Headers(sent?.headers).has(name)).toBe(false);
});
it("supports depth and LP HTTPS boundaries with the same host/auth rules", async () => {
  const depth = await createTestnetDepthProxy(env, async () => Response.json({ depth: depthFixture() }))(new Request("https://dex.example.com/api/testnet-depth"));
  expect(depth.status).toBe(200);
  const f = lpWalletFixture();
  const proxyHeaders = { forwarded: "for=192.0.2.1;host=dex.example.com;proto=https" };
  const lp = await createTestnetLpWalletProxy(vercelEnv, async () => Response.json({ study: f.study }), () => LP_NOW)(request({ intent: f.intent }, proxyHeaders), "study");
  expect(lp.status).toBe(200); expect((await lp.json()).study.executionEnabled).toBe(false);
  const positions = await createTestnetLpProxy(vercelEnv, async () => Response.json({ code: "TESTNET_LP_RPC_UNAVAILABLE" }, { status: 503 }))(request({ chainId: 84532, owner: f.intent.wallet, cursor: "0", limit: 1 }, proxyHeaders));
  expect(positions.status).toBe(503); expect((await positions.json()).code).toBe("TESTNET_LP_RPC_UNAVAILABLE");
});
it("denies final recheck before fetching when writes are off while retaining LP receipt recovery", async () => {
  const f = lpWalletFixture(); let calls = 0;
  const proxy = createTestnetLpWalletProxy(vercelEnv, async () => { calls++; return Response.json({ observation: f.observation }); }, () => LP_NOW);
  expect((await proxy(request({ contextId: f.study.contextId }, { forwarded: "for=unknown" }), "recheck")).status).toBe(403);
  expect(calls).toBe(0);
  const swapProxy = createTestnetWalletProxy(vercelEnv, async () => { calls++; throw new Error("Writes must be denied"); });
  expect((await swapProxy(request({ contextId: f.study.contextId }, { forwarded: "for=unknown" }), "recheck")).status).toBe(403);
  expect(calls).toBe(0);
  expect((await proxy(request({ contextId: f.study.contextId, hash: f.observation.hash }, { forwarded: "for=unknown" }), "receipt")).status).toBe(200);
});
