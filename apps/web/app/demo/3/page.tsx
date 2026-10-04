import type { Metadata } from "next";
import { DemoNavigation } from "../../../components/demo-navigation";
import { DemoPoolDiscovery } from "../../../components/demo-pool-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia Explore" };
export default function ExploreDemoPage() {
  return <div className="demo-page testnet-page recording-page discovery-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / EXPLORE</span><h1>Explore</h1>
      <p>Explore a curated Uniswap pool with data from the chain.</p></div><span className="recording-network"><span className="network-dot" /> Base Sepolia · Testnet</span></header>
    <DemoNavigation active="explore" /><DemoPoolDiscovery />
    <p className="recording-disclaimer">Test tokens only · Explicit read-only refresh · Desktop demo</p>
  </div>;
}
