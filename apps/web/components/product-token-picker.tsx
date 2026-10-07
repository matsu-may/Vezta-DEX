"use client";
import {useState} from "react";
import {testnetChainConfig,type TestnetChainId} from "@vezta-dex/core";
import {ProductDialog} from "./product-dialog";
import {ProductNetworkIcon,ProductTokenIcon} from "./product-token";
export function ProductTokenPicker({token,chainId,disabled,label,onPick}:{token:"USDC"|"WETH";chainId:TestnetChainId;disabled:boolean;label:string;onPick:(token:"USDC"|"WETH")=>void}) {
  const [open,setOpen] = useState(false), [search,setSearch] = useState("");
  const config = testnetChainConfig(chainId);
  const tokens = (["USDC","WETH"] as const).filter(t => `${t} ${t==="USDC"?"USD Coin":"Wrapped Ether"} ${config.candidate[t].address}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <div className="product-token-picker"><button type="button" disabled={disabled} className="product-token-trigger" aria-label={label} aria-haspopup="dialog" onClick={()=>{setSearch("");setOpen(true);}}><ProductTokenIcon chainId={chainId} token={token}/>{token}<span aria-hidden="true">⌄</span></button>
    <ProductDialog open={open&&!disabled} title="Select a token" onClose={()=>setOpen(false)}>
      <label className="sr-only" htmlFor={`${label}-search`}>Search supported tokens</label><input id={`${label}-search`} className="field product-token-search" type="search" placeholder="Search name or address" value={search} onChange={event=>setSearch(event.target.value)}/>
      <p className="product-token-network"><ProductNetworkIcon chainId={chainId}/>{config.label}<span>Testnet</span></p>
      <div className="product-token-list">{tokens.map(t=><button type="button" key={t} aria-label={`Choose ${t}`} onClick={()=>{setOpen(false);onPick(t);}}><ProductTokenIcon chainId={chainId} token={t}/><span><strong>{t==="USDC"?"USD Coin":"Wrapped Ether"}</strong><small>{t} · {config.candidate[t].address.slice(0,6)}…{config.candidate[t].address.slice(-4)}</small></span><span>{t}</span></button>)}</div>
      {!tokens.length&&<p role="status" className="product-empty">No supported tokens match.</p>}<p className="product-dialog-note">Only curated testnet tokens are available.</p>
    </ProductDialog>
  </div>;
}
