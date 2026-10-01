import Link from "next/link";
import { isStale, type LpPositionPage } from "../lib/api";

export function LpPositionList({ page, owner, now }: { page: LpPositionPage; owner: string; now: number }) {
  const nextHref = page.nextCursor === null ? null
    : `/positions?${new URLSearchParams({ owner, cursor: page.nextCursor })}`;
  return (
    <>
      <div className="position-meta">
        <span className={isStale(page.observedAt, now) ? "badge badge-warning" : "badge badge-fresh"}>
          {isStale(page.observedAt, now) ? "Stale read" : "Current read"}
        </span>
        <span className="mono">Polygon block {page.blockNumber}</span>
        <span className="mono">{page.totalOwned} owner NFTs across all pools</span>
      </div>
      {page.positions.length ? (
        <div className="table-wrap">
          <table className="data-table position-table">
            <thead><tr><th scope="col">Position</th><th scope="col">Range (ticks)</th>
              <th scope="col">State</th><th scope="col">Liquidity (raw)</th><th scope="col">Amounts / fees</th></tr></thead>
            <tbody>{page.positions.map(position => (
              <tr key={position.tokenId}>
                <td><strong className="mono">#{position.tokenId}</strong><span className="subline">Uniswap v3 · USDC/WETH · 0.05%</span></td>
                <td className="mono">{position.tickLower} to {position.tickUpper}</td>
                <td><span className={position.inRange ? "badge badge-fresh" : "badge badge-warning"}>
                  {position.inRange ? "In range" : "Out of range"}</span></td>
                <td className="mono">{BigInt(position.liquidity).toLocaleString("en-US")}</td>
                <td>Unavailable<span className="subline">No verified amount or fee calculation</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="empty-state" role="status"><strong>{page.totalOwned === "0" ? "No positions owned"
        : "No matching positions on this page"}</strong>
        <p>{page.incomplete ? "Other owner NFTs remain. Continue scanning to find this pool."
          : "This read covers the fixed Polygon USDC/WETH 0.05% pool."}</p></div>}
      {nextHref && <div className="position-pager"><Link className="button position-next" href={nextHref}>Scan next NFT page →</Link></div>}
      <p className="data-caveat">NFT ownership and raw liquidity come from a pinned Polygon block. Current token amounts and uncollected fees remain unavailable; raw liquidity is not USD value.</p>
    </>
  );
}
