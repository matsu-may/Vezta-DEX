// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DemoSwapActions } from "./demo-swap-actions";
import type { TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import fixtures from "../lib/fixtures/testnet-wallet-browser.json";
afterEach(cleanup);
it('opens wallet selection from the primary action without quoting or submitting', () => {
  const onConnect = vi.fn();
  const calls = mount({account:null, quote:null}, {onConnect});
  fireEvent.click(screen.getByRole('button', {name:'Connect wallet'}));
  expect(onConnect).toHaveBeenCalledOnce();
  expect(calls.quote).not.toHaveBeenCalled(); expect(calls.submit).not.toHaveBeenCalled();
});
function mount(patch: Partial<TestnetWalletSnapshot> = {}, options = {}) {
  const f = fixtures['forward-swap'];
  const state = { account: f.intent.wallet, quote: f.quote, action: null, review: null, busy: false, ...patch } as unknown as TestnetWalletSnapshot;
  const quote = vi.fn(); const review = vi.fn(); const submit = vi.fn();
  render(<DemoSwapActions state={state} busy={false} fresh reviewFresh canSubmit onQuote={quote} onReview={review} onSubmit={submit} {...options} />);
  return { quote, review, submit };
}
it('offers one primary review and never submits before the reviewed action exists', () => {
  const calls = mount(); fireEvent.click(screen.getByRole('button', { name: 'Review swap' }));
  expect(calls.review).toHaveBeenCalledWith('swap'); expect(calls.submit).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Submit reviewed testnet transaction' })).toBeNull();
});
it('directs an approval-required result into approval review rather than submission', () => {
  const calls = mount({ review: { status: 'approval-required' } as TestnetWalletSnapshot['review'] });
  fireEvent.click(screen.getByRole('button', { name: 'Review approval' })); expect(calls.review).toHaveBeenCalledWith('approval'); expect(calls.submit).not.toHaveBeenCalled();
});
it('requires a new quote when the reviewed action expires', () => {
  const f = fixtures['forward-swap']; const calls = mount({ action: f.checked.action as unknown as TestnetWalletSnapshot['action'] }, { reviewFresh: false });
  fireEvent.click(screen.getByRole('button', { name: 'Get wallet quote' })); expect(calls.quote).toHaveBeenCalledOnce(); expect(calls.submit).not.toHaveBeenCalled();
});
it('retains explicit execution gating on the sole submit action', () => {
  const f = fixtures['forward-swap']; mount({ action: f.checked.action as unknown as TestnetWalletSnapshot['action'] }, { canSubmit: false });
  expect(screen.getByRole('button', { name: 'Submit reviewed testnet transaction' }).hasAttribute('disabled')).toBe(true);
});
it('reopens prepared review without submitting and leaves execution gating to its modal', () => {
  const f = fixtures['forward-swap']; const open = vi.fn();
  const calls = mount({action:f.checked.action as unknown as TestnetWalletSnapshot['action']}, {onOpenReview:open,canSubmit:false});
  fireEvent.click(screen.getByRole('button',{name:'Review prepared transaction'}));
  expect(open).toHaveBeenCalledOnce();expect(calls.submit).not.toHaveBeenCalled();
});
