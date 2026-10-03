import { randomBytes } from "node:crypto";
import { z } from "zod";
import { inspectTestnetSwapTransaction, parseTestnetSwapIntent, parseTestnetSwapQuote, planTestnetTokenApproval,
  TESTNET_SWAP_POLICY as P, validateTestnetFeeFields, type TestnetFeeFields, type TestnetSwapIntent, type TestnetSwapQuote, type TestnetSwapTransaction } from "@vezta-dex/core";
import type { TestnetQuoteStore } from "./testnet-quote-store";
import type { TestnetApprovalReader } from "./testnet-approval";
import type { TestnetSwapPreparer } from "./testnet-swap-preparation";

type ActionCode = "TESTNET_CONTEXT_INVALID" | "TESTNET_CONTEXT_CAPACITY" | "TESTNET_CONTEXT_UNAVAILABLE"
  | "TESTNET_CONTEXT_HASH_CHANGED" | "TESTNET_CONTEXT_ATTEMPTED" | "TESTNET_RECHECK_BUSY" | "TESTNET_INTENT_INVALID";
export class TestnetActionError extends Error {
  constructor(readonly code: ActionCode) { super(code); }
}
const fail = (code: ActionCode): never => { throw new TestnetActionError(code); };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const hash = (v: string) => /^0x[0-9a-fA-F]{64}$/.test(v) && BigInt(v) !== 0n;
const integer = (v: string) => /^(0|[1-9][0-9]{0,77})$/.test(v) && BigInt(v) < 2n ** 256n;

export interface TestnetActionInput {
  kind: "swap" | "approve" | "reset";
  intent: TestnetSwapIntent; quote: TestnetSwapQuote;
  transaction: TestnetSwapTransaction & { nonce: string; gas: string } & TestnetFeeFields;
  blockNumber: string; blockHash: string; currentAllowance: string;
}
export interface TestnetActionContext extends TestnetActionInput {
  contextId: string; issuedAt: number; trackingExpiresAt: number;
  quoteExpiresAt: string; originalHash: string | null; submissionAttempted: boolean;
}
const quoteIntent = (q: TestnetSwapQuote) => parseTestnetSwapIntent({ chainId: q.chainId, wallet: q.wallet,
  tokenIn: q.tokenIn, tokenOut: q.tokenOut, amountIn: q.amountIn, slippageBps: q.slippageBps });

function validateInput(value: TestnetActionInput, now: number): TestnetActionInput {
  try {
    const intent = parseTestnetSwapIntent(value.intent); const quote = parseTestnetSwapQuote(value.quote, now);
    const tx = value.transaction; validateTestnetFeeFields(tx);
    if (JSON.stringify(intent) !== JSON.stringify(quoteIntent(quote)) || !integer(value.blockNumber)
      || BigInt(value.blockNumber) < BigInt(quote.blockNumber) || !hash(value.blockHash)
      || (value.blockNumber === quote.blockNumber && !same(value.blockHash, quote.blockHash))
      || !integer(value.currentAllowance) || !integer(tx.nonce) || BigInt(tx.nonce) > BigInt(Number.MAX_SAFE_INTEGER)
      || !integer(tx.gas) || BigInt(tx.gas) < 21000n || BigInt(tx.gas) > 650000n
      || !integer(tx.gasPrice) || BigInt(tx.gasPrice) === 0n || BigInt(tx.gasPrice) > 2000000000000n
      || tx.chainId !== P.chainId || !same(tx.from, intent.wallet) || tx.value !== "0") return fail("TESTNET_CONTEXT_INVALID");
    const economic = { chainId: tx.chainId, from: tx.from, to: tx.to, data: tx.data, value: tx.value };
    if (value.kind === "swap") {
      if (value.currentAllowance !== intent.amountIn) return fail("TESTNET_CONTEXT_INVALID");
      inspectTestnetSwapTransaction(economic, quote, now);
    } else {
      const plan = planTestnetTokenApproval(intent, BigInt(value.currentAllowance));
      if (plan.kind === "ready" || plan.kind !== value.kind || !same(tx.to, plan.transaction.to)
        || !same(tx.data, plan.transaction.data)) return fail("TESTNET_CONTEXT_INVALID");
    }
    return structuredClone({ ...value, intent, quote });
  } catch { return fail("TESTNET_CONTEXT_INVALID"); }
}

// Internal trusted issuance; no HTTP endpoint accepts client-authored expected economics.
export class TestnetActionStore {
  private readonly entries = new Map<string, TestnetActionContext>();
  constructor(private readonly now = Date.now, private readonly capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 128) throw new Error("Invalid context capacity");
  }
  private prune() {
    const now = this.now();
    if (!Number.isSafeInteger(now) || now < 0 || now > 8640000000000000 - 86400000) return fail("TESTNET_CONTEXT_INVALID");
    for (const [id, entry] of this.entries) if (entry.trackingExpiresAt <= now) this.entries.delete(id);
  }
  get size() { this.prune(); return this.entries.size; }
  issue(value: TestnetActionInput, consume: () => unknown) {
    this.prune(); const now = this.now(); const input = validateInput(value, now);
    if (this.entries.size >= this.capacity) return fail("TESTNET_CONTEXT_CAPACITY");
    const contextId = randomBytes(24).toString("hex");
    const quoteExpiresAt = new Date(Date.parse(input.quote.observedAt) + 30000).toISOString();
    const context = { ...input, contextId, issuedAt: now, trackingExpiresAt: now + 86400000,
      quoteExpiresAt, originalHash: null, submissionAttempted: false };
    // All fallible construction/capacity checks precede synchronous quote consumption.
    consume(); this.entries.set(contextId, context);
    return { contextId, kind: input.kind, chainId: P.chainId, transaction: structuredClone(input.transaction),
      quoteExpiresAt, trackingExpiresAt: new Date(context.trackingExpiresAt).toISOString(), executionEnabled: false as const };
  }
  read(id: string) {
    this.prune(); const entry = /^[a-f0-9]{48}$/.test(id) ? this.entries.get(id) : undefined;
    if (!entry) return fail("TESTNET_CONTEXT_UNAVAILABLE");
    return structuredClone(entry);
  }
  bindHash(id: string, value: string) {
    const context = this.read(id);
    if (!hash(value)) return fail("TESTNET_CONTEXT_INVALID");
    if (context.originalHash && !same(context.originalHash, value)) return fail("TESTNET_CONTEXT_HASH_CHANGED");
    this.entries.get(id)!.originalHash = value.toLowerCase();
  }
  // Synchronous final boundary: reserve once even if the send response is lost.
  markSubmissionAttempted(id: string) {
    const context = this.read(id);
    if (context.submissionAttempted || context.originalHash !== null) return fail("TESTNET_CONTEXT_ATTEMPTED");
    parseTestnetSwapQuote(context.quote, this.now());
    this.entries.get(id)!.submissionAttempted = true;
  }
}

const requestSchema = z.object({ kind: z.enum(["approval", "swap"]), intent: z.unknown(),
  quoteId: z.string().regex(/^[a-f0-9]{48}$/) }).strict();
export function parseTestnetRecheckRequest(value: unknown) {
  const body = requestSchema.parse(value); return { ...body, intent: parseTestnetSwapIntent(body.intent) };
}

export class TestnetRechecker {
  private busy = false;
  constructor(private readonly approvals: TestnetApprovalReader, private readonly preparer: TestnetSwapPreparer,
    private readonly quotes: TestnetQuoteStore, readonly contexts: TestnetActionStore) {}
  async read(value: unknown) {
    let request: ReturnType<typeof parseTestnetRecheckRequest>;
    try { request = parseTestnetRecheckRequest(value); } catch { return fail("TESTNET_INTENT_INVALID"); }
    if (this.busy) return fail("TESTNET_RECHECK_BUSY");
    this.busy = true;
    try {
      const body = { intent: request.intent, quoteId: request.quoteId };
      const study = await (request.kind === "swap" ? this.preparer : this.approvals).read(body);
      if (study.status !== "unsigned-prepared" || !study.transaction) return { study, action: null };
      const kind = request.kind === "swap" ? "swap" : study.approvalKind;
      if (kind === "ready") return fail("TESTNET_CONTEXT_INVALID");
      const quote = this.quotes.read(request.quoteId, request.intent);
      const action = this.contexts.issue({ kind, intent: study.intent, quote, transaction: study.transaction,
        blockNumber: study.blockNumber, blockHash: study.blockHash, currentAllowance: study.currentAllowance },
      () => this.quotes.consume(request.quoteId, request.intent));
      return { study, action };
    } finally { this.busy = false; }
  }
}
