"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import type { TestnetDepthReport } from "@vezta-dex/core";
import { loadTestnetDepth } from "../lib/testnet-depth";

type Pool = TestnetDepthReport["pools"][number];
type Sample = Pool["samples"][number];
const feeLabel = (fee: number) => `${fee / 10000}%`;
const impactLabel = (impact: number | null) => impact === null ? "Unavailable" : `${(impact / 100).toFixed(2)}%`;
function tokenAmount(raw: string, symbol: "USDC" | "WETH") {
  return `${formatUnits(BigInt(raw), symbol === "USDC" ? 6 : 18)} ${symbol}`;
}
function inputToken(sample: Sample) { return sample.direction === "USDC_TO_WETH" ? "USDC" : "WETH"; }
function outputToken(sample: Sample) { return sample.direction === "USDC_TO_WETH" ? "WETH" : "USDC"; }

export function TestnetDiscovery() {
  const [report, setReport] = useState<TestnetDepthReport | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [selectedFee, setSelectedFee] = useState<number | null>(null);
  const [sampleIndex, setSampleIndex] = useState(1);
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!report) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [report]);

  const expired = report !== null && now - Date.parse(report.observedAt) >= 120000;
  const selectedPool = !expired ? report?.pools.find(pool => pool.feeTier === selectedFee && pool.depthQualified) : undefined;
  const sample = selectedPool?.samples[sampleIndex];

  async function refresh() {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(""); setReport(null); setSelectedFee(null);
    try {
      const next = await loadTestnetDepth();
      setNow(Date.now()); setReport(next);
    } catch { setError("Testnet pool data unavailable. Check Base Sepolia RPC configuration and refresh."); }
    finally { busy.current = false; setPending(false); }
  }

  return (
    <div className="demo-page testnet-page">
      <section className="demo-banner">
        <div><span className="eyebrow">BASE SEPOLIA · CHAIN 84532 · TEST TOKENS</span>
          <h1>Explore the testnet.</h1>
          <p>Inspect live USDC / WETH pools and small swap quotes. No funded wallet is needed to explore.</p>
          <p>Testnet prices have no reliable dollar value. Quotes are snapshots; wallet transactions are not enabled here.</p>
        </div>
      </section>
      <section className="testnet-toolbar" aria-label="Pool discovery controls">
        <button className="button button-primary" disabled={pending} onClick={refresh}>
          {pending ? "Checking Base Sepolia pools…" : "Check Base Sepolia pools"}
        </button>
        <p role="status">{pending ? "Reading pools and six quote samples per pool. This can take up to 45 seconds."
          : report ? "Snapshot loaded. Refresh to check current pool depth." : "Start a pool check to load chain data."}</p>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {report && <div className="demo-stack">
        <section className="section-card testnet-provenance" aria-label="Snapshot provenance">
          <div><span className="eyebrow">UNISWAP V3 · BASE SEPOLIA RPC</span>
            <h2>{report.depthQualified ? "Pool depth snapshot" : "No pool passed the demo depth screen."}</h2>
            <p>Depth candidates pass all six samples at ≤1% impact relative to the pool’s fee-adjusted spot price.</p>
          </div>
          <dl className="demo-preview">
            <div><dt>Block</dt><dd>{report.blockNumber}</dd></div>
            <div><dt>Block hash</dt><dd>{report.blockHash}</dd></div>
            <div><dt>Block time</dt><dd>{report.observedAt}</dd></div>
          </dl>
          {expired && <p className="form-error" role="status">Snapshot expired. Refresh before previewing a quote.</p>}
        </section>
        {sample?.amountOut && <section className="section-card testnet-quote" aria-label="Selected quote preview">
          <span className="eyebrow">TESTNET QUOTE SNAPSHOT · {feeLabel(selectedFee!)} POOL</span>
          <h2>{inputToken(sample)} → {outputToken(sample)}</h2>
          <dl className="demo-preview">
            <div><dt>Input</dt><dd>{tokenAmount(sample.amountIn, inputToken(sample))}</dd></div>
            <div><dt>Estimated received</dt><dd>{tokenAmount(sample.amountOut, outputToken(sample))}</dd></div>
            <div><dt>Minimum preview at 0.5% slippage</dt><dd>{tokenAmount((BigInt(sample.amountOut) * 9950n / 10000n).toString(), outputToken(sample))}</dd></div>
            <div><dt>Price impact after fee</dt><dd>{impactLabel(sample.priceImpactBps)}</dd></div>
          </dl>
          <label className="form-label" htmlFor="quote-sample">Quote sample</label>
          <select className="field" id="quote-sample" value={sampleIndex} onChange={event => setSampleIndex(Number(event.target.value))}>
            {selectedPool?.samples.map((item, i) => <option key={i} value={i}>{tokenAmount(item.amountIn, inputToken(item))} → {outputToken(item)}</option>)}
          </select>
          <p className="form-help">This minimum illustrates slippage. Transaction simulation and execution checks follow separately.</p>
        </section>}
        {report.pools.map(pool => <section key={pool.address} className="section-card testnet-pool">
          <div className="testnet-pool-header"><div>
            <span className="eyebrow">USDC / WETH · UNISWAP V3</span><h2>{feeLabel(pool.feeTier)} fee pool</h2>
            <a className="testnet-address" href={`https://sepolia.basescan.org/address/${pool.address}`} target="_blank" rel="noreferrer">{pool.address}</a>
          </div><span className={pool.depthQualified && !expired ? "badge badge-fresh" : "section-note"}>
            {expired ? "Historical snapshot" : pool.depthQualified ? "Depth candidate" : "Outside demo depth policy"}</span></div>
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th scope="col">Input</th><th scope="col">Quoted output</th><th scope="col">Impact after fee</th><th scope="col">Sample result</th></tr></thead>
            <tbody>{pool.samples.map((item, i) => <tr key={i}>
              <td className="mono">{tokenAmount(item.amountIn, inputToken(item))}</td>
              <td className="mono">{item.amountOut ? tokenAmount(item.amountOut, outputToken(item)) : "Unavailable"}</td>
              <td className="mono">{impactLabel(item.priceImpactBps)}</td>
              <td>{item.available ? item.withinImpactLimit ? "Within 1%" : "Above 1%" : item.code === "QUOTE_INVALID" ? "Invalid quote" : "Quote unavailable"}</td>
            </tr>)}</tbody>
          </table></div>
          {pool.depthQualified && <button className="button demo-reset" disabled={expired} onClick={() => { setSelectedFee(pool.feeTier); setSampleIndex(1); }}>
            Preview {feeLabel(pool.feeTier)} pool
          </button>}
        </section>)}
      </div>}
    </div>
  );
}
