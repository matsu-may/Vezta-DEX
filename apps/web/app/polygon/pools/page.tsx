import { PoolList } from "../../../components/pool-list";
import { DataUnavailable } from "../../../components/data-unavailable";
import { createDexApi } from "../../../lib/api";

export const dynamic = "force-dynamic";

export default async function PoolsPage() {
  let data: Awaited<ReturnType<typeof loadPools>> | null = null;
  try {
    data = await loadPools();
  } catch {
    // The provider state is shown below.
  }

  return (
    <div className="page-stack">
      <section className="page-heading"><div className="eyebrow">POOL DIRECTORY</div><h1>Uniswap pools on Polygon</h1><p>Four fee tiers for native USDC and WETH are queried from the v3 factory. Only pools present on-chain appear here.</p></section>
      <section className="section-card" aria-label="Curated pool list">
        {data ? <PoolList pools={data.pools} now={data.fetchedAt} /> : <DataUnavailable />}
        <p className="data-caveat">Pool liquidity is shown in raw protocol units. It cannot be compared with USD TVL or projected LP returns.</p>
      </section>
    </div>
  );
}

async function loadPools() {
  const pools = await createDexApi().getPools();
  return { pools, fetchedAt: Date.now() };
}
