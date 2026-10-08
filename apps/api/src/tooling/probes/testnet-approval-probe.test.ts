import { expect, it, vi } from "vitest";
import { TestnetSwapQuoteReader } from "../../modules/swap/testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "../../modules/swap/testnet-quote.test-helper";

it("reports both unfunded approval studies without wallet/calldata/provider secrets or a send", async () => {
  const { TestnetApprovalReader } = await import("../../modules/swap/testnet-approval");
  const { runTestnetApprovalProbe } = await import("./testnet-approval-probe");
  const source = { ...testnetQuoteSource(), async getTokenBalance() { return 0n; },
    async getNativeBalance() { return 0n; }, async getTokenAllowance() { return 0n; },
    async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
    async simulateApproval() { throw new Error("must not simulate"); },
    async estimateApprovalGas() { throw new Error("must not estimate"); }, async getGasPrice() { return 1n; },
    async getAdditionalFees() { throw new Error("must not read fees"); } };
  const create = vi.fn(() => {
    const quotes = new TestnetSwapQuoteReader(() => source, undefined, () => TESTNET_NOW);
    return { quotes, approvals: new TestnetApprovalReader(() => source, quotes.store, () => TESTNET_NOW) };
  });
  expect(await runTestnetApprovalProbe("bad", create)).toEqual([{ status: "testnet-approval-unavailable", code: "TESTNET_INTENT_INVALID" }]);
  expect(create).not.toHaveBeenCalled();
  const rows = await runTestnetApprovalProbe(testnetIntent().wallet, create);
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row).toMatchObject({ status: "testnet-approval-study", studyStatus: "blocked", approvalKind: "approve",
      reason: "TESTNET_INPUT_BALANCE_LOW", runtimeVerified: true, transactionPresent: false,
      executionEnabled: false, funding: { inputBalanceSufficient: false, nativeEthPositive: false } });
    expect(JSON.stringify(row)).not.toContain(testnetIntent().wallet);
    expect(JSON.stringify(row)).not.toContain("data");
  }
  expect(await runTestnetApprovalProbe(testnetIntent().wallet, () => { throw new Error("private-provider-key"); }))
    .toEqual([{ status: "testnet-approval-unavailable", direction: "USDC_TO_WETH", code: "TESTNET_RPC_UNAVAILABLE" }]);
});
