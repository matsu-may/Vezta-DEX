import type { Metadata } from "next";
import { DemoNavigation } from "../../../components/demo-navigation";
import { testnetDemoEnabled } from "../../../lib/testnet-demo-gate";
import { TestnetLpWalletPanel } from "../../../components/testnet-lp-wallet-panel";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet liquidity demo" };
export default function LiquidityRecordingPage() {
  return <div className="demo-page testnet-page recording-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / DEMO 02</span><h1>Make your liquidity work.</h1><p>Explore your Uniswap positions with a verified view of the pool.</p></div><span className="recording-network"><span className="network-dot" /> Base Sepolia · Testnet</span></header>
    <DemoNavigation active="liquidity"/>
    <TestnetLpWalletPanel executionEnabled={testnetDemoEnabled()}/><p className="recording-disclaimer">Test tokens only · Uniswap v3 · Explicit wallet actions · Desktop demo</p>
  </div>;
}
