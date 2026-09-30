import test from "node:test";
import assert from "node:assert/strict";
import { inspectForkEvidence } from "./smoke-lp-fork-preflight.mjs";

const HASH = `0x${"a".repeat(64)}`;
const NOW = Date.UTC(2026, 9, 30, 12, 0, 0);

test("accepts only an Anvil fork of the same fresh Polygon block with verified LP pool", () => {
  const evidence = inspectForkEvidence({ source: { chainId: 137, number: 123n, hash: HASH, timestamp: BigInt(NOW / 1000 - 10) },
    fork: { chainId: 137, number: 123n, hash: HASH }, clientVersion: "anvil/v1", poolVerified: true, now: NOW });
  assert.deepEqual(evidence, { sameChain: true, anvilClient: true, sameBlockNumber: true,
    sameBlockHash: true, freshSource: true, poolVerified: true });
});

test("rejects changed block, wrong chain, non-Anvil endpoint, stale source or invalid pool", () => {
  const source = { chainId: 137, number: 123n, hash: HASH, timestamp: BigInt(NOW / 1000 - 10) };
  const fork = { chainId: 137, number: 123n, hash: HASH };
  for (const change of [
    { fork: { ...fork, hash: `0x${"b".repeat(64)}` } },
    { fork: { ...fork, chainId: 1 } },
    { clientVersion: "geth/v1" },
    { source: { ...source, timestamp: BigInt(NOW / 1000 - 130) } },
    { poolVerified: false },
  ]) {
    const checks = inspectForkEvidence({ source, fork, clientVersion: "anvil/v1", poolVerified: true, now: NOW, ...change });
    assert.ok(Object.values(checks).includes(false));
  }
});
