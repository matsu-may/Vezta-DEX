"use client";
import { TestnetFeeReview } from "./testnet-fee-review";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, testnetLpIntentSchema, type TestnetLpIntent } from "@vezta-dex/core";
import { testnetLpMessage } from "../lib/testnet-lp-wallet-errors";
import { TestnetLpWalletController, type TestnetLpWalletSnapshot } from "../lib/testnet-lp-wallet-controller";
import { createTestnetLpWalletClient } from "../lib/testnet-lp-wallet-client";
import type { TestnetWallet } from "../lib/testnet-wallet-controller";
import { TestnetLpPanel } from "./testnet-lp-panel";
import { injectedDemoWallet, useDemoWalletBinding } from "./demo-wallet-header";
const amount = (value: string, decimals: number) => formatUnits(BigInt(value), decimals);
const names = { mint: "Create full-range position", increase: "Add liquidity", decrease: "Remove liquidity", collect: "Collect tokens", burn: "Close empty position" } as const;
export function TestnetLpWalletPanel({ executionEnabled, presentation = "technical" }: { executionEnabled: boolean; presentation?: "demo" | "technical" }) {
  const c = useRef<TestnetLpWalletController | null>(null); const provider = useRef<TestnetWallet | null>(null);
  const [mutationKey, setMutationKey] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const origin = useRef<HTMLElement | null>(null); const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (actionOpen) heading.current?.focus(); }, [actionOpen]);
  const [state, setState] = useState<TestnetLpWalletSnapshot | null>(null); const [startup, setStartup] = useState("Loading wallet interface…");
  const [kind, setKind] = useState<TestnetLpIntent["kind"]>("mint"); const [tokenId, setTokenId] = useState("");
  const [amount0, setAmount0] = useState("1000000"); const [amount1, setAmount1] = useState("1000000000000000");
  const [percentage, setPercentage] = useState<25 | 50 | 100>(25); const [hash, setHash] = useState(""); const [now, setNow] = useState(0);
  useEffect(() => {
    let alive = true; const wallet = injectedDemoWallet();
    const updateStartup = (message: string) => queueMicrotask(() => { if (alive) setStartup(message); });
    if (!wallet) { updateStartup("Install MetaMask to connect a Base Sepolia wallet. Position reads remain available below."); return () => { alive = false; }; }
    try {
      const controller = new TestnetLpWalletController(wallet, createTestnetLpWalletClient(), window.localStorage, Date.now, undefined, () => executionEnabled);
      c.current = controller; provider.current = wallet;
      const update = () => { if (alive) {
        const snapshot = controller.snapshot(); const observed = snapshot.observation;
        if (observed?.status === "confirmed" && observed.verified && ["mint", "increase", "decrease", "collect", "burn"].includes(observed.actionKind)) {
          setMutationKey(`${observed.contextId}:${observed.hash}`);
        }
        setState(snapshot); setNow(Date.now());
      } };
      const unsubscribe = controller.subscribe(update); queueMicrotask(update); updateStartup("");
      return () => { alive = false; unsubscribe(); controller.dispose(); c.current = null; provider.current = null; };
    } catch { updateStartup("Local recovery storage is unavailable. Enable site storage before submitting."); return () => { alive = false; }; }
  }, [executionEnabled]);
  useEffect(() => { if (!state?.study) return; const timer = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(timer); }, [state?.study]);
  const busy = !state || state.busy; const recovering = !!state?.submission || state?.stage === "recovery-blocked";
  const connect = useCallback(async () => {
    const controller = c.current;
    if (!controller) return { account: null, error: "Install MetaMask and enable site storage, then reload this page." };
    await controller.connect(); const snapshot = controller.snapshot();
    return { account: snapshot.stage === "connected" ? snapshot.account : null, error: snapshot.message };
  }, []);
  const headerWallet = useDemoWalletBinding({ account: state?.account ?? null, busy: !!state?.busy, blocked: recovering, connect });
  const s = state?.study; const fresh = !!s && now < Date.parse(s.expiresAt); const o = state?.observation; const rec = state?.submission;
  const intent = testnetLpIntentSchema.safeParse({ chainId: 84532, wallet: state?.account, kind,
    ...(kind !== "mint" ? { tokenId } : {}), ...(kind === "mint" || kind === "increase" ? { amount0Cap: amount0, amount1Cap: amount1 } : {}), ...(kind === "decrease" ? { percentage } : {}) });
  const edit = () => c.current?.invalidateInput();
  const select = (next: TestnetLpIntent["kind"], id: string) => { if (busy || recovering) return; origin.current = document.activeElement as HTMLElement; edit(); setKind(next); setTokenId(id); setActionOpen(true); };
  const closeAction = () => { if (busy || recovering) return; edit(); setActionOpen(false); origin.current?.focus(); };
  const controls = <section aria-label="Testnet LP wallet">
    {presentation === "demo" && !recovering && <button className="text-action lp-back-action" disabled={busy} onClick={closeAction}>Back to positions</button>}
    <h2 ref={heading} tabIndex={-1}>{presentation === "demo" ? names[kind] : "Manage liquidity"}</h2>
    <p className="testnet-mode">{executionEnabled ? "Test tokens only · every transaction is signed in your wallet" : "Read-only preview · wallet submission is disabled"}</p>
    {startup && <p role="status">{startup}</p>}
    {headerWallet && !state?.account && !recovering && <p className="form-help">Connect your wallet in the top-right corner to review a position action.</p>}
    {state && <>
      {state.account && !headerWallet && <p className="mono testnet-connected">Connected: {state.account}</p>}
      {!recovering && <>
        {!headerWallet && <button className="button" disabled={busy} onClick={() => void connect()}>Connect Base Sepolia wallet</button>}
        <div className="testnet-fields"><div><label className="form-label" htmlFor="lp-action">LP action</label><select id="lp-action" className="field" value={kind} disabled={busy} onChange={e => { edit(); setKind(e.target.value as TestnetLpIntent["kind"]); }}>
          {Object.entries(names).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
          {kind !== "mint" && <div><label className="form-label" htmlFor="lp-token-id">Position NFT ID</label><input id="lp-token-id" className="field mono" value={tokenId} disabled={busy} inputMode="numeric" onChange={e => { edit(); setTokenId(e.target.value); }} /></div>}
          {kind === "decrease" && <div><label className="form-label" htmlFor="lp-percentage">Remove percentage</label><select id="lp-percentage" className="field" value={percentage} disabled={busy} onChange={e => { edit(); setPercentage(Number(e.target.value) as 25 | 50 | 100); }}>{[25,50,100].map(v => <option key={v} value={v}>{v}%</option>)}</select></div>}
        </div>
        {(kind === "mint" || kind === "increase") && <><div className="testnet-fields"><div><label className="form-label" htmlFor="lp-usdc-cap">Maximum USDC authorization</label><select id="lp-usdc-cap" className="field" value={amount0} disabled={busy} onChange={e => { edit(); setAmount0(e.target.value); }}>{["100000", "1000000", "5000000"].map(v => <option value={v} key={v}>{amount(v,6)} USDC</option>)}</select></div>
          <div><label className="form-label" htmlFor="lp-weth-cap">Maximum WETH authorization</label><select id="lp-weth-cap" className="field" value={amount1} disabled={busy} onChange={e => { edit(); setAmount1(e.target.value); }}>{["100000000000000", "1000000000000000", "10000000000000000", "50000000000000000"].map(v => <option value={v} key={v}>{amount(v,18)} WETH</option>)}</select></div></div><p className="form-help">Mint uses the full range. Adding uses the existing position range. Approvals authorize these caps; the planned deposit may use less. Any unused allowance can remain after execution.</p></>}
        {kind === "decrease" && <p className="form-help">Removing liquidity records owed tokens in the NFT. Collect is a separate reviewed action to transfer them to your wallet.</p>}
        {kind === "collect" && <p className="form-help">Collect transfers available owed tokens, which can include withdrawn principal and fees. It is not a profit measure.</p>}
        {kind === "burn" && <p className="form-help">Close only an empty NFT after all liquidity is removed and all owed tokens are collected.</p>}
        <button className="button" disabled={busy || !intent.success} onClick={() => { if (intent.success) void c.current!.study(intent.data); }}>Study LP action</button>
        {s && <section className="testnet-review" aria-label="LP action review"><h3>{s.status === "blocked" ? "Action unavailable" : `Review ${s.actionKind}${s.approvalToken ? ` ${s.approvalToken}` : ""}`}</h3>
          {s.status === "blocked" && <p role="status">{testnetLpMessage(s.reason ?? "")}</p>}
          <dl className="demo-preview"><div><dt>Requested action</dt><dd>{names[s.intent.kind]}</dd></div>
            {s.intent.kind !== "mint" && <div><dt>Position NFT ID</dt><dd>#{s.intent.tokenId}</dd></div>}
            {s.approvalToken && <><div><dt>Authorization in this action</dt><dd>{s.actionKind === "reset" ? "0" : amount(s.approvalToken === "USDC" ? s.plan.amount0Cap : s.plan.amount1Cap, s.approvalToken === "USDC" ? 6 : 18)} {s.approvalToken}</dd></div><div><dt>Approval spender</dt><dd className="mono">{C.v3PositionManager}</dd></div></>}
            {(s.intent.kind === "mint" || s.intent.kind === "increase") && <><div><dt>Maximum authorization</dt><dd>{amount(s.intent.amount0Cap,6)} USDC / {amount(s.intent.amount1Cap,18)} WETH</dd></div><div><dt>Planned deposit</dt><dd>{amount(s.plan.amount0Desired,6)} USDC / {amount(s.plan.amount1Desired,18)} WETH</dd></div><div><dt>Minimum deposit</dt><dd>{amount(s.plan.amount0Minimum,6)} USDC / {amount(s.plan.amount1Minimum,18)} WETH</dd></div></>}
            {s.intent.kind === "decrease" && <><div><dt>Liquidity removed</dt><dd>{s.intent.percentage}% · {s.plan.liquidity} units</dd></div><div><dt>Minimum added to NFT owed</dt><dd>{amount(s.plan.amount0Minimum,6)} USDC / {amount(s.plan.amount1Minimum,18)} WETH</dd></div></>}
            {s.intent.kind === "collect" && <div><dt>Stored owed before collect</dt><dd>{amount(s.plan.storedOwed0,6)} USDC / {amount(s.plan.storedOwed1,18)} WETH</dd></div>}
            <div><dt>Range</dt><dd>{s.plan.tickLower} → {s.plan.tickUpper}</dd></div>
            {s.gas && <div><dt>Complete snapshot fee budget</dt><dd>{amount(s.gas.totalFeeBudget,18)} test ETH</dd></div>}
            <div><dt>Native gas balance</dt><dd>{amount(s.balances.ETH,18)} test ETH</dd></div><div><dt>Wallet balance</dt><dd>{amount(s.balances.USDC,6)} USDC / {amount(s.balances.WETH,18)} WETH</dd></div></dl>
          <p role="status" className="form-help">{fresh ? `Review expires in ${Math.max(0,Math.ceil((Date.parse(s.expiresAt)-now)/1000))}s.` : "Review expired. Request a fresh study."} Each approval and LP operation requires its own review.</p>
          {s.status === "prepared" && <>{["approve", "reset"].includes(s.actionKind) && <p className="lp-next-step">Approval is a separate transaction. After verification, acknowledge the result and study again to continue to the next token or LP operation.</p>}<p className="form-help">Confirm the reviewed operation in MetaMask. A supported Smart Account may relay it with a separate outer nonce and gas payer.</p><button className="button testnet-submit" disabled={busy || !fresh || !executionEnabled || !s.executionEnabled} onClick={() => void c.current!.submit()}>Submit reviewed LP transaction</button></>}
          {s.transaction && <details className="quote-provenance"><summary>Transaction and fee details</summary><dl className="demo-preview"><div><dt>Network</dt><dd>Base Sepolia · 84532</dd></div><div><dt>Transaction sender</dt><dd className="mono">{s.transaction.from}</dd></div><div><dt>Transaction target</dt><dd className="mono">{s.transaction.to}</dd></div><div><dt>Native value</dt><dd>0 test ETH</dd></div><div><dt>Prepared nonce</dt><dd>{s.transaction.nonce}</dd></div><div><dt>Gas limit</dt><dd>{s.transaction.gas}</dd></div><TestnetFeeReview fees={s.transaction} />{s.gas && <><div><dt>L2 fee ceiling</dt><dd>{amount(s.gas.l2FeeCeiling,18)} test ETH</dd></div><div><dt>L1 fee upper bound</dt><dd>{amount(s.gas.l1FeeUpperBound,18)} test ETH</dd></div><div><dt>Operator fee upper bound</dt><dd>{amount(s.gas.operatorFeeUpperBound,18)} test ETH</dd></div></>}<div><dt>Transaction deadline</dt><dd>{s.plan.deadline ? new Date(Number(s.plan.deadline)*1000).toISOString() : "No contract deadline"}</dd></div></dl><p className="form-help">The complete budget includes twice the L1/operator upper bounds. It is a snapshot ceiling, not the actual charged fee.</p></details>}
          <details className="quote-provenance"><summary>Review provenance</summary><p>Base Sepolia RPC · verified runtime · block {s.blockNumber}</p><p className="mono">{s.blockHash}</p><p>Observed: {s.observedAt}</p><p className="mono">Context: {s.contextId ?? "blocked"}</p></details>
        </section>}
      </>}
      {recovering && <section className="testnet-review" aria-label="Original LP transaction recovery"><h3>{rec?.hash ? "Original LP transaction" : state.stage === "recovery-blocked" ? "LP recovery blocked" : "LP submission outcome uncertain"}</h3><p>Keep the original context and hash. Do not resend. Reload preserves this record and never opens MetaMask automatically.</p>
        {rec && <><dl className="demo-preview"><div><dt>Original wallet</dt><dd className="mono">{rec.study.intent.wallet}</dd></div><div><dt>Original action</dt><dd>{rec.study.actionKind}{rec.study.approvalToken ? ` ${rec.study.approvalToken}` : ""}</dd></div><div><dt>Status</dt><dd>{state.stage}</dd></div><div><dt>Context</dt><dd className="mono">{rec.study.contextId}</dd></div></dl>
          {rec.hash ? <><p className="mono"><a href={`https://sepolia.basescan.org/tx/${rec.hash}`} target="_blank" rel="noreferrer">{rec.hash}</a></p><button className="button" disabled={busy} onClick={() => void c.current!.observe()}>Check original LP transaction</button></>
            : <><label className="form-label" htmlFor="lp-original-hash">Original LP transaction hash</label><input id="lp-original-hash" className="field mono" value={hash} onChange={e => setHash(e.target.value)} autoComplete="off" /><button className="button" disabled={busy || !/^0x[a-fA-F0-9]{64}$/.test(hash)} onClick={() => void c.current!.recoverHash(hash)}>Recover original LP hash</button></>}
          {o && <><p role="status">{o.status === "confirming" ? "Included · wait for two confirmations, then check again." : o.status === "confirmed" ? "Original action verified with two confirmations." : o.status === "reverted" ? "Original transaction reverted. The result is verified." : "Original transaction remains unresolved. Preserve its hash and check again."}</p>
            {o.verified && <dl className="demo-preview"><div><dt>Position NFT</dt><dd>{o.tokenId ?? "Not created"}</dd></div><div><dt>{rec.study.actionKind === "collect" ? "Actual tokens collected" : rec.study.actionKind === "decrease" ? "Tokens added to NFT owed" : ["mint","increase"].includes(rec.study.actionKind) ? "Actual tokens deposited" : "Economic token payments"}</dt><dd>{amount(o.amount0,6)} USDC / {amount(o.amount1,18)} WETH</dd></div>{o.status === "confirmed" && ["approve", "reset"].includes(rec.study.actionKind) && rec.study.approvalToken && <div><dt>Verified authorization</dt><dd>{rec.study.actionKind === "reset" ? "0" : amount(rec.study.approvalToken === "USDC" ? rec.study.plan.amount0Cap : rec.study.plan.amount1Cap,rec.study.approvalToken === "USDC" ? 6 : 18)} {rec.study.approvalToken}</dd></div>}{o.executionModel && <><div><dt>Execution</dt><dd>MetaMask delegation</dd></div><div><dt>Gas payer</dt><dd className="mono">{o.gasPayer}</dd></div></>}{o.l2GasCost !== undefined && <div><dt>{o.executionModel ? "Observed outer L2 cost" : "Observed L2 cost"}</dt><dd>{amount(o.l2GasCost,18)} test ETH</dd></div>}<div><dt>Actual total fee</dt><dd>L1/operator charged fees not yet qualified</dd></div></dl>}
            {o.verified && ["confirmed","reverted"].includes(state.stage) && <button className="button" disabled={busy} onClick={() => { if (o.tokenId) setTokenId(o.tokenId); void c.current!.acknowledge(); }}>Acknowledge verified LP result</button>}</>}
        </>}
        {state.stage === "recovery-blocked" && <p role="alert">Recovery storage is invalid or conflicting. Preserve wallet history and ask for review before starting another action.</p>}
      </section>}
      {busy && <p role="status">{recovering ? "Checking the original transaction…" : "Checking wallet and pinned chain state…"}</p>}
      {state.message && <p role="alert" className="form-error">{state.message}</p>}
    </>}
  </section>;
  const showControls = presentation !== "demo" || actionOpen || recovering;
  return <>
    {!showControls && startup && <p role="status" className="form-help">{startup}</p>}
    <TestnetLpPanel walletControls={showControls ? controls : undefined} onSelectAction={select} walletBusy={busy || recovering} connectedWallet={state?.account} mutationKey={mutationKey} />
  </>;
}
