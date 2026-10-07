"use client";
import Link from "next/link";
import { testnetNetworkHref } from "../lib/testnet-network-selection";
import { ProductPair } from "./product-token";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatUnits, isAddress } from "viem";
import { testnetChainConfig, createTestnetLpPositionDomain, type TestnetChainId, type TestnetChainLpPage } from "@vezta-dex/core";
import { loadTestnetLpPositions } from "../lib/testnet-lp";
const tokenAmount = (amount: string, token: "USDC" | "WETH") => `${formatUnits(BigInt(amount), token === "USDC" ? 6 : 18)} ${token}`;
export function TestnetLpPanel({ walletControls, onSelectAction, walletBusy = false, connectedWallet, mutationKey = null, chainId = 84532, productMode, selectedTokenId, initialOwner }: { productMode?: "list" | "detail"; selectedTokenId?: string; initialOwner?:string; walletControls?: ReactNode; onSelectAction?: (kind: "mint" | "increase" | "decrease" | "collect" | "burn", tokenId: string) => void; walletBusy?: boolean; connectedWallet?: string | null; mutationKey?: string | null; chainId?: TestnetChainId } = {}) {
  const config = testnetChainConfig(chainId), C = config.candidate, P = config.policy;
  const {testnetLpRequestSchema} = createTestnetLpPositionDomain(chainId);
  const [owner, setOwner] = useState(initialOwner && isAddress(initialOwner) ? initialOwner : ""); const [page, setPage] = useState<TestnetChainLpPage | null>(null);
  const [positions, setPositions] = useState<TestnetChainLpPage["positions"]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [now, setNow] = useState(0);
  const generation = useRef(0);
  const [scanMutation, setScanMutation] = useState(mutationKey); const previousMutation = useRef(mutationKey);
  useEffect(() => {
    if (previousMutation.current === mutationKey) return;
    previousMutation.current = mutationKey; const token = ++generation.current;
    // Cancel an in-flight read; the existing snapshot remains explicitly historical.
    queueMicrotask(() => { if (generation.current === token) setBusy(false); });
  }, [mutationKey]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!page) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [page]);
  const matchingOwner = !!connectedWallet && owner.toLowerCase() === connectedWallet.toLowerCase();
  const valid = testnetLpRequestSchema.safeParse({ chainId, owner, cursor: "0", limit: 1 }).success;
  const historical = !!page && scanMutation !== mutationKey;
  const stale = historical || (!!page && now - Date.parse(page.snapshot.observedAt) >= 120000);
  function edit(value: string) { generation.current++; setOwner(value); setPage(null); setPositions([]); setBusy(false); setError(""); }
  async function read(next = false) {
    if (busy || !valid || (next && (!page?.nextCursor || stale))) return;
    const token = ++generation.current; setBusy(true); setError("");
    if (!next) { setPage(null); setPositions([]); }
    try {
      const result = await loadTestnetLpPositions({ chainId, owner,
        cursor: next ? page!.nextCursor : "0", limit: 1, ...(next ? { snapshot: page!.snapshot } : {}) },fetch,Date.now,chainId);
      if (generation.current !== token) return;
      if (next && positions.some(p => result.positions.some(q => q.tokenId === p.tokenId))) throw new Error("Repeated NFT in scan");
      setScanMutation(mutationKey); setPage(result); setPositions(next ? [...positions, ...result.positions] : result.positions); setNow(Date.now());
    } catch {
      if (generation.current !== token) return;
      setPage(null); setPositions([]); setError(`Testnet LP data unavailable. Refresh the read; check ${config.label} RPC if it persists.`);
    } finally { if (generation.current === token) setBusy(false); }
  }
  return <div className={`testnet-demo-grid recording-grid lp-recording-grid lp-catalog ${walletControls ? "lp-position-workspace" : ""}`}><div className="lp-position-column">
    <section className="section-card lp-position-list" aria-label={`${config.label} LP positions`}><div className="positions-list-heading"><div><h2>{selectedTokenId ? `Position #${selectedTokenId}` : "Your positions"}</h2><p className="form-help">USDC / WETH · Uniswap v3 · 0.3% · {config.label}</p></div>{productMode ? <Link className="button button-primary" href={testnetNetworkHref(chainId,"positions/create")}>＋ Create position</Link> : onSelectAction && <button className="button" disabled={walletBusy} onClick={() => onSelectAction("mint", "")}>Create position</button>}</div>
      <p className="form-help">Read any wallet address. No connection, signature or transaction is requested.</p>
      <div className="position-owner-search"><label className="form-label" htmlFor="lp-owner">Position owner address</label>
      <input className="field mono" id="lp-owner" value={owner} onChange={event => edit(event.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off" />
      <div className="testnet-actions">{connectedWallet && <button className="button demo-reset" disabled={busy || walletBusy} onClick={() => edit(connectedWallet)}>Use connected wallet</button>}<button className="button" disabled={!valid || busy} onClick={() => void read()}>Read LP positions</button>{!onSelectAction && !productMode && <button className="button demo-reset" disabled>Create position</button>}</div></div>
      {busy && <p role="status">Reading a pinned {config.label} block…</p>}
      {error && <p role="alert" className="demo-error">{error}</p>}
      {!page && !busy && !error && <div className="demo-empty"><strong>Your positions appear here</strong><p>Enter a wallet address and read its NFTs. Create a position to start providing liquidity to this pool.</p></div>}
      {page && <>
        {historical && <p role="status" className="form-help">A confirmed LP action changed this position state. Read LP positions again to get a fresh snapshot before selecting another position action.</p>}<p className="mono form-help">Queried owner: {page.owner}</p>{onSelectAction && !matchingOwner && <p className="form-help">Connect the queried owner to select actions for these positions.</p>}
        <div className="lp-scan-meta"><span className={stale ? "badge badge-warning" : "badge badge-fresh"}>{historical ? "Historical scan · refresh" : stale ? "Stale scan · refresh" : "Verified pinned read"}</span><span className="mono">Block {page.snapshot.number}</span></div>
        <p className="form-help">{page.totalOwned} owner NFTs across all pools · scanned {BigInt(page.cursor) + BigInt(page.scanned)}/{page.totalOwned}</p>
        {positions.length === 0 && <div className="demo-empty" role="status"><strong>{page.totalOwned === "0" ? "No positions owned" : "No matching positions scanned"}</strong><p>{page.incomplete ? "More owner NFTs remain. Continue scanning this block." : "This scan covers the fixed USDC/WETH 0.3% pool."}</p></div>}
        <div className="lp-position-cards">{positions.filter(p=>!selectedTokenId || p.tokenId===selectedTokenId).map(p => <article className="lp-position-card" key={p.tokenId}>
          <header>{productMode && <ProductPair chainId={chainId}/>}<h3>Position #{p.tokenId}</h3><span className={p.state === "active" ? "badge badge-fresh" : "badge badge-warning"}>{p.state === "empty" ? "No active liquidity" : p.inRange ? "In range" : "Out of range"}</span></header>
          <p className="mono form-help">Ticks {p.tickLower} → {p.tickUpper} · pool tick {page.poolTick}</p>
          <dl className="demo-preview"><div><dt>Current principal</dt><dd>{tokenAmount(p.currentAmounts.USDC, "USDC")}<br />{tokenAmount(p.currentAmounts.WETH, "WETH")}</dd></div>
            <div><dt>New fees since checkpoint</dt><dd>{tokenAmount(p.newFeesSinceCheckpoint.USDC, "USDC")}<br />{tokenAmount(p.newFeesSinceCheckpoint.WETH, "WETH")}</dd></div>
            <div><dt>Stored owed · mixed</dt><dd>{tokenAmount(p.storedOwed.USDC, "USDC")}<br />{tokenAmount(p.storedOwed.WETH, "WETH")}</dd></div>
            <div><dt>Estimated collectable</dt><dd>{tokenAmount(p.collectable.USDC, "USDC")}<br />{tokenAmount(p.collectable.WETH, "WETH")}</dd></div></dl>
          <p className="form-help">Stored owed may include withdrawn principal and fees. Collectable is an estimate, may include rounding dust, and is not profit. Current principal excludes collectable tokens.</p>
          <div className="testnet-actions">{productMode === "list" ? <Link className="button" href={testnetNetworkHref(chainId,`positions/${p.tokenId}`,{owner:page.owner})}>View position →</Link> : ([ ["increase", "Add liquidity"], ["decrease", "Remove liquidity"], ["collect", "Collect tokens"], ["burn", "Close position"] ] as const).map(([kind, label]) => <button className="button demo-reset" disabled={!onSelectAction || !matchingOwner || walletBusy || stale || (kind === "burn" && (p.state !== "empty" || p.storedOwed.USDC !== "0" || p.storedOwed.WETH !== "0"))} key={kind} onClick={() => onSelectAction?.(kind, p.tokenId)}>{label}</button>)}</div>
        </article>)}</div>
        {selectedTokenId && !positions.some(p=>p.tokenId===selectedTokenId) && <p role="status">{page.nextCursor ? "Position not scanned yet. Continue scanning the owner NFTs." : "This scan did not find the selected NFT in this wallet’s supported pool."}</p>}
        {page.nextCursor && <button className="button demo-reset" disabled={busy || stale} onClick={() => void read(true)}>Scan next NFT</button>}
        <details className="quote-provenance"><summary>Read provenance</summary><p>Owner: {page.owner}</p><p>Source: {page.source} · runtime verified</p><p>Observed: {page.snapshot.observedAt}</p><p>Block hash: {page.snapshot.hash}</p><p>All pages use the same pinned block; refresh after 120 seconds.</p></details>
      </>}
      <details className="quote-provenance lp-pool-info"><summary>About this pool</summary><p>Uniswap v3 concentrated liquidity · fees accrue only while in range. Test tokens have no monetary value; USD TVL and APR are unavailable.</p><p className="mono">Pool: {P.pool}</p><p className="mono">Position manager: {C.v3PositionManager}</p><p>Review every approval and LP operation separately. Removing liquidity records owed tokens; collect transfers them to the wallet.</p></details>
    </section></div>
    {walletControls && <div className="section-card lp-action-panel">{walletControls}</div>}
  </div>;
}
