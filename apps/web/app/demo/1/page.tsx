import type { Metadata } from "next";
import { TestnetWalletPanel } from "../../../components/testnet-wallet-panel";
import { testnetDemoEnabled } from "../../../lib/testnet-demo-gate";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet swap demo" };
export default function RecordingDemoPage() {
  return <div className="demo-page testnet-page recording-page swap-recording-page">
    <div id="demo-pool"><TestnetWalletPanel executionEnabled={testnetDemoEnabled()} presentation="demo" /></div>
    <p className="recording-disclaimer">Test tokens only · Uniswap v3 · 0.5% slippage</p>
  </div>;
}
