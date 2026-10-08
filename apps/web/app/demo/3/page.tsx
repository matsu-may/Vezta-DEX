import type { Metadata } from "next";
import { DemoPoolDiscovery } from "../../../features/explore/components/demo-pool-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia Explore" };
export default function ExploreDemoPage() {
  return <div className="demo-page testnet-page recording-page discovery-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / EXPLORE</span><h1>Explore</h1>
      <p>Explore Uniswap pools with data from the chain.</p></div></header>
    <DemoPoolDiscovery />
    <p className="recording-disclaimer">Test tokens only · Explicit read-only refresh · Desktop demo</p>
  </div>;
}
