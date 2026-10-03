import { afterEach, expect, it, vi } from "vitest";
import { decodeFunctionData, parseAbi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import type { BaseSepoliaApprovalSource } from "./testnet-approval";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import { delegatedWalletCodeReader } from "./testnet-metamask-wallet.test-helper";

it("prepares exact approval for the proven MetaMask delegate and rejects a changed runtime", async () => {
  const { reader, source, request } = await setup();
  source.getCode = delegatedWalletCodeReader(source.getCode, request.intent.wallet);
  expect(await reader.read(request)).toMatchObject({ status: "unsigned-prepared", approvalKind: "approve",
    transaction: { from: "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e", value: "0" } });
  source.getCode = delegatedWalletCodeReader(source.getCode, request.intent.wallet, true);
  await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_METAMASK_RUNTIME_MISMATCH" });
});

const TRUE = `0x${"0".repeat(63)}1` as Hex;
const abi = parseAbi(["function approve(address spender,uint256 value) returns (bool)"]);
afterEach(() => vi.useRealTimers());

async function setup(reverse = false) {
  const { TestnetApprovalReader } = await import("./testnet-approval");
  let now = TESTNET_NOW;
  const intent = reverse ? { ...testnetIntent(), tokenIn: C.WETH.address, tokenOut: C.USDC.address,
    amountIn: "100000000000000" } : testnetIntent();
  const quotes = new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => now);
  const quoted = await quotes.read(intent);
  const source: BaseSepoliaApprovalSource & ReturnType<typeof testnetQuoteSource> = { ...testnetQuoteSource(),
    async getTokenBalance() { return 100000000000000n; }, async getNativeBalance() { return 10n ** 18n; },
    async getTokenAllowance() { return 0n; }, async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
    async simulateApproval() { return TRUE; }, async estimateApprovalGas() { return 50000n; },
    async getGasPrice() { return 10000000n; },
    async getAdditionalFees() { return { l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 1000000000n, fork: "jovian" as const }; },
  };
  const create = vi.fn<(signal: AbortSignal) => typeof source>(() => source);
  const reader = new TestnetApprovalReader(create, quotes.store, () => now);
  return { reader, source, create, quotes, request: { intent, quoteId: quoted.quoteId }, setNow: (value: number) => { now = value; } };
}

it.each([false, true])("builds only an exact unsigned approval after real runtime/state/simulation checks (reverse=%s)", async reverse => {
  const { reader, source, quotes, request } = await setup(reverse);
  const simulate = vi.spyOn(source, "simulateApproval");
  const result = await reader.read(request);
  expect(result).toMatchObject({ status: "unsigned-prepared", approvalKind: "approve", quoteId: request.quoteId,
    chainId: 84532, accountNonce: "7", blockNumber: "123", runtimeVerified: true, executionEnabled: false,
    simulation: { status: "success" }, gas: { estimatedGas: "50000", gasLimit: "60000", gasPrice: "20000000",
      l2FeeCeiling: "1200000000000", totalFeeBudget: "1208000000000", totalFeeQualified: true },
    transaction: { from: "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e", to: request.intent.tokenIn, value: "0", nonce: "7",
      gas: "60000", gasPrice: "20000000" } });
  expect(decodeFunctionData({ abi, data: result.transaction!.data })).toEqual({ functionName: "approve",
    args: [P.router, BigInt(request.intent.amountIn)] });
  expect(simulate.mock.calls[0][1]).toBe(123n);
  expect(quotes.store.read(request.quoteId, request.intent).wallet.toLowerCase()).toBe(request.intent.wallet.toLowerCase());
});

it("requires reset for every nonzero differing allowance and allows reset without input tokens", async () => {
  const { reader, source, request } = await setup(); source.getTokenBalance = async () => 0n;
  for (const allowance of [1n, 1000001n, 2n ** 256n - 1n]) {
    source.getTokenAllowance = async () => allowance;
    const result = await reader.read(request);
    expect(result.status).toBe("unsigned-prepared"); expect(result.approvalKind).toBe("reset");
    expect(decodeFunctionData({ abi, data: result.transaction!.data }).args).toEqual([P.router, 0n]);
    expect(result.funding.inputBalanceSufficient).toBe(false);
  }
});

it("blocks a reset without native ETH even though it does not require input tokens", async () => {
  const { reader, source, request } = await setup();
  source.getTokenAllowance = async () => 1n; source.getTokenBalance = async () => 0n;
  source.getNativeBalance = async () => 0n;
  source.simulateApproval = async () => { throw new Error("must not simulate an unfunded reset"); };
  expect(await reader.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_NATIVE_BALANCE_LOW",
    approvalKind: "reset", transaction: null, simulation: null, gas: null, executionEnabled: false });
});

it("checks quote and newer state block hashes independently before returning a transaction", async () => {
  const { reader, source, request } = await setup();
  const originalBlock = source.getLatestBlock;
  const stateHash = `0x${"cd".repeat(32)}` as const; const quoteHash = `0x${"ab".repeat(32)}` as const;
  source.getLatestBlock = async () => ({ ...await originalBlock(), number: 124n, hash: stateHash });
  source.getBlockHash = async block => block === 124n ? stateHash : quoteHash;
  expect((await reader.read(request)).blockNumber).toBe("124");
  for (const wrongBlock of [123n, 124n]) {
    source.getBlockHash = async block => block === wrongBlock ? `0x${"ef".repeat(32)}` as const
      : block === 124n ? stateHash : quoteHash;
    await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_BLOCK_CHANGED" });
  }
});

it("returns ready without a transaction or simulation when allowance is exact", async () => {
  const { reader, source, request } = await setup(); source.getTokenAllowance = async () => 1000000n;
  source.simulateApproval = async () => { throw new Error("must not simulate"); };
  expect(await reader.read(request)).toMatchObject({ status: "allowance-ready", approvalKind: "ready",
    transaction: null, gas: null, simulation: null, executionEnabled: false });
});

it("returns valid blocked studies without calldata for unfunded input/native/L2 budget", async () => {
  const { reader, source, request } = await setup();
  source.getTokenBalance = async () => 0n;
  expect(await reader.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_INPUT_BALANCE_LOW", transaction: null });
  source.getTokenBalance = async () => 1000000n; source.getNativeBalance = async () => 0n;
  expect(await reader.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_NATIVE_BALANCE_LOW", transaction: null });
  source.getNativeBalance = async () => 1n;
  expect(await reader.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_L2_BUDGET_LOW",
    transaction: null, gas: { totalFeeQualified: true }, executionEnabled: false });
  source.getNativeBalance = async () => 1200000000000n;
  expect(await reader.read(request)).toMatchObject({ status: "blocked", reason: "TESTNET_TOTAL_BUDGET_LOW",
    transaction: null, funding: { l2BudgetCovered: true, totalBudgetCovered: false } });
});

it("rejects malformed, forged, expired and misbound requests before creating an RPC source", async () => {
  const { reader, request, create, setNow } = await setup();
  for (const input of [{ ...request, secret: "private" }, { ...request, quoteId: "x" },
    { ...request, quoteId: "ab".repeat(24) }, { ...request, intent: { ...request.intent, amountIn: "100000" } }]) {
    await expect(reader.read(input)).rejects.toThrow();
  }
  setNow(TESTNET_NOW + 28000);
  await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
  expect(create).not.toHaveBeenCalled();
});

it("blocks changed runtime, wallet code, decimals, canonical hashes, nonce and allowance", async () => {
  for (const change of ["runtime", "wallet", "decimals", "hash", "pending", "allowance", "older", "invalid-balance"]) {
    const { reader, source, request } = await setup();
    if (change === "runtime" || change === "wallet") { const original = source.getCode;
      source.getCode = async (a, b) => a.toLowerCase() === (change === "runtime" ? P.router : request.intent.wallet).toLowerCase()
        ? "0x6000" : original(a, b); }
    if (change === "decimals") source.getDecimals = async () => 8;
    if (change === "hash") source.getBlockHash = async () => `0x${"cd".repeat(32)}`;
    if (change === "pending") { let calls = 0; source.getPendingNonce = async () => calls++ ? 8n : 7n; }
    if (change === "allowance") { let calls = 0; source.getTokenAllowance = async () => calls++ ? 1n : 0n; }
    if (change === "older") { const original = source.getLatestBlock;
      source.getLatestBlock = async () => ({ ...await original(), number: 122n }); }
    if (change === "invalid-balance") source.getTokenBalance = async () => -1n;
    await expect(reader.read(request)).rejects.toThrow();
  }
});

it("rejects false, empty or reverted approval simulation without exposing provider details", async () => {
  const { reader, source, request } = await setup();
  for (const returned of ["0x", `0x${"0".repeat(64)}`, `0x${"0".repeat(63)}2`]) {
    source.simulateApproval = async () => returned as Hex;
    await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_APPROVAL_SIMULATION_FAILED" });
  }
  source.simulateApproval = async () => { throw new Error("private-rpc-key"); };
  await expect(reader.read(request)).rejects.toThrow("TESTNET_APPROVAL_SIMULATION_FAILED");
});

it("bounds gas/price, rejects quote expiry during simulation, and rounds buffered gas up", async () => {
  const { reader, source, request, setNow } = await setup();
  for (const gas of [0n, 20999n, 200001n]) {
    source.estimateApprovalGas = async () => gas;
    await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_APPROVAL_GAS_INVALID" });
  }
  source.estimateApprovalGas = async () => 50001n;
  expect((await reader.read(request)).gas?.gasLimit).toBe("60002");
  for (const price of [0n, 1000000000001n]) {
    source.getGasPrice = async () => price;
    await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_APPROVAL_GAS_INVALID" });
  }
  source.getGasPrice = async () => 10000000n;
  source.simulateApproval = async () => { setNow(TESTNET_NOW + 28000); return TRUE; };
  await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
});

it("aborts busy/hung studies and ignores late completion while recovering for the next request", async () => {
  vi.useFakeTimers(); const { reader, source, request, create } = await setup();
  let finish!: (value: number) => void;
  source.getChainId = () => new Promise(resolve => { finish = resolve; });
  const failure = expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_APPROVAL_TIMEOUT" });
  await expect(reader.read(request)).rejects.toMatchObject({ code: "TESTNET_APPROVAL_BUSY" });
  await vi.advanceTimersByTimeAsync(25000); await failure;
  expect(create.mock.calls[0][0].aborted).toBe(true);
  finish(84532); await vi.advanceTimersByTimeAsync(0);
  source.getChainId = async () => 84532;
  expect((await reader.read(request)).status).toBe("unsigned-prepared");
});
