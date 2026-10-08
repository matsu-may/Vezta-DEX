"use client";
import {useState,type ReactNode} from "react";
import Link from "next/link";
import {testnetChainConfig,type TestnetChainId,type TestnetLpRange,lpRangePrices,TESTNET_LP_FULL_RANGE} from "@vezta-dex/core";
import {testnetNetworkHref} from "../../../lib/testnet-network-selection";
import {ProductPair} from "../../../components/ui/product-token";
export function ProductRangeDiagram({range}:{range:TestnetLpRange|null}) {
 const full=range?.tickLower===TESTNET_LP_FULL_RANGE.tickLower && range.tickUpper===TESTNET_LP_FULL_RANGE.tickUpper;
 const actual=range&&!full?lpRangePrices(range):null;
 return <div className="product-range-diagram"><p>Selected price range <span>USDC per WETH</span></p><div className="range-band" role="img" aria-label={full?"Full usable price range":actual?`Selected bounds ${actual.lower} to ${actual.upper}`:"Enter valid range bounds"}><span className="range-end"/><span className="range-fill"/><span className="range-end"/></div><div className="range-labels"><strong>{full?"Full usable minimum":actual?.lower??"Lower bound"}</strong><strong>{full?"Full usable maximum":actual?.upper??"Upper bound"}</strong></div><small>No historical chart or liquidity distribution is available. This diagram shows your selected bounds only.</small></div>;
}
export function ProductLpCreate({chainId,controls,range,reviewing,blocked,onBack}:{chainId:TestnetChainId;controls:ReactNode;range:TestnetLpRange|null;reviewing:boolean;blocked:boolean;onBack:()=>void}) {
 const [selected,setSelected]=useState(false),config=testnetChainConfig(chainId);
 return <div className="product-create"><nav className="product-breadcrumb" aria-label="Breadcrumb"><Link href={testnetNetworkHref(chainId,"positions")}>Your positions</Link><span>›</span><span>Create position</span></nav>
 <h2>{selected||blocked?"Set your position":"Choose a pool"}</h2>
 <div className="product-create-grid"><aside><ol className="product-steps"><li className={!selected&&!blocked?"current":"done"}><span>1</span><div>Select a pool<small>{selected||blocked?"USDC / WETH · v3 · 0.3%":"Choose a supported execution pool"}</small></div></li><li className={selected&&!reviewing?"current":""}><span>2</span><div>Set range and deposit<small>Full range or custom bounds</small></div></li><li className={reviewing||blocked?"current":""}><span>3</span><div>Review and confirm<small>Approvals and mint are separate</small></div></li></ol>
 {(selected||blocked)&&<div className="product-pool-summary"><ProductPair chainId={chainId}/><h3>USDC / WETH</h3><p>{config.label} · v3 · 0.3%</p><a className="mono product-address" href={`${config.explorer}/address/${config.policy.pool}`} target="_blank" rel="noreferrer">{config.policy.pool.slice(0,10)}…{config.policy.pool.slice(-6)} ↗</a><p>Testnet assets · USD TVL and APR unavailable.</p>{!blocked&&<button className="text-action" onClick={()=>{onBack();setSelected(false);}}>← Change pool</button>}</div>}
 </aside><div>{!selected&&!blocked?<section className="product-pool-picker"><div className="product-toolbar"><p>Supported liquidity pool</p><span className="badge">{config.label}</span></div><button className="product-pool-choice" aria-label="Select USDC / WETH pool" onClick={()=>setSelected(true)}><ProductPair chainId={chainId}/><span><strong>USDC / WETH</strong><small>Uniswap v3 · 0.3% fee · full/custom range</small></span><span aria-hidden="true">→</span></button><p className="product-data-note">Only the qualified 0.3% pool supports LP execution. Other curated fee tiers are available for swap discovery.</p></section>:<div className="product-position-form">{!blocked&&<ProductRangeDiagram range={range}/>} {controls}</div>}</div></div>
 </div>;
}
