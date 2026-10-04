import type { TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";

/** Presentation only: controller reviews and submission gates remain authoritative. */
export function DemoSwapActions({ state, busy, fresh, reviewFresh, canSubmit, onQuote, onReview, onSubmit }: {
  state: TestnetWalletSnapshot; busy: boolean; fresh: boolean; reviewFresh: boolean; canSubmit: boolean;
  onQuote: () => void; onReview: (kind: "swap" | "approval") => void; onSubmit: () => void;
}) {
  const needsQuote = !state.quote || !fresh || (!!state.action && !reviewFresh);
  const needsApproval = state.review?.status === "approval-required";
  const label = needsQuote ? "Get wallet quote" : state.action ? "Submit reviewed testnet transaction" : needsApproval ? "Review approval" : "Review swap";
  const disabled = busy || !state.account || (!needsQuote && !!state.action && !canSubmit);
  const act = () => needsQuote ? onQuote() : state.action ? onSubmit() : onReview(needsApproval ? "approval" : "swap");
  return <div className="swap-action-stack">
    <button className="button swap-primary-action" disabled={disabled} onClick={act}>{label}</button>
    {state.quote && <div className="swap-secondary-actions">
      <button className="text-action" disabled={busy} onClick={onQuote}>Refresh quote</button>
      <details className="swap-review-options"><summary>More review options</summary><div>
        <button className="text-action" disabled={busy || !fresh} onClick={() => onReview("approval")}>Check token approval</button>
      </div></details>
    </div>}
  </div>;
}
