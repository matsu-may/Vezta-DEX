"use client";
import { TestnetActivity } from "./testnet-activity";
import { testnetQuoteExpiresAt } from "@vezta-dex/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, parseTestnetSwapIntent, parseTestnetSwapAmount, parseTestnetSlippage } from "@vezta-dex/core";
import { TestnetWalletController, type TestnetWallet, type TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import { createTestnetWalletClient } from "../lib/testnet-wallet-client";
import { TestnetWalletReview } from "./testnet-wallet-review";
import { TestnetWalletRecovery } from "./testnet-wallet-recovery";
import { DemoSwapActions } from "./demo-swap-actions";
import { DemoSwapInputs } from "./demo-swap-inputs";
import { injectedDemoWallet, useDemoWalletBinding } from "./demo-wallet-header";
export function TestnetWalletPanel({ executionEnabled, presentation = "technical" }: { executionEnabled: boolean; presentation?: "technical" | "demo" }) {
  const controller = useRef<TestnetWalletController | null>(null);
  const wallet = useRef<TestnetWallet | null>(null);
  const [state, setState] = useState<TestnetWalletSnapshot | null>(null);
  const [recoveryController, setRecoveryController] = useState<TestnetWalletController | null>(null);
  const [startup, setStartup] = useState("Loading wallet interface…");
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [amount, setAmount] = useState("1"); const [slippage, setSlippage] = useState("0.5"); const [now, setNow] = useState(0); const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let alive = true;
    const startupMessage = (message: string) => queueMicrotask(() => { if (alive) setStartup(message); });
    const provider = injectedDemoWallet();
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
  const connect = useCallback(async () => {
    setStartup(""); const c = controller.current;
    if (!c) return { account: null, error: "Install MetaMask and enable site storage, then reload this page." };
    await c.connect(); const snapshot = c.snapshot();
    return { account: snapshot.stage === "connected" ? snapshot.account : null, error: snapshot.message };
  }, []);
  const headerWallet = useDemoWalletBinding({ account: state?.account ?? null, busy: !!state?.busy || switching, blocked: recovering, connect }, presentation === "demo");
  const reviewFresh = !!state?.review && now < Date.parse(state.review.observedAt) + 30000;
  const canSubmit = executionEnabled && reviewFresh && fresh && state?.quote?.executionEnabled && state.action?.executionEnabled;
  async function switchChain() {
    if (busy || !wallet.current) return; setSwitching(true);
    try { await wallet.current.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x14a34" }] }); setStartup(""); }
    catch { setStartup("Network switch rejected or unavailable. Add Base Sepolia in MetaMask using the owner guide."); }
    finally { setSwitching(false); }
  }
  let parsedAmount: string | null = null; let slippageBps: number | null = null;
  try { parsedAmount = parseTestnetSwapAmount(amount, direction === "forward" ? C.USDC.address : C.WETH.address); slippageBps = parseTestnetSlippage(slippage); } catch {}
  const inputValid = parsedAmount !== null && slippageBps !== null;
  async function quote() {
    if (!state?.account || !controller.current || !inputValid) return;
    await controller.current.quote(parseTestnetSwapIntent({ chainId: P.chainId, wallet: state.account,
      tokenIn: direction === "forward" ? C.USDC.address : C.WETH.address,
      tokenOut: direction === "forward" ? C.WETH.address : C.USDC.address,
      amountIn: parsedAmount!, slippageBps: slippageBps! }));
  }
  function changeDirection(next: "forward" | "reverse") {
    controller.current?.invalidateInput(); setDirection(next); setAmount(next === "forward" ? "1" : "0.0001");
  }
  function changeAmount(next: string) { controller.current?.invalidateInput(); setAmount(next); }
  return <div className={`testnet-demo-grid ${presentation === "demo" ? "recording-grid" : ""}`}>
    {presentation !== "demo" && <aside className="section-card testnet-explore" aria-label="Demo pool">
      <span className="eyebrow">EXPLORE · BASE SEPOLIA</span><h2>USDC / WETH</h2>
      <p>Uniswap v3 · 0.3% fee pool</p><span className="badge badge-fresh">Test tokens only</span>
      <dl className="demo-preview"><div><dt>Chain</dt><dd>Base Sepolia · 84532</dd></div>
        <div><dt>Pool</dt><dd className="mono"><a href={`https://sepolia.basescan.org/address/${P.pool}`} target="_blank" rel="noreferrer">{P.pool}</a></dd></div>
        <div><dt>Source</dt><dd>{state?.quote ? "Base Sepolia RPC · verified quote" : "Curated pool · request quote to verify"}</dd></div>
        {state?.quote && <div><dt>Block</dt><dd>{state.quote.quote.blockNumber}</dd></div>}
      </dl>{state?.quote && <details className="quote-provenance"><summary>Block provenance</summary><p className="mono">{state.quote.quote.blockHash}</p></details>}<p className="form-help">Testnet prices have no monetary value. This demo uses one pool; it does not aggregate best prices or display inferred APR.</p>
      <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a>
    </aside>}
    <section className="section-card testnet-wallet" aria-label="Testnet wallet swap">
      {presentation !== "demo" && <span className="eyebrow">SWAP · TESTNET</span>}<h2>{presentation === "demo" ? "Swap tokens" : "Review a small testnet swap"}</h2>
      <p className="testnet-mode">{presentation === "demo" ? executionEnabled ? "Test tokens only · every transaction is signed in your wallet" : "Read-only preview · wallet submission is disabled" : executionEnabled ? "Local testnet acceptance enabled · MetaMask signs every transaction" : "Read-only preview · run pnpm dev:testnet for wallet acceptance"}</p>
      {startup && <p role="status">{startup}</p>}
      {headerWallet && !state?.account && !recovering && <p className="form-help">Connect your wallet in the top-right corner to request a quote.</p>}
      {!state && presentation === "demo" && <DemoSwapInputs direction={direction} amount={amount} disabled onDirection={changeDirection} onAmount={changeAmount} />}
      {state && <>
        {state.account && !headerWallet && <p className="mono testnet-connected">Connected: {state.account}</p>}
        {!recovering && <>
          {!headerWallet && <div className="testnet-actions"><button className="button" disabled={busy} onClick={() => void connect()}>Connect Base Sepolia wallet</button>
            <button className="button demo-reset" disabled={busy} onClick={() => void switchChain()}>Switch to Base Sepolia</button></div>}
          <DemoSwapInputs direction={direction} amount={amount} disabled={busy} amountOut={state.quote?.quote.amountOut} onDirection={changeDirection} onAmount={changeAmount} />
          <details className="swap-review-options"><summary>Swap settings · {slippage}% slippage</summary>
            <label className="form-label" htmlFor="testnet-slippage">Slippage tolerance (%)</label>
            <input className="field" id="testnet-slippage" inputMode="decimal" maxLength={6} value={slippage} disabled={busy} onChange={e => { controller.current?.invalidateInput(); setSlippage(e.target.value); }} />
            <p className="form-help">Allowed: 0.05%–1%. Lower tolerance may cause a revert; higher tolerance permits a lower received amount.</p>
          </details>
          {!inputValid && <p role="alert" className="form-error">Enter a positive amount within the testnet cap, using at most {direction === "forward" ? 6 : 18} decimals, and slippage from 0.05% to 1%.</p>}
          {slippageBps !== null && slippageBps > P.slippageBps && <p className="form-help">Your selected slippage allows more price movement than the default 0.5%.</p>}
          {presentation !== "demo" && <button className="button testnet-quote-button" disabled={busy || !state.account || !inputValid} onClick={() => void quote()}>Get wallet quote</button>}
          <TestnetWalletReview state={state} compact={presentation === "demo"} />
          {state.quote && <><p className="form-help" role="status">{fresh ? `Quote expires in ${Math.max(0, Math.ceil((expiry - now) / 1000))}s. Review and confirm before expiry.` : "Quote expired. Request a fresh quote before continuing."}</p>
            {presentation !== "demo" && <div className="testnet-actions"><button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("approval")}>Review approval</button>
              <button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("swap")}>Review swap</button></div>}</>}
          {state.action && <><p className="form-help">Review network, recipient and fees in MetaMask. Review the requested token amount. MetaMask may relay the exact reviewed call using its supported smart account; the receipt shows the actual gas payer.</p>
            {!reviewFresh && <p role="status">Review expired. Request a fresh quote and review before continuing.</p>}
            {presentation !== "demo" && <button className="button testnet-submit" disabled={busy || !canSubmit} onClick={() => void controller.current!.submit()}>Submit reviewed testnet transaction</button>}</>}
          {presentation === "demo" && <DemoSwapActions state={state} busy={busy || !inputValid} fresh={fresh} reviewFresh={reviewFresh} canSubmit={!!canSubmit} onQuote={() => void quote()} onReview={kind => void controller.current!.review(kind)} onSubmit={() => void controller.current!.submit()} />}
        </>}
        {busy && <p role="status">{recovering ? "Checking the original transaction…" : "Checking the current wallet and chain state…"}</p>}
        {state.message && <p role="alert" className="form-error">{state.message}</p>}
        {!!state.archived?.length && <details className="archived-history"><summary>Original approvals awaiting manual review ({state.archived.length})</summary>
          <p>Unverified history preserved. These wallets are blocked in this demo.</p>
          {state.archived.map(record => <p key={record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${record.hash}`} target="_blank" rel="noreferrer">{record.hash}</a> <button className="button demo-reset" disabled={busy} onClick={() => void controller.current!.reconcileHistoricalApproval(record.hash!)}>Verify historical approval</button></p>)}
        </details>}
        {!!state.resolvedHistory?.length && <details className="archived-history"><summary>Acknowledged historical approvals ({state.resolvedHistory.length})</summary><p>Original hashes retained. The original API review was unavailable.</p>{state.resolvedHistory.map(h => <p key={h.record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${h.record.hash}`} target="_blank" rel="noreferrer">{h.record.hash}</a></p>)}</details>}
        {recoveryController && <TestnetWalletRecovery state={state} controller={recoveryController} />}
        <TestnetActivity account={state.account ?? state.submission?.intent.wallet ?? null} />
      </>}
    </section>
  </div>;
}
