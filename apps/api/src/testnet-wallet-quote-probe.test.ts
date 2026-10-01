import { expect, it, vi } from "vitest";
import { runTestnetWalletQuoteProbe } from "./testnet-wallet-quote-probe";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

it("validates the wallet before source creation and emits bounded diagnostics for both directions", async () => {
  const create = vi.fn(() => new TestnetSwapQuoteReader(() => testnetQuoteSource(), undefined, () => TESTNET_NOW));
  expect(await runTestnetWalletQuoteProbe("bad", create, () => TESTNET_NOW))
    .toEqual([{ status: "testnet-wallet-quote-unavailable", code: "TESTNET_INTENT_INVALID" }]);
  expect(create).not.toHaveBeenCalled();
  const results = await runTestnetWalletQuoteProbe(testnetIntent().wallet, create, () => TESTNET_NOW);
  expect(results).toHaveLength(2);
  for (const result of results) {
    expect(result).toMatchObject({ status: "testnet-wallet-quote-read-only", checks: {
      intentMatches: true, minimumValid: true, quoteFresh: true, opaqueQuoteId: true,
      configurationVerified: true, runtimeVerified: false, executionEnabled: false,
    } });
    expect(JSON.stringify(result)).not.toContain(testnetIntent().wallet);
    expect(JSON.stringify(result)).not.toContain("data");
  }
});

it("does not echo unknown provider errors or continue after failure", async () => {
  const result = await runTestnetWalletQuoteProbe(testnetIntent().wallet,
    () => { throw new Error("secret RPC URL"); });
  expect(result).toEqual([{ status: "testnet-wallet-quote-unavailable", direction: "USDC_TO_WETH", code: "TESTNET_RPC_UNAVAILABLE" }]);
});
