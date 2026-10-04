import type { Metadata } from "next";
import { DemoNavigation } from "../../../components/demo-navigation";
import { TestnetWalletPanel } from "../../../components/testnet-wallet-panel";
import { testnetDemoEnabled } from "../../../lib/testnet-demo-gate";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet swap demo" };
export default function RecordingDemoPage() {
  return <div className="demo-page testnet-page recording-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / SWAP</span><h1>Swap</h1>
      <p>Swap USDC and WETH with Uniswap. Your wallet stays in control.</p></div>
      <span className="recording-network"><span className="network-dot" /> Base Sepolia · Testnet</span></header>
    <DemoNavigation active="swap" />
    <div id="demo-pool"><TestnetWalletPanel executionEnabled={testnetDemoEnabled()} presentation="demo" /></div>
    <p className="recording-disclaimer">Test tokens only · Uniswap v3 · 0.5% slippage · Your wallet signs each reviewed transaction</p>
  </div>;
}
