import type { PoolRecord } from "@vezta-dex/core";
import Link from "next/link";
import { isStale } from "../lib/api";

export function PoolList({ pools, now }: { pools: PoolRecord[]; now: number }) {
  if (pools.length === 0) {
    return <div className="empty-state">No curated pools found at the current block.</div>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Pool</th>
            <th scope="col">Fee</th>
            <th scope="col">Active liquidity (raw)</th>
            <th scope="col">Data</th>
          </tr>
        </thead>
        <tbody>
          {pools.map((pool) => (
            <tr key={pool.id}>
              <td>
                <Link className="pool-link" href={`/polygon/pools/${encodeURIComponent(pool.id)}`}>
                  {pool.token0.symbol} / {pool.token1.symbol}
                </Link>
                <span className="subline">Uniswap v3 · Polygon</span>
              </td>
              <td>{pool.feeTier / 10_000}%</td>
              <td className="mono">{pool.activeLiquidity === null ? "Unavailable" : BigInt(pool.activeLiquidity).toLocaleString("en-US")}</td>
              <td>
                <span className={isStale(pool.observedAt, now) ? "badge badge-warning" : "badge badge-fresh"}>
                  {isStale(pool.observedAt, now) ? "Stale" : "Current"}
                </span>
                <span className="subline">Block {pool.blockNumber}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
