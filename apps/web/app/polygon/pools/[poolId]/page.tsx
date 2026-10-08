import Link from "next/link";
import { DataUnavailable } from "../../../../components/ui/data-unavailable";
import { createDexApi, DexApiError, isStale } from "../../../../features/legacy/polygon/lib/api";

export const dynamic = "force-dynamic";

export default async function PoolDetailPage({ params }: { params: Promise<{ poolId: string }> }) {
  const { poolId } = await params;
  let data: Awaited<ReturnType<typeof loadPool>> | null = null;
  let missing = false;
  try {
    data = await loadPool(poolId);
  } catch (error) {
    missing = error instanceof DexApiError && (error.status === 404 || error.status === 400);
  }

  return (
    <div className="page-stack">
      <Link className="back-link" href="/polygon/pools">← All pools</Link>
      {data ? <>
        <section className="page-heading">
          <div className="eyebrow">POLYGON · UNISWAP V3</div>
          <h1>{data.pool.token0.symbol} / {data.pool.token1.symbol}</h1>
          <p>On-chain state from block <strong>{data.pool.blockNumber}</strong>. Pool fee: <strong>{data.pool.feeTier / 10_000}%</strong>.</p>
          <span className={isStale(data.pool.observedAt, data.fetchedAt) ? "badge badge-warning" : "badge badge-fresh"}>{isStale(data.pool.observedAt, data.fetchedAt) ? "Stale data" : "Current read"}</span>
        </section>
        <section className="detail-grid" aria-label="Pool facts">
          <div className="detail-card"><span>Active liquidity (raw)</span><strong className="mono">{data.pool.activeLiquidity === null ? "Unavailable" : BigInt(data.pool.activeLiquidity).toLocaleString("en-US")}</strong><small>Protocol units, not USD TVL</small></div>
          <div className="detail-card"><span>TVL / 24h volume / APR</span><strong>Unavailable</strong><small>No indexed source has been validated yet</small></div>
          <div className="detail-card"><span>Source</span><strong>Polygon RPC</strong><small>{data.pool.observedAt} · block {data.pool.blockNumber}</small></div>
        </section>
        <section className="section-card" aria-labelledby="contracts-title"><div className="section-heading"><h2 id="contracts-title">Contract identity</h2></div>
          <dl className="identity-list">
            <div><dt>Pool address</dt><dd><code>{data.pool.reference}</code></dd></div>
            <div><dt>Native USDC</dt><dd><code>{data.pool.token0.address}</code></dd></div>
            <div><dt>WETH</dt><dd><code>{data.pool.token1.address}</code></dd></div>
          </dl>
        </section>
      </> : <DataUnavailable detail={missing ? "This pool is not in the curated Polygon set." : "Polygon pool data is temporarily unavailable. Try again shortly."} />}
    </div>
  );
}

async function loadPool(poolId: string) {
  const pool = await createDexApi().getPool(poolId);
  return { pool, fetchedAt: Date.now() };
}
