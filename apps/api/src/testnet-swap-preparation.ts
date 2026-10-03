import { decodeAbiParameters, encodeAbiParameters, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, buildTestnetSwapTransaction,
  inspectTestnetSwapTransaction, planTestnetTokenApproval, type TestnetSwapTransaction, type TestnetFeeFields } from "@vezta-dex/core";
import { parseTestnetApprovalRequest } from "./testnet-approval";
import type { BaseSepoliaWalletSource } from "./testnet-wallet-state";
import type { BaseSepoliaSwapSource } from "./testnet-swap-quote";
import { TestnetQuoteStore } from "./testnet-quote-store";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
import { planTestnetSourceGas, testnetGasFeeFields, completeTestnetFeeBudget, TestnetFeeError, type TestnetFeeSource } from "./testnet-fees";

export interface BaseSepoliaPreparationSource extends BaseSepoliaWalletSource, BaseSepoliaSwapSource, TestnetFeeSource {
  simulateTestnetSwap(transaction: TestnetSwapTransaction, block: bigint): Promise<Hex>;
  estimateTestnetSwapGas(transaction: TestnetSwapTransaction, block: bigint): Promise<bigint>;
  getGasPrice(): Promise<bigint>;
}
type RequestBody = ReturnType<typeof parseTestnetApprovalRequest>;
type Code = "TESTNET_INTENT_INVALID" | "TESTNET_QUOTE_UNAVAILABLE" | "TESTNET_PREPARE_BUSY"
  | "TESTNET_PREPARE_TIMEOUT" | "TESTNET_RPC_UNAVAILABLE" | "TESTNET_WRONG_CHAIN"
  | "TESTNET_PREPARE_STALE" | "TESTNET_CONFIGURATION_INVALID" | "TESTNET_EOA_REQUIRED"
  | "TESTNET_RUNTIME_MISMATCH" | "TESTNET_STATE_INVALID" | "TESTNET_NONCE_CHANGED"
  | "TESTNET_ALLOWANCE_CHANGED" | "TESTNET_BLOCK_CHANGED" | "TESTNET_SWAP_SIMULATION_FAILED"
  | "TESTNET_SWAP_GAS_INVALID" | "TESTNET_FEE_INVALID" | "TESTNET_FEE_MODEL_UNAVAILABLE"
  | "TESTNET_QUOTE_INVALID" | "TESTNET_IMPACT_EXCEEDED" | "TESTNET_MINIMUM_NOT_MET";
export class TestnetPreparationError extends Error {
  constructor(readonly code: Code) { super(code); }
}
const fail = (code: Code): never => { throw new TestnetPreparationError(code); };
const uint = (v: bigint, bits = 256) => typeof v === "bigint" && v >= 0n && v < 2n ** BigInt(bits);
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const MIN_SQRT = 4295128739n;
const MAX_SQRT = 1461446703485210103287273052203988822378723970342n;
type UnsignedSwap = TestnetSwapTransaction & { nonce: string; gas: string } & TestnetFeeFields;

export class TestnetSwapPreparer {
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaPreparationSource,
    private readonly quotes: TestnetQuoteStore, private readonly now = Date.now) {}

  async read(value: unknown) {
    let request: RequestBody;
    try { request = parseTestnetApprovalRequest(value); } catch { return fail("TESTNET_INTENT_INVALID"); }
    this.quote(request);
    if (this.busy) return fail("TESTNET_PREPARE_BUSY");
    this.busy = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetPreparationError("TESTNET_PREPARE_TIMEOUT")); }, 25000);
      });
      return await Promise.race([this.probe(this.createSource(controller.signal), request, controller.signal), timeout]);
    } catch (error) {
      if (error instanceof TestnetPreparationError) throw error;
      if (error instanceof TestnetFeeError) return fail(error.code);
      return fail("TESTNET_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }

  private quote(request: RequestBody) {
    try { return this.quotes.read(request.quoteId, request.intent); }
    catch { return fail("TESTNET_QUOTE_UNAVAILABLE"); }
  }

  private async probe(source: BaseSepoliaPreparationSource, request: RequestBody, signal: AbortSignal) {
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
        return fail("TESTNET_PREPARE_STALE");
      }
    };
    fresh();
    const dependencies = [P.router, C.v3QuoterV2, C.v3Factory, P.pool, C.v3PositionManager];
    const [walletCode, codes, tokenCodes, decimals, input, eth, allowance, nonce, pending] = await Promise.all([
      source.getCode(i.wallet, block.number), Promise.all(dependencies.map(a => source.getCode(a, block.number))),
      Promise.all([C.USDC.address, C.WETH.address].map(a => source.getCode(a, block.number))),
      Promise.all([source.getDecimals(C.USDC.address, block.number), source.getDecimals(C.WETH.address, block.number)]),
      source.getTokenBalance(i.tokenIn, i.wallet, block.number), source.getNativeBalance(i.wallet, block.number),
      source.getTokenAllowance(i.tokenIn, i.wallet, P.router, block.number),
      source.getAccountNonce(i.wallet, block.number), source.getPendingNonce(i.wallet),
    ]);
    fresh();
    if (walletCode !== "0x") return fail("TESTNET_EOA_REQUIRED");
    if (!tokenCodes.every(c => /^0x(?:[0-9a-fA-F]{2})+$/.test(c)) || decimals[0] !== 6 || decimals[1] !== 18) return fail("TESTNET_CONFIGURATION_INVALID");
    try { verifyTestnetRuntimeCodes(P.chainId, dependencies.map((address, n) => ({ address, code: codes[n] }))); }
    catch { return fail("TESTNET_RUNTIME_MISMATCH"); }
    if (![input, eth, allowance].every(v => uint(v)) || !uint(nonce, 64) || !uint(pending, 64)) return fail("TESTNET_STATE_INVALID");
    if (nonce !== pending) return fail("TESTNET_NONCE_CHANGED");
    const approvalKind = planTestnetTokenApproval(i, allowance).kind;
    const funding = { inputBalanceSufficient: input >= BigInt(i.amountIn), nativeEthPositive: eth > 0n,
      l2BudgetCovered: null as boolean | null, totalBudgetCovered: null as boolean | null };
    let status: "blocked" | "approval-required" | "unsigned-prepared" = "blocked";
    let reason: "TESTNET_INPUT_BALANCE_LOW" | "TESTNET_NATIVE_BALANCE_LOW" | "TESTNET_L2_BUDGET_LOW" | "TESTNET_TOTAL_BUDGET_LOW" | null = null;
    let gas: ReturnType<typeof completeTestnetFeeBudget> | null = null;
    let simulation: { status: "success"; amountOut: string } | null = null;
    let transaction: UnsignedSwap | null = null; let priceImpactBps: number | null = null;
    if (!funding.inputBalanceSufficient) reason = "TESTNET_INPUT_BALANCE_LOW";
    else if (!funding.nativeEthPositive) reason = "TESTNET_NATIVE_BALANCE_LOW";
    else if (approvalKind !== "ready") status = "approval-required";
    else {
      const [pool, state, spacing, deps] = await Promise.all([
        source.getPool(P.feeTier, block.number), source.getPoolState(P.pool, block.number),
        source.getTickSpacing(P.pool, block.number), source.getDependencyConfiguration(block.number),
      ]);
      fresh();
      if (!same(pool, P.pool) || !same(state.token0, C.USDC.address) || !same(state.token1, C.WETH.address)
        || !same(state.factory, C.v3Factory) || state.fee !== P.feeTier || spacing !== 60
        || !uint(state.liquidity, 128) || state.liquidity === 0n || !uint(state.sqrtPriceX96, 160)
        || state.sqrtPriceX96 <= MIN_SQRT || state.sqrtPriceX96 >= MAX_SQRT
        || ![deps.router, deps.quoter, deps.manager].every(d => same(d.factory, C.v3Factory) && same(d.weth, C.WETH.address))
        || !same(deps.router.positionManager, C.v3PositionManager)) return fail("TESTNET_CONFIGURATION_INVALID");
      const q = await source.quoteExactInput(i.tokenIn, i.tokenOut, BigInt(i.amountIn), P.feeTier, block.number);
      fresh();
      const forward = same(i.tokenIn, C.USDC.address); const ratio = state.sqrtPriceX96 ** 2n; const Q192 = 2n ** 192n;
      const spot = BigInt(i.amountIn) * 997000n * (forward ? ratio : Q192) / (1000000n * (forward ? Q192 : ratio));
      if (spot <= 0n || !uint(q.amountOut) || q.amountOut === 0n || q.amountOut > spot
        || !uint(q.gasEstimate) || q.gasEstimate === 0n || !uint(q.sqrtPriceX96After, 160)
        || q.sqrtPriceX96After <= MIN_SQRT + 1n || q.sqrtPriceX96After >= MAX_SQRT - 1n
        || (forward ? q.sqrtPriceX96After > state.sqrtPriceX96 : q.sqrtPriceX96After < state.sqrtPriceX96)
        || !Number.isInteger(q.initializedTicksCrossed) || q.initializedTicksCrossed < 0
        || q.initializedTicksCrossed > 1774544) return fail("TESTNET_QUOTE_INVALID");
      priceImpactBps = Number(((spot - q.amountOut) * 10000n + spot - 1n) / spot);
      if (priceImpactBps > 100) return fail("TESTNET_IMPACT_EXCEEDED");
      if (q.amountOut < BigInt(quote.minimumAmountOut)) return fail("TESTNET_MINIMUM_NOT_MET");
      const tx = buildTestnetSwapTransaction(quote, this.now());
      inspectTestnetSwapTransaction(tx, quote, this.now());
      let output: bigint;
      try {
        const data = await source.simulateTestnetSwap(tx, block.number);
        fresh();
        // One canonical bytes[] result with one canonical uint256; no trailing/extra data.
        if (data.length > 514) return fail("TESTNET_SWAP_SIMULATION_FAILED");
        const [results] = decodeAbiParameters([{ type: "bytes[]" }], data);
        if (results.length !== 1 || results[0].length !== 66
          || encodeAbiParameters([{ type: "bytes[]" }], [results]).toLowerCase() !== data.toLowerCase()) return fail("TESTNET_SWAP_SIMULATION_FAILED");
        [output] = decodeAbiParameters([{ type: "uint256" }], results[0]);
      } catch (error) {
        if (error instanceof TestnetPreparationError) throw error;
        return fail("TESTNET_SWAP_SIMULATION_FAILED");
      }
      if (output !== q.amountOut || output < BigInt(quote.minimumAmountOut)) return fail("TESTNET_SWAP_SIMULATION_FAILED");
      const estimate = await source.estimateTestnetSwapGas(tx, block.number);
      fresh();
      let planned;
      try { planned = await planTestnetSourceGas(source, block.number, estimate, "swap"); } catch { return fail("TESTNET_SWAP_GAS_INVALID"); }
      const additional = await source.getAdditionalFees({ ...tx, ...testnetGasFeeFields(planned) }, nonce, planned.gasLimit, planned.gasPrice, block.number);
      fresh(); gas = completeTestnetFeeBudget(planned, additional); simulation = { status: "success", amountOut: output.toString() };
      funding.l2BudgetCovered = eth >= BigInt(gas.l2FeeCeiling); funding.totalBudgetCovered = eth >= BigInt(gas.totalFeeBudget);
      if (!funding.l2BudgetCovered) reason = "TESTNET_L2_BUDGET_LOW";
      else if (!funding.totalBudgetCovered) reason = "TESTNET_TOTAL_BUDGET_LOW";
      else { status = "unsigned-prepared"; transaction = { ...tx, nonce: nonce.toString(), gas: gas.gasLimit, ...testnetGasFeeFields(planned) }; }
    }
    const [stateHash, quoteHash, finalPending, finalAllowance] = await Promise.all([
      source.getBlockHash(block.number), source.getBlockHash(BigInt(quote.blockNumber)),
      source.getPendingNonce(i.wallet), source.getTokenAllowance(i.tokenIn, i.wallet, P.router, block.number),
    ]);
    fresh();
    if (!same(stateHash, block.hash) || !same(quoteHash, quote.blockHash)) return fail("TESTNET_BLOCK_CHANGED");
    if (!uint(finalPending, 64) || finalPending !== nonce) return fail("TESTNET_NONCE_CHANGED");
    if (!uint(finalAllowance) || finalAllowance !== allowance) return fail("TESTNET_ALLOWANCE_CHANGED");
    return { status, reason, chainId: P.chainId, quoteId: request.quoteId, intent: i, approvalKind,
      blockNumber: block.number.toString(), blockHash: block.hash,
      observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
      expiresAt: new Date(Date.parse(quote.observedAt) + 30000).toISOString(), source: "base-sepolia-rpc" as const,
      minimumAmountOut: quote.minimumAmountOut, priceImpactBps, accountNonce: nonce.toString(),
      inputBalance: input.toString(), nativeBalance: eth.toString(), currentAllowance: allowance.toString(),
      funding, simulation, gas, transaction, runtimeVerified: true as const, executionEnabled: false as const };
  }
}
