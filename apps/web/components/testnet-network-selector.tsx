"use client";
import Link from "next/link";
import {ProductNetworkIcon} from "./product-token";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { testnetChainConfig } from "@vezta-dex/core";
import {pendingTestnetWorkspaces,testnetNetworkId} from "../lib/testnet-network-selection";
import {switchProductNetwork} from "../lib/product-routes";
export function TestnetNetworkSelector() {
 const path=usePathname() ?? "";
 return /^\/(?:demo\/[1-4]|networks\/(?:base-sepolia|unichain-sepolia))(?:\/|$)/.test(path) ? <TestnetNetworkSelectorControl/> : null;
}
function TestnetNetworkSelectorControl() {
 const pathname=usePathname() ?? "", router=useRouter();
 const chainId=testnetNetworkId(pathname.split("/")[2] ?? "") ?? 84532;
 const [pending,setPending]=useState<ReturnType<typeof pendingTestnetWorkspaces>>([]),[unavailable,setUnavailable]=useState(true);
 useEffect(()=>{
  const update=()=>{try {setPending(pendingTestnetWorkspaces(window.localStorage));setUnavailable(false);} catch {setUnavailable(true);}};
  const timer=setInterval(update,500); queueMicrotask(update); window.addEventListener("storage",update);
  return ()=>{clearInterval(timer);window.removeEventListener("storage",update);};
 },[]);
 return <div className="testnet-network-control"><label className="sr-only" htmlFor="workspace-chain">Testnet network</label>
 <ProductNetworkIcon chainId={chainId}/><select id="workspace-chain" className="field" value={chainId} disabled={unavailable || pending.length>0} onChange={event=>{
  try {if(pendingTestnetWorkspaces(window.localStorage).length) return; } catch {setUnavailable(true);return;}
  router.push(switchProductNetwork(pathname,Number(event.target.value) as 84532|1301));
 }}><option value={84532}>Base Sepolia</option><option value={1301}>Unichain Sepolia · EOA</option></select>
 {pending.length>0 && <span role="status">Original transaction needs recovery: {pending.map(p=><Link key={`${p.chainId}:${p.flow}`} href={p.href}>{testnetChainConfig(p.chainId).label} {p.flow} ↗ </Link>)}</span>}
 {unavailable && <span role="status">Checking recovery storage…</span>}
 </div>;
}
