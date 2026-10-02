import { inspectTestnetSwapTransaction, planTestnetTokenApproval, TESTNET_SWAP_POLICY as P,
  type TestnetSwapIntent } from "@vezta-dex/core";
import type { TestnetForkReceiptEvidence } from "./testnet-fork";
import { forkAssert } from "./testnet-fork";
import type { TestnetQuoteStore } from "./testnet-quote-store";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";

type Source = Pick<BaseSepoliaWalletSource, "getPendingNonce" | "getTokenAllowance" | "getBlockHash">;
type Study = { transaction: TestnetForkReceiptEvidence["transaction"]; blockNumber: string; blockHash: string; currentAllowance: string };
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

// Fork harness only. This is not an authenticated browser/public submission endpoint.
export async function prepareForkSend(source: Source, store: TestnetQuoteStore,
  request: { intent: TestnetSwapIntent; quoteId: string }, study: Study,
  kind: TestnetForkReceiptEvidence["kind"], signal: AbortSignal, now = Date.now) {
  const { intent: i, quoteId } = request; const tx = study.transaction;
  const quote = store.read(quoteId, i); signal.throwIfAborted();
  const validate = () => {
    signal.throwIfAborted(); store.read(quoteId, i);
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
  return () => { validate(); store.consume(quoteId, i); };
}
