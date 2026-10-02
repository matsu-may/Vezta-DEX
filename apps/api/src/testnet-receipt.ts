import { z } from "zod";
import { decodeEventLog, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetActionError, type TestnetActionContext, type TestnetActionStore } from "./testnet-action";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";

export interface TestnetObservedTransaction {
  hash: string; type: string; chainId?: number; from: string; to: string | null; input: Hex; value: bigint;
  nonce: number; gas: bigint; gasPrice?: bigint; blockNumber: bigint | null; blockHash: string | null;
}
export interface TestnetObservedReceipt {
  transactionHash: string; from: string; to: string | null; blockNumber: bigint; blockHash: string;
  status: "success" | "reverted"; gasUsed: bigint; effectiveGasPrice: bigint;
  logs: { address: string; topics: readonly Hex[]; data: Hex; removed?: boolean;
    blockNumber: bigint | null; blockHash: string | null; transactionHash: string | null }[];
}
export interface BaseSepoliaReceiptSource extends BaseSepoliaWalletSource {
  getTransaction(hash: Hex): Promise<TestnetObservedTransaction | null>;
  getReceipt(hash: Hex): Promise<TestnetObservedReceipt | null>;
}
type ReceiptCode = "TESTNET_RECEIPT_INVALID" | "TESTNET_RECEIPT_BUSY" | "TESTNET_RECEIPT_TIMEOUT"
  | "TESTNET_RPC_UNAVAILABLE" | "TESTNET_WRONG_CHAIN" | "TESTNET_RECEIPT_STALE" | "TESTNET_INTENT_INVALID";
export class TestnetReceiptError extends Error {
  constructor(readonly code: ReceiptCode) { super(code); }
}
const fail = (code: ReceiptCode): never => { throw new TestnetReceiptError(code); };
const same = (a: string | null | undefined, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (v: bigint) => typeof v === "bigint" && v >= 0n && v < 2n ** 256n;
const nonzeroHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v) && BigInt(v) > 0n;
const querySchema = z.object({ contextId: z.string().regex(/^[a-f0-9]{48}$/),
  hash: z.string().refine(nonzeroHash) }).strict();
export const parseTestnetReceiptRequest = (value: unknown) => querySchema.parse(value);

function matchesOriginal(tx: TestnetObservedTransaction, c: TestnetActionContext, hash: string) {
  const expected = c.transaction;
  return same(tx.hash, hash) && tx.type === "legacy" && tx.chainId === P.chainId && same(tx.from, c.intent.wallet)
    && same(tx.to, expected.to) && same(tx.input, expected.data) && tx.value === 0n
    && Number.isSafeInteger(tx.nonce) && tx.nonce >= 0 && String(tx.nonce) === expected.nonce
    && tx.gas === BigInt(expected.gas) && tx.gasPrice === BigInt(expected.gasPrice);
}

function reviewEvents(c: TestnetActionContext, r: TestnetObservedReceipt) {
  let spent = 0n; let received = 0n; let approvals = 0;
  const expectedApproval = c.kind === "reset" ? 0n : BigInt(c.intent.amountIn);
  for (const log of r.logs) {
    const input = same(log.address, c.intent.tokenIn); const output = same(log.address, c.intent.tokenOut);
    if (!input && !output) continue;
    const transfer = log.topics[0]?.toLowerCase() === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const approval = log.topics[0]?.toLowerCase() === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
    if (!transfer && !approval) continue;
    if (log.removed || log.blockNumber !== r.blockNumber || !same(log.blockHash, r.blockHash)
      || !same(log.transactionHash, r.transactionHash) || log.topics.length !== 3
      || !log.topics.slice(1).every(t => /^0x0{24}[0-9a-fA-F]{40}$/.test(t))
      || !/^0x[0-9a-fA-F]{64}$/.test(log.data)) throw new Error("Invalid receipt event");
    if (transfer) {
      const { args } = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data,
        topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (input) spent += (same(args.from, c.intent.wallet) ? args.value : 0n) - (same(args.to, c.intent.wallet) ? args.value : 0n);
      if (output) received += (same(args.to, c.intent.wallet) ? args.value : 0n) - (same(args.from, c.intent.wallet) ? args.value : 0n);
    } else if (input && c.kind !== "swap") {
      const { args } = decodeEventLog({ abi: erc20Abi, eventName: "Approval", data: log.data,
        topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (same(args.owner, c.intent.wallet) && same(args.spender, P.router)) {
        if (args.value !== expectedApproval) throw new Error("Invalid approval event"); approvals++;
      }
    }
  }
  if (c.kind === "swap") {
    if (spent !== BigInt(c.intent.amountIn) || received < BigInt(c.quote.minimumAmountOut) || !uint(received)) throw new Error("Invalid swap events");
    return { amountIn: spent.toString(), amountOut: received.toString() };
  }
  if (approvals !== 1 || spent !== 0n || received !== 0n) throw new Error("Invalid approval events");
  return { amountIn: "0", amountOut: "0", approvedAmount: expectedApproval.toString() };
}

export class TestnetReceiptReader {
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaReceiptSource,
    private readonly contexts: TestnetActionStore, private readonly now = Date.now) {}
  async observe(value: unknown) {
    let query: ReturnType<typeof parseTestnetReceiptRequest>;
    try { query = parseTestnetReceiptRequest(value); } catch { return fail("TESTNET_INTENT_INVALID"); }
    const context = this.contexts.read(query.contextId);
    if (context.originalHash && !same(context.originalHash, query.hash)) throw new TestnetActionError("TESTNET_CONTEXT_HASH_CHANGED");
    if (this.busy) return fail("TESTNET_RECEIPT_BUSY");
    this.busy = true; const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetReceiptError("TESTNET_RECEIPT_TIMEOUT")); }, 25000);
      });
      return await Promise.race([this.probe(this.createSource(controller.signal), context, query.hash as Hex, controller.signal), timeout]);
    } catch (error) {
      if (error instanceof TestnetReceiptError || error instanceof TestnetActionError) throw error;
      return fail("TESTNET_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }
  private async probe(source: BaseSepoliaReceiptSource, c: TestnetActionContext, hash: Hex, signal: AbortSignal) {
    if (await source.getChainId() !== P.chainId) return fail("TESTNET_WRONG_CHAIN");
    signal.throwIfAborted(); const head = await source.getLatestBlock();
    const fresh = () => {
      signal.throwIfAborted(); this.contexts.read(c.contextId);
      const time = Number(head.timestamp) * 1000; const now = this.now();
      if (!Number.isSafeInteger(now) || now < 0 || !Number.isSafeInteger(time) || time <= 0
        || time > now + 10000 || now - time >= 30000 || head.number <= 0n || !nonzeroHash(head.hash)) return fail("TESTNET_RECEIPT_STALE");
    };
    fresh();
    const base = { contextId: c.contextId, hash, kind: c.kind, chainId: P.chainId, source: "base-sepolia-rpc" as const,
      observedAt: new Date(Number(head.timestamp) * 1000).toISOString(), executionEnabled: false as const };
    type Diagnostic = "transaction-unavailable" | "unsupported-transaction-type" | "transaction-mismatch" | "receipt-mismatch" | "event-mismatch";
    const empty = (status: "unknown-original" | "pending" | "confirming" | "reorged" | "unverified", confirmations = "0", diagnostic?: Diagnostic) =>
      ({ ...base, status, confirmations, execution: null, ...(diagnostic ? { diagnostic } : {}) });
    const [tx, receipt] = await Promise.all([source.getTransaction(hash), source.getReceipt(hash)]);
    fresh();
    if (!tx) {
      if (receipt) return empty("unverified", "0", "transaction-unavailable");
      const nonce = await source.getAccountNonce(c.intent.wallet, head.number);
      const stable = await source.getBlockHash(head.number); fresh();
      if (!uint(nonce)) return fail("TESTNET_RECEIPT_INVALID");
      if (!same(stable, head.hash)) return empty("reorged");
      return { ...empty("unknown-original"), nonceUsed: nonce > BigInt(c.transaction.nonce) };
    }
    if (tx.type !== "legacy") return empty("unverified", "0", "unsupported-transaction-type");
    if (!matchesOriginal(tx, c, hash)) return empty("unverified", "0", "transaction-mismatch");
    this.contexts.bindHash(c.contextId, hash);
    if (!receipt) return empty("pending");
    if (!same(receipt.transactionHash, hash) || !same(receipt.from, c.intent.wallet) || !same(receipt.to, c.transaction.to)
      || !same(tx.blockHash, receipt.blockHash) || tx.blockNumber !== receipt.blockNumber
      || !uint(receipt.blockNumber) || receipt.blockNumber <= BigInt(c.blockNumber) || receipt.blockNumber > head.number
      || !nonzeroHash(receipt.blockHash) || !uint(receipt.gasUsed) || receipt.gasUsed === 0n
      || receipt.gasUsed > BigInt(c.transaction.gas) || receipt.effectiveGasPrice !== BigInt(c.transaction.gasPrice)
      || !Array.isArray(receipt.logs) || receipt.logs.length > 128) return empty("unverified", "0", "receipt-mismatch");
    const canonical = await source.getBlockHash(receipt.blockNumber); fresh();
    if (!same(canonical, receipt.blockHash)) return empty("reorged");
    const confirmations = head.number - receipt.blockNumber + 1n;
    if (confirmations < 2n) return empty("confirming", confirmations.toString());
    let economics: ReturnType<typeof reviewEvents> | null = null;
    if (receipt.status === "success") {
      try { economics = reviewEvents(c, receipt); } catch { return empty("unverified", confirmations.toString(), "event-mismatch"); }
    } else if (receipt.status !== "reverted" || receipt.logs.length !== 0) return empty("unverified", "0", "receipt-mismatch");
    const [usdc, weth, eth, allowance] = await Promise.all([
      source.getTokenBalance(C.USDC.address, c.intent.wallet, head.number), source.getTokenBalance(C.WETH.address, c.intent.wallet, head.number),
      source.getNativeBalance(c.intent.wallet, head.number), source.getTokenAllowance(c.intent.tokenIn, c.intent.wallet, P.router, head.number),
    ]);
    const [headHash, receiptHash] = await Promise.all([source.getBlockHash(head.number), source.getBlockHash(receipt.blockNumber)]);
    fresh();
    if (!same(headHash, head.hash) || !same(receiptHash, receipt.blockHash)) return empty("reorged");
    if (![usdc, weth, eth, allowance].every(uint)) return fail("TESTNET_RECEIPT_INVALID");
    return { ...base, status: receipt.status === "success" ? "confirmed" as const : "reverted" as const,
      confirmations: confirmations.toString(), blockNumber: receipt.blockNumber.toString(), blockHash: receipt.blockHash,
      execution: { status: receipt.status === "success" ? "verified" as const : "reverted" as const, ...economics,
        l2GasCost: (receipt.gasUsed * receipt.effectiveGasPrice).toString(), actualTotalFeeQualified: false as const,
        balances: { USDC: usdc.toString(), WETH: weth.toString(), ETH: eth.toString() },
        tokenAllowance: allowance.toString(), allowanceMatchesExpected: allowance === (c.kind === "approve" ? BigInt(c.intent.amountIn) : 0n),
        stateBlockNumber: head.number.toString(), stateBlockHash: head.hash } };
  }
}
