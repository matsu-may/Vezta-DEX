"use client";
import { ProductDialog } from "./product-dialog";
import { ProductTransactionProgress } from "./product-transaction-progress";
import { TestnetActivity } from "./testnet-activity";
import { createTestnetSwapDomain, testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseTestnetSwapAmount, parseTestnetSlippage } from "@vezta-dex/core";
import { TestnetWalletController, type TestnetWallet, type TestnetWalletSnapshot } from "../lib/testnet-wallet-controller";
import { createTestnetWalletClient } from "../lib/testnet-wallet-client";
import { TestnetWalletReview } from "./testnet-wallet-review";
import { TestnetWalletRecovery } from "./testnet-wallet-recovery";
import { DemoSwapActions } from "./demo-swap-actions";
import { DemoSwapInputs } from "./demo-swap-inputs";
import { injectedDemoWallet, useDemoWalletBinding, useProductWalletDialog, useProductWalletSession } from "./demo-wallet-header";
export function TestnetWalletPanel({ executionEnabled, presentation = "technical", initialPoolFee, chainId = 84532 }: { executionEnabled: boolean; presentation?: "technical" | "demo"; initialPoolFee?: number | null; chainId?: TestnetChainId }) {
  const config = testnetChainConfig(chainId), C = config.candidate, P = config.policy;
  const {parseTestnetSwapIntent} = createTestnetSwapDomain(chainId);
  const controller = useRef<TestnetWalletController | null>(null);
  const wallet = useRef<TestnetWallet | null>(null);
  const [state, setState] = useState<TestnetWalletSnapshot | null>(null);
  const [recoveryController, setRecoveryController] = useState<TestnetWalletController | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [startup, setStartup] = useState("Loading wallet interface…");
  const openWallet = useProductWalletDialog();
  const [direction, setDirection] = useState<"forward" | "reverse">("forward");
  const [routing, setRouting] = useState(initialPoolFee === null ? "invalid" : initialPoolFee === undefined ? "legacy" : String(initialPoolFee));
  const [amount, setAmount] = useState("1"); const [slippage, setSlippage] = useState("0.5"); const [now, setNow] = useState(0); const [switching, setSwitching] = useState(false);
  useEffect(() => {
    let alive = true;
    const startupMessage = (message: string) => queueMicrotask(() => { if (alive) setStartup(message); });
    const provider = injectedDemoWallet();
    if (!provider) { startupMessage(`Install MetaMask in this browser to connect a ${config.label} wallet.`); return () => { alive = false; }; }
    try {
      const c = new TestnetWalletController(provider, createTestnetWalletClient(fetch, chainId), window.localStorage, Date.now, undefined, () => executionEnabled, chainId);
      controller.current = c; wallet.current = provider;
      const update = () => { if (alive) { setState(c.snapshot()); setNow(Date.now()); } };
      const unsubscribe = c.subscribe(update); queueMicrotask(() => { if (alive) { update(); setRecoveryController(c); } }); startupMessage("");
      return () => { alive = false; unsubscribe(); c.dispose(); controller.current = null; wallet.current = null; };
    } catch { startupMessage("Local recovery storage is unavailable. Enable site storage before using this demo."); return () => { alive = false; }; }
  }, [executionEnabled, chainId, config.label]);
  useEffect(() => {
    if (!state?.quote) return;
    const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer);
  }, [state?.quote]);
  const expiry = state?.quote ? Date.parse(createTestnetSwapDomain(state.quote.quote.chainId).testnetQuoteExpiresAt(state.quote.quote)) : 0;
  const fresh = !!state?.quote && now < expiry;
  const busy = !state || state.busy || switching;
  const recovering = !!state?.submission || state?.stage === "recovery-blocked";
  const sessionAccount = useProductWalletSession();
  useEffect(() => {
    if (sessionAccount && state?.stage === "disconnected" && !recovering) void controller.current?.restoreConnection(sessionAccount);
  }, [sessionAccount, state?.stage, recovering]);
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
    try { await wallet.current.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] }); setStartup(""); }
    catch { setStartup(`Network switch rejected or unavailable. Add ${config.label} in MetaMask using the owner guide.`); }
    finally { setSwitching(false); }
  }
  let parsedAmount: string | null = null; let slippageBps: number | null = null;
  try { parsedAmount = parseTestnetSwapAmount(amount, direction === "forward" ? C.USDC.address : C.WETH.address, chainId); slippageBps = parseTestnetSlippage(slippage); } catch {}
  const inputValid = parsedAmount !== null && slippageBps !== null && routing !== "invalid";
  async function quote() {
    if (!state?.account || !controller.current || !inputValid) return;
    await controller.current.quote(parseTestnetSwapIntent({ chainId: P.chainId, wallet: state.account,
      tokenIn: direction === "forward" ? C.USDC.address : C.WETH.address,
      tokenOut: direction === "forward" ? C.WETH.address : C.USDC.address,
      amountIn: parsedAmount!, slippageBps: slippageBps!,
      ...(routing === "best-direct" ? { routing: "best-direct" } : routing === "legacy" ? {} : { poolFeeTier: Number(routing) }) }));
  }
  async function review(kind: "swap" | "approval") {
    if (presentation === "demo") setReviewOpen(true);
    await controller.current?.review(kind);
  }
  function submitReviewed() { setReviewOpen(false); void controller.current?.submit(); }
  function changeDirection(next: "forward" | "reverse") {
    setReviewOpen(false); controller.current?.invalidateInput(); setDirection(next); setAmount(next === "forward" ? "1" : "0.0001");
  }
  function changeAmount(next: string) { setReviewOpen(false); controller.current?.invalidateInput(); setAmount(next); }
  return <div className={`testnet-demo-grid ${presentation === "demo" ? "recording-grid" : ""}`}>
    {presentation !== "demo" && <aside className="section-card testnet-explore" aria-label="Demo pool">
      <span className="eyebrow">EXPLORE · {config.label.toUpperCase()}</span><h2>USDC / WETH</h2>
      <p>Uniswap v3 · {state?.quote ? `${state.quote.quote.feeTier / 10000}% selected fee pool` : "0.3% original pool"}</p><span className="badge badge-fresh">Test tokens only</span>
      <dl className="demo-preview"><div><dt>Chain</dt><dd>{config.label} · {chainId}</dd></div>
        <div><dt>Pool</dt><dd className="mono"><a href={`${config.explorer}/address/${state?.quote?.quote.pool ?? P.pool}`} target="_blank" rel="noreferrer">{state?.quote?.quote.pool ?? P.pool}</a></dd></div>
        <div><dt>Source</dt><dd>{state?.quote ? `${config.label} RPC · verified quote` : "Curated pool · request quote to verify"}</dd></div>
        {state?.quote && <div><dt>Block</dt><dd>{state.quote.quote.blockNumber}</dd></div>}
      </dl>{state?.quote && <details className="quote-provenance"><summary>Block provenance</summary><p className="mono">{state.quote.quote.blockHash}</p></details>}<p className="form-help">Testnet prices have no monetary value. Swap settings can compare four curated direct pools; this is not global routing or inferred APR.</p>
      <a href="https://faucet.circle.com/" target="_blank" rel="noreferrer">Get test USDC ↗</a>
    </aside>}
    <section className="section-card testnet-wallet" aria-label="Testnet wallet swap">
      {presentation !== "demo" && <span className="eyebrow">SWAP · TESTNET</span>}<h2>{presentation === "demo" ? "Swap tokens" : "Review a small testnet swap"}</h2>
      <p className="testnet-mode">{presentation === "demo" ? executionEnabled ? "Test tokens only · every transaction is signed in your wallet" : "Read-only preview · wallet submission is disabled" : executionEnabled ? "Local testnet acceptance enabled · MetaMask signs every transaction" : "Read-only preview · run pnpm dev:testnet for wallet acceptance"}</p>
      {startup && <p role="status">{startup}</p>}
      {headerWallet && !state?.account && !recovering && <p className="form-help">Connect your wallet in the top-right corner to request a quote.</p>}
      {!state && presentation === "demo" && <DemoSwapInputs chainId={chainId} direction={direction} amount={amount} disabled onDirection={changeDirection} onAmount={changeAmount} />}
      {state && <>
        {state.account && !headerWallet && <p className="mono testnet-connected">Connected: {state.account}</p>}
        {!recovering && <>
          {!headerWallet && <div className="testnet-actions"><button className="button" disabled={busy} onClick={() => void connect()}>Connect {config.label} wallet</button>
            <button className="button demo-reset" disabled={busy} onClick={() => void switchChain()}>Switch to {config.label}</button></div>}
          <DemoSwapInputs chainId={chainId} direction={direction} amount={amount} disabled={busy} amountOut={state.quote?.quote.amountOut} inputBalance={state.review?.inputBalance} onDirection={changeDirection} onAmount={changeAmount} />
          <details className="swap-review-options"><summary>Swap settings · {slippage}% slippage</summary>
            <label className="form-label" htmlFor="testnet-routing">Routing preference</label>
            <select className="field" id="testnet-routing" value={routing} disabled={busy} onChange={e => { controller.current?.invalidateInput(); setRouting(e.target.value); }}>
              {routing === "invalid" && <option value="invalid">Invalid pool selection · choose a route</option>}
              <option value="legacy">Pinned pool · 0.3% (original)</option>
              {chainId === 84532 && <option value="best-direct">Compare direct pools · greatest output</option>}
              {config.pools.map(p => <option key={p.feeTier} value={p.feeTier}>Selected pool · {p.feeTier / 10000}%</option>)}
            </select>
            <p className="form-help">Comparison excludes failed checks and impact above 1%. Selection uses output before gas; a reviewed quote never reroutes.</p>
            <label className="form-label" htmlFor="testnet-slippage">Slippage tolerance (%)</label>
            <input className="field" id="testnet-slippage" inputMode="decimal" maxLength={6} value={slippage} disabled={busy} onChange={e => { controller.current?.invalidateInput(); setSlippage(e.target.value); }} />
            <p className="form-help">Allowed: 0.05%–1%. Lower tolerance may cause a revert; higher tolerance permits a lower received amount.</p>
          </details>
          {routing === "invalid" && <p role="alert" className="form-error">The pool URL is invalid. Choose a curated routing preference in Swap settings.</p>}
          {!inputValid && <p role="alert" className="form-error">Enter a positive amount within the testnet cap, using at most {direction === "forward" ? 6 : 18} decimals, and slippage from 0.05% to 1%.</p>}
          {slippageBps !== null && slippageBps > P.slippageBps && <p className="form-help">Your selected slippage allows more price movement than the default 0.5%.</p>}
          {presentation !== "demo" && <button className="button testnet-quote-button" disabled={busy || !state.account || !inputValid} onClick={() => void quote()}>Get wallet quote</button>}
          <TestnetWalletReview state={state} compact={presentation === "demo"} showTransaction={presentation !== "demo"} />
          {state.quote && <><p className="form-help" role="status">{fresh ? `Quote expires in ${Math.max(0, Math.ceil((expiry - now) / 1000))}s. Review and confirm before expiry.` : "Quote expired. Request a fresh quote before continuing."}</p>
            {presentation !== "demo" && <div className="testnet-actions"><button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("approval")}>Review approval</button>
              <button className="button demo-reset" disabled={busy || !fresh} onClick={() => void controller.current!.review("swap")}>Review swap</button></div>}</>}
          {state.action && presentation !== "demo" && <><p className="form-help">Review network, recipient and fees in MetaMask. Review the requested token amount. {chainId === 84532 ? "MetaMask may relay the exact reviewed call using its supported smart account; the receipt shows the actual gas payer." : "Use a standard EOA wallet on Unichain; smart account execution is not qualified."}</p>
            {!reviewFresh && <p role="status">Review expired. Request a fresh quote and review before continuing.</p>}
            <button className="button testnet-submit" disabled={busy || !canSubmit} onClick={submitReviewed}>Submit reviewed testnet transaction</button></>}
          {presentation === "demo" && <DemoSwapActions state={state} busy={busy || (!!state.account && !inputValid)} fresh={fresh} reviewFresh={reviewFresh} canSubmit={!!canSubmit} onConnect={openWallet} onQuote={() => void quote()} onReview={kind => void review(kind)} onSubmit={submitReviewed} onOpenReview={() => setReviewOpen(true)} />}
        </>}
        {presentation === "demo" && <ProductDialog open={reviewOpen&&!recovering} title="Review transaction" onClose={()=>setReviewOpen(false)}>
          <p className="product-dialog-note">{config.label} · Testnet</p>
          <ProductTransactionProgress approval={state.action?.kind!=="swap" && state.review?.status!=="allowance-ready"}/>
          <TestnetWalletReview state={state} compact modal/>
          {busy&&<p role="status">Checking the current wallet and chain state…</p>}
          {state.message&&<p role="alert" className="form-error">{state.message}</p>}
          {state.action ? <><p className="form-help">Confirm the account, network and reviewed amount in MetaMask.</p>
            {!reviewFresh||!fresh?<p role="status">Review expired. Request a fresh quote and review before continuing.</p>:<p className="form-help" role="status">Quote expires in {Math.max(0,Math.ceil((expiry-now)/1000))}s.</p>}
            <button className="button product-dialog-submit" disabled={busy||!canSubmit} onClick={submitReviewed}>Submit reviewed testnet transaction</button></>
            :state.review?.status==="allowance-ready"?<button className="button product-dialog-submit" disabled={busy||!fresh} onClick={()=>void review("swap")}>Review swap</button>
            :state.review?.status==="approval-required"?<button className="button product-dialog-submit" disabled={busy||!fresh} onClick={()=>void review("approval")}>Review approval</button>:null}
        </ProductDialog>}
        {busy && !(presentation === "demo" && reviewOpen && !recovering) && <p role="status">{recovering ? "Checking the original transaction…" : "Checking the current wallet and chain state…"}</p>}
        {state.message && !(presentation === "demo" && reviewOpen && !recovering) && <p role="alert" className="form-error">{state.message}</p>}
        {!!state.archived?.length && <details className="archived-history"><summary>Original approvals awaiting manual review ({state.archived.length})</summary>
          <p>Base Sepolia history preserved. These wallets are blocked pending manual review.</p>
          {state.archived.map(record => <p key={record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${record.hash}`} target="_blank" rel="noreferrer">{record.hash}</a> <button className="button demo-reset" disabled={busy} onClick={() => void controller.current!.reconcileHistoricalApproval(record.hash!)}>Verify historical approval</button></p>)}
        </details>}
        {!!state.resolvedHistory?.length && <details className="archived-history"><summary>Acknowledged historical approvals ({state.resolvedHistory.length})</summary><p>Original hashes retained. The original API review was unavailable.</p>{state.resolvedHistory.map(h => <p key={h.record.hash}><a className="mono" href={`https://sepolia.basescan.org/tx/${h.record.hash}`} target="_blank" rel="noreferrer">{h.record.hash}</a></p>)}</details>}
        {recoveryController && <TestnetWalletRecovery state={state} controller={recoveryController} />}
        <TestnetActivity chainId={chainId} account={state.account ?? state.submission?.intent.wallet ?? null} />
      </>}
    </section>
  </div>;
}
