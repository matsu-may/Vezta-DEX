import test from "node:test";
import assert from "node:assert/strict";
import { probeLpOnchain } from "./smoke-lp-onchain.mjs";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const FACTORY = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const hash = `0x${"1".repeat(64)}`;
const observedAt = Date.UTC(2026, 8, 30, 12, 0, 0);

function client(overrides = {}) {
  const calls = [];
  let blocks = 0;
  const reader = {
    getChainId: async () => overrides.chainId ?? 137,
    getBlock: async request => {
      calls.push({ method: "getBlock", request });
      blocks += 1;
      return { number: 123n, hash: blocks === 2 && overrides.reorg ? `0x${"2".repeat(64)}` : hash,
        timestamp: BigInt(observedAt / 1000 - 10) };
    },
    readContract: async request => {
      calls.push({ method: "readContract", request });
      switch (request.functionName) {
        case "getPool": return overrides.pool ?? POOL;
        case "feeAmountTickSpacing": return 10;
        case "factory": return FACTORY;
        case "token0": return USDC;
        case "token1": return WETH;
        case "fee": return 500;
        case "tickSpacing": return 10;
        case "liquidity": return 123n;
        case "slot0": return [456n, 22, 0, 0, 0, 0, true];
        case "decimals": return request.address.toLowerCase() === USDC.toLowerCase() ? (overrides.usdcDecimals ?? 6) : 18;
        default: throw new Error("Unexpected contract read");
      }
    },
  };
  return { reader, calls };
}

test("checks Polygon pool identity and state at one canonical block without exposing RPC details", async () => {
  const { reader, calls } = client();
  const lines = [];
  const verified = await probeLpOnchain({ client: reader, now: () => observedAt, write: line => lines.push(JSON.parse(line)) });
  assert.equal(verified, true);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].verified, true);
  assert.equal(lines[0].blockNumber, "123");
  assert.ok(Object.values(lines[0].checks).every(Boolean));
  assert.deepEqual(calls.filter(call => call.method === "getBlock").map(call => call.request), [
    { blockTag: "latest" }, { blockNumber: 123n },
  ]);
  assert.ok(calls.filter(call => call.method === "readContract").every(call => call.request.blockNumber === 123n));
  assert.ok(!JSON.stringify(lines).includes(POOL));
});

test("wrong pool, decimals or changed block hash cannot pass verification", async () => {
  for (const overrides of [{ pool: "0x1111111111111111111111111111111111111111" }, { usdcDecimals: 18 }, { reorg: true }]) {
    const { reader } = client(overrides);
    const lines = [];
    const verified = await probeLpOnchain({ client: reader, now: () => observedAt, write: line => lines.push(JSON.parse(line)) });
    assert.equal(verified, false);
    assert.equal(lines[0].verified, false);
    assert.ok(Object.values(lines[0].checks).includes(false));
  }
});

test("wrong chain and RPC errors fail closed without leaking provider messages", async () => {
  const wrong = client({ chainId: 1 });
  const lines = [];
  assert.equal(await probeLpOnchain({ client: wrong.reader, now: () => observedAt, write: line => lines.push(JSON.parse(line)) }), false);
  assert.deepEqual(lines, [{ errorKind: "WRONG_CHAIN" }]);
  assert.equal(wrong.calls.length, 0);
  assert.equal(await probeLpOnchain({ client: { getChainId: async () => { throw new Error("private-rpc-url"); } }, write: line => lines.push(JSON.parse(line)) }), false);
  assert.deepEqual(lines[1], { errorKind: "RPC_UNAVAILABLE", stage: "chain" });
  const failing = client();
  failing.reader.readContract = async request => {
    if (request.functionName === "token0") throw new Error("private-provider-message");
    return client().reader.readContract(request);
  };
  assert.equal(await probeLpOnchain({ client: failing.reader, now: () => observedAt, write: line => lines.push(JSON.parse(line)) }), false);
  assert.deepEqual(lines[2], { errorKind: "RPC_UNAVAILABLE", stage: "pool" });
  assert.ok(!JSON.stringify(lines).includes("private-rpc-url"));
  assert.ok(!JSON.stringify(lines).includes("private-provider-message"));
});
