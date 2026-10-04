import { expect, it } from "vitest";
import { buildTestnetSwapTransaction } from "@vezta-dex/core";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { metamaskFixtureAccount } from "../../../packages/core/src/testnet-metamask.test-helper";
import { testnetActionFixture } from "./testnet-action.test-helper";
import { nestedReceiptFixture } from "./testnet-metamask-nested.test-helper";
import { TestnetActionStore } from "./testnet-action";
import { TestnetReceiptReader, type BaseSepoliaReceiptSource } from "./testnet-receipt";

async function setup(reverse = false) {
  const f = await testnetActionFixture("swap", reverse);
  const owner = metamaskFixtureAccount.address;
  f.input.intent.wallet = owner; f.input.quote.wallet = owner;
  const inner = buildTestnetSwapTransaction(f.input.quote, f.clock());
  Object.assign(f.input.transaction, inner);
  const w = await nestedReceiptFixture(reverse, inner);
  const store = new TestnetActionStore(f.clock); const action = store.issue(f.input, () => {});
  const transfer = (token: Hex, from: Hex, to: Hex, value: bigint) => ({ address: token,
    topics: encodeEventTopics({ abi: erc20Abi, eventName: "Transfer", args: { from, to } }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]), blockNumber: 124n,
    blockHash: w.receipt.blockHash, transactionHash: w.tx.hash,
  });
  w.receipt.logs.push(transfer(f.input.intent.tokenIn, owner, f.input.quote.pool, BigInt(f.input.intent.amountIn)),
    transfer(f.input.intent.tokenOut, f.input.quote.pool, owner, BigInt(f.input.quote.amountOut)));
  const source: BaseSepoliaReceiptSource = { ...f.source, ...w.source,
    async getLatestBlock() { return { number: 125n, timestamp: 1790800000n, hash: w.receipt.blockHash as Hex }; },
    async getBlockHash() { return w.receipt.blockHash as Hex; }, async getTransaction() { return w.tx; },
    async getReceipt() { return w.receipt; }, async getTokenAllowance() { return 0n; },
  };
  const reader = new TestnetReceiptReader(() => source, store, f.clock);
  return { f, w, store, action, source, reader,
    query: { contextId: action.contextId, hash: w.tx.hash } };
}

it.each([false, true])("confirms the nested swap against original economics and binds only its original hash (reverse=%s)", async reverse => {
  const s = await setup(reverse);
  expect(await s.reader.observe(s.query)).toMatchObject({ status: "confirmed", executionModel: "metamask-delegation",
    execution: { status: "verified", amountIn: reverse ? "1000000000000000" : "1000000",
      amountOut: reverse ? "2491253" : "398600600000000", actualTotalFeeQualified: false } });
  expect(s.store.read(s.action.contextId).originalHash).toBe(s.w.tx.hash);
  await expect(s.reader.observe({ ...s.query, hash: `0x${"34".repeat(32)}` })).rejects.toThrow("TESTNET_CONTEXT_HASH_CHANGED");
});

it.each(["output-below-original-minimum", "input-above-exact", "changed-original-call", "reorg"])("does not accept weakened original constraints: %s", async mutation => {
  const s = await setup();
  if (mutation === "output-below-original-minimum") s.w.receipt.logs[4].data = encodeAbiParameters([{ type: "uint256" }], [BigInt(s.f.input.quote.minimumAmountOut) - 1n]);
  if (mutation === "input-above-exact") s.w.receipt.logs[3].data = encodeAbiParameters([{ type: "uint256" }], [1000001n]);
  if (mutation === "changed-original-call") s.w.tx.input = `${s.w.tx.input}00`;
  if (mutation === "reorg") s.source.getBlockHash = async () => `0x${"ff".repeat(32)}`;
  expect(await s.reader.observe(s.query)).toMatchObject({ status: mutation === "reorg" ? "reorged" : "unverified", execution: null });
  if (mutation === "changed-original-call" || mutation === "reorg") expect(s.store.read(s.action.contextId).originalHash).toBeNull();
});
