import {notFound} from "next/navigation";
import {testnetChainConfig} from "@vezta-dex/core";
import {testnetNetworkId} from "../../../../lib/testnet-network-selection";
import {testnetDemoEnabled} from "../../../../lib/testnet-demo-gate";
import {TestnetWalletPanel} from "../../../../components/testnet-wallet-panel";
import {TestnetLpWalletPanel} from "../../../../components/testnet-lp-wallet-panel";
import {TestnetChainExplore} from "../../../../components/testnet-chain-explore";
export const dynamic="force-dynamic";
export default async function TestnetProductPage({params}:{params:Promise<{network:string;view:string}>}) {
 const {network,view}=await params,chainId=testnetNetworkId(network);
 if(!chainId || !["swap","positions","explore","pools","pool"].includes(view)) notFound();
 const config=testnetChainConfig(chainId),enabled=testnetDemoEnabled() && (chainId===84532 || process.env.DEX_HOSTED_MODE!=="1");
 return <div className={`demo-page testnet-page recording-page ${view === "swap" ? "swap-recording-page" : ""}`}>
 <header className="recording-heading"><div><span className="eyebrow">VEZTA DEX / {config.label.toUpperCase()}</span><h1>{view === "swap" ? "Swap" : view === "positions" ? "Positions" : view === "pool" ? "Pool details" : "Explore pools"}</h1><p>{chainId===1301 ? "Test tokens · standard EOA wallet required" : "Test tokens · EOA and qualified MetaMask smart accounts"}</p></div></header>
 {view === "swap" ? <TestnetWalletPanel key={chainId} chainId={chainId} executionEnabled={enabled} presentation="demo"/> : view === "positions" ? <TestnetLpWalletPanel key={chainId} chainId={chainId} executionEnabled={enabled} presentation="demo"/> : <TestnetChainExplore key={chainId} chainId={chainId} detail={view==="pool"}/>}
 <p className="recording-disclaimer">Testnet assets have no monetary value · Same-chain swaps and liquidity · Wallet signs every action</p>
 </div>;
}
