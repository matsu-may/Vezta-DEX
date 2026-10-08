import type { Metadata } from "next";
import { testnetDemoEnabled } from "../../../lib/testnet-demo-gate";
import { TestnetLpWalletPanel } from "../../../features/liquidity/components/testnet-lp-wallet-panel";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet liquidity demo" };
export default function LiquidityRecordingPage() {
  return <div className="demo-page testnet-page recording-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / POSITIONS</span><h1>Positions</h1><p>Your Uniswap liquidity positions and earned fees.</p></div></header>

    <TestnetLpWalletPanel executionEnabled={testnetDemoEnabled()} presentation="demo"/><p className="recording-disclaimer">Test tokens only · Uniswap v3 · Explicit wallet actions · Desktop demo</p>
  </div>;
}
