import test from "node:test";
import assert from "node:assert/strict";
import { probeLpAllowances } from "./smoke-lp-allowances.mjs";

const WALLET = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const HASH = `0x${"1".repeat(64)}`;
const NOW = Date.UTC(2026, 9, 1, 12, 0, 0);

function source(overrides = {}) {
  const calls = [];
  const client = {
    getChainId: async () => overrides.chainId ?? 137,
    getBlock: async request => {
      calls.push({ method: "getBlock", request });
      return { number: 123n, timestamp: BigInt(NOW / 1000 - (overrides.ageSeconds ?? 10)),
        hash: request.blockNumber && overrides.reorg ? `0x${"2".repeat(64)}` : HASH };
    },
    request: async request => {
      calls.push({ method: "request", request });
      if (overrides.rpcError) throw new Error("private-rpc-url");
      return overrides.code ?? "0x";
    },
    readContract: async request => {
      calls.push({ method: "readContract", request });
      return request.address.toLowerCase() === USDC.toLowerCase() ? (overrides.usdcAllowance ?? 0n) : (overrides.wethAllowance ?? 0n);
    },
  };
  return { client, calls };
}

test("reads both v3 manager allowances at one stable Polygon block without printing amounts", async () => {
  const { client, calls } = source({ usdcAllowance: 0n, wethAllowance: 7n });
  const lines = [];
  const result = await probeLpAllowances({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) });
  assert.equal(result, true);
  assert.deepEqual(lines, [{ chainId: 137, blockNumber: "123", observedAt: new Date(NOW - 10_000).toISOString(),
    checks: { blockFresh: true, blockStable: true, accountEoa: true, allowanceShapeValid: true },
    allowances: { USDC: "zero", WETH: "finite" }, bothZero: false, verified: true }]);
  assert.deepEqual(calls.filter(x => x.method === "readContract").map(x => [x.request.address, x.request.args, x.request.blockNumber]), [
    [USDC, [WALLET, MANAGER], 123n], [WETH, [WALLET, MANAGER], 123n],
  ]);
  assert.equal(calls.filter(x => x.method === "request")[0].request.method, "eth_getCode");
  assert.deepEqual(calls.filter(x => x.method === "getBlock").map(x => x.request), [{ blockTag: "latest" }, { blockNumber: 123n }]);
  assert.ok(!JSON.stringify(lines).includes(WALLET));
  assert.ok(!JSON.stringify(lines).includes(MANAGER));
});

test("reports unlimited allowance as existing exposure without calling it exact", async () => {
  const lines = [];
  const { client } = source({ wethAllowance: (1n << 256n) - 1n });
  const result = await probeLpAllowances({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) });
  assert.equal(result, true);
  assert.equal(lines[0].allowances.WETH, "unlimited");
  assert.equal(lines[0].bothZero, false);
});

test("rejects changed block, stale block, contract wallet and invalid allowance", async () => {
  for (const overrides of [{ reorg: true }, { ageSeconds: 130 }, { code: "0x6000" }, { usdcAllowance: -1n }]) {
    const { client } = source(overrides);
    const lines = [];
    assert.equal(await probeLpAllowances({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
    assert.equal(lines[0].verified, false);
    assert.ok(Object.values(lines[0].checks).includes(false));
  }
});

test("rejects a block that becomes stale while allowances are read", async () => {
  const { client } = source();
  const lines = [];
  let checks = 0;
  const result = await probeLpAllowances({ client, wallet: WALLET,
    now: () => (++checks === 1 ? NOW : NOW + 121_000), write: x => lines.push(JSON.parse(x)) });
  assert.equal(result, false);
  assert.equal(lines[0].checks.blockFresh, false);
});

test("wrong chain and provider failure fail closed without leaking provider details", async () => {
  const wrong = source({ chainId: 1 });
  const lines = [];
  assert.equal(await probeLpAllowances({ client: wrong.client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
  assert.deepEqual(lines, [{ errorKind: "WRONG_CHAIN" }]);
  assert.equal(wrong.calls.length, 0);
  const failing = source({ rpcError: true });
  assert.equal(await probeLpAllowances({ client: failing.client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
  assert.deepEqual(lines[1], { errorKind: "RPC_UNAVAILABLE", stage: "account" });
  assert.ok(!JSON.stringify(lines).includes("private-rpc-url"));
});
