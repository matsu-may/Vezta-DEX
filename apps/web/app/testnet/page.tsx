import type { Metadata } from "next";
import { TestnetDiscovery } from "../../features/explore/components/testnet-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia testnet" };
import { TestnetWalletPanel } from "../../features/swap/components/testnet-wallet-panel";
import { testnetDemoEnabled } from "../../lib/testnet-demo-gate";
export const dynamic = "force-dynamic";
export default function TestnetPage() { return <div className="demo-page testnet-page">
  <header className="page-heading"><span className="eyebrow">STANDALONE DEMO · BASE SEPOLIA</span><h1>Explore. Review. Swap.</h1>
    <p>Use test tokens to try a small Uniswap swap. Every wallet action requires your confirmation.</p></header>
  <TestnetWalletPanel executionEnabled={testnetDemoEnabled()} />
  <details className="testnet-diagnostics"><summary>Read-only pool depth diagnostics</summary><TestnetDiscovery /></details>
</div>; }
