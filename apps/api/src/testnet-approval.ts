import { createTestnetSwapDomain, testnetChainConfig } from "@vezta-dex/core";
import { z } from "zod";
import type { Hex } from "viem";
import {  classifyTestnetWalletCode, type TestnetSwapTransaction, type TestnetChainId, type TestnetFeeFields } from "@vezta-dex/core";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";
import { TestnetQuoteStore } from "./testnet-quote-store";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
import { verifyTestnetMetaMaskRuntime } from "./testnet-metamask-runtime";
import { planTestnetSourceGas, testnetGasFeeFields, completeTestnetFeeBudget, TestnetFeeError, type TestnetFeeSource } from "./testnet-fees";

export interface BaseSepoliaApprovalSource extends BaseSepoliaWalletSource, TestnetFeeSource {
  simulateApproval(transaction: TestnetSwapTransaction<TestnetChainId>, block: bigint): Promise<Hex>;
  estimateApprovalGas(transaction: TestnetSwapTransaction<TestnetChainId>, block: bigint): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
}
const requestSchema = z.object({ intent: z.unknown(), quoteId: z.string().regex(/^[a-f0-9]{48}$/) }).strict();
export function parseTestnetApprovalRequest<I extends TestnetChainId = 84532>(value: unknown, chainId: I = 84532 as I) {
  const request = requestSchema.parse(value);
  return { intent: createTestnetSwapDomain(chainId).parseTestnetSwapIntent(request.intent), quoteId: request.quoteId };
}
type RequestBody<I extends TestnetChainId> = ReturnType<typeof parseTestnetApprovalRequest<I>>;
type Code = "TESTNET_INTENT_INVALID" | "TESTNET_QUOTE_UNAVAILABLE" | "TESTNET_APPROVAL_BUSY"
  | "TESTNET_APPROVAL_TIMEOUT" | "TESTNET_RPC_UNAVAILABLE" | "TESTNET_WRONG_CHAIN"
  | "TESTNET_APPROVAL_STALE" | "TESTNET_CONFIGURATION_INVALID" | "TESTNET_EOA_REQUIRED"
  | "TESTNET_RUNTIME_MISMATCH" | "TESTNET_METAMASK_RUNTIME_MISMATCH" | "TESTNET_STATE_INVALID" | "TESTNET_NONCE_CHANGED"
  | "TESTNET_ALLOWANCE_CHANGED" | "TESTNET_BLOCK_CHANGED" | "TESTNET_APPROVAL_SIMULATION_FAILED"
  | "TESTNET_APPROVAL_GAS_INVALID" | "TESTNET_FEE_INVALID" | "TESTNET_FEE_MODEL_UNAVAILABLE";
export class TestnetApprovalError extends Error {
  constructor(readonly code: Code) { super(code); }
}
const fail = (code: Code): never => { throw new TestnetApprovalError(code); };
const uint = (value: bigint, bits = 256) => typeof value === "bigint" && value >= 0n && value < 2n ** BigInt(bits);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
type GasStudy = ReturnType<typeof completeTestnetFeeBudget>;
type UnsignedApproval<I extends TestnetChainId> = TestnetSwapTransaction<I> & { nonce: string; gas: string } & TestnetFeeFields;

export class TestnetApprovalReader<I extends TestnetChainId = 84532> {
  private readonly config;
  private readonly domain;
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaApprovalSource,
    private readonly quotes: TestnetQuoteStore<I>, private readonly now = Date.now, readonly chainId: I = 84532 as I) {
    this.config = testnetChainConfig(chainId); this.domain = createTestnetSwapDomain(chainId);
    if (quotes.chainId !== chainId) throw new Error("Quote store chain mismatch");
  }

  async read(value: unknown) {
    let request: RequestBody<I>;
    try { request = parseTestnetApprovalRequest(value, this.chainId); } catch { return fail("TESTNET_INTENT_INVALID"); }
    this.quote(request);
    if (this.busy) return fail("TESTNET_APPROVAL_BUSY");
    this.busy = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetApprovalError("TESTNET_APPROVAL_TIMEOUT")); }, 25000);
      });
      return await Promise.race([this.probe(this.createSource(controller.signal), request, controller.signal), timeout]);
    } catch (error) {
      if (error instanceof TestnetApprovalError) throw error;
      if (error instanceof TestnetFeeError) return fail(error.code);
      return fail("TESTNET_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }

  private quote(request: RequestBody<I>) {
    try { return this.quotes.read(request.quoteId, request.intent); }
    catch { return fail("TESTNET_QUOTE_UNAVAILABLE"); }
  }

  private async probe(source: BaseSepoliaApprovalSource, request: RequestBody<I>, signal: AbortSignal) {
    const { candidate: C, policy: P } = this.config;
    const i = request.intent; const quote = this.quote(request);
    if (await source.getChainId() !== P.chainId) return fail("TESTNET_WRONG_CHAIN");
    signal.throwIfAborted();
    const block = await source.getLatestBlock();
    const fresh = () => {
      this.quote(request); signal.throwIfAborted();
      const now = this.now(); const time = Number(block.timestamp) * 1000;
      if (!Number.isSafeInteger(now) || now < 0 || block.number < BigInt(quote.blockNumber)
        || block.number <= 0n || !Number.isSafeInteger(time) || time <= 0 || time > now + 10000
        || now - time >= 30000 || !/^0x[0-9a-fA-F]{64}$/.test(block.hash) || BigInt(block.hash) === 0n) {
        return fail("TESTNET_APPROVAL_STALE");
      }
    };
    fresh();
    const dependencies = [P.router, C.v3QuoterV2, C.v3Factory, quote.pool, C.v3PositionManager];
    const [code, codes, tokenCodes, decimals, input, eth, allowance, nonce, pending] = await Promise.all([
      source.getCode(i.wallet, block.number), Promise.all(dependencies.map(a => source.getCode(a, block.number))),
      Promise.all([C.USDC.address, C.WETH.address].map(a => source.getCode(a, block.number))),
      Promise.all([source.getDecimals(C.USDC.address, block.number), source.getDecimals(C.WETH.address, block.number)]),
      source.getTokenBalance(i.tokenIn, i.wallet, block.number), source.getNativeBalance(i.wallet, block.number),
      source.getTokenAllowance(i.tokenIn, i.wallet, P.router, block.number),
      source.getAccountNonce(i.wallet, block.number), source.getPendingNonce(i.wallet),
    ]);
    fresh();
    let accountKind: ReturnType<typeof classifyTestnetWalletCode>;
    try { accountKind = classifyTestnetWalletCode(code); } catch { return fail("TESTNET_EOA_REQUIRED"); }
    if (accountKind === "metamask-delegated") {
      if (this.chainId !== 84532) return fail("TESTNET_EOA_REQUIRED");
      try { await verifyTestnetMetaMaskRuntime(source, block.number); }
      catch { return fail("TESTNET_METAMASK_RUNTIME_MISMATCH"); }
      fresh();
    }
    if (!tokenCodes.every(c => /^0x(?:[0-9a-fA-F]{2})+$/.test(c)) || decimals[0] !== 6 || decimals[1] !== 18) {
      return fail("TESTNET_CONFIGURATION_INVALID");
    }
    try { verifyTestnetRuntimeCodes(P.chainId, dependencies.map((address, n) => ({ address, code: codes[n] })), quote.feeTier); }
    catch { return fail("TESTNET_RUNTIME_MISMATCH"); }
    if (![input, eth, allowance].every(v => uint(v)) || !uint(nonce, 64) || !uint(pending, 64)) return fail("TESTNET_STATE_INVALID");
    if (nonce !== pending) return fail("TESTNET_NONCE_CHANGED");
    const plan = this.domain.planTestnetTokenApproval(i, allowance);
    const funding = { inputBalanceSufficient: input >= BigInt(i.amountIn), nativeEthPositive: eth > 0n,
      l2BudgetCovered: null as boolean | null, totalBudgetCovered: null as boolean | null };
    let status: "blocked" | "allowance-ready" | "unsigned-prepared" = "blocked";
    let reason: "TESTNET_INPUT_BALANCE_LOW" | "TESTNET_NATIVE_BALANCE_LOW" | "TESTNET_L2_BUDGET_LOW" | "TESTNET_TOTAL_BUDGET_LOW" | null = null;
    let gas: GasStudy | null = null; let transaction: UnsignedApproval<I> | null = null;
    let simulation: { status: "success" } | null = null;
    if (plan.kind !== "reset" && !funding.inputBalanceSufficient) reason = "TESTNET_INPUT_BALANCE_LOW";
    else if (!funding.nativeEthPositive) reason = "TESTNET_NATIVE_BALANCE_LOW";
    else if (plan.kind === "ready") status = "allowance-ready";
    else {
      let returned: Hex;
      try { returned = await source.simulateApproval(plan.transaction, block.number); }
      catch { return fail("TESTNET_APPROVAL_SIMULATION_FAILED"); }
      fresh();
      if (returned.toLowerCase() !== `0x${"0".repeat(63)}1`) return fail("TESTNET_APPROVAL_SIMULATION_FAILED");
      const estimate = await source.estimateApprovalGas(plan.transaction, block.number);
      fresh();
      let planGas;
      try { planGas = await planTestnetSourceGas(source, block.number, estimate, "approval"); } catch { return fail("TESTNET_APPROVAL_GAS_INVALID"); }
      const additional = await source.getAdditionalFees({ ...plan.transaction, ...testnetGasFeeFields(planGas) }, nonce, planGas.gasLimit, planGas.gasPrice, block.number);
      fresh();
      gas = completeTestnetFeeBudget(planGas, additional);
      simulation = { status: "success" }; funding.l2BudgetCovered = eth >= BigInt(gas.l2FeeCeiling);
      funding.totalBudgetCovered = eth >= BigInt(gas.totalFeeBudget);
      if (!funding.l2BudgetCovered) reason = "TESTNET_L2_BUDGET_LOW";
      else if (!funding.totalBudgetCovered) reason = "TESTNET_TOTAL_BUDGET_LOW";
      else {
        status = "unsigned-prepared";
        transaction = { ...plan.transaction, nonce: nonce.toString(), gas: gas.gasLimit, ...testnetGasFeeFields(planGas) };
      }
    }
    const [stateHash, quoteHash, finalPending, finalAllowance] = await Promise.all([
      source.getBlockHash(block.number), source.getBlockHash(BigInt(quote.blockNumber)),
      source.getPendingNonce(i.wallet), source.getTokenAllowance(i.tokenIn, i.wallet, P.router, block.number),
    ]);
    fresh();
    if (!same(stateHash, block.hash) || !same(quoteHash, quote.blockHash)) return fail("TESTNET_BLOCK_CHANGED");
    if (!uint(finalPending, 64) || finalPending !== nonce) return fail("TESTNET_NONCE_CHANGED");
    if (!uint(finalAllowance) || finalAllowance !== allowance) return fail("TESTNET_ALLOWANCE_CHANGED");
    return { status, reason, chainId: P.chainId, quoteId: request.quoteId, intent: i,
      blockNumber: block.number.toString(), blockHash: block.hash,
      observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      expiresAt: this.domain.testnetQuoteExpiresAt(quote), source: this.config.source,
      accountNonce: nonce.toString(), inputBalance: input.toString(), nativeBalance: eth.toString(),
      currentAllowance: allowance.toString(), approvalKind: plan.kind, funding, simulation, gas, transaction,
      runtimeVerified: true as const, executionEnabled: false as const };
  }
}
