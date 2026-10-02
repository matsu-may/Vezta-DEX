import { afterEach, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetActionStore } from "./testnet-action";
import { testnetActionFixture } from "./testnet-action.test-helper";
import { TESTNET_HASH, TESTNET_NOW } from "./testnet-quote.test-helper";
import type { BaseSepoliaReceiptSource } from "./testnet-receipt";

afterEach(() => vi.useRealTimers());
const hash = `0x${"12".repeat(32)}` as Hex;
const receiptHash = `0x${"cd".repeat(32)}` as Hex;
const headHash = `0x${"ef".repeat(32)}` as Hex;
async function setup(kind: "swap" | "approve" | "reset" = "swap", reverse = false) {
  const { TestnetReceiptReader } = await import("./testnet-receipt");
  const f = await testnetActionFixture(kind, reverse); const store = new TestnetActionStore(f.clock);
  const action = store.issue(f.input, () => f.quotes.store.consume(f.quoted.quoteId, f.request.intent));
  const context = store.read(action.contextId); const tx = context.transaction; const wallet = context.intent.wallet;
  const log = (address: string, name: "Transfer" | "Approval", from: Hex, to: Hex, value: bigint) => ({
    address, topics: (name === "Transfer" ? encodeEventTopics({ abi: erc20Abi, eventName: name, args: { from, to } })
      : encodeEventTopics({ abi: erc20Abi, eventName: name, args: { owner: from, spender: to } })) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }], [value]), removed: false,
    blockNumber: 124n, blockHash: receiptHash, transactionHash: hash,
  });
  const transaction = { hash, type: "legacy", chainId: 84532, from: wallet, to: tx.to, input: tx.data, value: 0n, nonce: 7,
    gas: BigInt(tx.gas), gasPrice: BigInt(tx.gasPrice), blockNumber: 124n as bigint | null, blockHash: receiptHash as string | null };
  const receipt = { transactionHash: hash, from: wallet, to: tx.to, blockNumber: 124n, blockHash: receiptHash,
    status: "success" as "success" | "reverted", gasUsed: kind === "swap" ? 100000n : 50000n, effectiveGasPrice: BigInt(tx.gasPrice),
    logs: kind === "swap" ? [log(context.intent.tokenIn, "Transfer", wallet, P.pool, BigInt(context.intent.amountIn)),
      log(context.intent.tokenOut, "Transfer", P.pool, wallet, BigInt(context.quote.amountOut))]
      : [log(context.intent.tokenIn, "Approval", wallet, P.router, kind === "reset" ? 0n : BigInt(context.intent.amountIn))] };
  const source: BaseSepoliaReceiptSource = { ...f.source,
    async getLatestBlock() { return { number: 125n, timestamp: 1790800000n, hash: headHash }; },
    async getBlockHash(block) { return block === 124n ? receiptHash : block === 123n ? TESTNET_HASH : headHash; },
    async getTransaction() { return transaction; }, async getReceipt() { return receipt; },
    async getAccountNonce() { return 8n; },
    async getTokenAllowance() { return kind === "approve" ? BigInt(context.intent.amountIn) : 0n; },
  };
  const create = vi.fn(() => source); const reader = new TestnetReceiptReader(create, store, f.clock);
  const request = { contextId: action.contextId, hash };
  return { f, store, source, transaction, receipt, reader, request, create };
}

it.each([false, true])("verifies original event economics, not unrelated balance deltas (reverse=%s)", async reverse => {
  const s = await setup("swap", reverse);
  const result = await s.reader.observe(s.request);
  expect(result).toMatchObject({ status: "confirmed", confirmations: "2", executionEnabled: false,
    execution: { status: "verified", amountIn: reverse ? "1000000000000000" : "1000000",
      amountOut: reverse ? "2491253" : "398600600000000", actualTotalFeeQualified: false,
      allowanceMatchesExpected: true, stateBlockNumber: "125" } });
  expect(s.store.read(s.request.contextId).originalHash).toBe(hash);
});

it.each(["approve", "reset"] as const)("verifies %s event and explicitly reports a changed current allowance", async kind => {
  const s = await setup(kind);
  expect(await s.reader.observe(s.request)).toMatchObject({ status: "confirmed", execution: {
    status: "verified", approvedAmount: kind === "reset" ? "0" : "1000000", allowanceMatchesExpected: true } });
  s.source.getTokenAllowance = async () => 999n;
  expect(await s.reader.observe(s.request)).toMatchObject({ status: "confirmed", execution: { status: "verified", allowanceMatchesExpected: false } });
});

it("distinguishes unknown original, pending, confirming, reorged and reverted without rebroadcast", async () => {
  for (const stage of ["unknown", "pending", "confirming", "reorged", "reverted"]) {
    const s = await setup();
    if (stage === "unknown") { s.source.getTransaction = async () => null; s.source.getReceipt = async () => null; }
    if (stage === "pending") { s.transaction.blockNumber = null; s.transaction.blockHash = null; s.source.getReceipt = async () => null; }
    if (stage === "confirming") s.source.getLatestBlock = async () => ({ number: 124n, timestamp: 1790800000n, hash: receiptHash });
    if (stage === "reorged") s.source.getBlockHash = async () => headHash;
    if (stage === "reverted") { s.receipt.status = "reverted"; s.receipt.logs = []; }
    const result = await s.reader.observe(s.request);
    expect(result.status).toBe(stage === "unknown" ? "unknown-original" : stage);
    expect(result.execution?.status).not.toBe("verified");
    if (stage === "unknown") expect(result).toMatchObject({ nonceUsed: true, execution: null });
  }
});

it("rejects mismatched original transaction and malformed or insufficient receipt economics", async () => {
  for (const change of ["from", "to", "nonce", "chain", "payload", "value", "gas", "price", "receipt-hash", "missing", "removed", "data", "log-hash", "spend", "minimum", "logs-bound"]) {
    const s = await setup();
    if (change === "from") s.transaction.from = P.pool;
    if (change === "to") s.transaction.to = C.USDC.address;
    if (change === "nonce") s.transaction.nonce = 8;
    if (change === "chain") s.transaction.chainId = 137;
    if (change === "payload") s.transaction.input = "0x1234";
    if (change === "value") s.transaction.value = 1n;
    if (change === "gas") s.transaction.gas += 1n;
    if (change === "price") s.transaction.gasPrice += 1n;
    if (change === "receipt-hash") s.receipt.transactionHash = headHash;
    if (change === "missing") s.receipt.logs = [];
    if (change === "removed") s.receipt.logs[0].removed = true;
    if (change === "data") s.receipt.logs[0].data += "00";
    if (change === "log-hash") s.receipt.logs[0].blockHash = headHash;
    if (change === "spend") s.receipt.logs[0].data = encodeAbiParameters([{ type: "uint256" }], [999999n]);
    if (change === "minimum") s.receipt.logs[1].data = encodeAbiParameters([{ type: "uint256" }], [1n]);
    if (change === "logs-bound") s.receipt.logs = Array.from({ length: 129 }, () => s.receipt.logs[0]);
    expect(await s.reader.observe(s.request)).toMatchObject({ status: "unverified", execution: null });
  }
});

it("rechecks canonical hashes and freshness after asynchronous state reads", async () => {
  for (const change of ["head", "receipt", "time"]) {
    const s = await setup(); const original = s.source.getBlockHash;
    s.source.getTokenBalance = async () => {
      if (change === "time") s.f.setNow(TESTNET_NOW + 30000);
      else s.source.getBlockHash = async b => (change === "head" ? b === 125n : b === 124n) ? `0x${"34".repeat(32)}` : original(b);
      return 0n;
    };
    if (change === "time") await expect(s.reader.observe(s.request)).rejects.toMatchObject({ code: "TESTNET_RECEIPT_STALE" });
    else expect(await s.reader.observe(s.request)).toMatchObject({ status: "reorged", execution: null });
  }
});

it("rejects invalid/lost/context-authored requests and changed bound hash before RPC", async () => {
  const s = await setup();
  for (const value of [{ ...s.request, intent: s.f.request.intent }, { ...s.request, hash: "0x" + "0".repeat(64) },
    { ...s.request, contextId: "ab".repeat(24) }]) await expect(s.reader.observe(value)).rejects.toThrow();
  expect(s.create).not.toHaveBeenCalled();
  await s.reader.observe(s.request); s.create.mockClear();
  await expect(s.reader.observe({ ...s.request, hash: headHash })).rejects.toMatchObject({ code: "TESTNET_CONTEXT_HASH_CHANGED" });
  expect(s.create).not.toHaveBeenCalled();
});

it("times out, rejects overlap and prevents late work from binding a hash", async () => {
  const s = await setup(); vi.useFakeTimers(); let release!: () => void;
  s.source.getTransaction = async () => { await new Promise<void>(resolve => { release = resolve; }); return s.transaction; };
  const running = s.reader.observe(s.request);
  const rejected = expect(running).rejects.toMatchObject({ code: "TESTNET_RECEIPT_TIMEOUT" });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  await expect(s.reader.observe(s.request)).rejects.toMatchObject({ code: "TESTNET_RECEIPT_BUSY" });
  await vi.advanceTimersByTimeAsync(25000); await rejected;
  release(); await vi.advanceTimersByTimeAsync(0);
  expect(s.store.read(s.request.contextId).originalHash).toBeNull();
});
it("explains unverified envelopes without accepting smart or altered transactions", async () => {
  const s = await setup("approve"); s.transaction.type = "eip7702";
  expect(await s.reader.observe(s.request)).toMatchObject({ status: "unverified", diagnostic: "unsupported-transaction-type", execution: null });
  s.transaction.type = "legacy"; s.transaction.nonce += 1;
  expect(await s.reader.observe(s.request)).toMatchObject({ status: "unverified", diagnostic: "transaction-mismatch", execution: null });
  s.transaction.nonce -= 1; s.receipt.logs = [];
  expect(await s.reader.observe(s.request)).toMatchObject({ status: "unverified", diagnostic: "event-mismatch", execution: null });
});
