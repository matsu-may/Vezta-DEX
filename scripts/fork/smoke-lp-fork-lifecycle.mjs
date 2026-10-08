// Direct v3 manager lifecycle on a disposable Polygon Anvil fork. No real wallet or upstream writes.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { minimumFromPreview, reviewForkLifecycleOutcome } from "./lp-fork-lifecycle-outcome.mjs";
import { assertLocalForkOrigin, rehearseLpForkMint } from "./smoke-lp-fork-mint.mjs";
import { probeLpForkPreflight } from "./smoke-lp-fork-preflight.mjs";
import { selectLpApiKey } from "../smoke/smoke-lp-pool-info.mjs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { decodeAbiParameters, decodeEventLog, encodeFunctionData, erc20Abi, toHex } = require("viem");
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const UINT128_MAX = (1n << 128n) - 1n;
const ZERO = "0x0000000000000000000000000000000000000000";
const transferEvent = [{ type: "event", name: "Transfer", inputs: [
  { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true },
  { name: "tokenId", type: "uint256", indexed: true },
] }];
const abi = [
  { type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
    { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint24" },
    { type: "int24" }, { type: "int24" }, { type: "uint128" }, { type: "uint256" }, { type: "uint256" },
    { type: "uint128" }, { type: "uint128" },
  ] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "increaseLiquidity", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenId", type: "uint256" }, { name: "amount0Desired", type: "uint256" },
    { name: "amount1Desired", type: "uint256" }, { name: "amount0Min", type: "uint256" },
    { name: "amount1Min", type: "uint256" }, { name: "deadline", type: "uint256" },
  ] }], outputs: [{ type: "uint128" }, { type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "decreaseLiquidity", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" },
    { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ] }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "collect", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
    { name: "tokenId", type: "uint256" }, { name: "recipient", type: "address" },
    { name: "amount0Max", type: "uint128" }, { name: "amount1Max", type: "uint128" },
  ] }], outputs: [{ type: "uint256" }, { type: "uint256" }] },
  { type: "function", name: "burn", stateMutability: "payable", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [] },
];
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };
const same = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

async function send(client, origin, wallet, to, data, gas) {
  assertLocalForkOrigin(origin);
  const hash = await client.request({ method: "eth_sendTransaction", params: [{
    from: wallet, to, data, value: "0x0", ...(gas ? { gas: toHex(gas) } : {}),
  }] });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 30_000 });
  assert(receipt.status === "success", "Local transaction reverted");
  return receipt;
}

export async function rehearseLpForkLifecycle({ client, localOrigin, wallet, tokenId, mintedLiquidity, desired,
  write = line => process.stdout.write(line + "\n") }) {
  let stage = "origin";
  try {
    assertLocalForkOrigin(localOrigin);
    assert(/\banvil\b/i.test(await client.request({ method: "web3_clientVersion" })), "Not Anvil");
    assert(await client.getChainId() === 137, "Wrong chain");
    assert(typeof tokenId === "bigint" && tokenId > 0n && mintedLiquidity > 0n, "Invalid minted position");
    const position = () => client.readContract({ address: MANAGER, abi, functionName: "positions", args: [tokenId] });
    const owner = () => client.readContract({ address: MANAGER, abi, functionName: "ownerOf", args: [tokenId] });
    const balances = async () => ({
      USDC: await client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
      WETH: await client.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [wallet] }),
    });
    const allowances = async () => ({
      USDC: await client.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [wallet, MANAGER] }),
      WETH: await client.readContract({ address: WETH, abi: erc20Abi, functionName: "allowance", args: [wallet, MANAGER] }),
    });
    const first = await position();
    assert(same(await owner(), wallet) && same(first[2], USDC) && same(first[3], WETH)
      && first[4] === 500 && first[7] === mintedLiquidity, "Minted position changed");
    assert(desired?.USDC > 0n && desired?.USDC <= 1_000_000n
      && desired?.WETH > 0n && desired?.WETH <= 1_000_000_000_000_000n, "Unbounded local fixture");

    stage = "increase-fixture";
    // Pool transfers only alter this disposable fork. They do not model market economics.
    for (const [token, address] of [["USDC", USDC], ["WETH", WETH]]) {
      const poolBalance = await client.readContract({ address, abi: erc20Abi, functionName: "balanceOf", args: [POOL] });
      assert(poolBalance >= desired[token], "Pool fixture lacks tokens");
      await send(client, localOrigin, POOL, address,
        encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [wallet, desired[token]] }));
    }
    // Reset mint residue before granting a second exact cap; read it back rather than assuming approval semantics.
    for (const address of [USDC, WETH]) {
      await send(client, localOrigin, wallet, address,
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MANAGER, 0n] }));
    }
    const zeroed = await allowances();
    assert(zeroed.USDC === 0n && zeroed.WETH === 0n, "Residual allowance reset failed");
    for (const [token, address] of [["USDC", USDC], ["WETH", WETH]]) {
      await send(client, localOrigin, wallet, address,
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MANAGER, desired[token]] }));
    }
    const exact = await allowances();
    assert(exact.USDC === desired.USDC && exact.WETH === desired.WETH, "Exact increase allowance missing");
    write(JSON.stringify({ stage: "increase-approval", localOnly: true, residueReset: true, exactApprovals: true }));

    const deadline = (await client.getBlock({ blockTag: "latest" })).timestamp + 600n;
    const simulate = async (name, params, amountIndexes) => {
      const definition = abi.find(item => item.name === name);
      const call = async value => {
        const data = encodeFunctionData({ abi, functionName: name, args: [value] });
        const request = { from: wallet, to: MANAGER, data, value: "0x0" };
        const output = await client.request({ method: "eth_call", params: [request, "latest"] });
        return { request, result: decodeAbiParameters(definition.outputs, output) };
      };
      let { request, result } = await call(params);
      if (amountIndexes) {
        const amount0Min = minimumFromPreview(result[amountIndexes[0]]);
        const amount1Min = minimumFromPreview(result[amountIndexes[1]]);
        ({ request, result } = await call({ ...params, amount0Min, amount1Min }));
        assert(result[amountIndexes[0]] >= amount0Min && result[amountIndexes[1]] >= amount1Min,
          "Local output below preview minimum");
      }
      const gas = BigInt(await client.request({ method: "eth_estimateGas", params: [request] }));
      assert(gas > 0n && gas <= 2_000_000n, "Unbounded local gas");
      const receipt = await send(client, localOrigin, wallet, MANAGER, request.data, gas * 12n / 10n);
      return { result, receipt };
    };

    stage = "increase";
    const beforeIncrease = await balances();
    const increase = await simulate("increaseLiquidity", { tokenId, amount0Desired: desired.USDC,
      amount1Desired: desired.WETH, amount0Min: 0n, amount1Min: 0n, deadline }, [1, 2]);
    const [addedLiquidity, spentUSDC, spentWETH] = increase.result;
    const afterIncreaseBalance = await balances();
    const afterIncreasePosition = await position();
    const ownerAfterIncrease = await owner();
    const afterIncreaseAllowance = await allowances();
    const spendMatches = spentUSDC > 0n && spentUSDC <= desired.USDC
      && spentWETH > 0n && spentWETH <= desired.WETH
      && beforeIncrease.USDC - afterIncreaseBalance.USDC === spentUSDC
      && beforeIncrease.WETH - afterIncreaseBalance.WETH === spentWETH;
    const allowanceResidualMatches = afterIncreaseAllowance.USDC === desired.USDC - spentUSDC
      && afterIncreaseAllowance.WETH === desired.WETH - spentWETH;
    assert(spendMatches && allowanceResidualMatches, "Increase spend or allowance mismatch");
    write(JSON.stringify({ stage: "increase", localOnly: true, spendBounded: spendMatches,
      allowanceResidualMatches }));

    stage = "decrease-partial";
    const firstRemoved = afterIncreasePosition[7] / 2n;
    assert(firstRemoved > 0n && firstRemoved < afterIncreasePosition[7], "Position cannot be partially decreased");
    const partial = await simulate("decreaseLiquidity", { tokenId, liquidity: firstRemoved,
      amount0Min: 0n, amount1Min: 0n, deadline }, [0, 1]);
    const afterPartialPosition = await position();
    const afterPartialBalance = await balances();
    const ownerAfterPartial = await owner();
    stage = "decrease-full";
    const secondRemoved = afterPartialPosition[7];
    assert(secondRemoved > 0n, "No remaining liquidity");
    const full = await simulate("decreaseLiquidity", { tokenId, liquidity: secondRemoved,
      amount0Min: 0n, amount1Min: 0n, deadline }, [0, 1]);
    const afterFullPosition = await position();
    const afterFullBalance = await balances();
    const ownerAfterFull = await owner();
    const noTransferBeforeCollect = afterPartialBalance.USDC === afterIncreaseBalance.USDC
      && afterPartialBalance.WETH === afterIncreaseBalance.WETH
      && afterFullBalance.USDC === afterIncreaseBalance.USDC
      && afterFullBalance.WETH === afterIncreaseBalance.WETH;
    write(JSON.stringify({ stage: "decrease", localOnly: true, partial: true, full: true,
      noWalletTransferBeforeCollect: noTransferBeforeCollect }));

    stage = "collect";
    const beforeCollect = await balances();
    const collection = await simulate("collect", { tokenId, recipient: wallet,
      amount0Max: UINT128_MAX, amount1Max: UINT128_MAX });
    const afterCollect = await balances();
    const afterCollectPosition = await position();
    stage = "burn";
    const burnReceipt = await send(client, localOrigin, wallet, MANAGER,
      encodeFunctionData({ abi, functionName: "burn", args: [tokenId] }));
    const burnedEvent = burnReceipt.logs.filter(log => same(log.address, MANAGER)).some(log => {
      try {
        const event = decodeEventLog({ abi: transferEvent, data: log.data, topics: log.topics });
        return event.eventName === "Transfer" && same(event.args.from, wallet)
          && same(event.args.to, ZERO) && event.args.tokenId === tokenId;
      } catch { return false; }
    });
    let ownerGone = false;
    try { await owner(); } catch { ownerGone = true; }
    const burned = burnedEvent && ownerGone;
    const residualBeforeCleanup = await allowances();
    stage = "allowance-cleanup";
    for (const address of [USDC, WETH]) {
      await send(client, localOrigin, wallet, address,
        encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [MANAGER, 0n] }));
    }
    const finalAllowance = await allowances();
    const checks = reviewForkLifecycleOutcome({
      mintLiquidity: mintedLiquidity, addedLiquidity, afterIncrease: afterIncreasePosition[7],
      firstRemoved, afterPartial: afterPartialPosition[7], secondRemoved, afterFull: afterFullPosition[7],
      owedBefore: { USDC: first[10], WETH: first[11] },
      firstWithdrawal: { USDC: partial.result[0], WETH: partial.result[1] },
      owedAfterPartial: { USDC: afterPartialPosition[10], WETH: afterPartialPosition[11] },
      secondWithdrawal: { USDC: full.result[0], WETH: full.result[1] },
      owedAfterFull: { USDC: afterFullPosition[10], WETH: afterFullPosition[11] },
      collected: { USDC: collection.result[0], WETH: collection.result[1] },
      balancesBeforeCollect: beforeCollect, balancesAfterCollect: afterCollect,
      owedAfterCollect: { USDC: afterCollectPosition[10], WETH: afterCollectPosition[11] },
      receiptsSucceeded: [increase.receipt, partial.receipt, full.receipt, collection.receipt, burnReceipt]
        .every(receipt => receipt.status === "success"),
      ownerMatches: same(ownerAfterIncrease, wallet) && same(ownerAfterPartial, wallet)
        && same(ownerAfterFull, wallet) && noTransferBeforeCollect,
      allowanceResidualMatches: allowanceResidualMatches
        && residualBeforeCleanup.USDC === afterIncreaseAllowance.USDC
        && residualBeforeCleanup.WETH === afterIncreaseAllowance.WETH,
      allowancesCleared: finalAllowance.USDC === 0n && finalAllowance.WETH === 0n,
      burned,
    });
    write(JSON.stringify({ status: "fork-lifecycle-local-only", checks, verified: checks.verified }));
    return checks.verified;
  } catch {
    write(JSON.stringify({ stage, errorKind: "FORK_LIFECYCLE_UNAVAILABLE" }));
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const success = await probeLpForkPreflight({ rpcUrl: process.env.POLYGON_RPC_URL,
    onVerified: context => rehearseLpForkMint({ ...context, apiKey: selectLpApiKey(process.env),
      onMinted: rehearseLpForkLifecycle }) });
  if (!success) process.exitCode = 1;
}
