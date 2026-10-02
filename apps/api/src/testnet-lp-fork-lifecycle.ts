import { decodeEventLog, encodeFunctionData, erc20Abi, parseAbi, toHex, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { forkAssert, guardedForkRequest } from "./testnet-fork";
import { withForkSnapshot } from "./testnet-fork-snapshot";
import { mineFreshForkBlock } from "./testnet-fork-clock";
import { createBaseSepoliaPreflightSource } from "./base-sepolia-source";
import { TestnetLpPositionReader } from "./testnet-lp-position";
import { planTestnetLp, planLpApprovals, type LpPlan } from "./testnet-lp-plan";
import { reviewLpForkOutcome, type LpForkBalances } from "./testnet-lp-fork-outcome";
import type { startOwnedTestnetAnvil } from "./testnet-fork-process";
const owner = "0x1111111111111111111111111111111111111111" as const;
const events = parseAbi([
  "event IncreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event DecreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event Collect(uint256 indexed tokenId,address recipient,uint256 amount0,uint256 amount1)",
]);
const poolCollectAbi = parseAbi(["event Collect(address indexed owner,address recipient,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount0,uint128 amount1)"]);
const same = (a: string | null, b: string) => a?.toLowerCase() === b.toLowerCase();
export async function runTestnetLpFork(fork: Awaited<ReturnType<typeof startOwnedTestnetAnvil>>, upstream: { number: bigint; hash: string; timestamp: bigint }, signal: AbortSignal, report: (row: Record<string, unknown>) => void) {
  const { client, origin, boundary } = fork;
  const mutate = (method: string, params: readonly unknown[]) => guardedForkRequest(boundary, origin, method, params, () => signal.throwIfAborted());
  const source = (inner: AbortSignal) => createBaseSepoliaPreflightSource(origin, AbortSignal.any([signal, inner]));
  const reads = source(signal);
  const initial = await client.getBlock({ blockTag: "latest" });
  forkAssert(await client.getChainId() === 84532 && initial.number === upstream.number && same(initial.hash, upstream.hash), "FORK_SOURCE_MISMATCH");
  report({ status: "testnet-lp-fork-pinned", chainId: 84532, blockNumber: initial.number.toString(), localOnly: true });
  await withForkSnapshot(boundary, origin, async () => {
    forkAssert(await reads.getCode(owner, initial.number) === "0x" && await reads.getPositionCount(owner, initial.number) === 0n, "FORK_FIXTURE_NOT_EMPTY");
    const send = async (from: string, to: string, data: Hex, value = 0n) => {
      const hash = await mutate("eth_sendTransaction", [{ from, to, data, value: toHex(value), chainId: toHex(84532) }]);
      forkAssert(typeof hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(hash), "FORK_HASH_INVALID");
      const receipt = await client.waitForTransactionReceipt({ hash: hash as Hex, timeout: 30000, retryCount: 0 });
      forkAssert(receipt.status === "success" && same(receipt.from, from) && same(receipt.to, to), "FORK_LP_RECEIPT_INVALID");
      const [tx, canonical] = await Promise.all([client.getTransaction({ hash: hash as Hex }), client.getBlock({ blockNumber: receipt.blockNumber })]);
      forkAssert("chainId" in tx && tx.chainId === 84532 && same(tx.from, from) && same(tx.to, to) && same(tx.input, data)
        && tx.value === value && same(canonical.hash, receipt.blockHash) && same(tx.blockHash, receipt.blockHash), "FORK_LP_CONTEXT_INVALID");
      return receipt;
    };
    for (const account of [owner, P.pool]) { await mutate("anvil_setBalance", [account, toHex(10n ** 18n)]); await mutate("anvil_impersonateAccount", [account]); }
    forkAssert(await reads.getTokenBalance(C.USDC.address, P.pool, initial.number) >= 10000000n, "FORK_POOL_FUNDING_LOW");
    await send(P.pool, C.USDC.address, encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [owner, 10000000n] }));
    await mutate("anvil_stopImpersonatingAccount", [P.pool]);
    await send(owner, C.WETH.address, encodeFunctionData({ abi: parseAbi(["function deposit() payable"]), functionName: "deposit" }), 5n * 10n ** 16n);
    report({ stage: "fixture-funded", localOnly: true, ownerFundsUsed: false });
    // Validate accepted deployed runtimes via the real position reader before producing any LP plans.
    const reader = new TestnetLpPositionReader(source);
    const warmBlock = await reads.getLatestBlock();
    await reads.getLpPoolState(warmBlock.number); await reads.getDependencyConfiguration(warmBlock.number);
    await mineFreshForkBlock(boundary, origin, warmBlock.timestamp, signal);
    await reader.read({ chainId: 84532, owner, cursor: "0", limit: 1 });
    let tokenId: bigint | undefined;
    const state = async () => {
      const before = await reads.getLatestBlock(); await mineFreshForkBlock(boundary, origin, before.timestamp, signal);
      const block = await reads.getLatestBlock();
      const [pool, position, actualOwner] = await Promise.all([reads.getLpPoolState(block.number),
        tokenId === undefined ? undefined : reads.getPosition(tokenId, block.number),
        tokenId === undefined ? undefined : reads.getPositionOwner(tokenId, block.number)]);
      return { pool, position, actualOwner, block };
    };
    const balances = async (block: bigint): Promise<LpForkBalances> => {
      const [usdc, weth, position] = await Promise.all([reads.getTokenBalance(C.USDC.address, owner, block), reads.getTokenBalance(C.WETH.address, owner, block),
        tokenId === undefined ? undefined : reads.getPosition(tokenId, block)]);
      return { USDC: usdc, WETH: weth, liquidity: position?.liquidity ?? 0n, owed0: position?.tokensOwed0 ?? 0n, owed1: position?.tokensOwed1 ?? 0n };
    };
    const approve = async (plan: LpPlan) => {
      for (let round = 0; round < 2; round++) {
        const b = await reads.getLatestBlock();
        const [USDC, WETH] = await Promise.all([reads.getTokenAllowance(C.USDC.address, owner, C.v3PositionManager, b.number), reads.getTokenAllowance(C.WETH.address, owner, C.v3PositionManager, b.number)]);
        const actions = planLpApprovals(plan, { USDC, WETH });
        if (actions.every(a => a.kind === "ready")) return;
        for (const a of actions) if (a.transaction) {
          await send(owner, a.transaction.to, a.transaction.data);
          const latest = await reads.getLatestBlock();
          forkAssert(await reads.getTokenAllowance(C[a.token].address, owner, C.v3PositionManager, latest.number) === BigInt(a.amount), "FORK_LP_APPROVAL_INVALID");
        }
      }
      const b = await reads.getLatestBlock();
      const [a0, a1] = await Promise.all([reads.getTokenAllowance(C.USDC.address, owner, C.v3PositionManager, b.number), reads.getTokenAllowance(C.WETH.address, owner, C.v3PositionManager, b.number)]);
      forkAssert(a0 === BigInt(plan.amount0Desired!) && a1 === BigInt(plan.amount1Desired!), "FORK_LP_APPROVAL_INVALID");
    };
    const deposit = async (kind: "mint" | "increase") => {
      const s = await state(); const i = { kind, wallet: owner, amount0Cap: kind === "mint" ? "1000000" : "100000", amount1Cap: "50000000000000000", deadline: String(Math.floor(Date.now() / 1000) + 30),
        ...(kind === "mint" ? { tickLower: -887220, tickUpper: 887220 } : { tokenId: tokenId!.toString() }) };
      // Exact approvals are read after each confirmation; refresh the deadline afterward.
      const first = planTestnetLp(i, s, Math.floor(Date.now() / 1000)); await approve(first);
      const latest = await reads.getLatestBlock(); await mineFreshForkBlock(boundary, origin, latest.timestamp, signal);
      const plan = planTestnetLp({ ...i, deadline: String(Math.floor(Date.now() / 1000) + 30) }, s, Math.floor(Date.now() / 1000));
      await execute(plan);
    };
    const execute = async (plan: LpPlan) => {
      const b = await reads.getLatestBlock(); const before = await balances(b.number);
      await client.call({ account: owner, to: C.v3PositionManager, data: plan.transaction.data, value: 0n, blockNumber: b.number });
      const gas = await client.estimateGas({ account: owner, to: C.v3PositionManager, data: plan.transaction.data, value: 0n, blockNumber: b.number });
      forkAssert(gas > 0n && gas < 1000000n, "FORK_LP_GAS_INVALID");
      const receipt = await send(owner, C.v3PositionManager, plan.transaction.data);
      const matched = receipt.logs.filter(l => same(l.address, C.v3PositionManager)).flatMap(l => {
        try { return [decodeEventLog({ abi: events, data: l.data, topics: l.topics, strict: true })]; } catch { return []; }
      });
      const event = matched.find(e => e.eventName === (plan.kind === "collect" ? "Collect" : plan.kind === "decrease" ? "DecreaseLiquidity" : "IncreaseLiquidity"));
      forkAssert(event && event.args.amount0 >= 0n && event.args.amount1 >= 0n, "FORK_LP_EVENT_INVALID");
      if (plan.kind === "mint") tokenId = event.args.tokenId;
      forkAssert(event.args.tokenId === tokenId, "FORK_LP_NFT_INVALID");
      if (event.eventName === "Collect") forkAssert(same(event.args.recipient, owner), "FORK_LP_RECIPIENT_INVALID");
      const after = await balances(receipt.blockNumber);
      const liquidity = "liquidity" in event.args ? event.args.liquidity : undefined;
      forkAssert(plan.kind !== "burn", "FORK_LP_EVENT_INVALID");
      let collected0: bigint | undefined; let collected1: bigint | undefined;
      if (plan.kind === "collect") {
        const poolEvents = receipt.logs.filter(l => same(l.address, P.pool)).flatMap(l => {
          try { return [decodeEventLog({ abi: poolCollectAbi, data: l.data, topics: l.topics, strict: true })]; } catch { return []; }
        });
        forkAssert(poolEvents.length === 1, "FORK_LP_POOL_COLLECT_INVALID");
        const paid = poolEvents[0].args; const position = await reads.getPosition(tokenId!, receipt.blockNumber);
        forkAssert(same(paid.owner, C.v3PositionManager) && same(paid.recipient, owner)
          && paid.tickLower === position.tickLower && paid.tickUpper === position.tickUpper, "FORK_LP_POOL_COLLECT_INVALID");
        collected0 = paid.amount0; collected1 = paid.amount1;
        // Pool event reports actual transferred tokens; manager event reports nominal owed.
        report({ stage: "collect-rounding", localOnly: true,
          nominal0: event.args.amount0.toString(), nominal1: event.args.amount1.toString(),
          received0: collected0.toString(), received1: collected1.toString(),
          roundingDust0: (event.args.amount0 - collected0).toString(), roundingDust1: (event.args.amount1 - collected1).toString() });
      }
      reviewLpForkOutcome({ kind: plan.kind, before, after, amount0: event.args.amount0, amount1: event.args.amount1, liquidity, collected0, collected1 });
      if (plan.kind === "mint" || plan.kind === "increase") forkAssert(event.args.amount0 <= BigInt(plan.amount0Desired!) && event.args.amount1 <= BigInt(plan.amount1Desired!), "FORK_LP_CAP_EXCEEDED");
      if (plan.kind === "decrease") forkAssert(event.args.amount0 >= BigInt(plan.amount0Minimum!) && event.args.amount1 >= BigInt(plan.amount1Minimum!) && liquidity === BigInt(plan.liquidity!), "FORK_LP_MINIMUM_INVALID");
      const nft = await reads.getPosition(tokenId!, receipt.blockNumber);
      forkAssert(same(await reads.getPositionOwner(tokenId!, receipt.blockNumber), owner) && same(nft.token0, C.USDC.address) && same(nft.token1, C.WETH.address) && nft.fee === 3000, "FORK_LP_NFT_INVALID");
      report({ stage: plan.kind, localOnly: true, simulationSucceeded: true, gasBounded: true, balancesVerified: true, nftVerified: true, verified: true });
    };
    await deposit("mint"); await deposit("increase");
    for (const full of [false, true]) {
      const s = await state(); const liquidity = full ? s.position!.liquidity : s.position!.liquidity / 2n;
      await execute(planTestnetLp({ kind: "decrease", wallet: owner, tokenId: tokenId!.toString(), liquidity: liquidity.toString(), deadline: String(Math.floor(Date.now() / 1000) + 30) }, s, Math.floor(Date.now() / 1000)));
    }
    const s = await state();
    await execute(planTestnetLp({ kind: "collect", wallet: owner, tokenId: tokenId!.toString() }, s, Math.floor(Date.now() / 1000)));
    const cleared = await state();
    const burn = planTestnetLp({ kind: "burn", wallet: owner, tokenId: tokenId!.toString() }, cleared, Math.floor(Date.now() / 1000));
    await send(owner, C.v3PositionManager, burn.transaction.data);
    for (const token of [C.USDC.address, C.WETH.address]) await send(owner, token, encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [C.v3PositionManager, 0n] }));
    const end = await reads.getLatestBlock();
    forkAssert(await reads.getPositionCount(owner, end.number) === 0n, "FORK_LP_BURN_FAILED");
    for (const token of [C.USDC.address, C.WETH.address]) forkAssert(await reads.getTokenAllowance(token, owner, C.v3PositionManager, end.number) === 0n, "FORK_LP_ALLOWANCE_RESIDUAL");
    await reader.read({ chainId: 84532, owner, cursor: "0", limit: 1 });
    report({ stage: "burn-and-clear", localOnly: true, burned: true, allowancesCleared: true, verified: true });
  });
  report({ status: "testnet-lp-fork-lifecycle-local-only", chainId: 84532, verified: true, snapshotReverted: true, ownerFundsUsed: false, actualTotalFeeQualified: false, executionEnabled: false });
}
