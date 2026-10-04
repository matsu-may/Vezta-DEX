"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { BASE_SEPOLIA_CANDIDATE as tokens, TESTNET_SWAP_POLICY as policy, type TestnetDepthReport } from "@vezta-dex/core";
import { loadTestnetDepth } from "../lib/testnet-depth";

type Pool = TestnetDepthReport["pools"][number];
type Selection = { fee?: string; pool?: string };
const feeLabel = (fee: number) => `${fee / 10000}%`;
const isPinned = (pool: Pool) => pool.feeTier === policy.feeTier && pool.address.toLowerCase() === policy.pool.toLowerCase();
const identity = (pool: Pool) => `${pool.feeTier}:${pool.address.toLowerCase()}`;
function requestedIdentity(selection?: Selection) {
  if (!selection || (selection.fee === undefined && selection.pool === undefined)) return `${policy.feeTier}:${policy.pool.toLowerCase()}`;
  if (!/^(100|500|3000|10000)$/.test(selection.fee ?? "") || !/^0x[0-9a-fA-F]{40}$/.test(selection.pool ?? "")) return null;
  return `${selection.fee}:${selection.pool!.toLowerCase()}`;
}
function detailHref(pool: Pool) {
  return `/demo/4?${new URLSearchParams({ fee: String(pool.feeTier), pool: pool.address })}`;
}
function AddressLink({ address }: { address: string }) {
  return <a className="mono discovery-address" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer">{address} ↗</a>;
}
function PoolIdentity({ pool }: { pool: Pool }) {
  return <section className="section-card discovery-identity" aria-label="Selected pool identity">
    <span className="eyebrow">OBSERVED TESTNET CONTRACTS</span><h2>Pool identity</h2>
    <dl className="identity-list">
      <div><dt>Network</dt><dd>Base Sepolia · Chain 84532</dd></div>
      <div><dt>Protocol / fee</dt><dd>Uniswap v3 / {feeLabel(pool.feeTier)}</dd></div>
      <div><dt>Pool</dt><dd><AddressLink address={pool.address} /></dd></div>
      <div><dt>USDC · 6 decimals</dt><dd><AddressLink address={tokens.USDC.address} /></dd></div>
      <div><dt>WETH · 18 decimals</dt><dd><AddressLink address={tokens.WETH.address} /></dd></div>
      <div><dt>Position manager</dt><dd><AddressLink address={tokens.v3PositionManager} /></dd></div>
    </dl>
    <p className="data-caveat">{isPinned(pool) ? "This is the pinned execution pool. Wallet workflows still recheck current depth and simulation." : "This pool is read-only. Passing the depth screen does not qualify its execution path."} Test tokens have no reliable dollar value.</p>
  </section>;
}
function QuoteSamples({ pool }: { pool: Pool }) {
  return <details className="discovery-diagnostics">
    <summary>Inspect six quote samples</summary>
    <p>Depth passes when every sample is available with ≤1% price impact against the fee-adjusted spot price. These snapshots are read-only; wallet reviews request fresh quotes and simulations.</p>
    <div className="table-wrap"><table className="data-table discovery-samples">
      <thead><tr><th scope="col">Sample input</th><th scope="col">Quoted output</th><th scope="col">Impact after fee</th><th scope="col">Result</th></tr></thead>
      <tbody>{pool.samples.map((sample, index) => {
        const forward = sample.direction === "USDC_TO_WETH";
        return <tr key={index}>
          <td className="mono">{formatUnits(BigInt(sample.amountIn), forward ? 6 : 18)} {forward ? "USDC" : "WETH"}</td>
          <td className="mono">{sample.amountOut ? `${formatUnits(BigInt(sample.amountOut), forward ? 18 : 6)} ${forward ? "WETH" : "USDC"}` : "Unavailable"}</td>
          <td className="mono">{sample.priceImpactBps === null ? "Unavailable" : `${(sample.priceImpactBps / 100).toFixed(2)}%`}</td>
          <td>{!sample.available ? "Quote unavailable" : sample.withinImpactLimit ? "Within 1%" : "Above 1%"}</td>
        </tr>;
      })}</tbody>
    </table></div>
  </details>;
}

export function DemoPoolDiscovery({ detail = false, selection }: { detail?: boolean; selection?: Selection }) {
  const [report, setReport] = useState<TestnetDepthReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const [selectedIdentity, setSelectedIdentity] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("fee-asc");
  const busy = useRef(false);
  useEffect(() => {
    if (!report) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [report]);
  const expired = report !== null && now - Date.parse(report.observedAt) >= 120000;
  const pools = (report?.pools ?? []).filter(item => {
    const text = `USDC WETH Base Sepolia Uniswap v3 ${feeLabel(item.feeTier)} ${item.feeTier} ${item.address}`.toLowerCase();
    return text.includes(search.trim().toLowerCase()) && (filter === "all"
      || (filter === "depth-passed" && item.depthQualified)
      || (filter === "outside-depth" && !item.depthQualified)
      || (filter === "pinned" && isPinned(item))
      || (filter === "read-only" && !isPinned(item)));
  }).sort((a, b) => sort === "fee-desc" ? b.feeTier - a.feeTier : a.feeTier - b.feeTier);
  const wanted = detail ? requestedIdentity(selection) : selectedIdentity ?? requestedIdentity(selection);
  const hasRequestedSelection = selection?.fee !== undefined || selection?.pool !== undefined;
  const pool = report?.pools.find(item => identity(item) === wanted);
  const visibleSelection = detail || pools.some(item => identity(item) === wanted);
  const qualified = !!pool?.depthQualified && isPinned(pool) && !expired && visibleSelection;
  const status = pending ? "Checking pool depth…" : expired ? "Snapshot expired · refresh required"
    : !report ? "Awaiting pool check" : !pool ? hasRequestedSelection ? "Selected pool not found" : "Curated pool not found"
      : pool.depthQualified ? "Depth screen passed" : "Outside demo depth policy";

  async function refresh() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(false); setReport(null);
    try { const next = await loadTestnetDepth(); setNow(Date.now()); setReport(next); }
    catch { setError(true); }
    finally { busy.current = false; setPending(false); }
  }

  return <div className="discovery-stack">
    <section className="section-card discovery-card" aria-label={detail ? "Pool detail" : "Curated pool discovery"} aria-busy={pending}>
      <div className="discovery-toolbar"><div><span className="eyebrow">CURATED PAIR · UNISWAP V3</span>
        <h2>{detail ? "Pool overview" : "Observed pools"}</h2>
        <p>USDC / WETH on Base Sepolia. Explore observed fee tiers; only the pinned 0.3% pool supports the demo’s wallet workflows.</p>
      </div><button className="button button-primary" onClick={refresh} disabled={pending}>{pending ? "Refreshing…" : "Refresh pool data"}</button></div>
      {detail ? <>
        <dl className="discovery-metrics"><div><dt>Network</dt><dd>Base Sepolia</dd></div><div><dt>Protocol</dt><dd>Uniswap v3</dd></div><div><dt>Pool fee</dt><dd>{pool ? feeLabel(pool.feeTier) : "Awaiting identity check"}</dd></div></dl>
        <div className="discovery-pair-row"><div className="discovery-pair"><span className="discovery-token" aria-hidden="true">$</span><span className="discovery-token discovery-token-eth" aria-hidden="true">Ξ</span><div><strong>USDC / WETH</strong><span>{pool && isPinned(pool) ? "Test tokens · pinned execution pool" : "Test tokens · read-only pool"}</span></div></div><span className={`badge ${qualified ? "badge-fresh" : "badge-warning"}`} role="status">{status}</span></div>
      </> : <>
        <div className="discovery-filters" role="group" aria-label="Pool filters">
          <label className="form-label">Search pools<input className="field" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Token, fee or pool address" /></label>
          <label className="form-label">Pool status<select className="field" value={filter} onChange={event => setFilter(event.target.value)}>
            <option value="all">All observed pools</option><option value="depth-passed">Passed depth screen</option><option value="outside-depth">Outside depth policy</option><option value="pinned">Pinned execution pool</option><option value="read-only">Read-only pools</option>
          </select></label>
          <label className="form-label">Sort pools<select className="field" value={sort} onChange={event => setSort(event.target.value)}>
            <option value="fee-asc">Fee: low to high</option><option value="fee-desc">Fee: high to low</option>
          </select></label>
        </div>
        {report && pools.length > 0 ? <div className="table-wrap"><table className="data-table discovery-pool-table" aria-label="Observed pools"><thead><tr><th scope="col">Pool / fee</th><th scope="col">Depth</th><th scope="col">Freshness</th><th scope="col">Execution</th><th scope="col">Selection</th></tr></thead><tbody>{pools.map(item => <tr key={identity(item)} aria-selected={identity(item) === wanted} className={identity(item) === wanted ? "discovery-row-selected" : undefined}>
          <th scope="row"><div className="discovery-pair"><span className="discovery-token" aria-hidden="true">$</span><span className="discovery-token discovery-token-eth" aria-hidden="true">Ξ</span><div><strong>USDC / WETH</strong><span>Uniswap v3 · {feeLabel(item.feeTier)}</span><span className="mono">{item.address.slice(0, 6)}…{item.address.slice(-4)}</span></div></div></th>
          <td><span className={`badge ${item.depthQualified && !expired ? "badge-fresh" : "badge-warning"}`}>{item.depthQualified ? "Depth screen passed" : "Outside demo depth policy"}</span></td>
          <td>{expired ? "Historical" : "Fresh"} · block {report.blockNumber}</td>
          <td>{!isPinned(item) ? "Read-only · unqualified execution" : expired ? "Read-only · refresh required" : !item.depthQualified ? "Read-only · depth required" : "Pinned · fresh wallet checks required"}</td>
          <td><button className="button demo-reset" aria-label={`Select ${feeLabel(item.feeTier)} pool`} aria-pressed={identity(item) === wanted} onClick={() => setSelectedIdentity(identity(item))}>{identity(item) === wanted ? "Selected" : "Select"}</button><Link className="discovery-detail-link" href={detailHref(item)} aria-label={`View ${feeLabel(item.feeTier)} pool detail`}>View detail ↗</Link></td>
        </tr>)}</tbody></table></div> : <p className="discovery-help" role="status">{report ? report.pools.length ? "No pools match your filters." : "No pools observed at this block." : status}</p>}
        {pool && visibleSelection && <p className="discovery-selection">Selected {feeLabel(pool.feeTier)} pool · <span className="mono">{pool.address}</span></p>}
      </>}
      <p className="form-help">USD TVL and APR are unavailable on testnet.</p>
      {error && <p className="form-error" role="alert">Pool data unavailable. Check the Base Sepolia read service and refresh.</p>}
      <p className="discovery-help">{pending ? "Reading a pinned block and bounded quote samples. This can take up to 45 seconds."
        : !report ? "No data is read until you refresh. No wallet connection is needed."
        : !pool ? "The requested pool identity is absent from this report. Choose an observed pool in Explore."
        : expired ? "Historical evidence remains visible. Refresh before opening a new workflow."
        : !isPinned(pool) ? "Read-only pool. Depth samples do not qualify another router or pool for wallet execution."
        : !qualified ? "The current quote samples did not pass the depth screen. Refresh later to check again."
        : "The sample depth screen passed. Each wallet action still requires its own fresh study, simulation and review."}</p>
      {pool && visibleSelection && <div className="discovery-actions">{qualified ? <><Link className="button button-primary" href="/demo/1">Swap USDC / WETH</Link><Link className="button demo-reset" href="/demo/2">Manage liquidity</Link></> : <><button className="button button-primary" disabled>Swap USDC / WETH</button><button className="button demo-reset" disabled>Manage liquidity</button></>}</div>}
      {report && <details className="discovery-source-details"><summary>Source and block</summary><section className="discovery-provenance" aria-label="Snapshot provenance">
        <h3>Snapshot provenance</h3><p>All observed pools share this source and pinned block.</p><dl>
          <div><dt>Source</dt><dd className="mono">{report.source}</dd></div>
          <div><dt>Observed block time</dt><dd><time dateTime={report.observedAt}>{report.observedAt}</time></dd></div>
          <div><dt>Block</dt><dd className="mono">{report.blockNumber}</dd></div>
        </dl>
        <details><summary>Block hash</summary><code>{report.blockHash}</code></details>
      </section></details>}
      {detail && pool && <QuoteSamples pool={pool} />}
    </section>
    {detail && pool && <PoolIdentity pool={pool} />}
  </div>;
}
