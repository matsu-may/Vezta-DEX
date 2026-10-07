"use client";
import Link from "next/link";
import {useState} from "react";
import {testnetChainConfig,type TestnetChainId} from "@vezta-dex/core";
import {testnetNetworkHref} from "../lib/testnet-network-selection";
import {ProductPair,ProductTokenIcon} from "./product-token";
import {ProductActivity} from "./product-activity";
export type ExploreView="tokens"|"pools"|"transactions"|"auctions";
export function ExploreTabs({chainId,view}:{chainId:TestnetChainId;view:ExploreView}) {
 return <nav className="product-tabs" aria-label="Explore views">{["tokens","auctions","pools","transactions"].map(tab=><Link key={tab} href={testnetNetworkHref(chainId,`explore/${tab}`)} aria-current={view===tab?"page":undefined}>{tab[0].toUpperCase()+tab.slice(1)}</Link>)}</nav>;
}
export function UnsupportedAuction({chainId,launch=false}:{chainId:TestnetChainId;launch?:boolean}) {
 return <section className="product-empty"><span className="product-empty-symbol" aria-hidden="true">◇</span><h2>{launch?"Auction launches are not supported yet":"Auctions are not supported yet"}</h2><p>This testnet workspace supports Uniswap v3 swaps and liquidity positions. Auction creation and bidding require a separate integration.</p><Link className="button button-primary" href={testnetNetworkHref(chainId,"explore/pools")}>Explore pools</Link></section>;
}
export function ProductExplore({chainId,view}:{chainId:TestnetChainId;view:ExploreView}) {
 const config=testnetChainConfig(chainId),C=config.candidate,[search,setSearch]=useState("");
 const href=(path:string)=>testnetNetworkHref(chainId,path),match=(text:string)=>text.toLowerCase().includes(search.trim().toLowerCase());
 const tokens=(["USDC","WETH"] as const).filter(symbol=>match(`${symbol} ${C[symbol].address}`));
 const pools=config.pools.filter(p=>match(`USDC WETH Uniswap v3 ${p.pool} ${p.feeTier/10000}%`));
 return <div className="product-explore"><div className="product-overview"><span>Network<strong>{config.label}</strong></span><span>Protocol<strong>Uniswap v3</strong></span><span>Supported tokens<strong>2</strong></span><span>Curated pools<strong>{config.pools.length}</strong></span></div>
 <ExploreTabs chainId={chainId} view={view}/>
 {view==="auctions"?<UnsupportedAuction chainId={chainId}/>:view==="transactions"?<ProductActivity chainId={chainId}/>:<>
 <div className="product-toolbar"><p>{view==="tokens"?"Supported testnet assets":"Curated pools · fresh checks required before execution"}</p><div>{view==="pools"&&<Link className="button button-primary" href={href("positions/create")}>＋ New position</Link>}<label className="product-search"><span className="sr-only">{view==="tokens"?"Search tokens":"Search pools"}</span><input aria-label={view==="tokens"?"Search tokens":"Search pools"} value={search} onChange={e=>setSearch(e.target.value)} placeholder={view==="tokens"?"Search tokens":"Token, fee or address"}/><span aria-hidden="true">⌕</span></label></div></div>
 <div className="table-wrap"><table className="product-table"><thead><tr><th>#</th><th>{view==="tokens"?"Token":"Pool"}</th>{view==="tokens"?<><th>Decimals</th><th>Contract</th></>:<><th>Fee tier</th><th>Liquidity actions</th><th>Data status</th></>}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>
 {view==="tokens"?tokens.map((token,i)=><tr key={token}><td>{i+1}</td><td><div className="product-pair-label"><ProductTokenIcon token={token}/><div><strong>{token==="USDC"?"USD Coin":"Wrapped Ether"}</strong><small>{token} · {config.label}</small></div></div></td><td>{token==="USDC"?6:18}</td><td><a className="mono product-address" href={`${config.explorer}/address/${C[token].address}`} target="_blank" rel="noreferrer">{C[token].address}</a></td><td><Link className="text-action" href={href("swap")}>Swap ↗</Link></td></tr>):pools.map((pool,i)=><tr key={pool.pool}><td>{i+1}</td><td><Link className="product-pair-label" href={href(`pools/${pool.pool}`)} aria-label={`View ${pool.feeTier/10000}% pool`}><ProductPair/><div><strong>USDC / WETH</strong><small>v3 · {config.label}</small></div></Link></td><td>{pool.feeTier/10000}%</td><td>{pool.pool.toLowerCase()===config.policy.pool.toLowerCase()?"Create & manage positions":"LP unavailable · swap requires checks"}</td><td><span className="product-subtle">Curated · refresh sample in detail</span></td><td><Link className="text-action" href={href(`pools/${pool.pool}`)}>View details ↗</Link></td></tr>)}
 </tbody></table></div>
 {(view==="tokens"?tokens:pools).length===0&&<p className="product-empty" role="status">{view==="tokens"?"No tokens match your search.":"No pools match your search."}</p>}
 <p className="product-data-note">Testnet assets have no monetary value. USD prices, TVL, volume and APR are unavailable. Curated identities are not a live execution qualification.</p>
 </>}
 </div>;
}
