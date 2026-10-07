import { decodeEventLog, erc20Abi, isAddress, type Hex } from "viem";
import { testnetChainConfig, type TestnetChainId, type TestnetFeeFields } from "@vezta-dex/core";
import { matchesTestnetFeeEnvelope, matchesTestnetReceiptGasPrice } from "./testnet-transaction-envelope";

export class TestnetForkError extends Error {
  constructor(readonly code: string) { super(code); }
}
export function forkAssert(condition: unknown, code: string): asserts condition {
  if (!condition) throw new TestnetForkError(code);
}
const same = (a: string | null | undefined, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const uint = (v: bigint) => typeof v === "bigint" && v >= 0n && v < 2n ** 256n;
const validHash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v) && BigInt(v) > 0n;

export function assertTestnetForkOrigin(origin: string) {
  let u: URL;
  try { u = new URL(origin); } catch { throw new TestnetForkError("FORK_ORIGIN_INVALID"); }
  forkAssert(u.protocol === "http:" && u.hostname === "127.0.0.1" && /^[0-9]+$/.test(u.port)
    && Number(u.port) > 0 && Number(u.port) <= 65535 && !u.username && !u.password
    && u.pathname === "/" && !u.search && !u.hash && origin === `http://127.0.0.1:${u.port}`, "FORK_ORIGIN_INVALID");
  return origin;
}
export interface ForkClientBoundary {
  transport: { type: string; url?: string };
  getChainId(): Promise<number>;
  getClientVersion(): Promise<string>;
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
}
const writes = new Set(["anvil_setBalance", "anvil_impersonateAccount", "anvil_stopImpersonatingAccount",
  "evm_snapshot", "evm_revert", "evm_mine", "evm_setNextBlockTimestamp", "eth_sendTransaction"]);

export async function guardedForkRequest(client: ForkClientBoundary, origin: string, method: string, params: readonly unknown[], beforeWrite?: () => void, chainId: TestnetChainId = 84532) {
  testnetChainConfig(chainId);
  assertTestnetForkOrigin(origin);
  forkAssert(client.transport.type === "http" && client.transport.url === origin && writes.has(method), "FORK_TRANSPORT_INVALID");
  const [chain, version] = await Promise.all([client.getChainId(), client.getClientVersion()]);
  forkAssert(chain === chainId && /\banvil\b/i.test(version), "FORK_CLIENT_INVALID");
  beforeWrite?.();
  return client.request({ method, params });
}

export interface TestnetForkReceiptEvidence {
  kind: "swap" | "approve" | "reset";
  tokenIn: string; tokenOut: string; amountIn: string; minimumAmountOut: string;
  transaction: { chainId: TestnetChainId; from: string; to: string; data: Hex; value: "0"; nonce: string; gas: string } & TestnetFeeFields;
  hash: Hex; afterBlock: bigint; canonical: { number: bigint; hash: string | null; baseFeePerGas?: bigint | null }; latestBlock: bigint;
  tx: { hash: string; from: string; to: string | null; input: Hex; value: bigint; nonce: number;
    chainId?: number; blockNumber: bigint | null; blockHash: string | null; gas: bigint; type: string;
    gasPrice?: bigint | null; maxFeePerGas?: bigint | null; maxPriorityFeePerGas?: bigint | null;
    accessList?: readonly unknown[] | null; authorizationList?: readonly unknown[] | null };
  receipt: { transactionHash: string; from: string; to: string | null; blockNumber: bigint; blockHash: string;
    status: "success" | "reverted"; gasUsed: bigint; effectiveGasPrice: bigint;
    logs: { address: string; topics: readonly Hex[]; data: Hex; removed?: boolean;
      blockNumber: bigint | null; blockHash: string | null; transactionHash: string | null }[] };
  before: { input: bigint; output: bigint; native: bigint };
  after: { input: bigint; output: bigint; native: bigint; allowance: bigint };
}

// Verifies a supplied original fork context, not an authenticated public submission record.
export function reviewTestnetForkReceipt(e: TestnetForkReceiptEvidence) {
  const cfg = testnetChainConfig(e.transaction.chainId), C = cfg.candidate, P = cfg.policy;
  const { transaction: expected, tx, receipt: r } = e; const wallet = expected.from;
  const amount = BigInt(e.amountIn); const minimum = BigInt(e.minimumAmountOut);
  const forward = same(e.tokenIn, C.USDC.address) && same(e.tokenOut, C.WETH.address);
  const reverse = same(e.tokenIn, C.WETH.address) && same(e.tokenOut, C.USDC.address);
  forkAssert((forward || reverse) && isAddress(wallet) && uint(amount) && amount > 0n && uint(minimum)
    && expected.chainId === P.chainId && expected.value === "0" && validHash(e.hash)
    && validHash(r.blockHash) && tx.chainId === P.chainId && same(tx.hash, e.hash)
    && same(tx.from, wallet) && same(r.from, wallet) && same(tx.to, expected.to) && same(r.to, expected.to)
    && same(expected.to, e.kind === "swap" ? P.router : e.tokenIn)
    && same(tx.input, expected.data) && tx.value === 0n && Number.isSafeInteger(tx.nonce) && tx.nonce >= 0
    && String(tx.nonce) === expected.nonce && tx.gas === BigInt(expected.gas) && matchesTestnetFeeEnvelope(tx, expected)
    && same(r.transactionHash, e.hash) && same(tx.blockHash, r.blockHash) && tx.blockNumber === r.blockNumber
    && e.canonical.number === r.blockNumber && same(e.canonical.hash, r.blockHash)
    && uint(e.afterBlock) && r.blockNumber > e.afterBlock && e.latestBlock >= r.blockNumber + 1n
    && r.status === "success" && uint(r.gasUsed) && r.gasUsed > 0n && r.gasUsed <= BigInt(expected.gas)
    && uint(r.effectiveGasPrice) && matchesTestnetReceiptGasPrice(r.effectiveGasPrice, expected, e.canonical.baseFeePerGas ?? undefined)
    && Object.values(e.before).every(uint) && Object.values(e.after).every(uint), "FORK_RECEIPT_INVALID");
  let input = 0n; let output = 0n; let approvals = 0;
  const approvalAmount = e.kind === "reset" ? 0n : amount;
  for (const log of r.logs) {
    if (!same(log.address, e.tokenIn) && !same(log.address, e.tokenOut)) continue;
    const transfer = log.topics[0]?.toLowerCase() === "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    const approval = log.topics[0]?.toLowerCase() === "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
    if (!transfer && !approval) continue;
    forkAssert(!log.removed && log.blockNumber === r.blockNumber && same(log.blockHash, r.blockHash)
      && same(log.transactionHash, e.hash) && log.topics.length === 3
      && log.topics.slice(1).every(t => /^0x0{24}[0-9a-fA-F]{40}$/.test(t))
      && /^0x[0-9a-fA-F]{64}$/.test(log.data), "FORK_LOG_INVALID");
    if (transfer) {
      const { args } = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data,
        topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (same(log.address, e.tokenIn)) input += (same(args.from, wallet) ? args.value : 0n) - (same(args.to, wallet) ? args.value : 0n);
      if (same(log.address, e.tokenOut)) output += (same(args.to, wallet) ? args.value : 0n) - (same(args.from, wallet) ? args.value : 0n);
    } else if (e.kind !== "swap" && same(log.address, e.tokenIn)) {
      const { args } = decodeEventLog({ abi: erc20Abi, eventName: "Approval", data: log.data,
        topics: log.topics as [Hex, ...Hex[]], strict: true });
      if (same(args.owner, wallet) && same(args.spender, P.router)) {
        forkAssert(args.value === approvalAmount, "FORK_APPROVAL_EVENT_INVALID"); approvals++;
      }
    }
  }
  const gas = r.gasUsed * r.effectiveGasPrice;
  forkAssert(e.before.native - e.after.native === gas && uint(gas), "FORK_GAS_DELTA_INVALID");
  if (e.kind === "swap") {
    forkAssert(minimum > 0n && input === amount && output >= minimum && uint(output)
      && e.before.input - e.after.input === input && e.after.output - e.before.output === output
      && e.after.allowance === 0n, "FORK_SWAP_DELTA_INVALID");
  } else forkAssert(approvals === 1 && input === 0n && output === 0n && e.before.input === e.after.input
    && e.before.output === e.after.output && e.after.allowance === approvalAmount, "FORK_APPROVAL_DELTA_INVALID");
  return { verified: true as const, amountIn: input.toString(), amountOut: output.toString(),
    l2GasCost: gas.toString(), actualTotalFeeQualified: false as const };
}
