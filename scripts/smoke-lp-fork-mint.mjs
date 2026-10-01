// Disposable Polygon Anvil rehearsal only. Never connect a wallet or submit to the upstream RPC.
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { planForkMint } from "./lp-fork-mint-plan.mjs";
import { reviewForkMintOutcome } from "./lp-fork-outcome.mjs";
import { probeLpForkPreflight } from "./smoke-lp-fork-preflight.mjs";
import { selectLpApiKey } from "./smoke-lp-pool-info.mjs";

const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { decodeAbiParameters, decodeEventLog, decodeFunctionData, encodeFunctionData, erc20Abi, toHex } = require("viem");
const WALLET = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e"; // Public test EOA; no key is used.
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const POOL = "0xA4D8c89f0c20efbe54cBa9e7e7a7E509056228D9";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const ZERO = "0x0000000000000000000000000000000000000000";
const MINT_ABI = [{ type: "function", name: "mint", stateMutability: "payable", inputs: [{ name: "params", type: "tuple", components: [
  { name: "token0", type: "address" }, { name: "token1", type: "address" }, { name: "fee", type: "uint24" },
  { name: "tickLower", type: "int24" }, { name: "tickUpper", type: "int24" },
  { name: "amount0Desired", type: "uint256" }, { name: "amount1Desired", type: "uint256" },
  { name: "amount0Min", type: "uint256" }, { name: "amount1Min", type: "uint256" },
  { name: "recipient", type: "address" }, { name: "deadline", type: "uint256" },
] }], outputs: [
  { name: "tokenId", type: "uint256" }, { name: "liquidity", type: "uint128" },
  { name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" },
] }];
const POSITION_ABI = [{ type: "function", name: "positions", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [
  { type: "uint96" }, { type: "address" }, { type: "address" }, { type: "address" }, { type: "uint24" },
  { type: "int24" }, { type: "int24" }, { type: "uint128" }, { type: "uint256" }, { type: "uint256" },
  { type: "uint128" }, { type: "uint128" },
] }, { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] }];
const TRANSFER_ABI = [{ type: "event", name: "Transfer", inputs: [
  { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true },
  { name: "tokenId", type: "uint256", indexed: true },
] }];
const same = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();
const assert = (condition, reason) => { if (!condition) throw new Error(reason); };

export function assertLocalForkOrigin(origin) {
  const url = new URL(origin);
  assert(url.protocol === "http:" && url.hostname === "127.0.0.1" && /^\d+$/.test(url.port)
    && Number(url.port) > 0 && Number(url.port) <= 65535 && !url.username && !url.password
    && url.pathname === "/" && !url.search && !url.hash && origin === `http://127.0.0.1:${url.port}`,
  "Not a local Anvil origin");
  return origin;
}

async function localSend(client, origin, tx) {
  assertLocalForkOrigin(origin);
  const hash = await client.request({ method: "eth_sendTransaction", params: [{
    from: tx.from, to: tx.to, data: tx.data, value: "0x0", ...(tx.gas ? { gas: tx.gas } : {}),
  }] });
  const receipt = await client.waitForTransactionReceipt({ hash, timeout: 30_000 });
  assert(receipt.status === "success", "Local transaction reverted");
  return receipt;
}

export async function rehearseLpForkMint({ client, localOrigin, sourceBlock, apiKey, fetcher = fetch,
  now = Date.now, write = line => process.stdout.write(line + "\n"), onMinted }) {
  let stage = "origin";
  try {
    assertLocalForkOrigin(localOrigin);
    assert(/\banvil\b/i.test(await client.request({ method: "web3_clientVersion" })), "Not Anvil");
    assert(await client.getChainId() === 137, "Wrong fork chain");
    const pinned = await client.getBlock({ blockNumber: sourceBlock.number });
    assert(same(pinned.hash, sourceBlock.hash), "Fork block changed");
    const fresh = () => now() - Number(sourceBlock.timestamp) * 1000 <= 120_000;
    assert(fresh(), "Source block stale");
    assert(typeof apiKey === "string" && apiKey.trim(), "No LP API key");
    stage = "create";
    const response = await fetcher("https://liquidity.api.uniswap.org/lp/create", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-api-key": apiKey.trim() },
      body: JSON.stringify({ walletAddress: WALLET, protocol: "V3", chainId: 137,
        existingPool: { token0Address: USDC, token1Address: WETH, poolReference: POOL },
        independentToken: { tokenAddress: USDC, amount: "1000000" },
        tickBounds: { tickLower: -887270, tickUpper: 887270 }, slippageTolerance: 0.5, simulateTransaction: false }),
      signal: AbortSignal.timeout(12_000),
    });
    assert(response.ok, "LP create unavailable");
    const body = await response.json();
    const plan = planForkMint({ body, wallet: WALLET, nowSeconds: Math.floor(now() / 1000) });
    const mint = decodeFunctionData({ abi: MINT_ABI, data: plan.transaction.data }).args[0];
    const minimum = { USDC: mint.amount0Min, WETH: mint.amount1Min };
    assert(fresh(), "Source block stale");
    stage = "fixture";
    const code = await client.getCode({ address: WALLET });
    assert(!code || code === "0x", "Fixture account is a contract");
    const balances = async owner => ({ USDC: await client.readContract({ address: USDC, abi: erc20Abi, functionName: "balanceOf", args: [owner] }),
      WETH: await client.readContract({ address: WETH, abi: erc20Abi, functionName: "balanceOf", args: [owner] }) });
    const allowances = async () => ({ USDC: await client.readContract({ address: USDC, abi: erc20Abi, functionName: "allowance", args: [WALLET, MANAGER] }),
      WETH: await client.readContract({ address: WETH, abi: erc20Abi, functionName: "allowance", args: [WALLET, MANAGER] }) });
    const initial = await balances(WALLET);
    const initialAllowance = await allowances();
    assert(initial.USDC === 0n && initial.WETH === 0n && initialAllowance.USDC === 0n && initialAllowance.WETH === 0n,
      "Fixture account has token balance or standing allowance");
    assert(await client.getTransactionCount({ address: WALLET, blockTag: "pending" })
      === await client.getTransactionCount({ address: WALLET, blockTag: "latest" }), "Fixture pending nonce");
    const poolBalances = await balances(POOL);
    assert(poolBalances.USDC >= plan.desired.USDC && poolBalances.WETH >= plan.desired.WETH, "Pool fixture lacks tokens");
    // All three changes affect this disposable Anvil process only. Pool transfers perturb reserves; this is a wiring rehearsal.
    assertLocalForkOrigin(localOrigin);
    await client.request({ method: "anvil_setBalance", params: [WALLET, toHex(10n ** 18n)] });
    await client.request({ method: "anvil_setBalance", params: [POOL, toHex(10n ** 18n)] });
    for (const [token, address] of [["USDC", USDC], ["WETH", WETH]]) {
      const data = encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [WALLET, plan.desired[token]] });
      await localSend(client, localOrigin, { from: POOL, to: address, data });
    }
    const beforeMint = await balances(WALLET);
    assert(beforeMint.USDC === plan.desired.USDC && beforeMint.WETH === plan.desired.WETH, "Fixture funding mismatch");
    stage = "approval";
    for (const tx of plan.approvals) await localSend(client, localOrigin, tx);
    const readyAllowance = await allowances();
    assert(readyAllowance.USDC === plan.desired.USDC && readyAllowance.WETH === plan.desired.WETH,
      "Exact local allowances missing");
    write(JSON.stringify({ stage: "approval", localOnly: true, exactApprovals: true }));
    stage = "simulation";
    assert(fresh(), "Source block stale");
    const request = { from: WALLET, to: MANAGER, data: plan.transaction.data, value: "0x0" };
    const result = await client.request({ method: "eth_call", params: [request, "latest"] });
    const [tokenId, liquidity, amount0, amount1] = decodeAbiParameters(MINT_ABI[0].outputs, result);
    const gas = BigInt(await client.request({ method: "eth_estimateGas", params: [request] }));
    assert(gas > 0n && gas <= 2_000_000n, "Unbounded mint gas");
    write(JSON.stringify({ stage: "simulation", localOnly: true, success: true, gasBounded: true }));
    stage = "mint";
    const receipt = await localSend(client, localOrigin, { ...request, gas: toHex(gas * 12n / 10n) });
    const minted = receipt.logs.filter(log => same(log.address, MANAGER)).flatMap(log => {
      try { const event = decodeEventLog({ abi: TRANSFER_ABI, data: log.data, topics: log.topics });
        return event.eventName === "Transfer" && same(event.args.from, ZERO) && same(event.args.to, WALLET)
          ? [event.args.tokenId] : []; } catch { return []; }
    });
    assert(minted.length === 1, "Expected one minted NFT");
    const owner = await client.readContract({ address: MANAGER, abi: POSITION_ABI, functionName: "ownerOf", args: [minted[0]] });
    const fields = await client.readContract({ address: MANAGER, abi: POSITION_ABI, functionName: "positions", args: [minted[0]] });
    const afterMint = await balances(WALLET);
    const resultChecks = reviewForkMintOutcome({ wallet: WALLET, desired: plan.desired, minimum,
      simulation: { tokenId, liquidity, USDC: amount0, WETH: amount1 }, receiptStatus: receipt.status,
      mintedTokenId: minted[0], position: { owner, token0: fields[2], token1: fields[3], fee: fields[4],
        tickLower: fields[5], tickUpper: fields[6], liquidity: fields[7] },
      balancesBefore: beforeMint, balancesAfter: afterMint });
    const residual = await allowances();
    const allowanceResidualMatches = residual.USDC === plan.desired.USDC - amount0
      && residual.WETH === plan.desired.WETH - amount1;
    const verified = resultChecks.verified && allowanceResidualMatches;
    write(JSON.stringify({ status: "fork-mint-local-only", checks: { ...resultChecks, allowanceResidualMatches }, verified }));
    if (!verified || !onMinted) return verified;
    stage = "post-mint";
    return await onMinted({ client, localOrigin, wallet: WALLET, tokenId: minted[0],
      mintedLiquidity: liquidity, desired: plan.desired });
  } catch {
    write(JSON.stringify({ stage, errorKind: "FORK_MINT_UNAVAILABLE" }));
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const success = await probeLpForkPreflight({ rpcUrl: process.env.POLYGON_RPC_URL,
    onVerified: context => rehearseLpForkMint({ ...context, apiKey: selectLpApiKey(process.env) }) });
  if (!success) process.exitCode = 1;
}
