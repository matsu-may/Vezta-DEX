// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { getAddress } from "viem";
import fixtures from "../fixtures/testnet-wallet-browser.json";
import { parseTestnetWalletQuote, parseTestnetWalletReview } from "../lib/testnet-wallet-contracts";
import { parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetWalletReview } from "./testnet-wallet-review";

afterEach(cleanup);
it.each([false, true])("shows reviewed fee model and caps without calling EIP-1559 caps an actual gas price (dynamic=%s)", dynamic => {
  const f = structuredClone(fixtures["forward-swap"]);
  if (dynamic) {
    const fees = { feeModel: "eip1559", maxFeePerGas: f.checked.action.transaction.gasPrice, maxPriorityFeePerGas: "1000000" };
    Object.assign(f.checked.action.transaction, fees); Object.assign(f.checked.study.transaction, fees); Object.assign(f.checked.study.gas, fees);
  }
  const quote = parseTestnetWalletQuote(f.quote, parseTestnetSwapIntent(f.intent), f.now);
  const review = parseTestnetWalletReview(f.checked, quote, "swap", f.now);
  render(<TestnetWalletReview state={{ stage: "action-review", busy: false, message: "", account: getAddress(f.intent.wallet),
    quote, review: review.study, action: review.action, submission: null, observation: null }} />);
  expect(screen.getByText("Fee model")).toBeTruthy();
  expect(screen.getByText(dynamic ? "EIP-1559" : "Legacy")).toBeTruthy();
  if (dynamic) {
    expect(screen.getByText("Maximum fee per gas")).toBeTruthy();
    expect(screen.getByText("Maximum priority fee per gas")).toBeTruthy();
    expect(screen.queryByText("Gas price")).toBeNull();
  } else expect(screen.getByText("Gas price")).toBeTruthy();
});

it.each([
  ["forward-swap", "0.0003986006 WETH", "0.000396607597 WETH"],
  ["reverse-swap", "2.491253 USDC", "2.478796 USDC"],
] as const)("shows quoted estimate and minimum before approval in compact mode (%s)", (direction, estimate, minimum) => {
  const f = fixtures[direction];
  const quote = parseTestnetWalletQuote(f.quote, parseTestnetSwapIntent(f.intent), f.now);
  render(<TestnetWalletReview compact showTransaction={false} state={{ stage: "quote-review", busy: false, message: "", account: getAddress(f.intent.wallet),
    quote, review: null, action: null, submission: null, observation: null }} />);
  const summary = within(screen.getByRole("region", { name: "Wallet quote" }));
  expect(summary.getByText("Estimated received")).toBeTruthy();
  expect(summary.getByText("Minimum received")).toBeTruthy();
  expect(summary.getByText(estimate)).toBeTruthy();
  expect(summary.getByText(minimum)).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Transaction review" })).toBeNull();
});
