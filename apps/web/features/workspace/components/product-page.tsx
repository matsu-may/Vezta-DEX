import {isAddress} from "viem";
import {testnetChainConfig} from "@vezta-dex/core";
import {testnetDemoEnabled} from "../../../lib/testnet-demo-gate";
import {resolveProductPoolSelection,type ProductRoute} from "../../../lib/product-routes";
import {TestnetWalletPanel} from "../../swap/components/testnet-wallet-panel";
import {TestnetLpWalletPanel} from "../../liquidity/components/testnet-lp-wallet-panel";
import {ProductExplore,UnsupportedAuction} from "../../explore/components/product-explore";
import {ProductPoolDetail} from "../../explore/components/product-pool-detail";
export function ProductPage({route,search={}}:{route:ProductRoute;search?:Record<string,string|string[]|undefined>}) {
 const {chainId,view,tokenId,poolId}=route,config=testnetChainConfig(chainId);
 const enabled=testnetDemoEnabled()&&(chainId===84532||process.env.DEX_HOSTED_MODE!=="1");
 const initialOwner=typeof search.owner==="string" && isAddress(search.owner) ? search.owner : undefined;
 const selected=resolveProductPoolSelection(chainId,search);
 const heading=view==="swap"?"Swap":view==="positions"?"Supply liquidity to collect fees":view==="position"?`Position #${tokenId}`:view==="create"?"Create position":view==="launch-auction"?"Launch auction":"Explore";
 return <div className={`product-page demo-page testnet-page recording-page ${view==="swap"?"swap-recording-page product-swap-page":""}`}>
 {view!=="pool"&&<header className="product-page-heading"><span className="product-subtle">{config.label} · TESTNET</span><h1>{heading}</h1>{view==="positions"&&<p>Manage your Uniswap v3 positions, ranges and collectable tokens.</p>}</header>}
 {view==="swap"?<TestnetWalletPanel key={`${chainId}:${selected??"default"}`} chainId={chainId} initialPoolFee={selected} executionEnabled={enabled} presentation="demo"/>
 :["positions","position","create"].includes(view)?<TestnetLpWalletPanel key={`${chainId}:${view}:${tokenId??""}:${initialOwner??""}`} chainId={chainId} executionEnabled={enabled} presentation="demo" productMode={view==="create"?"create":view==="position"?"detail":"list"} selectedTokenId={tokenId} initialOwner={initialOwner}/>
 :view==="pool"?<ProductPoolDetail chainId={chainId} poolId={poolId??config.policy.pool}/>
 :view==="launch-auction"?<UnsupportedAuction chainId={chainId} launch/>
 :<ProductExplore key={`${chainId}:${view}`} chainId={chainId} view={view as "tokens"|"pools"|"transactions"|"auctions"}/>}
 <p className="recording-disclaimer">Testnet assets have no monetary value · {chainId===1301?"Standard EOA required":"EOA and qualified MetaMask smart accounts"} · Wallet signs every action</p>
 </div>;
}
