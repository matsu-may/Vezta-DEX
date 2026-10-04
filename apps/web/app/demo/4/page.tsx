import type { Metadata } from "next";
import { DemoPoolDiscovery } from "../../../components/demo-pool-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia USDC / WETH pool" };
export default function PoolDetailDemoPage() {
  return <div className="demo-page testnet-page recording-page discovery-page">
    <header className="recording-heading"><div><a className="pool-back-link" href="/demo/3">← Explore pools</a><span className="eyebrow">VEZTA DEX / POOL</span><h1>USDC / WETH</h1>
      <p>USDC / WETH · Uniswap v3 · 0.3% fee · Chain 84532</p></div></header>
    <DemoPoolDiscovery detail />
    <p className="recording-disclaimer">Test tokens only · Chain-sourced quote snapshots · Independent wallet reviews</p>
  </div>;
}
