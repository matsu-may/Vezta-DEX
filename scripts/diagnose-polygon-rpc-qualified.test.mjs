import test from "node:test";
import assert from "node:assert/strict";
import { inspectQualifiedRpcRead, runQualifiedRpcProbe } from "./diagnose-polygon-rpc-qualified.mjs";

const HASH = `0x${"a".repeat(64)}`;
const TX = `0x${"b".repeat(64)}`;
const WORD = `0x${"0".repeat(63)}1`;
const block = { number: "0x10", hash: HASH, timestamp: "0x64", transactions: [TX] };
const fixture = () => ({ chainId: "0x89", block, balance: WORD, allowance: WORD,
  receipt: { transactionHash: TX, blockNumber: "0x10", blockHash: HASH, status: "0x1" },
  confirmedBlock: block, now: 100_000 });

test("qualified read requires fresh same-chain block, two pinned contract calls and matching receipt", () => {
  assert.equal(inspectQualifiedRpcRead(fixture()).verified, true);
  for (const change of [
    { chainId: "0x1" }, { balance: "0x1" }, { allowance: "0x" },
    { receipt: { ...fixture().receipt, blockHash: `0x${"c".repeat(64)}` } },
    { confirmedBlock: { ...block, hash: `0x${"c".repeat(64)}` } },
    { now: 300_001 }, { block: { ...block, transactions: [] } },
  ]) assert.equal(inspectQualifiedRpcRead({ ...fixture(), ...change }).verified, false);
});

test("RPC qualification requests pinned reads and a receipt without logging RPC URL or payload", async () => {
  const lines = [];
  const methods = [];
  const responses = ["0x89", block, WORD, WORD, fixture().receipt, block];
  const verified = await runQualifiedRpcProbe({ rpcUrl: "https://key:secret@example.org/rpc", cycles: 1,
    now: () => 100_000,
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      methods.push([body.method, body.params]);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: responses.shift(), secret: "private" }), { status: 200 });
    },
    pause: async () => {}, write: line => lines.push(JSON.parse(line)),
  });
  assert.deepEqual(methods.map(entry => entry[0]), ["eth_chainId", "eth_getBlockByNumber", "eth_call",
    "eth_call", "eth_getTransactionReceipt", "eth_getBlockByNumber"]);
  assert.equal(methods[2][1][1], "0x10");
  assert.equal(methods[3][1][1], "0x10");
  assert.deepEqual(methods[4][1], [TX]);
  assert.deepEqual(methods[5][1], ["0x10", false]);
  assert.equal(lines[0].verified, true);
  assert.equal(verified, true);
  assert.deepEqual(Object.keys(lines[0].timings), ["chainMs", "latestBlockMs", "balanceMs",
    "allowanceMs", "receiptMs", "confirmBlockMs"]);
  assert.ok(!JSON.stringify(lines).includes("private"));
  assert.ok(!JSON.stringify(lines).includes("secret"));
  assert.ok(!JSON.stringify(lines).includes(TX));
});

test("RPC qualification uses a recent nonempty block and sanitizes provider failures", async () => {
  const methods = [];
  const lines = [];
  const empty = { ...block, number: "0x11", transactions: [] };
  const responses = ["0x89", empty, block, WORD, WORD, fixture().receipt, block];
  const recoveredResult = await runQualifiedRpcProbe({ rpcUrl: "https://private-key@example.org/rpc", cycles: 1,
    now: () => 100_000, pause: async () => {},
    fetcher: async (_url, options) => {
      const body = JSON.parse(options.body);
      methods.push(body);
      return new Response(JSON.stringify({ result: responses.shift() }), { status: 200 });
    }, write: line => lines.push(JSON.parse(line)),
  });
  assert.deepEqual(methods[2].params, ["0x10", false]);
  assert.equal(lines[0].verified, true);
  assert.equal(recoveredResult, true);

  const failed = [];
  const failedResult = await runQualifiedRpcProbe({ rpcUrl: "https://private-key@example.org/rpc", cycles: 1,
    pause: async () => {}, fetcher: async () => {
      throw new DOMException("private-key", "TimeoutError");
    }, write: line => failed.push(JSON.parse(line)),
  });
  assert.deepEqual(failed.map(({ stage, errorKind, verified }) => ({ stage, errorKind, verified })),
    [{ stage: "chain", errorKind: "RPC_TIMEOUT", verified: false }]);
  assert.equal(failedResult, false);
  assert.ok(!JSON.stringify(failed).includes("private-key"));
});

test("malformed RPC URL is rejected without repeating its credential text", async () => {
  await assert.rejects(runQualifiedRpcProbe({ rpcUrl: "private-token", cycles: 1 }), error =>
    error.message === "Invalid Polygon RPC URL" && !String(error).includes("private-token"));
});
