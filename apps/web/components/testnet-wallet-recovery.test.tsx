// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import fixtures from "../lib/fixtures/testnet-wallet-browser.json";
import { parseTestnetSubmission, parseTestnetWalletObservation } from "../lib/testnet-wallet-contracts";
import type { TestnetWalletController, TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import { TestnetWalletRecovery } from "./testnet-wallet-recovery";
afterEach(cleanup);
it("distinguishes the original approval event from a subsequently changed current allowance", () => {
  const f = fixtures["forward-approve"]; const hash = `0x${"11".repeat(32)}`;
  const submission = parseTestnetSubmission({ version: 1, intent: f.intent, quote: f.quote.quote, action: f.checked.action, attemptedAt: f.now, hash });
  const observation = parseTestnetWalletObservation({ observation: { contextId: submission.action.contextId, hash, kind: "approve", chainId: 84532,
    source: "base-sepolia-rpc", observedAt: new Date(f.now).toISOString(), executionEnabled: false, status: "confirmed", confirmations: "2",
    blockNumber: "124", blockHash: `0x${"cd".repeat(32)}`, execution: { status: "verified", amountIn: "0", amountOut: "0", approvedAmount: f.intent.amountIn,
      l2GasCost: "123", actualTotalFeeQualified: false, balances: { USDC: "1000000", WETH: "0", ETH: "100" }, tokenAllowance: "0", allowanceMatchesExpected: false,
      stateBlockNumber: "125", stateBlockHash: `0x${"ef".repeat(32)}` } } }, submission, f.now);
  const state: TestnetWalletSnapshot = { stage: "confirmed", busy: false, message: "", account: null, quote: null, action: null, review: null, submission, observation };
  render(<TestnetWalletRecovery state={state} controller={{} as TestnetWalletController} />);
  expect(screen.getByText("Original approval event amount")).toBeTruthy();
  expect(screen.getByText("Current allowance")).toBeTruthy();
  expect(screen.getByRole("alert").textContent).toContain("Allowance has changed");
});
