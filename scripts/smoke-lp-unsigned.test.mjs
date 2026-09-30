import test from "node:test";
import assert from "node:assert/strict";
import { probeLpUnsigned } from "./smoke-lp-unsigned.mjs";

const wallet = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const usdc = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const weth = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const manager = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";

function createResponse(overrides = {}) {
  return {
    requestId: "private-request-id",
    token0: { tokenAddress: usdc, amount: "1000000" },
    token1: { tokenAddress: weth, amount: "372000000000000" },
    tickLower: -887270, tickUpper: 887270,
    adjustedMinPrice: "0.00001", adjustedMaxPrice: "100000",
    create: { chainId: 137, from: wallet, to: manager, value: "0", data: "0x12345678" },
    ...overrides,
  };
}

test("reads unsigned create and approval shapes without leaking payload or sending a transaction", async () => {
  const requests = [];
  const lines = [];
  const result = await probeLpUnsigned({ apiKey: "private-key", wallet, write: line => lines.push(JSON.parse(line)),
    fetcher: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), method: options.method });
      if (url.endsWith("/lp/create")) return Response.json(createResponse());
      return Response.json({ requestId: "private-approval-id", transactions: [{ action: "CREATE", cancelApproval: false,
        transaction: { chainId: 137, from: wallet, to: usdc, value: "0", data: "0x095ea7b3" } }] });
    },
  });
  assert.equal(result, true);
  assert.deepEqual(requests.map(x => x.url), [
    "https://liquidity.api.uniswap.org/lp/create",
    "https://liquidity.api.uniswap.org/lp/check_approval",
  ]);
  assert.deepEqual(requests[0].body, { walletAddress: wallet, protocol: "V3", chainId: 137,
    existingPool: { token0Address: usdc, token1Address: weth, poolReference: "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9" },
    independentToken: { tokenAddress: usdc, amount: "1000000" },
    tickBounds: { tickLower: -887270, tickUpper: 887270 }, simulateTransaction: false });
  assert.deepEqual(requests[1].body, { walletAddress: wallet, protocol: "V3", chainId: 137,
    lpTokens: [{ tokenAddress: usdc, amount: "1000000" }, { tokenAddress: weth, amount: "372000000000000" }], action: "CREATE" });
  assert.ok(requests.every(x => x.method === "POST"));
  assert.deepEqual(lines, [
    { stage: "create", status: 200, shapeValid: true, tokenAmountsValid: true, transactionShapeValid: true },
    { stage: "check_approval", status: 200, shapeValid: true, transactionCount: 1 },
  ]);
  assert.ok(!JSON.stringify(lines).includes("private"));
  assert.ok(!JSON.stringify(lines).includes("0x095ea7b3"));
});

test("a wrong create target stops before approval", async () => {
  const urls = [];
  const lines = [];
  const result = await probeLpUnsigned({ apiKey: "secret", wallet, write: line => lines.push(JSON.parse(line)),
    fetcher: async url => { urls.push(url); return Response.json(createResponse({ create: {
      chainId: 137, from: wallet, to: "0x1111111111111111111111111111111111111111", value: "0", data: "0x12345678",
    } })); },
  });
  assert.equal(result, false);
  assert.equal(urls.length, 1);
  assert.deepEqual(lines, [{ stage: "create", status: 200, shapeValid: false, tokenAmountsValid: true, transactionShapeValid: false,
    transactionChecks: { present: true, chainMatches: true, chainType: "number", fromMatchesWallet: true, fromType: "string",
      targetMatchesManager: false, targetAddress: "0x1111111111111111111111111111111111111111",
      valueZero: true, valueType: "string", valueKind: "zero-decimal", calldataShapeValid: true, calldataType: "string" } }]);
});

test("classifies a hex-encoded zero value without treating it as approved", async () => {
  const lines = [];
  const calls = [];
  const result = await probeLpUnsigned({ apiKey: "secret", wallet, write: line => lines.push(JSON.parse(line)),
    fetcher: async url => { calls.push(url); return Response.json(createResponse({ create: {
      chainId: 137, from: wallet, to: manager, value: "0x0", data: "0x12345678",
    } })); },
  });
  assert.equal(result, false);
  assert.equal(calls.length, 1);
  assert.equal(lines[0].transactionChecks.valueKind, "zero-hex");
  assert.equal(lines[0].transactionChecks.valueZero, false);
});

test("a changed independent token amount cannot feed an approval request", async () => {
  const urls = [];
  const lines = [];
  const result = await probeLpUnsigned({ apiKey: "secret", wallet, write: line => lines.push(JSON.parse(line)),
    fetcher: async url => { urls.push(url); return Response.json(createResponse({ token0: { tokenAddress: usdc, amount: "2000000" } })); },
  });
  assert.equal(result, false);
  assert.equal(urls.length, 1);
  assert.deepEqual(lines, [{ stage: "create", status: 200, shapeValid: false, tokenAmountsValid: false, transactionShapeValid: true }]);
});

test("upstream errors are classified without printing response bodies", async () => {
  const lines = [];
  const result = await probeLpUnsigned({ apiKey: "secret", wallet, write: line => lines.push(JSON.parse(line)),
    fetcher: async () => new Response(JSON.stringify({ message: "private provider detail" }), { status: 403 }),
  });
  assert.equal(result, false);
  assert.deepEqual(lines, [{ stage: "create", status: 403, errorKind: "AUTH" }]);
});
