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
it("passes production quote through existing validators with writes off and no secret response", async () => {
  const f = await reviewedFixture(); let sent: RequestInit | undefined;
  const response = await createTestnetWalletProxy(env, async (_url, init) => { sent = init; return Response.json({ ...f.f.quoted,
    qualification: { ...f.f.quoted.qualification, executionEnabled: true } }); }, f.f.clock)(request(f.f.request.intent), "quote");
  expect(response.status).toBe(200); expect((await response.clone().json()).qualification.executionEnabled).toBe(false);
  expect(await response.text()).not.toContain(env.DEX_BFF_TOKEN);
  expect(new Headers(sent?.headers).get("authorization")).toBe(`Bearer ${env.DEX_BFF_TOKEN}`);
});
it("supports depth and LP HTTPS boundaries with the same host/auth rules", async () => {
  const depth = await createTestnetDepthProxy(env, async () => Response.json({ depth: depthFixture() }))(new Request("https://dex.example.com/api/testnet-depth"));
  expect(depth.status).toBe(200);
  const f = lpWalletFixture();
  const lp = await createTestnetLpWalletProxy(env, async () => Response.json({ study: f.study }), () => LP_NOW)(request({ intent: f.intent }), "study");
  expect(lp.status).toBe(200); expect((await lp.json()).study.executionEnabled).toBe(false);
  const positions = await createTestnetLpProxy(env, async () => Response.json({ code: "TESTNET_LP_RPC_UNAVAILABLE" }, { status: 503 }))(request({ chainId: 84532, owner: f.intent.wallet, cursor: "0", limit: 1 }));
  expect(positions.status).toBe(503); expect((await positions.json()).code).toBe("TESTNET_LP_RPC_UNAVAILABLE");
});
it("denies final recheck before fetching when writes are off while retaining LP receipt recovery", async () => {
  const f = lpWalletFixture(); let calls = 0;
  const proxy = createTestnetLpWalletProxy(env, async () => { calls++; return Response.json({ observation: f.observation }); }, () => LP_NOW);
  expect((await proxy(request({ contextId: f.study.contextId }), "recheck")).status).toBe(403);
  expect(calls).toBe(0);
  expect((await proxy(request({ contextId: f.study.contextId, hash: f.observation.hash }), "receipt")).status).toBe(200);
});
