import { toHex } from "viem";
import { inspectTestnetSwapTransaction, planTestnetTokenApproval, parseTestnetSwapQuote, TESTNET_SWAP_POLICY as P,
  sameTestnetFeeFields, testnetRpcFeeFields, validateTestnetFeeFields,
  type TestnetSwapIntent, type TestnetSwapQuote } from "@vezta-dex/core";
import type { ForkClientBoundary, TestnetForkReceiptEvidence } from "./testnet-fork";
import { forkAssert, guardedForkRequest } from "./testnet-fork";
import type { TestnetQuoteStore } from "./testnet-quote-store";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";
import type { TestnetActionStore } from "./testnet-action";

type Source = Pick<BaseSepoliaWalletSource, "getPendingNonce" | "getTokenAllowance" | "getBlockHash">;
type Study = { transaction: TestnetForkReceiptEvidence["transaction"]; blockNumber: string; blockHash: string; currentAllowance: string };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export async function sendReviewedForkTransaction(boundary: ForkClientBoundary, origin: string,
  transaction: Omit<TestnetForkReceiptEvidence["transaction"], "data"> & { data: string }, beforeWrite: () => void) {
  const reviewed = { ...transaction };
  const feeFields = testnetRpcFeeFields(reviewed);
  return guardedForkRequest(boundary, origin, "eth_sendTransaction", [{
    from: reviewed.from, to: reviewed.to, data: reviewed.data, value: toHex(BigInt(reviewed.value)),
    chainId: toHex(reviewed.chainId), nonce: toHex(BigInt(reviewed.nonce)), gas: toHex(BigInt(reviewed.gas)),
    ...feeFields,
  }], () => {
    forkAssert(JSON.stringify(transaction) === JSON.stringify(reviewed), "FORK_TRANSACTION_CHANGED");
    beforeWrite();
  });
}

// Fork harness only. This is not an authenticated browser/public submission endpoint.
export async function prepareForkSend(source: Source, store: TestnetQuoteStore,
  request: { intent: TestnetSwapIntent; quoteId: string }, study: Study,
  kind: TestnetForkReceiptEvidence["kind"], signal: AbortSignal, now = Date.now) {
  return prepareBoundForkSend(source, request.intent, study, kind, signal, now,
    () => store.read(request.quoteId, request.intent), () => store.consume(request.quoteId, request.intent));
}

export async function prepareForkContextSend(source: Source, contexts: TestnetActionStore, contextId: string,
  signal: AbortSignal, now = Date.now) {
  const c = contexts.read(contextId);
  return prepareBoundForkSend(source, c.intent, c, c.kind, signal, now, () => {
    const context = contexts.read(contextId);
    forkAssert(!context.submissionAttempted && context.originalHash === null, "FORK_ALREADY_SUBMITTED");
    return parseTestnetSwapQuote(context.quote, now());
  }, () => contexts.markSubmissionAttempted(contextId));
}

async function prepareBoundForkSend(source: Source, i: TestnetSwapIntent, study: Study,
  kind: TestnetForkReceiptEvidence["kind"], signal: AbortSignal, now: () => number,
  readQuote: () => TestnetSwapQuote, consume: () => unknown) {
  const tx = study.transaction; const originalFees = { ...tx }; const quote = readQuote(); signal.throwIfAborted();
  const validate = () => {
    signal.throwIfAborted(); readQuote();
    validateTestnetFeeFields(tx);
    forkAssert(sameTestnetFeeFields(tx, originalFees), "FORK_TRANSACTION_CHANGED");
    forkAssert(tx.chainId === P.chainId && tx.value === "0" && same(tx.from, i.wallet)
      && /^(0|[1-9][0-9]*)$/.test(tx.nonce) && BigInt(tx.nonce) <= BigInt(Number.MAX_SAFE_INTEGER)
      && /^[1-9][0-9]*$/.test(tx.gas) && BigInt(tx.gas) >= 21000n && BigInt(tx.gas) <= 650000n
      && /^[1-9][0-9]*$/.test(tx.gasPrice) && BigInt(tx.gasPrice) <= 2000000000000n, "FORK_TRANSACTION_INVALID");
    if (kind === "swap") {
      forkAssert(study.currentAllowance === i.amountIn, "FORK_ALLOWANCE_CHANGED");
      inspectTestnetSwapTransaction({ chainId: tx.chainId, from: tx.from, to: tx.to, data: tx.data, value: tx.value }, quote, now());
    } else {
      const plan = planTestnetTokenApproval(i, BigInt(study.currentAllowance));
      forkAssert(plan.kind === kind && same(tx.to, plan.transaction.to)
        && same(tx.data, plan.transaction.data), "FORK_APPROVAL_INVALID");
    }
  };
  validate();
  const [nonce, allowance, hash, quoteHash] = await Promise.all([
    source.getPendingNonce(i.wallet), source.getTokenAllowance(i.tokenIn, i.wallet, P.router, BigInt(study.blockNumber)),
    source.getBlockHash(BigInt(study.blockNumber)), source.getBlockHash(BigInt(quote.blockNumber)),
  ]);
  validate();
  forkAssert(nonce === BigInt(tx.nonce) && allowance === BigInt(study.currentAllowance)
    && same(hash, study.blockHash) && same(quoteHash, quote.blockHash), "FORK_STATE_CHANGED");
  return () => { validate(); consume(); };
}
