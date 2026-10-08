import test from "node:test";
import assert from "node:assert/strict";
import { runPolygonRpcProbe } from "./diagnose-polygon-rpc.mjs";

test("separates chain and block RPC failures without printing provider responses or URL", async () => {
  const lines = [];
  const requests = [];
  const responses = [
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0x89", secret: "hidden" }), { status: 200 }),
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, error: { code: -32005, message: "private-token" } }), { status: 429 }),
  ];
  let clock = 0;
  await runPolygonRpcProbe({
    rpcUrl: "https://private-token@example.org/rpc", cycles: 1,
    fetcher: async (_url, options) => { requests.push(JSON.parse(options.body)); return responses.shift(); },
    now: () => clock++ * 10, pause: async () => {},
    write: line => lines.push(JSON.parse(line)),
  });
  assert.deepEqual(requests.map(({ method, params }) => ({ method, params })), [
    { method: "eth_chainId", params: [] },
    { method: "eth_getBlockByNumber", params: ["latest", false] },
  ]);
  assert.deepEqual(lines.map(({ method, status, rpcErrorCode, validResult, elapsedMs }) => ({ method, status, rpcErrorCode, validResult, elapsedMs })), [
    { method: "eth_chainId", status: 200, rpcErrorCode: undefined, validResult: true, elapsedMs: 10 },
    { method: "eth_getBlockByNumber", status: 429, rpcErrorCode: -32005, validResult: false, elapsedMs: 10 },
  ]);
  assert.ok(!JSON.stringify(lines).includes("private-token"));
  assert.ok(!JSON.stringify(lines).includes("hidden"));
});

test("transport errors are classified without printing provider details", async () => {
  const lines = [];
  await runPolygonRpcProbe({
    rpcUrl: "https://example.org/private", cycles: 1,
    fetcher: async () => { throw new DOMException("secret URL", "TimeoutError"); },
    pause: async () => {}, write: line => lines.push(JSON.parse(line)),
  });
  assert.deepEqual(lines.map(({ method, networkError }) => ({ method, networkError })), [
    { method: "eth_chainId", networkError: "TimeoutError" },
    { method: "eth_getBlockByNumber", networkError: "TimeoutError" },
  ]);
  assert.ok(!JSON.stringify(lines).includes("secret URL"));
});
