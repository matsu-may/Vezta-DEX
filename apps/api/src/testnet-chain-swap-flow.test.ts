import { expect, it } from "vitest";
import { gunzipSync } from "node:zlib";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as B, testnetChainConfig } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetWalletStateReader } from "./testnet-wallet-state";
import { TestnetApprovalReader } from "./testnet-approval";
import { TestnetSwapPreparer } from "./testnet-swap-preparation";
import { TestnetActionStore, TestnetRechecker } from "./testnet-action";
import { TestnetReceiptReader } from "./testnet-receipt";
import { TESTNET_NOW, testnetQuoteSource } from "./testnet-quote.test-helper";
const cfg = testnetChainConfig(1301), C = cfg.candidate, P = cfg.policy;
const wallet = "0x1111111111111111111111111111111111111111" as const;
function source() {
  const codes = JSON.parse(gunzipSync(readFileSync(new URL("fixtures/unichain-sepolia-runtime.json.gz", import.meta.url))).toString()).contracts as {address: string; code: Hex}[];
  const b = testnetQuoteSource(); let allowance = 0n;
  const s = { ...b, getChainId: async () => 1301, getPool: async () => P.pool,
    getDecimals: async (a: string) => a.toLowerCase() === C.USDC.address.toLowerCase() ? 6 : 18,
    getCode: async (a: string) => a === wallet ? "0x" as const : codes.find(c => c.address.toLowerCase() === a.toLowerCase())?.code ?? "0x6001" as const,
    getPoolState: async () => ({...await b.getPoolState(P.pool, 123n), token0: C.USDC.address, token1: C.WETH.address, factory: C.v3Factory}),
    getDependencyConfiguration: async () => ({router: {factory: C.v3Factory, weth: C.WETH.address, positionManager: C.v3PositionManager},
      quoter: {factory: C.v3Factory, weth: C.WETH.address}, manager: {factory: C.v3Factory, weth: C.WETH.address}}),
    quoteExactInput: async (a: Hex, out: Hex, amount: bigint, fee: number, block: bigint) =>
      b.quoteExactInput(a.toLowerCase() === C.USDC.address.toLowerCase() ? B.USDC.address : B.WETH.address, out, amount, fee, block),
    getTokenBalance: async () => 10n ** 18n, getNativeBalance: async () => 10n ** 18n,
    getTokenAllowance: async () => allowance, getAccountNonce: async () => 7n, getPendingNonce: async () => 7n,
    simulateApproval: async () => `0x${"0".repeat(63)}1` as Hex, estimateApprovalGas: async () => 50000n,
    simulateTestnetSwap: async (tx: {data: Hex}) => {
      // Canonical output of the deterministic pool, checked against the real quote by the preparer.
      const amount = tx.data.length > 0 ? 398600600000000n : 0n;
      return encodeAbiParameters([{type: "bytes[]"}], [[encodeAbiParameters([{type: "uint256"}], [amount])]]);
    },
    estimateTestnetSwapGas: async () => 150000n, getGasPrice: async () => 10000000n,
    getAdditionalFees: async () => ({l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 0n, fork: "jovian" as const}),
  };
  return {s, allowance: (v: bigint) => { allowance = v; }};
}
const intent = {chainId: 1301, wallet, tokenIn: C.USDC.address, tokenOut: C.WETH.address, amountIn: "1000000", slippageBps: 50} as const;
it("prepares Unichain EOA exact approval and swap with original-chain persisted recovery", async () => {
  const dir = mkdtempSync(join(tmpdir(), "dex-uni-swap-"));
  try {
    const f = source(), quotes = new TestnetSwapQuoteReader(() => f.s, undefined, () => TESTNET_NOW, 1301);
    const q = await quotes.read(intent), request = {intent, quoteId: q.quoteId};
    const states = new TestnetWalletStateReader(() => f.s, () => TESTNET_NOW, 1301);
    expect(await states.read(intent)).toMatchObject({chainId: 1301, source: cfg.source, accountKind: "eoa"});
    const approval = new TestnetApprovalReader(() => f.s, quotes.store, () => TESTNET_NOW, 1301);
    const a = await approval.read(request);
    expect(a).toMatchObject({chainId: 1301, source: cfg.source, status: "unsigned-prepared"});
    expect(decodeFunctionData({abi: erc20Abi, data: a.transaction!.data}).args).toEqual([P.router, 1000000n]);
    f.allowance(1000000n);
    const preparer = new TestnetSwapPreparer(() => f.s, quotes.store, () => TESTNET_NOW, 1301);
    const prepared = await preparer.read(request);
    expect(prepared).toMatchObject({status: "unsigned-prepared", chainId: 1301, source: cfg.source, transaction: {to: P.router}});
    const contexts = new TestnetActionStore(() => TESTNET_NOW, 128, dir, 1301);
    const checked = await new TestnetRechecker(approval, preparer, quotes.store, contexts, 1301).read({...request, kind: "swap"});
    expect(checked.action?.chainId).toBe(1301);
    const id = checked.action!.contextId, hash = `0x${"cc".repeat(32)}` as Hex;
    contexts.markSubmissionAttempted(id); contexts.bindHash(id, hash);
    const restarted = new TestnetActionStore(() => TESTNET_NOW, 128, dir, 1301);
    expect(restarted.read(id)).toMatchObject({intent: {chainId: 1301}, originalHash: hash, submissionAttempted: true});
    expect(() => new TestnetActionStore(() => TESTNET_NOW, 128, dir)).toThrow();
    const t = restarted.read(id).transaction, blockHash = `0x${"dd".repeat(32)}` as Hex, headHash = `0x${"ee".repeat(32)}` as Hex;
    const tx = {hash, type: "legacy", chainId: 1301, from: wallet, to: t.to, input: t.data,
      value: 0n, nonce: 7, gas: BigInt(t.gas), gasPrice: BigInt(t.gasPrice), blockNumber: 125n, blockHash};
    const log = (token: Hex, from: Hex, to: Hex, amount: bigint) => ({address: token, blockNumber: 125n, blockHash, transactionHash: hash,
      topics: encodeEventTopics({abi: erc20Abi, eventName: "Transfer", args: {from, to}}) as Hex[], data: encodeAbiParameters([{type: "uint256"}], [amount])});
    const receipt = {transactionHash: hash, from: wallet, to: t.to, blockNumber: 125n, blockHash, status: "success" as const,
      gasUsed: 100000n, effectiveGasPrice: BigInt(t.gasPrice), logs: [log(C.USDC.address, wallet, P.pool, 1000000n), log(C.WETH.address, P.pool, wallet, BigInt(q.quote.amountOut))]};
    const rpc = {...f.s, getLatestBlock: async () => ({number: 126n, timestamp: 1790800000n, hash: headHash}),
      getBlockHash: async (n: bigint) => n === 125n ? blockHash : headHash, getTransaction: async () => tx, getReceipt: async () => receipt};
    const reader = new TestnetReceiptReader(() => rpc, restarted, () => TESTNET_NOW, 1301);
    expect(await reader.observe({contextId: id, hash})).toMatchObject({status: "confirmed", chainId: 1301, source: cfg.source,
      execution: {status: "verified", amountIn: "1000000", amountOut: q.quote.amountOut, actualTotalFeeQualified: false}});
    tx.chainId = 84532;
    expect(await reader.observe({contextId: id, hash})).toMatchObject({status: "unverified", diagnostic: "transaction-mismatch"});
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
it("rejects delegated Unichain wallets and cross-chain intent/store before issuing economics", async () => {
  const f = source(), quotes = new TestnetSwapQuoteReader(() => f.s, undefined, () => TESTNET_NOW, 1301);
  const q = await quotes.read(intent);
  const code = f.s.getCode;
  f.s.getCode = async a => a === wallet ? "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b" : code(a);
  const approval = new TestnetApprovalReader(() => f.s, quotes.store, () => TESTNET_NOW, 1301);
  const preparer = new TestnetSwapPreparer(() => f.s, quotes.store, () => TESTNET_NOW, 1301);
  await expect(approval.read({intent, quoteId: q.quoteId})).rejects.toMatchObject({code: "TESTNET_EOA_REQUIRED"});
  await expect(preparer.read({intent, quoteId: q.quoteId})).rejects.toMatchObject({code: "TESTNET_EOA_REQUIRED"});
  await expect(new TestnetWalletStateReader(() => f.s, () => TESTNET_NOW, 1301).read(intent)).rejects.toMatchObject({code: "TESTNET_EOA_REQUIRED"});
  await expect(approval.read({intent: {...intent, chainId: 84532}, quoteId: q.quoteId})).rejects.toMatchObject({code: "TESTNET_INTENT_INVALID"});
  expect(() => new TestnetApprovalReader(() => f.s, quotes.store, () => TESTNET_NOW)).toThrow();
});
