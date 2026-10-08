import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseTestnetDiscovery } from "./diagnose-testnet-discovery.mjs";

test("reports both fixed read boundaries without exposing bodies, addresses or credentials", async () => {
  const requests = []; const lines = [];
  const responses = [
    Response.json({ depth: { chainId: 84532, source: "base-sepolia-rpc", depthQualified: true,
      candidateFeeTiers: [3000], pools: [{}], secret: "hidden-key" } }),
    Response.json({ code: "TESTNET_API_HTTP_ERROR", upstreamStatus: 404, error: "hidden-url" }, { status: 503 }),
  ];
  let tick = 0;
  await diagnoseTestnetDiscovery({ fetcher: async (url, init) => { requests.push([url, init]); return responses.shift(); },
    now: () => ++tick * 10, write: line => lines.push(JSON.parse(line)) });
  assert.deepEqual(requests.map(([url]) => url), ["http://127.0.0.1:3021/api/v1/testnet/base-sepolia/depth", "http://127.0.0.1:3020/api/testnet-depth"]);
  assert.ok(requests.every(([, init]) => init.method === "GET" && init.redirect === "error" && !init.body));
  assert.deepEqual(lines, [
    { endpoint: "api-depth", status: 200, elapsedMs: 10, hasDepth: true, depthQualified: true, candidateFeeTiers: [3000], poolCount: 1 },
    { endpoint: "web-depth", status: 503, elapsedMs: 10, code: "TESTNET_API_HTTP_ERROR", upstreamStatus: 404, hasDepth: false },
  ]);
  assert.ok(!JSON.stringify(lines).includes("hidden"));
});

test("bounds malformed responses and classifies local fetch failures without raw details", async () => {
  const lines = [];
  await diagnoseTestnetDiscovery({ fetcher: async url => {
    if (url.includes(":3021")) return new Response("private-key".repeat(10000));
    throw new Error("private-url", { cause: { code: "ECONNREFUSED" } });
  }, write: line => lines.push(JSON.parse(line)) });
  assert.equal(lines[0].code, "INVALID_DIAGNOSTIC_RESPONSE");
  assert.equal(lines[1].networkError, "Error");
  assert.equal(lines[1].localErrorCode, "ECONNREFUSED");
  assert.ok(!JSON.stringify(lines).includes("private"));
});

test("does not echo unknown error codes or pretend an HTTP 200 body is valid depth", async () => {
  const lines = [];
  await diagnoseTestnetDiscovery({ fetcher: async () => Response.json({ code: "SECRET_API_KEY", depth: { chainId: 137 } }),
    write: line => lines.push(JSON.parse(line)) });
  assert.ok(lines.every(line => !line.hasDepth && line.code === "INVALID_DIAGNOSTIC_RESPONSE"));
  assert.ok(!JSON.stringify(lines).includes("SECRET"));
});
