"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatUnits } from "viem";
import { POLYGON_PERMIT2, TOKENS, parseExactInput } from "@vezta-dex/core";
import { RehearsalController, type RehearsalWallet } from "../lib/rehearsal-controller";
import { createRehearsalClient } from "../lib/rehearsal-client";
import { SUBMISSION_KEY } from "../lib/rehearsal-storage";
export function RehearsalPanelHost() {
  const [controller, setController] = useState<RehearsalController | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let instance: RehearsalController | undefined;
    let active = true;
    const recoveryChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === SUBMISSION_KEY) instance?.synchronizeRecovery();
    };
    window.addEventListener("storage", recoveryChanged);
    queueMicrotask(() => {
      if (!active)
        return;
      try {
        if (window.location.origin !== "http://127.0.0.1:3020" || !navigator.locks?.request) {
          setError("Use http://127.0.0.1:3020/rehearsal in a browser with Web Locks. Wallet actions are unavailable here.");
          return;
        }
        const wallet = (window as Window & {
          ethereum?: RehearsalWallet;
        }).ethereum;
        if (!wallet)
          setError("No EVM wallet detected. Recovery reads remain available; install/open MetaMask to start a new trade.");
        instance = new RehearsalController(wallet ?? { request: async () => { throw new Error("Wallet unavailable"); } }, createRehearsalClient(), window.localStorage);
        setController(instance);
      }
      catch {
        setError("Recovery storage is unavailable. Enable local storage before starting a wallet action.");
      }
    });
    return () => { active = false; window.removeEventListener("storage", recoveryChanged); instance?.dispose(); };
  }, []);
  return <>{error && <p className="form-error" role="alert">{error}</p>}{controller ? <RehearsalPanel controller={controller}/> : <p className="section-note">Loading local recovery…</p>}</>;
}
const stageNames = { disconnected: "Connect a wallet", connected: "Ready for a new quote", "quote-review": "Review quote and allowance", "permit-review": "Review Permit2 permission", "permit-signed": "Permit signed; prepare the swap", "swap-review": "Review simulation and gas", pending: "Transaction pending", confirming: "Waiting for confirmations", delayed: "Receipt delayed", unavailable: "Status unavailable", uncertain: "Submission outcome uncertain", requote: "Approval verified; requote required", confirmed: "Swap execution verified", reverted: "Transaction reverted", "verification-needed": "Execution needs investigation", invalidated: "Wallet or input changed", error: "Action needs review", "recovery-blocked": "Recovery needs investigation" } as const;
export function RehearsalPanel({ controller }: {
  controller: RehearsalController;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.snapshot, controller.snapshot);
  const [amount, setAmount] = useState("1");
  const [slippage, setSlippage] = useState(50);
  const [hash, setHash] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const submittedHash = state.submission?.hash;
  useEffect(() => {
    if (!submittedHash || state.busy || !["pending", "confirming", "unavailable"].includes(state.stage))
      return;
    const timer = setTimeout(() => void controller.checkReceipt(), 3000);
    return () => clearTimeout(timer);
  }, [controller, submittedHash, state.stage, state.busy]);
  const expired = !!state.quote && clock >= Date.parse(state.quote.quotedAt) + 30000;
  const walletActionDisabled = state.busy || expired;
  const permit = state.permit?.permit;
  const approvalGas = state.walletState?.approvalGas;
  function getQuote() {
    setFieldError("");
    try {
      if (!state.account)
        return;
      const amountIn = parseExactInput(amount, 6).toString();
      if (BigInt(amountIn) > 1000000n)
        throw new Error();
      void controller.quote({ chainId: 137, swapper: state.account, tokenIn: TOKENS.USDC.address, tokenOut: TOKENS.WETH.address, amountIn, slippageBps: slippage });
    }
    catch {
      setFieldError("Enter a positive amount up to 1 USDC with at most 6 decimal places.");
    }
  }
  const record = state.submission;
  return <div className="page-stack rehearsal-layout">
  <section className="section-card" aria-label="Local wallet rehearsal" aria-busy={state.busy}>
   <div className="section-heading"><h2>{stageNames[state.stage]}</h2><span className="badge">Local test</span></div>
   <p className="section-note">USDC (native) → WETH · Polygon 137 · separate test EOA recommended. Approval is exact; a different existing allowance stops this flow.</p>
   {state.account && <p className="section-note mono">Connected: {state.account}</p>}
   {!state.account && state.stage !== "recovery-blocked" && <button className="button button-primary" type="button" disabled={state.busy} onClick={() => void controller.connect()}>Connect Polygon wallet</button>}
   {!record && <div className="rehearsal-fields">
    <label className="form-label" htmlFor="rehearsal-amount">USDC amount (maximum 1)</label>
    <input className="field" id="rehearsal-amount" inputMode="decimal" value={amount} disabled={state.busy} onChange={event => { setAmount(event.target.value); controller.invalidate(); }}/>
    <label className="form-label" htmlFor="rehearsal-slippage">Maximum slippage</label>
    <select className="field" id="rehearsal-slippage" value={slippage} disabled={state.busy} onChange={event => { setSlippage(Number(event.target.value)); controller.invalidate(); }}><option value={10}>0.1%</option><option value={50}>0.5%</option><option value={100}>1%</option></select>
    {state.account && <button className="button button-primary" type="button" disabled={state.busy} onClick={getQuote}>Get rehearsal quote</button>}
   </div>}
   {state.message && <p className="section-note" role="status">{state.message}</p>}
   {fieldError && <p className="form-error" role="alert">{fieldError}</p>}
   {expired && <p className="form-error" role="alert">Quote expired. Request and review a fresh quote.</p>}
  </section>
  {state.quote && <section className="section-card quote-details" aria-label="Accepted quote review"><h2>Review your quote</h2>
   <div><span>Input</span><strong>{formatUnits(BigInt(state.quote.amountIn), 6)} native USDC</strong></div>
   <div><span>Estimated received</span><strong>{formatUnits(BigInt(state.quote.amountOut), 18)} WETH</strong></div>
   <div><span>Minimum received</span><strong>{formatUnits(BigInt(state.quote.minimumAmountOut), 18)} WETH</strong></div>
   <div><span>Slippage</span><strong>{state.quote.slippageBps / 100}%</strong></div>
   <div><span>Quote expires</span><strong>{new Date(Date.parse(state.quote.quotedAt) + 30000).toISOString()}</strong></div>
   <div><span>ERC20 allowance</span><strong>{state.approval?.currentAllowance === null ? "Account blocked" : formatUnits(BigInt(state.approval?.currentAllowance ?? "0"), 6) + " USDC"}</strong></div>
   <p className="section-note mono">Token: {TOKENS.USDC.address}<br />Permit2: {POLYGON_PERMIT2}</p>
   {state.stage === "quote-review" && state.approval?.plan.kind === "approve" && <>
    {approvalGas && <div><span>Estimated approval gas cost</span><strong>{formatUnits(BigInt(approvalGas.gas) * BigInt(approvalGas.gasPrice), 18)} POL</strong></div>}
    <button className="button button-primary" type="button" disabled={walletActionDisabled} onClick={() => void controller.approve()}>Approve exact USDC amount</button>
   </>}
   {state.stage === "quote-review" && state.approval?.plan.kind === "ready" && <button className="button button-primary" type="button" disabled={walletActionDisabled} onClick={() => void controller.reviewPermit()}>Review Permit2</button>}
  </section>}
  {permit && <section className="section-card quote-details" aria-label="Permit review"><h2>Permit2 permission</h2>
   {permit.kind === "sign" ? <>
    <div><span>Permit amount</span><strong>{formatUnits(BigInt(permit.data.values.details.amount), 6)} USDC</strong></div>
    <div><span>Allowance expires</span><strong>{permit.allowanceExpiresAt}</strong></div>
    <div><span>Signature deadline</span><strong>{permit.signatureDeadline}</strong></div>
    <p className="section-note mono">Spender: {permit.data.values.spender}</p>
    <p className="section-note">This permission has its own lifetime; the quote still expires after 30 seconds.</p>
   </> : <p className="section-note">Exact Permit2 permission is already present and was checked against this quote.</p>}
   {state.stage === "permit-review" && permit.kind === "sign" && <button className="button button-primary" type="button" disabled={walletActionDisabled} onClick={() => void controller.sign()}>Sign reviewed Permit2</button>}
   {(state.stage === "permit-signed" || (state.stage === "permit-review" && permit.kind === "ready")) && <button className="button button-primary" type="button" disabled={walletActionDisabled} onClick={() => void controller.prepare()}>Prepare and simulate swap</button>}
  </section>}
  {state.preparation && <section className="section-card quote-details" aria-label="Swap transaction review"><h2>Review swap transaction</h2>
   <p className="section-note mono">Router: {state.preparation.transaction.to}</p>
   <div><span>Native transaction value</span><strong>0 POL</strong></div>
   <div><span>Estimated gas limit</span><strong>{state.preparation.transaction.gas}</strong></div>
   <div><span>Estimated gas cost</span><strong>{formatUnits(BigInt(state.preparation.transaction.gas) * BigInt(state.preparation.transaction.gasPrice), 18)} POL</strong></div>
   <div><span>Simulation block</span><strong>{state.preparation.simulation.blockNumber}</strong></div>
   <p className="section-note">Simulation is an observation. Review the final network, amount and gas in your wallet before confirming.</p>
   {state.stage === "swap-review" && <button className="button button-primary" type="button" disabled={walletActionDisabled} onClick={() => void controller.submit()}>Submit reviewed swap</button>}
  </section>}
  {record && <section className="section-card quote-details" aria-label="Original transaction recovery"><h2>Original transaction</h2>
   <p className="section-note mono">Account: {record.intent.swapper}<br />Network: Polygon 137<br />Action: {record.kind}</p>
   {record.hash ? <><a className="mono" href={`https://polygonscan.com/tx/${record.hash}`} target="_blank" rel="noreferrer">View original Polygon transaction</a><p className="section-note mono">{record.hash}</p><button className="button" type="button" disabled={state.busy} onClick={() => void controller.checkReceipt()}>Check original transaction</button></> : <>
    <p className="section-note">Inspect MetaMask activity first. The transaction may have been sent. Recover its original hash; never retry automatically or substitute a replacement without investigation.</p>
    <label className="form-label" htmlFor="recovery-hash">Original transaction hash</label><input className="field" id="recovery-hash" value={hash} onChange={event => setHash(event.target.value)} autoComplete="off"/>
    <button className="button" type="button" disabled={state.busy} onClick={() => void controller.recover(hash)}>Recover original hash</button>
   </>}
   {state.execution?.status === "verified" && record.kind === "swap" && <div><span>Verified executed output</span><strong>{formatUnits(BigInt(state.execution.amountOut ?? "0"), 18)} WETH</strong></div>}
   {state.execution?.gasCost && <div><span>Actual gas cost</span><strong>{formatUnits(BigInt(state.execution.gasCost), 18)} POL</strong></div>}
   {state.execution?.balances && <><h3>Original account balances at receipt block</h3><div><span>USDC</span><strong>{formatUnits(BigInt(state.execution.balances.USDC), 6)}</strong></div><div><span>WETH</span><strong>{formatUnits(BigInt(state.execution.balances.WETH), 18)}</strong></div><div><span>POL</span><strong>{formatUnits(BigInt(state.execution.balances.POL), 18)}</strong></div></>}
   {["requote", "confirmed", "reverted"].includes(state.stage) && <button className="button" type="button" disabled={state.busy} onClick={() => void controller.clearVerified()}>Clear verified record for a new quote</button>}
  </section>}
  <p className="write-gate">Public swap release remains gated. Delayed, unavailable or unverified status never authorizes resubmission. Two canonical confirmations here are an observation, not irreversible finality.</p>
 </div>;
}
