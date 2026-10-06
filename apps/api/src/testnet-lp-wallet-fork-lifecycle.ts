import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { encodeFunctionData, erc20Abi, parseAbi, toHex, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, type TestnetLpStudy } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetLpWallet } from "./testnet-lp-wallet";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
import { TestnetLpWalletReceiptReader } from "./testnet-lp-wallet-receipt";
import { runTestnetLpWalletForkSteps } from "./testnet-lp-wallet-fork-steps";
import { forkAssert, guardedForkRequest } from "./testnet-fork";
import { sendReviewedForkTransaction } from "./testnet-fork-send";
import { withForkSnapshot } from "./testnet-fork-snapshot";
import { mineFreshForkBlock } from "./testnet-fork-clock";
import type { startOwnedTestnetAnvil } from "./testnet-fork-process";
import { customLpForkRange } from "./testnet-lp-fork-range";
import { classifyTestnetRpcFailure } from "./testnet-rpc-diagnostics";
const owner = "0x1111111111111111111111111111111111111111" as const;
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
export async function runTestnetLpWalletFork(fork: Awaited<ReturnType<typeof startOwnedTestnetAnvil>>,
  upstream: { number: bigint; hash: string; timestamp: bigint }, signal: AbortSignal, report: (row: Record<string, unknown>) => void, options: { customRange?: boolean } = {}) {
  const { client, origin, boundary } = fork;
  const mutate = (method: string, params: readonly unknown[]) => guardedForkRequest(boundary, origin, method, params, () => signal.throwIfAborted());
  let rpcFailureReported = false;
  const source = (inner: AbortSignal) => new Proxy(createBaseSepoliaPreflightSource(origin, AbortSignal.any([signal, inner])), {
    get(target, property, receiver) {
      const method = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || !/^[A-Za-z]{1,64}$/.test(property) || typeof method !== "function") return method;
      return async (...args: unknown[]) => {
        try { return await method.apply(target, args); }
        catch (error) {
          if (!rpcFailureReported) {
            rpcFailureReported = true;
            report({ stage:"rpc-failure", method:property, ...classifyTestnetRpcFailure(error), localOnly:true });
          }
          throw error;
        }
      };
    },
  });
  const reads = source(signal); const initial = await reads.getLatestBlock();
  forkAssert(await client.getChainId() === 84532 && initial.number === upstream.number && same(initial.hash, upstream.hash), "FORK_SOURCE_MISMATCH");
  report({ status: "testnet-lp-wallet-fork-pinned", blockNumber: initial.number.toString(), chainId: 84532, localOnly: true });
  const directory = mkdtempSync(join(tmpdir(), "dex-lp-wallet-fork-"));
  try {
    await withForkSnapshot(boundary, origin, async () => {
      forkAssert(await reads.getCode(owner, initial.number) === "0x" && await reads.getPositionCount(owner, initial.number) === 0n, "FORK_FIXTURE_NOT_EMPTY");
      const fixtureSend = async (from: string, to: string, data: Hex, value = 0n) => {
        const hash = await mutate("eth_sendTransaction", [{ from, to, data, value: toHex(value), chainId: toHex(84532) }]);
        forkAssert(typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash), "FORK_HASH_INVALID");
        const r = await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30000, retryCount: 0 });
        forkAssert(r.status === "success" && same(r.from, from) && same(r.to, to), "FORK_LP_RECEIPT_INVALID");
      };
      for (const a of [owner, P.pool]) { await mutate("anvil_setBalance", [a, toHex(10n ** 18n)]); await mutate("anvil_impersonateAccount", [a]); }
      forkAssert(await reads.getTokenBalance(C.USDC.address, P.pool, initial.number) >= 10000000n, "FORK_POOL_FUNDING_LOW");
      await fixtureSend(P.pool, C.USDC.address, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [owner, 10000000n] }));
      await mutate("anvil_stopImpersonatingAccount", [P.pool]);
      await fixtureSend(owner, C.WETH.address, encodeFunctionData({ abi: parseAbi(["function deposit() payable"]), functionName: "deposit" }), 5n * 10n ** 16n);
      // Deliberately exercise reset before the first capped approval.
      await fixtureSend(owner, C.USDC.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [C.v3PositionManager, 1n] }));
      report({ stage: "fixture-funded", localOnly: true, ownerFundsUsed: false });
      const warm = await reads.getLatestBlock();
      await Promise.all([reads.getLpPoolState(warm.number), reads.getDependencyConfiguration(warm.number),
        ...[P.router,C.v3QuoterV2,C.v3Factory,P.pool,C.v3PositionManager].map(a => reads.getCode(a, warm.number))]);
      report({ stage: "read-only-warmup", localOnly: true });
      const store = new TestnetLpWalletStore(directory); const wallet = new TestnetLpWallet(source, store);
      const receipt = new TestnetLpWalletReceiptReader(source, store);
      const fresh = async () => { const b = await reads.getLatestBlock(); await mineFreshForkBlock(boundary, origin, b.timestamp, signal); };
      const observedPool = await reads.getLpPoolState(warm.number);
      const range = options.customRange ? customLpForkRange(observedPool.tick) : undefined;
      if (range) await Promise.all([reads.getFeeGrowthOutside(range.tickLower,warm.number), reads.getFeeGrowthOutside(range.tickUpper,warm.number)]);
      if (range) report({ stage:"custom-range-fixture", ...range, observedTick:observedPool.tick, localOnly:true });
      let restartVerified = false; let rangeChecks = 0; let mintRestartVerified = false;
      const execute = async (review: TestnetLpStudy) => {
        report({ stage:"action-recheck", actionKind:review.actionKind, localOnly:true });
        const checked = await wallet.recheck({ contextId: review.contextId });
        forkAssert(JSON.stringify(checked.transaction) === JSON.stringify(review.transaction) && checked.contextId === review.contextId, "FORK_LP_WALLET_CONTEXT_INVALID");
        const t = checked.transaction!;
        const hash = await sendReviewedForkTransaction(boundary, origin, t, () => signal.throwIfAborted());
        forkAssert(typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash), "FORK_HASH_INVALID");
        await client.waitForTransactionReceipt({ hash: hash as Hex, timeout:30000, retryCount:0 }); await fresh();
        const observation = await receipt.observe({ contextId:checked.contextId, hash });
        forkAssert(observation.status === "confirmed" && observation.verified && BigInt(observation.confirmations) >= 2n, "FORK_LP_WALLET_RECEIPT_INVALID");
        if (range && ["mint","increase","decrease","collect"].includes(checked.actionKind)) {
          forkAssert(observation.tokenId, "FORK_LP_WALLET_NFT_INVALID");
          const nft = await reads.getPosition(BigInt(observation.tokenId), BigInt(observation.receiptBlockNumber!));
          forkAssert(nft.tickLower === range.tickLower && nft.tickUpper === range.tickUpper, "FORK_LP_WALLET_RANGE_INVALID");
          rangeChecks++;
          report({ stage:"custom-range-verified", actionKind:checked.actionKind, tokenId:observation.tokenId, ...range, localOnly:true });
        }
        if (!restartVerified || (range && checked.actionKind === "mint")) {
          const restarted = new TestnetLpWalletReceiptReader(source, new TestnetLpWalletStore(directory));
          const recovered = await restarted.observe({ contextId:checked.contextId, hash });
          forkAssert(recovered.verified && recovered.hash === observation.hash && recovered.contextId === observation.contextId, "FORK_LP_WALLET_RESTART_INVALID");
          if (range && checked.actionKind === "mint") {
            forkAssert(recovered.intent.kind === "mint" && recovered.intent.range?.tickLower === range.tickLower
              && recovered.intent.range?.tickUpper === range.tickUpper, "FORK_LP_WALLET_RANGE_RECOVERY_INVALID");
            mintRestartVerified = true;
          }
          restartVerified = true;
          report({ stage:"restart-recovery", localOnly:true, verified:true, originalHashBound:true });
        }
        report({ stage:checked.actionKind, approvalToken:checked.approvalToken, localOnly:true, simulationSucceeded:true,
          contextBound:true, receiptVerified:true, tokenId:observation.tokenId, amount0:observation.amount0, amount1:observation.amount1,
          actualTotalFeeQualified:false });
        return observation;
      };
      const tokenId = await runTestnetLpWalletForkSteps({ owner, ...(range ? {range} : {}), async study(intent) {
        await fresh(); report({ stage:"action-study", actionKind:intent.kind, localOnly:true });
        return wallet.study({ intent });
      }, execute });
      for (const token of [C.USDC.address,C.WETH.address]) await fixtureSend(owner,token,encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[C.v3PositionManager,0n]}));
      const end = await reads.getLatestBlock();
      forkAssert(await reads.getPositionCount(owner,end.number) === 0n && await reads.getPositionOwnerOrNull(BigInt(tokenId),end.number) === null, "FORK_LP_WALLET_BURN_INVALID");
      const allowances = await Promise.all([C.USDC.address,C.WETH.address].map(a => reads.getTokenAllowance(a,owner,C.v3PositionManager,end.number)));
      forkAssert(allowances.every(a => a === 0n) && restartVerified, "FORK_LP_WALLET_FINAL_INVALID");
      if (range) forkAssert(rangeChecks === 5 && mintRestartVerified, "FORK_LP_WALLET_RANGE_INCOMPLETE");
      report({ stage:"burn-and-clear", customRangeVerified:!!range, mintRestartVerified, localOnly:true, burned:true, allowancesCleared:true, restartVerified });
    });
  } finally { rmSync(directory,{recursive:true,force:true}); }
  report({ status:"testnet-lp-wallet-fork-lifecycle-local-only", chainId:84532, verified:true, snapshotReverted:true,
    ownerFundsUsed:false, actualTotalFeeQualified:false, executionEnabled:false });
}
