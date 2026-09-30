import test from "node:test";
import assert from "node:assert/strict";
import { probeLpWalletState } from "./smoke-lp-wallet-state.mjs";

const WALLET = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
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
      return request.address.toLowerCase() === USDC.toLowerCase() ? (overrides.usdc ?? 0n) : (overrides.weth ?? 0n);
    },
    getBalance: async request => { calls.push({ method: "getBalance", request }); return overrides.pol ?? 0n; },
    getTransactionCount: async request => {
      calls.push({ method: "getTransactionCount", request });
      return request.blockTag === "pending" ? (overrides.pendingNonce ?? 7) : 7;
    },
  };
  return { client, calls };
}

test("reads fixed LP wallet balances and mined nonce at one canonical block", async () => {
  const { client, calls } = source({ usdc: 2_000_000n, weth: 500_000_000_000_000n, pol: 1_000_000_000_000_000n });
  const lines = [];
  const verified = await probeLpWalletState({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) });
  assert.equal(verified, true);
  assert.deepEqual(lines, [{ chainId: 137, blockNumber: "123", observedAt: new Date(NOW - 10_000).toISOString(),
    checks: { blockFresh: true, blockStable: true, accountEoa: true, balancesValid: true, nonceStable: true },
    funding: { usdcAtLeastOne: true, wethPositive: true, polPositive: true }, verified: true }]);
  assert.deepEqual(calls.filter(x => x.method === "readContract").map(x => [x.request.address, x.request.args, x.request.blockNumber]), [
    [USDC, [WALLET], 123n], [WETH, [WALLET], 123n],
  ]);
  assert.deepEqual(calls.filter(x => x.method === "getBalance")[0].request, { address: WALLET, blockNumber: 123n });
  assert.deepEqual(calls.filter(x => x.method === "getTransactionCount").map(x => x.request), [
    { address: WALLET, blockNumber: 123n }, { address: WALLET, blockTag: "pending" },
  ]);
  assert.ok(!JSON.stringify(lines).includes(WALLET));
  assert.ok(!JSON.stringify(lines).includes("500000000000000"));
});

test("unfunded wallet is a valid read but does not imply LP can be minted", async () => {
  const { client } = source();
  const lines = [];
  assert.equal(await probeLpWalletState({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), true);
  assert.deepEqual(lines[0].funding, { usdcAtLeastOne: false, wethPositive: false, polPositive: false });
  assert.equal(lines[0].verified, true);
});

test("reorg, stale block, contract wallet and pending nonce fail closed", async () => {
  for (const overrides of [{ reorg: true }, { ageSeconds: 130 }, { code: "0x6000" }, { pendingNonce: 8 }]) {
    const { client } = source(overrides);
    const lines = [];
    assert.equal(await probeLpWalletState({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
    assert.equal(lines[0].verified, false);
    assert.ok(Object.values(lines[0].checks).includes(false));
  }
});

test("funding flags cannot appear ready when the block confirmation fails", async () => {
  const { client } = source({ reorg: true, usdc: 2_000_000n, weth: 500_000_000_000_000n, pol: 1_000_000_000_000_000n });
  const lines = [];
  assert.equal(await probeLpWalletState({ client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
  assert.deepEqual(lines[0].funding, { usdcAtLeastOne: false, wethPositive: false, polPositive: false });
});

test("wrong chain and RPC failure report only bounded errors", async () => {
  const wrong = source({ chainId: 1 });
  const lines = [];
  assert.equal(await probeLpWalletState({ client: wrong.client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
  assert.deepEqual(lines, [{ errorKind: "WRONG_CHAIN" }]);
  assert.equal(wrong.calls.length, 0);
  const failing = source({ rpcError: true });
  assert.equal(await probeLpWalletState({ client: failing.client, wallet: WALLET, now: () => NOW, write: x => lines.push(JSON.parse(x)) }), false);
  assert.deepEqual(lines[1], { errorKind: "RPC_UNAVAILABLE", stage: "account" });
  assert.ok(!JSON.stringify(lines).includes("private-rpc-url"));
});
