import { expect, it, vi } from "vitest";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

it("reports both unfunded preparation studies without exposing wallet/calldata/provider details", async () => {
  const { runTestnetPrepareProbe } = await import("./testnet-prepare-probe");
  const { TestnetSwapPreparer } = await import("./testnet-swap-preparation");
  const create = () => {
    const quotes = new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => TESTNET_NOW);
    const source = { ...testnetQuoteSource(), async getTokenBalance() { return 0n; }, async getNativeBalance() { return 0n; },
      async getTokenAllowance() { return 0n; }, async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
      async simulateTestnetSwap() { throw new Error("must not simulate"); }, async estimateTestnetSwapGas() { throw new Error("must not estimate"); },
      async getGasPrice() { return 1n; }, async getAdditionalFees() { throw new Error("must not read fees"); } };
    return { quotes, preparer: new TestnetSwapPreparer(() => source, quotes.store, () => TESTNET_NOW) };
  };
  const rows = await runTestnetPrepareProbe(testnetIntent().wallet, create);
  expect(rows).toHaveLength(2);
  for (const row of rows) expect(row).toMatchObject({ status: "testnet-swap-preparation-study", chainId: 84532,
    studyStatus: "blocked", reason: "TESTNET_INPUT_BALANCE_LOW", runtimeVerified: true,
    quoteIdMatches: true, simulationSucceeded: false, totalFeeQualified: false,
    transactionPresent: false, executionEnabled: false });
  expect(JSON.stringify(rows)).not.toContain(testnetIntent().wallet.toLowerCase());
  const bad = vi.fn(create);
  expect(await runTestnetPrepareProbe("invalid-wallet", bad)).toEqual([{ status: "testnet-swap-preparation-unavailable", code: "TESTNET_INTENT_INVALID" }]);
  expect(bad).not.toHaveBeenCalled();
  const failures = await runTestnetPrepareProbe(testnetIntent().wallet, () => { throw new Error("private-rpc-key"); });
  expect(failures).toEqual([{ status: "testnet-swap-preparation-unavailable", direction: "USDC_TO_WETH", code: "TESTNET_RPC_UNAVAILABLE" }]);
});
