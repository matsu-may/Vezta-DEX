import type { Metadata } from "next";
import { TestnetWalletPanel } from "../../../components/testnet-wallet-panel";
import { testnetDemoEnabled } from "../../../lib/testnet-demo-gate";
import { resolveTestnetRoutingSelection } from "../../../lib/testnet-routing-selection";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Vezta DEX — Testnet swap demo" };
export default async function RecordingDemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const selected = resolveTestnetRoutingSelection(await searchParams);
  return <div className="demo-page testnet-page recording-page swap-recording-page">
    <div id="demo-pool"><TestnetWalletPanel key={selected === null ? "invalid" : selected ?? "legacy"} initialPoolFee={selected} executionEnabled={testnetDemoEnabled()} presentation="demo" /></div>
    <p className="recording-disclaimer">Test tokens only · Uniswap v3 · Review your selected slippage before signing</p>
  </div>;
}
