import { POLYGON_UNIVERSAL_ROUTER_212, validateTradingIntent, type TradingIntent } from "./index";
import { TransactionReceiptNotFoundError, type Address, type Hash, type PublicClient } from "viem";
import { z } from "zod";

const hashSchema = z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform((value) => value as Hash);
const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform((value) => value as Address);
const submittedSchema = z.object({
  kind: z.enum(["approval", "swap"]),
  hash: hashSchema,
  intent: z.object({
    chainId: z.literal(137), swapper: addressSchema, tokenIn: addressSchema, tokenOut: addressSchema,
    amountIn: z.string(), slippageBps: z.number(),
  }).strict(),
}).strict();
const receiptSchema = z.object({
  transactionHash: hashSchema, from: addressSchema, to: addressSchema,
  blockNumber: z.bigint().nonnegative(), blockHash: hashSchema,
  status: z.enum(["success", "reverted"]), gasUsed: z.bigint().positive(),
  effectiveGasPrice: z.bigint().nonnegative(),
});
const blockSchema = z.object({ number: z.bigint().nonnegative(), hash: hashSchema });

export interface SubmittedTransaction {
  readonly kind: "approval" | "swap";
  readonly intent: Readonly<TradingIntent>;
  readonly hash: Hash;
}

export interface ReceiptEvidence {
  readonly from: Address;
  readonly to: Address;
  readonly blockNumber: bigint;
  readonly blockHash: Hash;
  readonly confirmations: bigint;
  readonly outcome: "success" | "reverted";
  readonly gasUsed: bigint;
  readonly effectiveGasPrice: bigint;
}

interface ObservationIdentity {
  readonly chainId: 137;
  readonly hash: Hash;
  readonly source: "polygon-rpc";
  readonly observedAt: string;
}

export type ReceiptObservation = ObservationIdentity & (
  | { readonly status: "pending"; readonly reason: "not-found" | "noncanonical-block" | "inconsistent-block" }
  | { readonly status: "unavailable"; readonly reason: "wrong-chain" | "invalid-receipt" | "invalid-block" | "rpc-unavailable" }
  | { readonly status: "confirming" | "confirmed" | "reverted"; readonly receipt: ReceiptEvidence }
);

export type ReceiptClient = Pick<PublicClient, "chain" | "getChainId" | "getTransactionReceipt" | "getBlockNumber" | "getBlock">;

export function copySubmittedTransaction(value: SubmittedTransaction): SubmittedTransaction {
  const parsed = submittedSchema.parse(value);
  validateTradingIntent(parsed.intent);
  return Object.freeze({ ...parsed, intent: Object.freeze(parsed.intent) });
}

export function receiptTarget(transaction: SubmittedTransaction): Address {
  return transaction.kind === "approval" ? transaction.intent.tokenIn : POLYGON_UNIVERSAL_ROUTER_212;
}

export function validateConfirmationThreshold(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("Invalid receipt confirmation threshold");
}

/** One read only. The caller supplies a fixed Polygon public client with bounded transport timeouts. */
export async function readTransactionReceipt(
  client: ReceiptClient,
  value: SubmittedTransaction,
  requiredConfirmations: number,
  now = Date.now(),
): Promise<ReceiptObservation> {
  const transaction = copySubmittedTransaction(value);
  validateConfirmationThreshold(requiredConfirmations);
  if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) throw new Error("Invalid receipt observation time");
  const identity: ObservationIdentity = {
    chainId: 137, hash: transaction.hash, source: "polygon-rpc", observedAt: new Date(now).toISOString(),
  };
  const unavailable = (reason: "wrong-chain" | "invalid-receipt" | "invalid-block" | "rpc-unavailable"): ReceiptObservation =>
    ({ ...identity, status: "unavailable", reason });

  if (client.chain?.id !== 137) return unavailable("wrong-chain");
  try {
    if (await client.getChainId() !== 137) return unavailable("wrong-chain");
    let rawReceipt;
    try {
      rawReceipt = await client.getTransactionReceipt({ hash: transaction.hash });
    } catch (error) {
      if (!(error instanceof TransactionReceiptNotFoundError)) throw error;
      if (await client.getChainId() !== 137) return unavailable("wrong-chain");
      return { ...identity, status: "pending", reason: "not-found" };
    }
    const parsed = receiptSchema.safeParse(rawReceipt);
    if (!parsed.success) return unavailable("invalid-receipt");
    const receipt = parsed.data;
    if (receipt.transactionHash.toLowerCase() !== transaction.hash.toLowerCase()
      || receipt.from.toLowerCase() !== transaction.intent.swapper.toLowerCase()
      || receipt.to.toLowerCase() !== receiptTarget(transaction).toLowerCase()) return unavailable("invalid-receipt");

    const [head, rawBlock] = await Promise.all([
      client.getBlockNumber({ cacheTime: 0 }),
      client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    if (await client.getChainId() !== 137) return unavailable("wrong-chain");
    const block = blockSchema.safeParse(rawBlock);
    if (!block.success || block.data.number !== receipt.blockNumber || typeof head !== "bigint" || head < 0n) return unavailable("invalid-block");
    if (block.data.hash.toLowerCase() !== receipt.blockHash.toLowerCase()) return { ...identity, status: "pending", reason: "noncanonical-block" };
    if (head < receipt.blockNumber) return { ...identity, status: "pending", reason: "inconsistent-block" };

    const confirmations = head - receipt.blockNumber + 1n;
    const evidence: ReceiptEvidence = {
      from: receipt.from, to: receipt.to, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
      confirmations, outcome: receipt.status, gasUsed: receipt.gasUsed, effectiveGasPrice: receipt.effectiveGasPrice,
    };
    const status = confirmations < BigInt(requiredConfirmations) ? "confirming" : receipt.status === "success" ? "confirmed" : "reverted";
    return { ...identity, status, receipt: evidence };
  } catch {
    return unavailable("rpc-unavailable");
  }
}
