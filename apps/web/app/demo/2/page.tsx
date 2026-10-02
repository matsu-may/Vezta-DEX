import type { Metadata } from "next";
import Link from "next/link";
import { TestnetLpPanel } from "../../../components/testnet-lp-panel";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet liquidity demo" };
export default function LiquidityRecordingPage() {
  return <div className="demo-page testnet-page recording-page">
    <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / DEMO 02</span><h1>Make your liquidity work.</h1><p>Explore your Uniswap positions with a verified view of the pool.</p></div><span className="recording-network"><span className="network-dot" /> Base Sepolia · Testnet</span></header>
    <nav className="recording-tabs" aria-label="Demo navigation"><Link href="/demo/1">Swap</Link><span aria-current="page">Liquidity</span><Link href="/testnet">Technical workspace ↗</Link></nav>
    <TestnetLpPanel /><p className="recording-disclaimer">Test tokens only · Uniswap v3 · Read-only positions · Desktop demo</p>
  </div>;
}
