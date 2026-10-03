"use client";
import { useState } from "react";
import { formatUnits } from "viem";
import type { TestnetWalletController, TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
const diagnosticMessages = {
  "transaction-unavailable": "RPC returned a receipt but no transaction details. Check the original transaction again later.",
  "unsupported-transaction-type": "The wallet used a transaction type this demo does not support, outside the supported MetaMask delegation profile. Keep the original hash for review.",
  "transaction-mismatch": "The sender, target, calldata, nonce or gas fields differ from the reviewed transaction. Keep the original hash for review.",
  "receipt-mismatch": "Receipt identity, block or gas fields could not be reconciled with the reviewed transaction.",
  "event-mismatch": "Token events did not prove the reviewed approval or swap amounts. Keep the original hash for review.",
};
import { testnetAmount } from "./testnet-wallet-review";
export function TestnetWalletRecovery({ state, controller }: { state: TestnetWalletSnapshot; controller: TestnetWalletController }) {
  const [hash, setHash] = useState(""); const [acceptedHash, setAcceptedHash] = useState<string | null>(null); const record = state.submission; const o = state.observation;
  if (!record && !state.historical && state.stage !== "recovery-blocked") return null;
  return <section className="testnet-review" aria-label="Original transaction recovery">
    <h3>{record?.hash ? "Original transaction" : "Submission outcome uncertain"}</h3>
    <p>Keep the original context and hash. Do not resend. Reviewed contexts are retained locally for 24 hours.</p>
    {state.stage === "pending" && !state.contextUnavailable && <p role="status">Waiting for the original transaction. Click Check original transaction to read its receipt; this will not send another transaction.</p>}
    {state.stage === "confirming" && <p role="status">The transaction is included. Wait for two confirmations, then check again.</p>}
    {state.stage === "unverified" && <p role="status">{o?.diagnostic ? diagnosticMessages[o.diagnostic] : "The original transaction could not be reconciled with the reviewed action. Keep its hash and ask for review."}</p>}
    {record && <><dl className="demo-preview">
      <div><dt>Original wallet</dt><dd className="mono">{record.intent.wallet}</dd></div>
      <div><dt>Original action</dt><dd>{record.action.kind}</dd></div>
      <div><dt>Original input</dt><dd>{testnetAmount(record.intent.amountIn, record.intent.tokenIn)}</dd></div>
      <div><dt>Network</dt><dd>Base Sepolia · 84532</dd></div>
      <div><dt>Status</dt><dd>{state.stage}</dd></div>
    </dl>
    {record.hash ? <><a href={`https://sepolia.basescan.org/tx/${record.hash}`} target="_blank" rel="noreferrer">View original Base Sepolia transaction</a>
      <p className="mono">{record.hash}</p><button className="button" disabled={state.busy} onClick={() => void controller.observe()}>Check original transaction</button></>
      : <><label className="form-label" htmlFor="original-testnet-hash">Original transaction hash</label>
        <input id="original-testnet-hash" className="field mono" value={hash} onChange={e => setHash(e.target.value)} autoComplete="off" />
        <button className="button" disabled={state.busy || !/^0x[0-9a-fA-F]{64}$/.test(hash)} onClick={() => void controller.recoverHash(hash)}>Recover original hash</button></>}
    {o?.execution && <dl className="demo-preview">
      {o.status === "confirmed" && record.action.kind === "swap" && <div><dt>Verified executed output</dt><dd>{testnetAmount(o.execution.amountOut!, record.intent.tokenOut)}</dd></div>}
      {o.execution.approvedAmount !== undefined && <div><dt>Original approval event amount</dt><dd>{testnetAmount(o.execution.approvedAmount, record.intent.tokenIn)}</dd></div>}
      <div><dt>Current allowance</dt><dd>{testnetAmount(o.execution.tokenAllowance, record.intent.tokenIn)}</dd></div>
      <div><dt>State block</dt><dd>{o.execution.stateBlockNumber}</dd></div>
      <div><dt>Confirmations</dt><dd>{o.confirmations}</dd></div>
      {o.executionModel && <><div><dt>Execution</dt><dd>MetaMask constrained delegation</dd></div><div><dt>Gas payer</dt><dd className="mono">{o.gasPayer}</dd></div></>}
      <div><dt>{o.executionModel ? "Relayer L2 gas cost" : "Verified L2 gas cost"}</dt><dd>{formatUnits(BigInt(o.execution.l2GasCost), 18)} test ETH</dd></div>
      <div><dt>Actual total fee</dt><dd>L1/operator charged fees not yet qualified</dd></div>
    </dl>}
    {o?.execution && !o.execution.allowanceMatchesExpected && <p role="alert">Allowance has changed since the original transaction. A new quote and review will check its current value.</p>}
    {(state.stage === "unverified" || state.contextUnavailable) && record.hash && record.action.kind !== "swap" && <div className="manual-review-notice">
      <h4>Approval needs review</h4>
      <button className="button" disabled={state.busy} onClick={() => void controller.reconcileHistoricalApproval()}>Verify historical approval</button>
      <p>This reads the original signed execution and approval event. It does not send a transaction or restore a missing API context.</p>
      <p>This app could not verify the original transaction. Archiving preserves its record and blocks this wallet from further demo actions. It does not mark the transaction successful.</p>
      <label><input type="checkbox" checked={acceptedHash === record.hash} onChange={e => setAcceptedHash(e.target.checked ? record.hash : null)} /> I will keep the original hash and continue only with a different standard account.</label>
      <button className="button demo-reset" disabled={state.busy || acceptedHash !== record.hash} onClick={() => void controller.archiveUnverifiedApproval()}>Archive approval for manual review</button>
    </div>}
    {(state.stage === "confirmed" || state.stage === "reverted") && <button className="button" disabled={state.busy} onClick={() => void controller.acknowledge()}>Acknowledge verified result</button>}
    </>}
    {state.historical && <section aria-label="Historical approval result" className="testnet-review">
      <h4>Verified historical approval</h4>
      <p>The signed on-chain approval is verified. Original API review unavailable. This is a separate historical result.</p>
      <dl className="demo-preview"><div><dt>Approved amount</dt><dd>{testnetAmount(state.historical.approvedAmount,state.historical.token)}</dd></div>
        <div><dt>Current allowance</dt><dd>{testnetAmount(state.historical.currentAllowance,state.historical.token)}</dd></div>
        <div><dt>Receipt block</dt><dd>{state.historical.receiptBlockNumber}</dd></div><div><dt>Original hash</dt><dd className="mono">{state.historical.hash}</dd></div></dl>
      <button className="button" disabled={state.busy} onClick={() => void controller.acknowledgeHistoricalApproval()}>Acknowledge historical approval</button>
    </section>}
    {state.stage === "recovery-blocked" && <p role="alert">Recovery record is invalid or conflicting. Preserve wallet activity and ask for review before starting another swap.</p>}
  </section>;
}
