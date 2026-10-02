// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
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
it("requires explicit unresolved acknowledgement to archive an unverified approval, never a swap", async () => {
  const f = fixtures["forward-approve"]; const hash = `0x${"11".repeat(32)}`;
  const submission = parseTestnetSubmission({ version: 1, intent: f.intent, quote: f.quote.quote, action: f.checked.action, attemptedAt: f.now, hash });
  const state: TestnetWalletSnapshot = { stage: "unverified", busy: false, message: "", account: null, quote: null, action: null, review: null, submission, observation: null };
  const controller = { archiveUnverifiedApproval: vi.fn() } as unknown as TestnetWalletController;
  const view = render(<TestnetWalletRecovery state={state} controller={controller} />);
  expect(screen.queryByRole("button", { name: "Acknowledge verified result" })).toBeNull();
  const button = screen.getByRole("button", { name: "Archive approval for manual review" });
  expect(button.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("checkbox")); fireEvent.click(button);
  expect(controller.archiveUnverifiedApproval).toHaveBeenCalledOnce();
  const next = fixtures["forward-reset"];
  const nextRecord = parseTestnetSubmission({ version: 1, intent: next.intent, quote: next.quote.quote, action: next.checked.action, attemptedAt: next.now, hash: `0x${"22".repeat(32)}` });
  view.rerender(<TestnetWalletRecovery state={{ ...state, submission: nextRecord }} controller={controller} />);
  expect(screen.getByRole("button", { name: "Archive approval for manual review" }).hasAttribute("disabled")).toBe(true);
});
