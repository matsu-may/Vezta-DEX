import Link from "next/link";
import {testnetChainConfig,type TestnetChainId} from "@vezta-dex/core";
import {testnetNetworkHref} from "../lib/testnet-network-selection";
import {ProductPair} from "./product-token";
import {TestnetChainExplore} from "./testnet-chain-explore";
export function ProductPoolDetail({chainId,poolId}:{chainId:TestnetChainId;poolId:string}) {
 const config=testnetChainConfig(chainId),pool=config.pools.find(p=>p.pool.toLowerCase()===poolId.toLowerCase())!;
 const lp=pool.pool.toLowerCase()===config.policy.pool.toLowerCase(),href=(view:string)=>testnetNetworkHref(chainId,view);
 return <div><nav className="product-breadcrumb" aria-label="Breadcrumb"><Link href={href("explore/pools")}>Pools</Link><span>›</span><span>USDC / WETH</span></nav>
 <header className="product-pool-heading"><ProductPair chainId={chainId}/><div><h1>USDC / WETH</h1><p>{config.label}<span>v3</span><span>{pool.feeTier/10000}%</span><span className="mono">{pool.pool.slice(0,8)}…{pool.pool.slice(-4)}</span></p></div></header>
 <div className="product-detail-grid"><div className="product-pool-main"><h2>Pool sample</h2><p className="product-subtle">Representative 1 USDC quote · independent of your wallet swap</p><TestnetChainExplore key={pool.pool} chainId={chainId} poolId={pool.pool} sampleOnly/><section className="product-panel"><h3>Market data</h3><p>Historical price, volume, liquidity distribution, USD TVL and APR are unavailable for this testnet integration. A quote sample is not a dollar price.</p></section></div>
 <aside className="product-sidebar"><div className="product-sidebar-actions"><Link className="button button-primary" href={testnetNetworkHref(chainId,"swap",{fee:String(pool.feeTier),pool:pool.pool})}>Swap</Link>{lp?<Link className="button" href={href("positions/create")}>＋ Create position</Link>:<p className="product-subtle">LP actions are supported on the 0.3% pool only.</p>}</div>
 <section className="product-panel"><h3>Pool information</h3><dl className="product-stat-list"><div><dt>Network</dt><dd>{config.label}</dd></div><div><dt>Protocol</dt><dd>Uniswap v3</dd></div><div><dt>Fee tier</dt><dd>{pool.feeTier/10000}%</dd></div><div><dt>Execution</dt><dd>Fresh quote & simulation required</dd></div><div><dt>Liquidity management</dt><dd>{lp?"Full / custom range":"Unavailable for this pool"}</dd></div></dl></section>
 <section className="product-panel"><h3>Links</h3>{[{label:"Pool",address:pool.pool},{label:"USDC",address:config.candidate.USDC.address},{label:"WETH",address:config.candidate.WETH.address},{label:"Position manager",address:config.candidate.v3PositionManager}].map(item=><div className="product-contract-link" key={item.label}><span>{item.label}</span><a className="mono" href={`${config.explorer}/address/${item.address}`} target="_blank" rel="noreferrer">{item.address.slice(0,8)}…{item.address.slice(-4)} ↗</a></div>)}</section></aside></div>
 </div>;
}
