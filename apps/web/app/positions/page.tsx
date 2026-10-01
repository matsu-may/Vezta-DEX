import Link from "next/link";
import type { Address } from "@vezta-dex/core";
import { DataUnavailable } from "../../components/data-unavailable";
import { LpPositionList } from "../../components/lp-position-list";
import { createDexApi } from "../../lib/api";

export const dynamic = "force-dynamic";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const CURSOR = /^(0|[1-9]\d{0,6})$/;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function PositionsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const query = await searchParams;
  const owner = first(query.owner)?.trim().slice(0, 64) ?? "";
  const rawCursor = first(query.cursor) ?? "0";
  const validOwner = ADDRESS.test(owner);
  const validCursor = CURSOR.test(rawCursor) && Number(rawCursor) <= 1_000_000;
  let data: Awaited<ReturnType<typeof loadPositionPage>> | null = null;
  let unavailable = false;
  if (validOwner && validCursor) {
    try {
      data = await loadPositionPage(owner as Address, Number(rawCursor));
    } catch {
      unavailable = true;
    }
  }

  return (
    <div className="page-stack positions-page">
      <section className="page-heading">
        <div className="eyebrow">POLYGON · UNISWAP V3</div>
        <h1>Liquidity positions</h1>
        <p>Look up an owner&apos;s NFT positions in the curated USDC/WETH 0.05% pool. Reads come from Polygon; no wallet signature is needed.</p>
      </section>
      <section className="section-card" aria-labelledby="position-search-title">
        <div className="section-heading"><h2 id="position-search-title">Find an owner</h2><span className="section-note">Read only · Polygon 137</span></div>
        <form action="/positions" method="get" className="position-search">
          <div><label htmlFor="position-owner" className="form-label">Wallet address</label>
            <input id="position-owner" className="field mono" name="owner" defaultValue={owner} autoComplete="off" maxLength={42}
              placeholder="0x…" aria-describedby="position-search-help" /></div>
          <button className="button button-primary position-search-button" type="submit">View positions</button>
        </form>
        <p id="position-search-help" className="form-help">Only this pool is shown. A wallet may hold NFTs for other pools.</p>
        {owner && !validOwner && <p className="form-error" role="alert">Enter a 42-character EVM wallet address.</p>}
        {validOwner && !validCursor && <p className="form-error" role="alert">Invalid NFT page cursor. Search the wallet again.</p>}
      </section>
      <section className="section-card" aria-labelledby="position-results-title">
        <div className="section-heading"><h2 id="position-results-title">Positions in this pool</h2>
          <Link className="back-link" href="/pools">View pool directory →</Link></div>
        {data ? <LpPositionList page={data.page} owner={owner} now={data.fetchedAt} />
          : unavailable ? <DataUnavailable detail="Polygon position data is temporarily unavailable. Try again shortly." />
            : <div className="empty-state" role="status"><strong>Enter a wallet address</strong><p>Position data will appear after a read from Polygon.</p></div>}
      </section>
    </div>
  );
}

async function loadPositionPage(owner: Address, cursor: number) {
  const page = await createDexApi().getPositionPage(owner, cursor);
  return { page, fetchedAt: Date.now() };
}
