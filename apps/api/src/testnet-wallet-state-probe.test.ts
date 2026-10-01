import { expect, it, vi } from "vitest";
import { runTestnetWalletStateProbe } from "./testnet-wallet-state-probe";
import { TestnetWalletStateReader } from "./testnet-wallet-state";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

it("validates CLI intent without RPC and reports unfunded state as successful reads", async () => {
  const s = { ...testnetQuoteSource(), async getTokenBalance() { return 0n; },
    async getNativeBalance() { return 0n; }, async getTokenAllowance() { return 0n; },
    async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; } };
  const create = vi.fn(() => new TestnetWalletStateReader(() => s, () => TESTNET_NOW));
  expect(await runTestnetWalletStateProbe(undefined, create))
    .toEqual({ status: "testnet-wallet-state-unavailable", code: "TESTNET_INTENT_INVALID" });
  expect(create).not.toHaveBeenCalled();
  const result = await runTestnetWalletStateProbe(testnetIntent().wallet, create);
  expect(result).toMatchObject({ status: "testnet-wallet-state-read-only", verified: true,
    funding: { inputBalanceSufficient: false, nativeEthPositive: false }, approvalKind: "approve", executionEnabled: false });
  expect(JSON.stringify(result)).not.toContain(testnetIntent().wallet);
  expect(await runTestnetWalletStateProbe(testnetIntent().wallet, () => { throw new Error("private key URL"); }))
    .toEqual({ status: "testnet-wallet-state-unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
});
