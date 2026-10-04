"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import { BASE_SEPOLIA_CANDIDATE as tokens, TESTNET_SWAP_POLICY as policy, type TestnetDepthReport } from "@vezta-dex/core";
import { loadTestnetDepth } from "../lib/testnet-depth";

type Pool = TestnetDepthReport["pools"][number];
function AddressLink({ address }: { address: string }) {
  return <a className="mono discovery-address" href={`https://sepolia.basescan.org/address/${address}`} target="_blank" rel="noreferrer">{address} ↗</a>;
}
function PoolIdentity() {
  return <section className="section-card discovery-identity" aria-label="Curated pool identity">
    <span className="eyebrow">PINNED TESTNET CONTRACTS</span><h2>Pool identity</h2>
    <dl className="identity-list">
      <div><dt>Network</dt><dd>Base Sepolia · Chain 84532</dd></div>
      <div><dt>Protocol / fee</dt><dd>Uniswap v3 / 0.3%</dd></div>
      <div><dt>Pool</dt><dd><AddressLink address={policy.pool} /></dd></div>
      <div><dt>USDC · 6 decimals</dt><dd><AddressLink address={tokens.USDC.address} /></dd></div>
      <div><dt>WETH · 18 decimals</dt><dd><AddressLink address={tokens.WETH.address} /></dd></div>
      <div><dt>Position manager</dt><dd><AddressLink address={tokens.v3PositionManager} /></dd></div>
    </dl>
    <p className="data-caveat">Registry identities are fixed. Refresh to read the pool’s current depth. Test tokens have no reliable dollar value.</p>
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

export function DemoPoolDiscovery({ detail = false }: { detail?: boolean }) {
  const [report, setReport] = useState<TestnetDepthReport | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(0);
  const busy = useRef(false);
  useEffect(() => {
    if (!report) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [report]);
  const expired = report !== null && now - Date.parse(report.observedAt) >= 120000;
  const pool = report?.pools.find(item => item.feeTier === policy.feeTier && item.address.toLowerCase() === policy.pool.toLowerCase());
  const qualified = !!pool?.depthQualified && !expired;
  const status = pending ? "Checking pool depth…" : expired ? "Snapshot expired · refresh required"
    : !report ? "Awaiting pool check" : !pool ? "Curated pool not found" : pool.depthQualified ? "Depth screen passed" : "Outside demo depth policy";

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
        <h2>{detail ? "Pool overview" : "Available pool"}</h2>
        <p>{detail ? "Inspect the pinned 0.3% pool before opening your wallet workflow." : "USDC / WETH on Base Sepolia. The 0.3% pool is the demo’s supported swap and liquidity path."}</p>
      </div><button className="button button-primary" onClick={refresh} disabled={pending}>{pending ? "Refreshing…" : "Refresh pool data"}</button></div>
      <dl className="discovery-metrics"><div><dt>Network</dt><dd>Base Sepolia</dd></div><div><dt>Protocol</dt><dd>Uniswap v3</dd></div><div><dt>Pool fee</dt><dd>0.3%</dd></div><div><dt>USD TVL / APR</dt><dd className="metric-unavailable">Unavailable on testnet</dd></div></dl>
      <div className="discovery-pair-row"><div className="discovery-pair"><span className="discovery-token" aria-hidden="true">$</span><span className="discovery-token discovery-token-eth" aria-hidden="true">Ξ</span>
        <div><strong>USDC / WETH</strong><span>Uniswap v3 · 0.3% fee · Test tokens</span></div></div>
        <span className={`badge ${qualified ? "badge-fresh" : "badge-warning"}`} role="status">{status}</span>
        {!detail && <Link className="discovery-detail-link" href="/demo/4">View pool detail</Link>}
      </div>
      {error && <p className="form-error" role="alert">Pool data unavailable. Check the Base Sepolia read service and refresh.</p>}
      <p className="discovery-help">{pending ? "Reading a pinned block and bounded quote samples. This can take up to 45 seconds."
        : !report ? "No data is read until you refresh. No wallet connection is needed."
        : !pool ? "The pinned pool is absent from this report. Other fee tiers are outside the demo’s execution path."
        : expired ? "Historical evidence remains visible. Refresh before opening a new workflow."
        : !qualified ? "The current quote samples did not pass the depth screen. Refresh later to check again."
        : "The sample depth screen passed. Each wallet action still requires its own fresh study, simulation and review."}</p>
      {qualified && <div className="discovery-actions"><Link className="button button-primary" href="/demo/1">Swap USDC / WETH</Link><Link className="button demo-reset" href="/demo/2">Manage liquidity</Link></div>}
      {report && <section className="discovery-provenance" aria-label="Snapshot provenance">
        <h3>Snapshot provenance</h3><dl>
          <div><dt>Source</dt><dd className="mono">{report.source}</dd></div>
          <div><dt>Observed block time</dt><dd><time dateTime={report.observedAt}>{report.observedAt}</time></dd></div>
          <div><dt>Block</dt><dd className="mono">{report.blockNumber}</dd></div>
        </dl>
        <details><summary>Block hash</summary><code>{report.blockHash}</code></details>
      </section>}
      {detail && pool && <QuoteSamples pool={pool} />}
    </section>
    {detail ? <PoolIdentity /> : <section className="discovery-note"><span className="eyebrow">A SMALL, BOUNDED TESTNET</span>
      <p>Explore the curated pool, swap test tokens, then open your liquidity positions. Pool data is a moment in time; refresh when you return.</p>
      <Link href="/demo/4">Inspect pool and token addresses ↗</Link></section>}
  </div>;
}
