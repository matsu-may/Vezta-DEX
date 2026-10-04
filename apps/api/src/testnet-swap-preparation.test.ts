import { afterEach, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeAbiParameters, parseAbi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, inspectTestnetSwapTransaction } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_HASH, TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import type { BaseSepoliaPreparationSource } from "./testnet-swap-preparation";
import { delegatedWalletCodeReader } from "./testnet-metamask-wallet.test-helper";

it("prepares the reviewed swap for the proven delegate and rejects changed MetaMask runtime", async () => {
  const { preparer, source, request } = await setup();
  source.getCode = delegatedWalletCodeReader(source.getCode, request.intent.wallet);
  expect(await preparer.read(request)).toMatchObject({ status: "unsigned-prepared", runtimeVerified: true });
  source.getCode = delegatedWalletCodeReader(source.getCode, request.intent.wallet, true);
  await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_METAMASK_RUNTIME_MISMATCH" });
});

const resultData = (output: bigint) => encodeAbiParameters([{ type: "bytes[]" }], [
  [encodeAbiParameters([{ type: "uint256" }], [output])],
]);
afterEach(() => vi.useRealTimers());

async function setup(reverse = false) {
  const { TestnetSwapPreparer } = await import("./testnet-swap-preparation");
  let now = TESTNET_NOW;
  const intent = testnetIntent(reverse);
  const quotes = new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => now);
  const quoted = await quotes.read(intent);
  const source: BaseSepoliaPreparationSource = { ...testnetQuoteSource(),
    async getTokenBalance() { return BigInt(intent.amountIn); }, async getNativeBalance() { return 10n ** 18n; },
    async getTokenAllowance() { return BigInt(intent.amountIn); },
    async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
    async simulateTestnetSwap() { return resultData(BigInt(quoted.quote.amountOut)); },
    async estimateTestnetSwapGas() { return 150001n; }, async getGasPrice() { return 10000000n; },
    async getAdditionalFees() { return { l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 0n, fork: "jovian" as const }; },
  };
  const create = vi.fn<(signal: AbortSignal) => typeof source>(() => source);
  const preparer = new TestnetSwapPreparer(create, quotes.store, () => now);
  return { preparer, source, create, quoted, quotes, request: { intent, quoteId: quoted.quoteId }, setNow: (v: number) => { now = v; } };
}

it.each([false, true])("simulates the original unsigned swap without weakening minimum/deadline (reverse=%s)", async reverse => {
  const { preparer, source, quoted, request, quotes } = await setup(reverse);
  const simulate = vi.spyOn(source, "simulateTestnetSwap");
  const result = await preparer.read(request);
  expect(result).toMatchObject({ status: "unsigned-prepared", reason: null, quoteId: request.quoteId,
    chainId: 84532, accountNonce: "7", blockNumber: "123", runtimeVerified: true, executionEnabled: false,
    minimumAmountOut: reverse ? "2478796" : "396607597000000",
    simulation: { status: "success", amountOut: reverse ? "2491253" : "398600600000000" },
    gas: { estimatedGas: "150001", gasLimit: "180002", gasPrice: "20000000",
      totalFeeBudget: "3606040000000", totalFeeQualified: true },
    transaction: { from: quoted.quote.wallet, to: P.router, nonce: "7", gas: "180002", value: "0" } });
  const prepared = result.transaction!;
  const tx = { chainId: prepared.chainId, from: prepared.from, to: prepared.to, data: prepared.data, value: prepared.value };
  inspectTestnetSwapTransaction(tx, quoted.quote, TESTNET_NOW);
  const outer = decodeFunctionData({ abi: parseAbi(["function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)"]), data: tx.data });
  expect(outer.args?.[0]).toBe(1790800120n);
  expect(simulate.mock.calls[0][1]).toBe(123n);
  expect(quotes.store.read(request.quoteId, request.intent).minimumAmountOut).toBe(quoted.quote.minimumAmountOut);
});

it("returns unfunded or approval-required studies with no swap transaction", async () => {
  const { preparer, source, request } = await setup();
  source.simulateTestnetSwap = async () => { throw new Error("must not simulate"); };
  source.getTokenBalance = async () => 0n;
  expect(await preparer.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_INPUT_BALANCE_LOW", transaction: null, gas: null });
  source.getTokenBalance = async () => 1000000n; source.getNativeBalance = async () => 0n;
  expect(await preparer.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_NATIVE_BALANCE_LOW", transaction: null });
  source.getNativeBalance = async () => 10n ** 18n;
  for (const [allowance, kind] of [[0n, "approve"], [1n, "reset"], [1000001n, "reset"], [2n ** 256n - 1n, "reset"]] as const) {
    source.getTokenAllowance = async () => allowance;
    expect(await preparer.read(request)).toMatchObject({ status: "approval-required", approvalKind: kind,
      transaction: null, simulation: null, gas: null, executionEnabled: false });
  }
});

it("withholds the transaction when ETH covers L2 but not total fees", async () => {
  const { preparer, source, request } = await setup();
  source.getNativeBalance = async () => 3600040000000n;
  expect(await preparer.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_TOTAL_BUDGET_LOW",
    funding: { l2BudgetCovered: true, totalBudgetCovered: false }, transaction: null, simulation: { status: "success" } });
  source.getNativeBalance = async () => 1n;
  expect(await preparer.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_L2_BUDGET_LOW", transaction: null });
});

it("rejects malformed/forged/changed/expired intents before RPC creation", async () => {
  const { preparer, request, create, setNow } = await setup();
  for (const value of [{ ...request, secret: "private" }, { ...request, quoteId: "ab".repeat(24) },
    { ...request, quoteId: "x" }, { ...request, intent: { ...request.intent, amountIn: "100000" } }]) {
    await expect(preparer.read(value)).rejects.toThrow();
  }
  setNow(TESTNET_NOW + 118000);
  await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
  expect(create).not.toHaveBeenCalled();
});

it("rejects changed runtime, EOA, token decimals, nonce and malformed state", async () => {
  for (const change of ["runtime", "wallet", "decimals", "nonce", "allowance", "negative", "older", "chain"]) {
    const { preparer, source, request } = await setup();
    if (change === "runtime" || change === "wallet") { const original = source.getCode;
      source.getCode = async (a, b) => a.toLowerCase() === (change === "runtime" ? P.router : request.intent.wallet).toLowerCase()
        ? "0x6000" : original(a, b); }
    if (change === "decimals") source.getDecimals = async () => 8;
    if (change === "nonce") { let n = 0; source.getPendingNonce = async () => n++ ? 8n : 7n; }
    if (change === "allowance") { let n = 0; source.getTokenAllowance = async () => n++ ? 1n : 1000000n; }
    if (change === "negative") source.getTokenBalance = async () => -1n;
    if (change === "older") { const original = source.getLatestBlock; source.getLatestBlock = async () => ({ ...await original(), number: 122n }); }
    if (change === "chain") source.getChainId = async () => 137;
    await expect(preparer.read(request)).rejects.toThrow();
  }
});

it("checks newer state and original quote canonical hashes separately", async () => {
  const { preparer, source, request } = await setup(); const original = source.getLatestBlock;
  const hash = `0x${"cd".repeat(32)}` as const;
  source.getLatestBlock = async () => ({ ...await original(), number: 124n, hash });
  source.getBlockHash = async b => b === 124n ? hash : TESTNET_HASH;
  expect((await preparer.read(request)).blockNumber).toBe("124");
  for (const wrong of [123n, 124n]) {
    source.getBlockHash = async b => b === wrong ? `0x${"ef".repeat(32)}` : b === 124n ? hash : TESTNET_HASH;
    await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_BLOCK_CHANGED" });
  }
});

it("requires fresh pool identity and rejects excessive impact or output below the original minimum", async () => {
  for (const change of ["token", "factory", "liquidity", "price", "min", "impact", "partial", "spacing", "pool", "dependency"]) {
    const { preparer, source, request, quoted } = await setup();
    const pool = source.getPoolState; const quote = source.quoteExactInput;
    if (["token", "factory", "liquidity", "price"].includes(change)) source.getPoolState = async (a, b) => ({ ...await pool(a, b),
      ...(change === "token" ? { token0: C.WETH.address } : change === "factory" ? { factory: P.router }
        : change === "liquidity" ? { liquidity: 0n } : { sqrtPriceX96: 4295128739n }) });
    if (change === "min" || change === "impact") source.quoteExactInput = async (...args) => ({ ...await quote(...args),
      amountOut: change === "min" ? BigInt(quoted.quote.minimumAmountOut) - 1n : 1n });
    if (change === "partial") source.quoteExactInput = async (...args) => ({ ...await quote(...args), sqrtPriceX96After: 4295128740n });
    if (change === "spacing") source.getTickSpacing = async () => 10;
    if (change === "pool") source.getPool = async () => P.router;
    if (change === "dependency") { const deps = source.getDependencyConfiguration; source.getDependencyConfiguration = async b => ({ ...await deps(b), router: { factory: C.v3Factory, weth: C.WETH.address, positionManager: P.router } }); }
    await expect(preparer.read(request)).rejects.toThrow();
  }
});

it("accepts a better fresh output while keeping the reviewed minimum and original deadline", async () => {
  const { preparer, source, quoted, request, setNow } = await setup();
  const q = source.quoteExactInput; const improved = BigInt(quoted.quote.amountOut) + 1n;
  source.quoteExactInput = async (...args) => ({ ...await q(...args), amountOut: improved });
  source.simulateTestnetSwap = async () => resultData(improved);
  setNow(TESTNET_NOW + 5000);
  const result = await preparer.read(request);
  expect(result.minimumAmountOut).toBe(quoted.quote.minimumAmountOut);
  expect(result.simulation?.amountOut).toBe(improved.toString());
  expect(result.expiresAt).toBe("2026-09-30T20:28:40.000Z");
});

it("rejects reverted, malformed, extra or mismatched simulation output without provider details", async () => {
  const { preparer, source, request, quoted } = await setup(); const amount = BigInt(quoted.quote.amountOut);
  const invalid: Hex[] = ["0x", resultData(amount - 1n), `${resultData(amount)}00`,
    encodeAbiParameters([{ type: "bytes[]" }], [["0x"]]),
    encodeAbiParameters([{ type: "bytes[]" }], [[encodeAbiParameters([{ type: "uint256" }], [amount]), "0x"]])];
  for (const data of invalid) {
    source.simulateTestnetSwap = async () => data;
    await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_SWAP_SIMULATION_FAILED" });
  }
  source.simulateTestnetSwap = async () => { throw new Error("private-rpc-key"); };
  await expect(preparer.read(request)).rejects.toThrow("TESTNET_SWAP_SIMULATION_FAILED");
});

it("bounds swap gas and rejects expiry during simulation or fee reads", async () => {
  const { preparer, source, request, setNow, quoted } = await setup();
  for (const estimate of [0n, 20999n, 500001n]) {
    source.estimateTestnetSwapGas = async () => estimate;
    await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_SWAP_GAS_INVALID" });
  }
  source.estimateTestnetSwapGas = async () => 150001n;
  source.getAdditionalFees = async () => { setNow(TESTNET_NOW + 118000); return { l1FeeUpperBound: 1n, operatorFeeUpperBound: 0n, fork: "jovian" }; };
  await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
  setNow(TESTNET_NOW); source.simulateTestnetSwap = async () => { setNow(TESTNET_NOW + 118000); return resultData(BigInt(quoted.quote.amountOut)); };
  await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
});

it("aborts busy/hung preparation and ignores late completion while allowing a new study", async () => {
  vi.useFakeTimers(); const { preparer, source, request, create } = await setup();
  let resolve!: (n: number) => void; source.getChainId = () => new Promise(r => { resolve = r; });
  const rejected = expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_PREPARE_TIMEOUT" });
  await expect(preparer.read(request)).rejects.toMatchObject({ code: "TESTNET_PREPARE_BUSY" });
  await vi.advanceTimersByTimeAsync(25000); await rejected;
  expect(create.mock.calls[0][0].aborted).toBe(true);
  resolve(84532); await vi.advanceTimersByTimeAsync(0);
  source.getChainId = async () => 84532;
  expect((await preparer.read(request)).status).toBe("unsigned-prepared");
});

it("reviews an allowance-ready quote after 35 seconds using a fresh block and the original minimum", async () => {
  const { preparer, source, request, setNow } = await setup();
  setNow(TESTNET_NOW + 35000);
  source.getLatestBlock = async () => ({ number: 124n, timestamp: 1790800035n, hash: TESTNET_HASH });
  const result = await preparer.read(request);
  expect(result).toMatchObject({ status: "unsigned-prepared", blockNumber: "124", minimumAmountOut: "396607597000000" });
  const decoded = decodeFunctionData({ abi: parseAbi(["function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)"]), data: result.transaction!.data });
  expect(decoded.args?.[0]).toBe(1790800120n);
  source.getLatestBlock = async () => ({ number: 124n, timestamp: 1790800000n, hash: TESTNET_HASH });
  await expect(preparer.read(request)).rejects.toThrow();
});
