import { z } from "zod";
import { decodeEventLog, encodeFunctionData, erc20Abi, keccak256, type PublicClient, type Hash } from "viem";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, copySubmittedTransaction, readTransactionReceipt, validateTradingIntent, type ReceiptClient, type ReceiptObservation, type TradingIntent } from "@vezta-dex/core";
import type { SwapPreparationChainSource } from "./swap-preparation";
const hexHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const integer = z.string().regex(/^(0|[1-9]\d{0,77})$/).refine(v => BigInt(v) < 1n << 256n);
export const submissionSchema = z.object({
  kind: z.enum(["approval", "swap"]), hash: hexHash, dataHash: hexHash,
  intent: z.object({ chainId: z.literal(137), swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/), tokenIn: z.string().regex(/^0x[0-9a-fA-F]{40}$/), tokenOut: z.string().regex(/^0x[0-9a-fA-F]{40}$/), amountIn: integer, slippageBps: z.number().int() }).strict(),
  minimumAmountOut: integer, submittedAt: z.number().int().nonnegative().max(8640000000000000),
  submissionId: z.string().uuid(), afterBlock: integer,
  expectedNonce: integer.refine(v => BigInt(v) <= BigInt(Number.MAX_SAFE_INTEGER)),
}).strict().superRefine((value, ctx) => {
  try {
    validateTradingIntent(value.intent as TradingIntent);
    if (value.kind === "swap" && value.minimumAmountOut === "0")
      throw new Error();
  }
  catch {
    ctx.addIssue({ code: "custom", message: "Invalid submission intent" });
  }
});
export type SubmissionRecord = z.infer<typeof submissionSchema>;
export interface WalletObservationSource extends Pick<SwapPreparationChainSource, "getTokenBalance" | "getNativeBalance" | "getTokenAllowance" | "getPermitAllowance"> {
  receiptClient: ReceiptClient & Pick<PublicClient, "getTransaction">;
}
export interface ExecutionEvidence {
  status: "verified" | "reverted" | "unverified";
  nonce?: string;
  amountIn?: string;
  amountOut?: string;
  gasCost?: string;
  balances?: {
    USDC: string;
    WETH: string;
    POL: string;
  };
  tokenAllowance?: string;
  permitAllowance?: {
    amount: string;
    expiration: string;
    nonce: string;
  };
}
export interface WalletObservation {
  observation: ReceiptObservation;
  execution: ExecutionEvidence | null;
}
function uint(value: bigint, bits = 256): string {
  if (typeof value !== "bigint" || value < 0n || value >= 1n << BigInt(bits))
    throw new Error();
  return value.toString();
}
const equal = (a: string | null | undefined, b: string) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
export class WalletObservationReader {
  constructor(private readonly source: WalletObservationSource, private readonly now: () => number = Date.now) { }
  async observe(value: unknown): Promise<WalletObservation> {
    const query = submissionSchema.parse(value);
    const submitted = copySubmittedTransaction({ kind: query.kind, hash: query.hash as Hash, intent: query.intent as TradingIntent });
    const client = this.source.receiptClient;
    const observation = await readTransactionReceipt(client, submitted, 2, this.now());
    if (observation.status !== "confirmed" && observation.status !== "reverted")
      return { observation, execution: null };
    try {
      const tx = await client.getTransaction({ hash: submitted.hash });
      const block = observation.receipt.blockNumber;
      if (!equal(tx.hash, query.hash) || !equal(tx.from, query.intent.swapper) || !equal(tx.to, observation.receipt.to)
        || tx.value !== 0n || !equal(tx.blockHash, observation.receipt.blockHash) || tx.blockNumber !== block
        || !equal(keccak256(tx.input), query.dataHash) || !Number.isSafeInteger(tx.nonce) || tx.nonce < 0
        || String(tx.nonce) !== query.expectedNonce || block <= BigInt(query.afterBlock))
        throw new Error();
      if (query.kind === "approval" && !equal(tx.input, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [POLYGON_PERMIT2, BigInt(query.intent.amountIn)] })))
        throw new Error();
      const [usdc, weth, native, allowance, permit] = await Promise.all([
        this.source.getTokenBalance(TOKENS.USDC.address, query.intent.swapper as Hash, block),
        this.source.getTokenBalance(TOKENS.WETH.address, query.intent.swapper as Hash, block),
        this.source.getNativeBalance(query.intent.swapper as Hash, block),
        this.source.getTokenAllowance(query.intent.tokenIn as Hash, query.intent.swapper as Hash, POLYGON_PERMIT2, block),
        this.source.getPermitAllowance(query.intent.tokenIn as Hash, query.intent.swapper as Hash, POLYGON_UNIVERSAL_ROUTER_212, block),
      ]);
      let amountIn = 0n;
      let amountOut = 0n;
      if (query.kind === "swap" && observation.status === "confirmed") {
        const raw = await client.getTransactionReceipt({ hash: submitted.hash });
        if (!equal(raw.blockHash, observation.receipt.blockHash) || raw.status !== "success")
          throw new Error();
        for (const log of raw.logs) {
          const tokenIn = equal(log.address, query.intent.tokenIn);
          const tokenOut = equal(log.address, query.intent.tokenOut);
          if (!tokenIn && !tokenOut)
            continue;
          // Non-Transfer events are irrelevant; malformed claimed Transfer events fail closed.
          if (log.topics[0]?.toLowerCase() !== "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef")
            continue;
          if (log.removed)
            throw new Error();
          const decoded = decodeEventLog({ abi: erc20Abi, eventName: "Transfer", data: log.data, topics: log.topics, strict: true });
          const { from, to, value } = decoded.args;
          if (tokenIn)
            amountIn += (equal(from, query.intent.swapper) ? value : 0n) - (equal(to, query.intent.swapper) ? value : 0n);
          if (tokenOut)
            amountOut += (equal(to, query.intent.swapper) ? value : 0n) - (equal(from, query.intent.swapper) ? value : 0n);
        }
        if (amountIn !== BigInt(query.intent.amountIn) || amountOut < BigInt(query.minimumAmountOut))
          throw new Error();
      }
      if (query.kind === "approval" && observation.status === "confirmed" && allowance !== BigInt(query.intent.amountIn))
        throw new Error();
      const canonical = await client.getBlock({ blockNumber: block });
      if (canonical.number !== block || !equal(canonical.hash, observation.receipt.blockHash)
        || typeof canonical.timestamp !== "bigint" || canonical.timestamp < 0n
        || canonical.timestamp < BigInt(Math.floor(query.submittedAt / 1000)) - 5n
        || await client.getChainId() !== 137)
        throw new Error();
      return { observation, execution: {
          status: observation.status === "reverted" ? "reverted" : "verified", nonce: String(tx.nonce), amountIn: uint(amountIn), amountOut: uint(amountOut),
          gasCost: uint(observation.receipt.gasUsed * observation.receipt.effectiveGasPrice),
          balances: { USDC: uint(usdc), WETH: uint(weth), POL: uint(native) }, tokenAllowance: uint(allowance),
          permitAllowance: { amount: uint(permit.amount, 160), expiration: uint(permit.expiration, 48), nonce: uint(permit.nonce, 48) },
        } };
    }
    catch {
      return { observation, execution: { status: "unverified" } };
    }
  }
}
