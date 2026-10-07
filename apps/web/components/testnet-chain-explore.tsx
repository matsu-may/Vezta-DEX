"use client";
import Link from "next/link";
import {useRef,useState,useEffect} from "react";
import {testnetChainConfig,createTestnetSwapDomain,type TestnetChainId} from "@vezta-dex/core";
import {createTestnetWalletContracts,type TestnetWalletQuote} from "../lib/testnet-wallet-contracts";
import {createTestnetWalletClient} from "../lib/testnet-wallet-client";
import {testnetNetworkHref} from "../lib/testnet-network-selection";
import {testnetAmount} from "./testnet-wallet-review";
async function readSample(chainId: TestnetChainId, poolFeeTier?: number) {
 const C=testnetChainConfig(chainId).candidate;
 const intent=createTestnetSwapDomain(chainId).parseTestnetSwapIntent({chainId,wallet:"0x1111111111111111111111111111111111111111",tokenIn:C.USDC.address,tokenOut:C.WETH.address,amountIn:"1000000",slippageBps:50,...(poolFeeTier === undefined ? {} : {poolFeeTier})});
 const response=await createTestnetWalletClient(fetch,chainId).call("quote",intent);
 const time=Date.now();
 return {checked:createTestnetWalletContracts(chainId).parseTestnetWalletQuote(response,intent,time),time};
}
export function TestnetChainExplore({chainId,detail=false,poolId,sampleOnly=false}:{chainId:TestnetChainId;detail?:boolean;poolId?:string;sampleOnly?:boolean}) {
 const config=testnetChainConfig(chainId),C=config.candidate,P=config.policy;
 const selected=config.pools.find(p=>p.pool.toLowerCase()===(poolId ?? P.pool).toLowerCase()) ?? {pool:P.pool,feeTier:P.feeTier};
 const [quote,setQuote]=useState<TestnetWalletQuote|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [filter,setFilter]=useState("");
 const matches=!filter || (`USDC WETH Uniswap v3 ${P.pool}`).toLowerCase().includes(filter.toLowerCase());
 const generation=useRef(0),[now,setNow]=useState(0);
 useEffect(()=>()=>{generation.current++;},[]);
 useEffect(()=>{if(!quote) return; const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[quote]);
 async function refresh() {
  if(busy) return;const token=++generation.current;setBusy(true);setQuote(null);setError("");
  try {
   // A deterministic public address binds this read; it is not the connected wallet.
   const {checked,time}=await readSample(chainId,poolId ? selected.feeTier : undefined);
   if(generation.current===token){setQuote(checked);setNow(time);}
  } catch {if(generation.current===token) setError("Pool sample unavailable. Check this chain's RPC configuration and refresh explicitly.");}
  finally {if(generation.current===token) setBusy(false);}
 }
 const stale=!!quote && now>=Date.parse(createTestnetSwapDomain(chainId).testnetQuoteExpiresAt(quote.quote));
 const address=(value:string)=><a className="mono discovery-address" href={`${config.explorer}/address/${value}`} target="_blank" rel="noreferrer">{value} ↗</a>;
 return <div className="discovery-page">{!detail && !sampleOnly && <label className="form-label">Filter pools<input className="field" value={filter} onChange={event=>setFilter(event.target.value)} placeholder="Token, protocol or address"/></label>}{!matches ? <p role="status">No pools match your filter.</p> : <section className="section-card"><div className="positions-list-heading"><div><h2>USDC / WETH</h2><p>{config.label} · Uniswap v3 · {selected.feeTier/10000}% fee</p></div><span className="badge">TESTNET</span></div>
 <p className="form-help">Curated pool · execution requires fresh checks. Refresh reads a representative 1 USDC quote; it does not connect a wallet, approve or send a transaction.</p>
 <button className="button" disabled={busy} onClick={()=>void refresh()}>{busy ? "Reading pool…" : "Refresh pool sample"}</button>
 {error && <p role="alert">{error}</p>}
 {quote && <><p role="status">{stale ? "Historical sample · refresh before using" : "Verified runtime and pinned-block sample"}</p><dl className="demo-preview"><div><dt>Sample input</dt><dd>1 USDC</dd></div><div><dt>Quoted output</dt><dd>{testnetAmount(quote.quote.amountOut,C.WETH.address,chainId)}</dd></div><div><dt>Minimum at 0.5% slippage</dt><dd>{testnetAmount(quote.quote.minimumAmountOut,C.WETH.address,chainId)}</dd></div><div><dt>Impact after fee</dt><dd>{(quote.priceImpactBps ?? 0)/100}%</dd></div><div><dt>Block</dt><dd>{quote.quote.blockNumber}</dd></div><div><dt>Observed</dt><dd>{quote.quote.observedAt}</dd></div><div><dt>Source</dt><dd>{config.source}</dd></div></dl><details><summary>Block hash</summary><p className="mono">{quote.quote.blockHash}</p></details></>}
 {!sampleOnly && <div className="testnet-actions"><Link className="button" href={testnetNetworkHref(chainId,"swap")}>Swap this pair</Link><Link className="button demo-reset" href={testnetNetworkHref(chainId,"positions")}>Manage liquidity</Link>{!detail && <Link href={testnetNetworkHref(chainId,"pool")}>Pool details ↗</Link>}</div>}
 {chainId === 84532 && !sampleOnly && <Link href="/demo/3">Browse all four curated Base pools ↗</Link>}
 <p className="data-caveat">TVL, volume and APR are unavailable. A testnet quote is not a market price in dollars. Wallet actions always obtain a fresh quote and simulation.</p>
 </section>}{detail && <section className="section-card"><h2>Pool identity</h2><dl className="identity-list"><div><dt>Network</dt><dd>{config.label} · {chainId}</dd></div><div><dt>Pool</dt><dd>{address(P.pool)}</dd></div><div><dt>USDC · 6 decimals</dt><dd>{address(C.USDC.address)}</dd></div><div><dt>WETH · 18 decimals</dt><dd>{address(C.WETH.address)}</dd></div><div><dt>Position manager</dt><dd>{address(C.v3PositionManager)}</dd></div><div><dt>Swap router</dt><dd>{address(P.router)}</dd></div></dl><p>Two canonical L2 confirmations qualify inclusion in this testnet workspace. They do not prove Ethereum finality.</p></section>}</div>;
}
