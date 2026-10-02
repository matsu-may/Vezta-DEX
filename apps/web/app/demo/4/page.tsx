import type { Metadata } from "next";
import { DemoNavigation } from "../../../components/demo-navigation";
import { DemoPoolDiscovery } from "../../../components/demo-pool-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia USDC / WETH pool" };
export default function PoolDetailDemoPage() {
  return <div className="demo-page testnet-page recording-page discovery-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / DEMO 04</span><h1>A closer look at the pool.</h1>
      <p>USDC / WETH · Uniswap v3 · 0.3% fee · Chain 84532</p></div><span className="recording-network"><span className="network-dot" /> Base Sepolia · Testnet</span></header>
    <DemoNavigation active="pool" /><DemoPoolDiscovery detail />
    <p className="recording-disclaimer">Test tokens only · Chain-sourced quote snapshots · Independent wallet reviews</p>
  </div>;
}
