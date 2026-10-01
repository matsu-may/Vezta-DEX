import Link from "next/link";
import { DemoDex } from "../../components/demo-dex";

export default function DemoPage() {
  return <div className="page-stack demo-page">
    <section className="page-heading">
      <div className="eyebrow">STANDALONE DEX · NO REAL ASSETS</div>
      <h1>Explore the full DEX flow without funding a wallet.</h1>
      <p>Practice a swap and the lifecycle of a liquidity position. All actions on this page are local simulations. Review real Polygon pools and quotes on the separate read-only pages.</p>
      <div className="demo-links"><Link href="/explore">Explore live pools ↗</Link><Link href="/swap">Preview live quote ↗</Link><Link href="/positions">Read on-chain positions ↗</Link></div>
    </section>
    <DemoDex />
  </div>;
}
