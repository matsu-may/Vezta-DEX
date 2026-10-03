import { z } from "zod";
import { decodeFunctionData, encodeFunctionData, decodeEventLog, erc20Abi, getAddress,
  type Address, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, metamaskDelegationAbi } from "@vezta-dex/core";
import { verifyMetaMaskExecution } from "./testnet-metamask-execution";
import type { BaseSepoliaReceiptSource, TestnetObservedReceipt, TestnetObservedTransaction } from "./testnet-receipt";

export type TestnetHistoricalApprovalSource = Pick<BaseSepoliaReceiptSource,
  "getChainId" | "getLatestBlock" | "getBlockHash" | "getCode" | "getAccountNonce" | "getBlockTransactions"
  | "getBlockBaseFee" | "getTransaction" | "getReceipt" | "getTokenAllowance">;
const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => BigInt(v) > 0n);
const requestSchema = z.object({ wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/)
  .refine(v => BigInt(v) > 2n).transform(v => getAddress(v)), hash: hashSchema }).strict();
export const parseTestnetHistoricalApprovalRequest = (value: unknown) => requestSchema.parse(value);
type Code = "TESTNET_HISTORICAL_REQUEST_INVALID" | "TESTNET_HISTORICAL_BUSY" | "TESTNET_HISTORICAL_TIMEOUT"
  | "TESTNET_HISTORICAL_RPC_UNAVAILABLE" | "TESTNET_HISTORICAL_WRONG_CHAIN" | "TESTNET_HISTORICAL_STALE"
  | "TESTNET_HISTORICAL_UNVERIFIED" | "TESTNET_HISTORICAL_NOT_CONFIRMED" | "TESTNET_HISTORICAL_REORGED";
export class TestnetHistoricalApprovalError extends Error {
  constructor(readonly code: Code) { super(code); }
}
const assert = (ok: unknown, code: Code = "TESTNET_HISTORICAL_UNVERIFIED"): void => {
  if (!ok) throw new TestnetHistoricalApprovalError(code);
};
const same = (a: unknown, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (value: unknown): value is bigint => typeof value === "bigint" && value >= 0n && value < 2n ** 256n;

// Derive only a bounded ERC20 approval; the signed delegation verifier proves the
// wrapper, execution bytes and one-use caveats afterward. No browser quote is trusted.
function deriveApproval(tx: TestnetObservedTransaction) {
  const decoded = decodeFunctionData({ abi: metamaskDelegationAbi, data: tx.input });
  assert(decoded.functionName === "redeemDelegations");
  if (decoded.functionName !== "redeemDelegations") throw new Error("Unsupported method");
  const executions = decoded.args[2];
  assert(executions.length === 1 && /^0x[0-9a-fA-F]{240}$/.test(executions[0]));
  const packed = executions[0], token = getAddress(`0x${packed.slice(2, 42)}`);
  assert(BigInt(`0x${packed.slice(42, 106)}`) === 0n);
  const symbol = same(token, C.USDC.address) ? "USDC" : same(token, C.WETH.address) ? "WETH" : null;
  assert(symbol !== null);
  const data = `0x${packed.slice(106)}` as Hex;
  const approval = decodeFunctionData({ abi: erc20Abi, data });
  assert(approval.functionName === "approve");
  if (approval.functionName !== "approve") throw new Error("Unsupported token method");
  const [spender, amount] = approval.args;
  assert(same(spender, P.router) && amount >= 0n && amount <= (symbol === "USDC" ? 5000000n : 1000000000000000n)
    && same(data, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [P.router, amount] })));
  return { token, data, amount, kind: amount === 0n ? "reset" as const : "approve" as const };
}

function verifyApprovalEvents(receipt: TestnetObservedReceipt, wallet: Address, token: Address, amount: bigint) {
  let approvals = 0;
  const ownerTopic = `0x${wallet.slice(2).toLowerCase().padStart(64, "0")}`;
  for (const log of receipt.logs) {
    const topic = log.topics[0]?.toLowerCase();
    if (topic === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef") {
      assert(!log.topics.slice(1, 3).some(t => same(t, ownerTopic)));
    }
    if (topic !== "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925") continue;
    if (!same(log.topics[1], ownerTopic)) continue;
    assert(same(log.address, token) && log.topics.length === 3 && /^0x[0-9a-fA-F]{64}$/.test(log.data));
    const event = decodeEventLog({ abi: erc20Abi, eventName: "Approval", data: log.data,
      topics: log.topics as [Hex, ...Hex[]], strict: true });
    assert(same(event.args.owner, wallet) && same(event.args.spender, P.router) && event.args.value === amount);
    approvals++;
  }
  assert(approvals === 1);
}

export class TestnetHistoricalApprovalReader {
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => TestnetHistoricalApprovalSource,
    private readonly now = Date.now) {}
  async read(value: unknown) {
    let request: ReturnType<typeof parseTestnetHistoricalApprovalRequest>;
    try { request = parseTestnetHistoricalApprovalRequest(value); }
    catch { throw new TestnetHistoricalApprovalError("TESTNET_HISTORICAL_REQUEST_INVALID"); }
    assert(!this.busy, "TESTNET_HISTORICAL_BUSY"); this.busy = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.probe(this.createSource(controller.signal), request, controller.signal),
        new Promise<never>((_resolve, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new TestnetHistoricalApprovalError("TESTNET_HISTORICAL_TIMEOUT"));
        }, 25000); })]);
    } catch (error) {
      if (error instanceof TestnetHistoricalApprovalError) throw error;
      throw new TestnetHistoricalApprovalError("TESTNET_HISTORICAL_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }
  private async probe(source: TestnetHistoricalApprovalSource, request: ReturnType<typeof parseTestnetHistoricalApprovalRequest>, signal: AbortSignal) {
    assert(await source.getChainId() === 84532, "TESTNET_HISTORICAL_WRONG_CHAIN");
    const head = await source.getLatestBlock();
    const fresh = () => {
      signal.throwIfAborted(); const now = this.now(), time = Number(head.timestamp) * 1000;
      assert(Number.isSafeInteger(now) && now >= 0 && Number.isSafeInteger(time) && time > 0
        && time <= now + 10000 && now - time < 30000 && head.number > 0n
        && hashSchema.safeParse(head.hash).success, "TESTNET_HISTORICAL_STALE");
    };
    fresh();
    const [tx, receipt] = await Promise.all([source.getTransaction(request.hash as Hex), source.getReceipt(request.hash as Hex)]);
    fresh();
    assert(tx && receipt, "TESTNET_HISTORICAL_NOT_CONFIRMED");
    if (!tx || !receipt) throw new TestnetHistoricalApprovalError("TESTNET_HISTORICAL_NOT_CONFIRMED");
    assert(same(tx.hash, request.hash) && same(receipt.transactionHash, request.hash) && receipt.status === "success"
      && uint(receipt.blockNumber) && receipt.blockNumber > 0n && receipt.blockNumber <= head.number
      && hashSchema.safeParse(receipt.blockHash).success);
    const confirmations = head.number - receipt.blockNumber + 1n;
    assert(confirmations >= 2n, "TESTNET_HISTORICAL_NOT_CONFIRMED");
    assert(same(await source.getBlockHash(receipt.blockNumber), receipt.blockHash), "TESTNET_HISTORICAL_REORGED"); fresh();
    let approval: ReturnType<typeof deriveApproval>, execution: Awaited<ReturnType<typeof verifyMetaMaskExecution>>;
    try {
      approval = deriveApproval(tx);
      const nonce = await source.getAccountNonce(request.wallet, receipt.blockNumber - 1n);
      assert(uint(nonce));
      execution = await verifyMetaMaskExecution(source, tx, receipt,
        { from: request.wallet, to: approval.token, data: approval.data, value: "0", nonce: nonce.toString() });
      verifyApprovalEvents(receipt, request.wallet, approval.token, approval.amount);
    } catch { throw new TestnetHistoricalApprovalError("TESTNET_HISTORICAL_UNVERIFIED"); }
    fresh();
    const [receiptAllowance, currentAllowance] = await Promise.all([
      source.getTokenAllowance(approval.token, request.wallet, P.router, receipt.blockNumber),
      source.getTokenAllowance(approval.token, request.wallet, P.router, head.number),
    ]);
    fresh(); assert(uint(receiptAllowance) && receiptAllowance === approval.amount && uint(currentAllowance));
    const [headHash, receiptHash] = await Promise.all([source.getBlockHash(head.number), source.getBlockHash(receipt.blockNumber)]);
    fresh(); assert(same(headHash, head.hash) && same(receiptHash, receipt.blockHash), "TESTNET_HISTORICAL_REORGED");
    return { wallet: request.wallet, hash: request.hash, chainId: 84532 as const, kind: approval.kind,
      token: approval.token, spender: P.router, approvedAmount: approval.amount.toString(), currentAllowance: currentAllowance.toString(),
      receiptBlockNumber: receipt.blockNumber.toString(), receiptBlockHash: receipt.blockHash,
      observedAt: new Date(Number(head.timestamp) * 1000).toISOString(), confirmations: confirmations.toString(),
      originalReviewAvailable: false as const, status: "verified-historical-approval" as const,
      executionModel: execution.executionModel, gasPayer: execution.gasPayer, actualTotalFeeQualified: false as const, executionEnabled: false as const };
  }
}
