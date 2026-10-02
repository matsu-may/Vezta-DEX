import { encodeFunctionData, erc20Abi, parseAbi, toHex, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, parseTestnetSwapIntent, planTestnetTokenApproval } from "@vezta-dex/core";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetApprovalReader } from "./testnet-approval";
import { TestnetSwapPreparer } from "./testnet-swap-preparation";
import { forkAssert, guardedForkRequest, reviewTestnetForkReceipt, type TestnetForkReceiptEvidence } from "./testnet-fork";
import { prepareForkSend } from "./testnet-fork-send";
import { withForkSnapshot } from "./testnet-fork-snapshot";
import { mineFreshForkBlock } from "./testnet-fork-clock";
import type { startOwnedTestnetAnvil } from "./testnet-fork-process";

export const TESTNET_FORK_WALLET = "0x1111111111111111111111111111111111111111" as const;
type OwnedFork = Awaited<ReturnType<typeof startOwnedTestnetAnvil>>;
type Row = Record<string, string | number | boolean>;
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();

export async function runTestnetForkLifecycle(fork: OwnedFork,
  upstream: { number: bigint; hash: string; timestamp: bigint }, signal: AbortSignal, report: (row: Row) => void) {
  const { client, boundary, origin } = fork;
  const mutate = (method: string, params: readonly unknown[], beforeWrite?: () => void) =>
    guardedForkRequest(boundary, origin, method, params, () => { signal.throwIfAborted(); beforeWrite?.(); });
  const source = (innerSignal: AbortSignal) => createBaseSepoliaPreflightSource(origin, AbortSignal.any([signal, innerSignal]));
  const reads = source(signal); const wallet = TESTNET_FORK_WALLET;
  const initial = await client.getBlock({ blockTag: "latest" });
  const age = Date.now() - Number(upstream.timestamp) * 1000;
  forkAssert(initial.number === upstream.number && same(initial.hash, upstream.hash)
    && age >= -10000 && age < 120000 && await client.getChainId() === P.chainId, "FORK_SOURCE_MISMATCH");
  report({ status: "testnet-fork-pinned", chainId: P.chainId, blockNumber: upstream.number.toString(), localOnly: true });

  await withForkSnapshot(boundary, origin, async () => {
    signal.throwIfAborted();
    forkAssert(await reads.getCode(wallet, upstream.number) === "0x", "FORK_FIXTURE_NOT_EOA");
    const beforeFunding = await reads.getTokenBalance(C.USDC.address, wallet, upstream.number);
    forkAssert(await reads.getTokenBalance(C.USDC.address, P.pool, upstream.number) >= 1000000n, "FORK_POOL_FUNDING_LOW");
    for (const account of [wallet, P.pool]) {
      await mutate("anvil_setBalance", [account, toHex(10n ** 18n)]);
      await mutate("anvil_impersonateAccount", [account]);
    }
    // Fixture setup only. All state, assets and impersonation belong to the disposable child.
    const fixtureSend = async (from: string, to: string, data: Hex, value = 0n) => {
      const hash = await mutate("eth_sendTransaction", [{ from, to, data, value: toHex(value), chainId: toHex(P.chainId) }]);
      forkAssert(typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash), "FORK_HASH_INVALID");
      const receipt = await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30000, retryCount: 0 });
      forkAssert(receipt.status === "success", "FORK_FIXTURE_FAILED");
    };
    await fixtureSend(P.pool, C.USDC.address, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [wallet, 1000000n] }));
    await mutate("anvil_stopImpersonatingAccount", [P.pool]);
    await fixtureSend(wallet, C.WETH.address, encodeFunctionData({ abi: parseAbi(["function deposit() payable"]), functionName: "deposit" }), 10n ** 16n);
    await fixtureSend(wallet, C.USDC.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [P.router, 1n] }));
    await fixtureSend(wallet, C.WETH.address, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [P.router, 0n] }));
    const fundedBlock = await reads.getLatestBlock();
    forkAssert(await reads.getTokenBalance(C.USDC.address, wallet, fundedBlock.number) === beforeFunding + 1000000n
      && await reads.getTokenBalance(C.WETH.address, wallet, fundedBlock.number) >= 10n ** 16n, "FORK_FIXTURE_FAILED");
    report({ stage: "fixture-funded", localOnly: true, ownerFundsUsed: false });

    const quotes = new TestnetSwapQuoteReader(source);
    const approvals = new TestnetApprovalReader(source, quotes.store);
    const preparer = new TestnetSwapPreparer(source, quotes.store);
    const freshMine = async () => {
      const block = await reads.getLatestBlock();
      await mineFreshForkBlock(boundary, origin, block.timestamp, signal);
    };
    // Warm Anvil's lazy upstream storage/code cache outside any executable quote's lifetime.
    // Every reader still revalidates its own fresh block, runtime and state afterward.
    report({ stage: "read-only-warmup", localOnly: true });
    const warmIntent = parseTestnetSwapIntent({ chainId: P.chainId, wallet, tokenIn: C.USDC.address,
      tokenOut: C.WETH.address, amountIn: "1000000", slippageBps: P.slippageBps });
    const warmPlan = planTestnetTokenApproval(warmIntent, 1n);
    forkAssert(warmPlan.kind === "reset", "FORK_FIXTURE_FAILED");
    const nonce = await reads.getPendingNonce(wallet);
    const price = await reads.getGasPrice();
    await Promise.all([
      ...[C.USDC.address, C.WETH.address, C.v3Factory, C.v3QuoterV2, C.v3PositionManager, P.router, P.pool]
        .map(a => reads.getCode(a, fundedBlock.number)),
      reads.getDecimals(C.USDC.address, fundedBlock.number), reads.getDecimals(C.WETH.address, fundedBlock.number),
      reads.getPool(P.feeTier, fundedBlock.number), reads.getPoolState(P.pool, fundedBlock.number),
      reads.getTickSpacing(P.pool, fundedBlock.number), reads.getDependencyConfiguration(fundedBlock.number),
      reads.quoteExactInput(C.USDC.address, C.WETH.address, 1000000n, P.feeTier, fundedBlock.number),
      reads.quoteExactInput(C.WETH.address, C.USDC.address, 100000000000000n, P.feeTier, fundedBlock.number),
      reads.getAdditionalFees(warmPlan.transaction, nonce, 60000n, price, fundedBlock.number),
    ]);
    const snapshotBalances = async (intent: ReturnType<typeof parseTestnetSwapIntent>, block: bigint) => {
      const [input, output, native, allowance] = await Promise.all([
        reads.getTokenBalance(intent.tokenIn, wallet, block), reads.getTokenBalance(intent.tokenOut, wallet, block),
        reads.getNativeBalance(wallet, block), reads.getTokenAllowance(intent.tokenIn, wallet, P.router, block),
      ]);
      return { input, output, native, allowance };
    };
    const execute = async (request: { intent: ReturnType<typeof parseTestnetSwapIntent>; quoteId: string },
      study: { transaction: TestnetForkReceiptEvidence["transaction"] | null; blockNumber: string; blockHash: string;
        currentAllowance: string; status: string; simulation: { status: "success" } | null;
        inputBalance: string; nativeBalance: string; gas: { totalFeeQualified: true } | null },
      kind: TestnetForkReceiptEvidence["kind"], direction: string) => {
      forkAssert(study.status === "unsigned-prepared" && study.transaction && study.simulation?.status === "success"
        && study.gas?.totalFeeQualified, "FORK_PREPARATION_BLOCKED");
      const transaction = study.transaction;
      const original = quotes.store.read(request.quoteId, request.intent);
      // Reuse balances already validated at this immutable study block; only output is missing.
      const before = { input: BigInt(study.inputBalance), native: BigInt(study.nativeBalance),
        output: await reads.getTokenBalance(request.intent.tokenOut, wallet, BigInt(study.blockNumber)) };
      const beforeWrite = await prepareForkSend(reads, quotes.store, request, { ...study, transaction }, kind, signal);
      const hash = await mutate("eth_sendTransaction", [{ from: transaction.from, to: transaction.to,
        data: transaction.data, value: "0x0", nonce: toHex(BigInt(transaction.nonce)),
        gas: toHex(BigInt(transaction.gas)), gasPrice: toHex(BigInt(transaction.gasPrice)),
        chainId: toHex(P.chainId), type: "0x0" }], beforeWrite);
      forkAssert(typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash), "FORK_HASH_INVALID");
      const receipt = await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30000, retryCount: 0 });
      await mutate("evm_mine", []);
      const [tx, canonical, latest, after] = await Promise.all([
        client.getTransaction({ hash: hash as Hex }), client.getBlock({ blockNumber: receipt.blockNumber }),
        client.getBlockNumber({ cacheTime: 0 }), snapshotBalances(request.intent, receipt.blockNumber),
      ]);
      const reviewed = reviewTestnetForkReceipt({ kind, tokenIn: request.intent.tokenIn, tokenOut: request.intent.tokenOut,
        amountIn: request.intent.amountIn, minimumAmountOut: original.minimumAmountOut, transaction,
        hash: hash as Hex, afterBlock: BigInt(study.blockNumber), canonical, latestBlock: latest, tx, receipt, before, after });
      report({ stage: kind, direction, localOnly: true, simulationSucceeded: true, snapshotFeeBudgetQualified: true,
        ...reviewed, confirmations: 2 });
    };
    for (const reverse of [false, true]) {
      const direction = reverse ? "WETH_TO_USDC" : "USDC_TO_WETH";
      const intent = parseTestnetSwapIntent({ chainId: P.chainId, wallet,
        tokenIn: reverse ? C.WETH.address : C.USDC.address, tokenOut: reverse ? C.USDC.address : C.WETH.address,
        amountIn: reverse ? "100000000000000" : "1000000", slippageBps: P.slippageBps });
      let ready = false;
      for (let attempt = 0; attempt < 2; attempt++) {
        await freshMine();
        const quote = await quotes.read(intent); const request = { intent, quoteId: quote.quoteId };
        report({ stage: "approval-study", direction, localOnly: true });
        const approval = await approvals.read(request);
        if (approval.status === "allowance-ready") { ready = true; break; }
        forkAssert(approval.approvalKind !== "ready", "FORK_APPROVAL_BLOCKED");
        await execute(request, approval, approval.approvalKind, direction);
        // Receipt already re-read the exact allowance; preparation checks it again at a fresh block.
        if (approval.approvalKind === "approve") { ready = true; break; }
      }
      forkAssert(ready, "FORK_APPROVAL_NOT_READY");
      await freshMine();
      const quote = await quotes.read(intent); const request = { intent, quoteId: quote.quoteId };
      report({ stage: "swap-study", direction, localOnly: true });
      await execute(request, await preparer.read(request), "swap", direction);
    }
    const last = await reads.getLatestBlock();
    for (const token of [C.USDC.address, C.WETH.address]) {
      forkAssert(await reads.getTokenAllowance(token, wallet, P.router, last.number) === 0n, "FORK_ALLOWANCE_RESIDUAL");
    }
  });
  report({ status: "testnet-fork-lifecycle-local-only", chainId: P.chainId, verified: true,
    snapshotReverted: true, ownerFundsUsed: false, actualTotalFeeQualified: false, executionEnabled: false });
}
