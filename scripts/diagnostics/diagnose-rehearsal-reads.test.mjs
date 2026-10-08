import test from "node:test";
import assert from "node:assert/strict";
import { runReadDiagnostics } from "./diagnose-rehearsal-reads.mjs";

const wallet = "0x1111111111111111111111111111111111111111";

test("repeated local reads report safe status, stage, and duration without printing upstream bodies", async () => {
  const lines = [];
  const requests = [];
  const responses = [
    new Response(JSON.stringify({ error: "Trading API quote is unavailable", code: "TRADING_API_RATE_LIMITED", upstreamStatus: 429, secret: "hidden" }), { status: 503 }),
    new Response(JSON.stringify({ error: "Polygon observation is unavailable", code: "WALLET_STATE_READS_UNAVAILABLE", secret: "hidden" }), { status: 503 }),
    new Response(JSON.stringify({ quote: { amountOut: "123", secret: "hidden" }, quoteId: "secret-id" }), { status: 200 }),
    new Response(JSON.stringify({ state: { balances: { USDC: "1000000" }, secret: "hidden" } }), { status: 200 }),
  ];
  let tick = 0;
  await runReadDiagnostics({
    swapper: wallet, cycles: 2,
    fetcher: async (url, options) => { requests.push({ url: String(url), body: JSON.parse(options.body) }); return responses.shift(); },
    now: () => tick++ * 10,
    pause: async () => {},
    write: value => lines.push(JSON.parse(value)),
  });
  assert.deepEqual(lines.map(({ endpoint, status, code, upstreamStatus, elapsedMs }) => ({ endpoint, status, code, upstreamStatus, elapsedMs })), [
    { endpoint: "quote", status: 503, code: "TRADING_API_RATE_LIMITED", upstreamStatus: 429, elapsedMs: 10 },
    { endpoint: "state", status: 503, code: "WALLET_STATE_READS_UNAVAILABLE", upstreamStatus: undefined, elapsedMs: 10 },
    { endpoint: "quote", status: 200, code: undefined, upstreamStatus: undefined, elapsedMs: 10 },
    { endpoint: "state", status: 200, code: undefined, upstreamStatus: undefined, elapsedMs: 10 },
  ]);
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.map(({ url }) => new URL(url).pathname), ["/api/v1/trading-quote", "/api/v1/wallet-state", "/api/v1/trading-quote", "/api/v1/wallet-state"]);
  assert.ok(requests.every(({ body }) => body.swapper === wallet && body.amountIn === "1000000" && body.chainId === 137));
  assert.ok(!JSON.stringify(lines).includes("hidden"));
  assert.ok(!JSON.stringify(lines).includes("secret-id"));
});

test("a failed local fetch is classified without printing its message", async () => {
  const lines = [];
  await runReadDiagnostics({
    swapper: wallet, cycles: 1,
    fetcher: async () => { throw new Error("secret-rpc-url"); },
    pause: async () => {},
    write: value => lines.push(JSON.parse(value)),
  });
  assert.deepEqual(lines.map(({ endpoint, networkError }) => ({ endpoint, networkError })), [
    { endpoint: "quote", networkError: "Error" },
    { endpoint: "state", networkError: "Error" },
  ]);
  assert.ok(!JSON.stringify(lines).includes("secret-rpc-url"));
});
