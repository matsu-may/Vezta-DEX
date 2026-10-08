import { type TestnetChainId, testnetChainConfig } from "@vezta-dex/core";
import { createTestnetChainSource } from "../infrastructure/rpc/base-sepolia-source";
import { TestnetSwapQuoteReader } from "../modules/swap/testnet-swap-quote";
import { TestnetWalletStateReader } from "../modules/wallet/testnet-wallet-state";
import { TestnetApprovalReader } from "../modules/swap/testnet-approval";
import { TestnetSwapPreparer } from "../modules/swap/testnet-swap-preparation";
import { TestnetActionStore, TestnetRechecker } from "../modules/transaction/testnet-action";
import { TestnetReceiptReader } from "../modules/transaction/testnet-receipt";
import { TestnetLpPositionReader } from "../modules/liquidity/testnet-lp-position";
import { TestnetLpWallet } from "../modules/liquidity/testnet-lp-wallet";
import { TestnetLpWalletStore } from "../modules/liquidity/testnet-lp-wallet-store";
import { TestnetLpWalletReceiptReader } from "../modules/liquidity/testnet-lp-wallet-receipt";
import { handleTestnetRequest } from "./testnet-routes";
import { handleTestnetLpRequest } from "./testnet-lp-routes";
import { handleTestnetLpWalletRequest } from "./testnet-lp-wallet-routes";
/** One process owns independent chain stores. Configuration does not certify a live RPC. */
export function createTestnetChainApi<I extends TestnetChainId>(chainId: I, rpcUrl: string | undefined,
  directories: {swap: string; lp: string}, now = Date.now) {
  testnetChainConfig(chainId);
  const source = rpcUrl ? (signal: AbortSignal) => createTestnetChainSource(chainId, rpcUrl, signal) : undefined;
  const quotes = source ? new TestnetSwapQuoteReader(source, undefined, now, chainId) : undefined;
  const states = source ? new TestnetWalletStateReader(source, now, chainId) : undefined;
  const approvals = source && quotes ? new TestnetApprovalReader(source, quotes.store, now, chainId) : undefined;
  const preparer = source && quotes ? new TestnetSwapPreparer(source, quotes.store, now, chainId) : undefined;
  const positions = source ? new TestnetLpPositionReader(source, now, chainId) : undefined;
  let rechecker: TestnetRechecker<I> | undefined, receipts: TestnetReceiptReader<I> | undefined;
  let lp: TestnetLpWallet<I> | undefined, lpReceipts: TestnetLpWalletReceiptReader<I> | undefined;
  let storageUnavailable = false;
  if (source && quotes && approvals && preparer) {
    try {
      const contexts = new TestnetActionStore(now, 128, directories.swap, chainId);
      rechecker = new TestnetRechecker(approvals, preparer, quotes.store, contexts, chainId);
      receipts = new TestnetReceiptReader(source, contexts, now, chainId);
      const lpStore = new TestnetLpWalletStore(directories.lp, now, 128, chainId);
      lp = new TestnetLpWallet(source, lpStore, now, chainId);
      lpReceipts = new TestnetLpWalletReceiptReader(source, lpStore, now, chainId);
    } catch {storageUnavailable = true; rechecker = undefined; receipts = undefined; lp = undefined; lpReceipts = undefined;}
  }
  const ready = !!(source && rechecker && receipts && lp && lpReceipts);
  return {ready, async handle(request: Request, executionAllowed = false) {
    const enabled = executionAllowed && ready;
    return await handleTestnetLpWalletRequest(request, lp, lpReceipts, enabled,
      storageUnavailable ? "TESTNET_LP_STORAGE_UNAVAILABLE" : "TESTNET_LP_RPC_NOT_CONFIGURED", chainId)
      ?? await handleTestnetLpRequest(request, positions, chainId)
      ?? await handleTestnetRequest(request, undefined, quotes, states, approvals, preparer, rechecker, receipts, enabled, chainId);
  }};
}
