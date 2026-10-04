"use client";
import { testnetQuoteExpiresAt } from "@vezta-dex/core";
import { useEffect, useRef, useState } from "react";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, parseTestnetSwapIntent } from "@vezta-dex/core";
import { TestnetWalletController, type TestnetWallet, type TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import { createTestnetWalletClient } from "../lib/testnet-wallet-client";
import { TestnetWalletReview } from "./testnet-wallet-review";
import { TestnetWalletRecovery } from "./testnet-wallet-recovery";
import { DemoSwapInputs } from "./demo-swap-inputs";
const amounts = { forward: ["100000", "1000000", "5000000"], reverse: ["10000000000000", "100000000000000", "1000000000000000"] };
const labels = { forward: ["0.1 USDC", "1 USDC", "5 USDC"], reverse: ["0.00001 WETH", "0.0001 WETH", "0.001 WETH"] };
export function TestnetWalletPanel({ executionEnabled, presentation = "technical" }: { executionEnabled: boolean; presentation?: "technical" | "demo" }) {
  const controller = useRef<TestnetWalletController | null>(null);
  const wallet = useRef<TestnetWallet | null>(null);
  const [state, setState] = useState<TestnetWalletSnapshot | null>(null);
  const [recoveryController, setRecoveryController] = useState<TestnetWalletController | null>(null);
  const [startup, setStartup] = useState("Loading wallet interface…");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [amount, setAmount] = useState(1); const [now, setNow] = useState(0); const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let alive = true;
    const startupMessage = (message: string) => queueMicrotask(() => { if (alive) setStartup(message); });
    const provider = (window as unknown as { ethereum?: TestnetWallet }).ethereum;
    if (!provider) { startupMessage("Install MetaMask in this browser to connect a Base Sepolia wallet."); return () => { alive = false; }; }
    try {
      const c = new TestnetWalletController(provider, createTestnetWalletClient(), window.localStorage, Date.now, undefined, () => executionEnabled);
      controller.current = c; wallet.current = provider;
      const update = () => { if (alive) { setState(c.snapshot()); setNow(Date.now()); } };
      const unsubscribe = c.subscribe(update); queueMicrotask(() => { if (alive) { update(); setRecoveryController(c); } }); startupMessage("");
      return () => { alive = false; unsubscribe(); c.dispose(); controller.current = null; wallet.current = null; };
    } catch { startupMessage("Local recovery storage is unavailable. Enable site storage before using this demo."); return () => { alive = false; }; }
  }, [executionEnabled]);
  useEffect(() => {
    if (!state?.quote) return;
    const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer);
  }, [state?.quote]);
  const expiry = state?.quote ? Date.parse(testnetQuoteExpiresAt(state.quote.quote)) : 0;
  const fresh = !!state?.quote && now < expiry;
  const busy = !state || state.busy || switching;
  const recovering = !!state?.submission || state?.stage === "recovery-blocked";
  const reviewFresh = !!state?.review && now < Date.parse(state.review.observedAt) + 30000;
  const canSubmit = executionEnabled && reviewFresh && fresh && state?.quote?.executionEnabled && state.action?.executionEnabled;
  async function switchChain() {
    if (busy || !wallet.current) return; setSwitching(true);
    try { await wallet.current.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }); setStartup(""); }
    catch { setStartup("Network switch rejected or unavailable. Add Base Sepolia in MetaMask using the owner guide."); }
    finally { setSwitching(false); }
  }
  async function quote() {
    if (!state?.account || !controller.current) return;
    await controller.current.quote(parseTestnetSwapIntent({ chainId: P.chainId, wallet: state.account,
      tokenIn: direction === "forward" ? C.USDC.address : C.WETH.address,
      tokenOut: direction === "forward" ? C.WETH.address : C.USDC.address,
      amountIn: amounts[direction][amount], slippageBps: P.slippageBps }));
  }
  function changeDirection(next: "forward" | "reverse") {
    controller.current?.invalidateInput(); setDirection(next); setAmount(1);
  }
  function changeAmount(next: number) { controller.current?.invalidateInput(); setAmount(next); }
  return <div className={`testnet-demo-grid ${presentation === "demo" ? "recording-grid" : ""}`}>
    <aside className="section-card testnet-explore" aria-label="Demo pool">
      <span className="eyebrow">EXPLORE · BASE SEPOLIA</span><h2>USDC / WETH</h2>
      <p>Uniswap v3 · 0.3% fee pool</p><span className="badge badge-fresh">Test tokens only</span>
      <dl className="demo-preview"><div><dt>Chain</dt><dd>Base Sepolia · 84532</dd></div>
        <div><dt>Pool</dt><dd className="mono"><a href={`https://sepolia.basescan.org/address/${P.pool}`} target="_blank" rel="noreferrer">{P.pool}</a></dd></div>
        <div><dt>Source</dt><dd>{state?.quote ? "Base Sepolia RPC · verified quote" : "Curated pool · request quote to verify"}</dd></div>
        {state?.quote && <div><dt>Block</dt><dd>{state.quote.quote.blockNumber}</dd></div>}
      </dl>{state?.quote && <details className="quote-provenance"><summary>Block provenance</summary><p className="mono">{state.quote.quote.blockHash}</p></details>}<p className="form-help">Testnet prices have no monetary value. This demo uses one pool; it does not aggregate best prices or display inferred APR.</p>
      <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a>
    </aside>
    <section className="section-card testnet-wallet" aria-label="Testnet wallet swap">
      <span className="eyebrow">SWAP · TESTNET</span><h2>{presentation === "demo" ? "Swap tokens" : "Review a small testnet swap"}</h2>
      {presentation === "demo" && <ol className="recording-steps" aria-label="Swap steps"><li>01 Connect</li><li>02 Review</li><li>03 Confirm</li></ol>}
      <p className="testnet-mode">{presentation === "demo" ? executionEnabled ? "Test tokens only · every transaction is signed in your wallet" : "Read-only preview · wallet submission is disabled" : executionEnabled ? "Local testnet acceptance enabled · MetaMask signs every transaction" : "Read-only preview · run pnpm dev:testnet for wallet acceptance"}</p>
      {startup && <p role="status">{startup}</p>}
      {!state && presentation === "demo" && <DemoSwapInputs direction={direction} amount={amount} disabled onDirection={changeDirection} onAmount={changeAmount} />}
      {state && <>
        {state.account && <p className="mono testnet-connected">Connected: {state.account}</p>}
        {!recovering && <>
          <div className="testnet-actions"><button className="button" disabled={busy} onClick={() => { setStartup(""); void controller.current!.connect(); }}>Connect Base Sepolia wallet</button>
            <button className="button demo-reset" disabled={busy} onClick={() => void switchChain()}>Switch to Base Sepolia</button></div>
          {presentation === "demo" ? <DemoSwapInputs direction={direction} amount={amount} disabled={busy} amountOut={state.quote?.quote.amountOut} onDirection={changeDirection} onAmount={changeAmount} /> : <div className="testnet-fields"><div><label className="form-label" htmlFor="testnet-direction">Direction</label>
            <select className="field" id="testnet-direction" disabled={busy} value={direction} onChange={e => { controller.current!.invalidateInput(); setDirection(e.target.value as "forward" | "reverse"); setAmount(1); }}>
              <option value="forward">USDC → WETH</option><option value="reverse">WETH → USDC</option></select></div>
            <div><label className="form-label" htmlFor="testnet-amount">Input amount</label><select className="field" id="testnet-amount" value={amount} disabled={busy} onChange={e => { controller.current!.invalidateInput(); setAmount(Number(e.target.value)); }}>
              {labels[direction].map((label, i) => <option value={i} key={label}>{label}</option>)}</select></div></div>}
          <button className="button testnet-quote-button" disabled={busy || !state.account} onClick={() => void quote()}>Get wallet quote</button>
          <TestnetWalletReview state={state} compact={presentation === "demo"} />
          {state.quote && <><p className="form-help" role="status">{fresh ? `Quote expires in ${Math.max(0, Math.ceil((expiry - now) / 1000))}s. Review and confirm before expiry.` : "Quote expired. Request a fresh quote before continuing."}</p>
            <div className="testnet-actions"><button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("approval")}>Review approval</button>
              <button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("swap")}>Review swap</button></div></>}
          {state.action && <><p className="form-help">Review network, recipient and fees in MetaMask. Review the requested token amount. MetaMask may relay the exact reviewed call using its supported smart account; the receipt shows the actual gas payer.</p>
            {!reviewFresh && <p role="status">Review expired. Request a fresh quote and review before continuing.</p>}
            <button className="button testnet-submit" disabled={busy || !canSubmit} onClick={() => void controller.current!.submit()}>Submit reviewed testnet transaction</button></>}
        </>}
        {busy && <p role="status">{recovering ? "Checking the original transaction…" : "Checking the current wallet and chain state…"}</p>}
        {state.message && <p role="alert" className="form-error">{state.message}</p>}
        {!!state.archived?.length && <details className="archived-history"><summary>Original approvals awaiting manual review ({state.archived.length})</summary>
          <p>Unverified history preserved. These wallets are blocked in this demo.</p>
          {state.archived.map(record => <p key={record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${record.hash}`} target="_blank" rel="noreferrer">{record.hash}</a> <button className="button demo-reset" disabled={busy} onClick={() => void controller.current!.reconcileHistoricalApproval(record.hash!)}>Verify historical approval</button></p>)}
        </details>}
        {!!state.resolvedHistory?.length && <details className="archived-history"><summary>Acknowledged historical approvals ({state.resolvedHistory.length})</summary><p>Original hashes retained. The original API review was unavailable.</p>{state.resolvedHistory.map(h => <p key={h.record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${h.record.hash}`} target="_blank" rel="noreferrer">{h.record.hash}</a></p>)}</details>}
        {recoveryController && <TestnetWalletRecovery state={state} controller={recoveryController} />}
      </>}
    </section>
  </div>;
}
