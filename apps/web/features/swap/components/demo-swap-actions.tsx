import type { TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";

/** Presentation only: controller reviews and submission gates remain authoritative. */
export function DemoSwapActions({ state, busy, fresh, reviewFresh, canSubmit, onQuote, onReview, onSubmit, onConnect, onOpenReview }: {
  state: TestnetWalletSnapshot; busy: boolean; fresh: boolean; reviewFresh: boolean; canSubmit: boolean;
  onQuote: () => void; onReview: (kind: "swap" | "approval") => void; onSubmit: () => void; onConnect?: () => void; onOpenReview?: () => void;
}) {
  const needsQuote = !state.quote || !fresh || (!!state.action && !reviewFresh);
  const needsApproval = state.review?.status === "approval-required";
  const connect = !state.account && !!onConnect;
  const label = connect ? "Connect wallet" : needsQuote ? "Get wallet quote" : state.action ? onOpenReview ? "Review prepared transaction" : "Submit reviewed testnet transaction" : needsApproval ? "Review approval" : "Review swap";
  const disabled = busy || (!connect && (!state.account || (!needsQuote && !!state.action && !onOpenReview && !canSubmit)));
  const act = () => connect ? onConnect!() : needsQuote ? onQuote() : state.action ? (onOpenReview ?? onSubmit)() : onReview(needsApproval ? "approval" : "swap");
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
