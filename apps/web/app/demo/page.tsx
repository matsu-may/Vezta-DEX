import Link from "next/link";
import { DemoDex } from "../../components/demo-dex";

export default function DemoPage() {
  return <div className="page-stack demo-page">
    <section className="page-heading">
      <div className="eyebrow">STANDALONE DEX · NO REAL ASSETS</div>
      <h1>Explore the full DEX flow without funding a wallet.</h1>
      <p>Practice a swap and the lifecycle of a liquidity position. All actions on this page are local simulations. Use the main routes for wallet-connected testnet swaps and liquidity positions. Polygon research remains available on its separate read-only pages.</p>
      <div className="demo-links"><Link href="/demo/1">Base Sepolia wallet demo ↗</Link><Link href="/explore">Explore live pools ↗</Link><Link href="/swap">Open testnet swap ↗</Link><Link href="/positions">Read on-chain positions ↗</Link></div>
    </section>
    <DemoDex />
  </div>;
}
