"use client";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, testnetLpRequestSchema, type TestnetLpPage } from "@vezta-dex/core";
import { loadTestnetLpPositions } from "../lib/testnet-lp";
const tokenAmount = (amount: string, token: "USDC" | "WETH") => `${formatUnits(BigInt(amount), token === "USDC" ? 6 : 18)} ${token}`;
export function TestnetLpPanel() {
  const [owner, setOwner] = useState(""); const [page, setPage] = useState<TestnetLpPage | null>(null);
  const [positions, setPositions] = useState<TestnetLpPage["positions"]>([]);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [now, setNow] = useState(0);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (!page) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [page]);
  const valid = testnetLpRequestSchema.safeParse({ chainId: 84532, owner, cursor: "0", limit: 1 }).success;
  const stale = !!page && now - Date.parse(page.snapshot.observedAt) >= 120000;
  function edit(value: string) { generation.current++; setOwner(value); setPage(null); setPositions([]); setBusy(false); setError(""); }
  async function read(next = false) {
    if (busy || !valid || (next && (!page?.nextCursor || stale))) return;
    const token = ++generation.current; setBusy(true); setError("");
    if (!next) { setPage(null); setPositions([]); }
    try {
      const result = await loadTestnetLpPositions({ chainId: 84532, owner,
        cursor: next ? page!.nextCursor : "0", limit: 1, ...(next ? { snapshot: page!.snapshot } : {}) });
      if (generation.current !== token) return;
      if (next && positions.some(p => result.positions.some(q => q.tokenId === p.tokenId))) throw new Error("Repeated NFT in scan");
      setPage(result); setPositions(next ? [...positions, ...result.positions] : result.positions); setNow(Date.now());
    } catch {
      if (generation.current !== token) return;
      setPage(null); setPositions([]); setError("Testnet LP data unavailable. Refresh the read; check Base Sepolia RPC if it persists.");
    } finally { if (generation.current === token) setBusy(false); }
  }
  return <div className="testnet-demo-grid recording-grid lp-recording-grid">
    <aside className="section-card testnet-explore">
      <span className="eyebrow">LIQUIDITY · BASE SEPOLIA</span><h2>USDC / WETH</h2><p>Uniswap v3 · 0.3% fee pool</p>
      <span className="badge badge-fresh">Test tokens only</span>
      <dl className="demo-preview"><div><dt>Chain</dt><dd>84532</dd></div><div><dt>Range</dt><dd>Concentrated liquidity</dd></div><div><dt>Fees</dt><dd>Earned only while in range</dd></div></dl>
      <p className="form-help">Testnet tokens and prices have no monetary value. Yield and USD TVL are unavailable.</p>
      <details className="quote-provenance"><summary>Pool & manager</summary><p>Pool: {P.pool}</p><p>Position manager: {C.v3PositionManager}</p></details>
      <div className="lp-read-boundary"><strong>LP transaction controls are coming next</strong><p>Mint, add, remove, collect and close require a qualified wallet flow. This page performs reads only.</p></div>
    </aside>
    <section className="section-card" aria-label="Base Sepolia LP positions"><span className="eyebrow">YOUR POSITIONS</span><h2>Provide liquidity.</h2>
      <p className="form-help">Read any wallet address. No connection, signature or transaction is requested.</p>
      <label className="form-label" htmlFor="lp-owner">Position owner address</label>
      <input className="field mono" id="lp-owner" value={owner} onChange={event => edit(event.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off" />
      <div className="testnet-actions"><button className="button" disabled={!valid || busy} onClick={() => void read()}>Read LP positions</button><button className="button demo-reset" disabled>Create position</button></div>
      {busy && <p role="status">Reading a pinned Base Sepolia block…</p>}
      {error && <p role="alert" className="demo-error">{error}</p>}
      {page && <>
        <div className="lp-scan-meta"><span className={stale ? "badge badge-warning" : "badge badge-fresh"}>{stale ? "Stale scan · refresh" : "Verified pinned read"}</span><span className="mono">Block {page.snapshot.number}</span></div>
        <p className="form-help">{page.totalOwned} owner NFTs across all pools · scanned {BigInt(page.cursor) + BigInt(page.scanned)}/{page.totalOwned}</p>
        {positions.length === 0 && <div className="demo-empty" role="status"><strong>{page.totalOwned === "0" ? "No positions owned" : "No matching positions scanned"}</strong><p>{page.incomplete ? "More owner NFTs remain. Continue scanning this block." : "This scan covers the fixed USDC/WETH 0.3% pool."}</p></div>}
        <div className="lp-position-cards">{positions.map(p => <article className="lp-position-card" key={p.tokenId}>
          <header><h3>Position #{p.tokenId}</h3><span className={p.state === "active" ? "badge badge-fresh" : "badge badge-warning"}>{p.state === "empty" ? "No active liquidity" : p.inRange ? "In range" : "Out of range"}</span></header>
          <p className="mono form-help">Ticks {p.tickLower} → {p.tickUpper} · pool tick {page.poolTick}</p>
          <dl className="demo-preview"><div><dt>Current principal</dt><dd>{tokenAmount(p.currentAmounts.USDC, "USDC")}<br />{tokenAmount(p.currentAmounts.WETH, "WETH")}</dd></div>
            <div><dt>New fees since checkpoint</dt><dd>{tokenAmount(p.newFeesSinceCheckpoint.USDC, "USDC")}<br />{tokenAmount(p.newFeesSinceCheckpoint.WETH, "WETH")}</dd></div>
            <div><dt>Stored owed · mixed</dt><dd>{tokenAmount(p.storedOwed.USDC, "USDC")}<br />{tokenAmount(p.storedOwed.WETH, "WETH")}</dd></div>
            <div><dt>Estimated collectable</dt><dd>{tokenAmount(p.collectable.USDC, "USDC")}<br />{tokenAmount(p.collectable.WETH, "WETH")}</dd></div></dl>
          <p className="form-help">Stored owed may include withdrawn principal and fees. Collectable is an estimate, may include rounding dust, and is not profit. Current principal excludes collectable tokens.</p>
          <div className="testnet-actions">{["Add liquidity", "Remove liquidity", "Collect tokens", "Close position"].map(label => <button className="button demo-reset" disabled key={label}>{label}</button>)}</div>
        </article>)}</div>
        {page.nextCursor && <button className="button demo-reset" disabled={busy || stale} onClick={() => void read(true)}>Scan next NFT</button>}
        <details className="quote-provenance"><summary>Read provenance</summary><p>Owner: {page.owner}</p><p>Source: {page.source} · runtime verified</p><p>Observed: {page.snapshot.observedAt}</p><p>Block hash: {page.snapshot.hash}</p><p>All pages use the same pinned block; refresh after 120 seconds.</p></details>
      </>}
    </section>
  </div>;
}
