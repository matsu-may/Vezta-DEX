import Link from "next/link";
import { PoolList } from "../../../components/pool-list";
import { DataUnavailable } from "../../../components/data-unavailable";
import { createDexApi } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function ExplorePage() {
  let data: Awaited<ReturnType<typeof loadExplore>> | null = null;
  try {
    data = await loadExplore();
  } catch {
    // Provider errors are rendered as a visible state, not as invented metrics.
  }

  return (
    <div className="page-stack">
      <section className="hero">
        <div className="eyebrow">POLYGON · UNISWAP V3</div>
        <h1>Explore liquidity with the source in view.</h1>
        <p>Browse a deliberately small set of native USDC and WETH pools. Every pool read is tied to a Polygon block.</p>
        <div className="hero-actions"><Link className="button button-primary" href="/polygon/pools">View pools <span aria-hidden="true">↗</span></Link></div>
      </section>

      <section className="section-card" aria-labelledby="tokens-title">
        <div className="section-heading"><div><div className="eyebrow">CURATED ASSETS</div><h2 id="tokens-title">Tokens</h2></div><span className="section-note">Identified by chain and address</span></div>
        {data ? <div className="token-grid">{data.tokens.map((token) => <article className="token-card" key={`${token.chainId}:${token.address.toLowerCase()}`}>
          <div className="token-symbol">{token.symbol}</div><div className="token-name">{token.name}</div>
          <code className="address" title={token.address}>{token.address}</code>
          <div className="token-meta">Polygon · {token.decimals} decimals</div>
        </article>)}</div> : <DataUnavailable />}
      </section>

      <section className="section-card" aria-labelledby="pools-title">
        <div className="section-heading"><div><div className="eyebrow">ON-CHAIN READS</div><h2 id="pools-title">Curated pools</h2></div><span className="section-note">Factory + pool state</span></div>
        {data ? <PoolList pools={data.pools} now={data.fetchedAt} /> : <DataUnavailable />}
        <p className="data-caveat">Active liquidity is a protocol value, not USD TVL. Volume, fees, and APR are unavailable in this preview.</p>
      </section>
    </div>
  );
}

async function loadExplore() {
  const api = createDexApi();
  const [tokens, pools] = await Promise.all([api.getTokens(), api.getPools()]);
  return { tokens, pools, fetchedAt: Date.now() };
}
