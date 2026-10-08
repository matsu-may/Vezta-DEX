"use client";
import Link from "next/link";
import {usePathname,useRouter,useSearchParams} from "next/navigation";
import {useEffect,useId,useRef,useState,type KeyboardEvent} from "react";
import {testnetChainConfig,type TestnetChainId} from "@vezta-dex/core";
import {ProductNetworkIcon} from "../ui/product-token";
import {ProductIcon} from "../ui/product-icon";
import {pendingTestnetWorkspaces,productWorkspaceChain} from "../../lib/testnet-network-selection";
import {switchProductNetwork} from "../../lib/product-routes";
import {useProductWalletDialog,useProductWalletNetwork} from "../../features/wallet/components/demo-wallet-header";

export function TestnetNetworkSelector() {
  const path=usePathname()??"",query=useSearchParams();
  return productWorkspaceChain(path,query.get("network"))!==null || /^\/demo\/[1-4](?:\/|$)/.test(path) ? <TestnetNetworkSelectorControl/> : null;
}
function TestnetNetworkSelectorControl() {
  const pathname=usePathname()??"",router=useRouter();
  const chainId=productWorkspaceChain(pathname,useSearchParams().get("network"))??84532;
  const [pending,setPending]=useState<ReturnType<typeof pendingTestnetWorkspaces>>([]),[unavailable,setUnavailable]=useState(true),[open,setOpen]=useState(false);
  const root=useRef<HTMLDivElement>(null),trigger=useRef<HTMLButtonElement>(null),listId=useId();
  const openWallet=useProductWalletDialog(),walletChainId=useProductWalletNetwork();
  const locked=unavailable||pending.length>0;
  const mismatch=walletChainId!==null&&walletChainId!==chainId;
  useEffect(()=>{
    const update=()=>{try {const next=pendingTestnetWorkspaces(window.localStorage);setPending(next);setUnavailable(false);if(next.length)setOpen(false);}catch {setUnavailable(true);setOpen(false);}};
    const timer=setInterval(update,500);queueMicrotask(update);window.addEventListener("storage",update);
    return()=>{clearInterval(timer);window.removeEventListener("storage",update);};
  },[]);
  useEffect(()=>{
    if(!open)return;
    root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]')?.focus();
    const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);
  },[open]);
  function dismiss(){setOpen(false);trigger.current?.focus();}
  function select(next:TestnetChainId){
    try {if(pendingTestnetWorkspaces(window.localStorage).length)return;}catch {setUnavailable(true);dismiss();return;}
    dismiss();if(next!==chainId)router.push(switchProductNetwork(pathname,next));
  }
  function keyboard(event:KeyboardEvent<HTMLDivElement>){
    if(event.key==="Escape"){event.preventDefault();dismiss();return;}
    if(!["ArrowDown","ArrowUp","Home","End"].includes(event.key)||locked)return;
    event.preventDefault();if(!open){setOpen(true);return;}
    const options=[...root.current!.querySelectorAll<HTMLButtonElement>('[role="option"]')];
    const index=options.indexOf(document.activeElement as HTMLButtonElement);
    const next=event.key==="Home"?0:event.key==="End"?options.length-1:(index+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;
    options[next]?.focus();
  }
  return <div ref={root} className="testnet-network-control" onKeyDown={keyboard} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
    <button ref={trigger} type="button" className={`network-trigger ${mismatch?"network-mismatch":""}`} aria-label={`Testnet network: ${testnetChainConfig(chainId).label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} disabled={locked} onClick={()=>setOpen(value=>!value)}>
      <ProductNetworkIcon chainId={chainId}/><span>{testnetChainConfig(chainId).label}</span><ProductIcon name="chevron" size={16}/>
    </button>
    {open&&!locked&&<div className="network-popover">
      <p className="network-popover-heading">Select network <span>TESTNET</span></p>
      <div id={listId} role="listbox" aria-label="Supported testnet networks">
        {([84532,1301] as const).map(id=><button type="button" role="option" aria-selected={chainId===id} key={id} onClick={()=>select(id)}>
          <ProductNetworkIcon chainId={id}/><span><strong>{testnetChainConfig(id).label}</strong><small>Chain {id}{id===1301?" · EOA only":""}</small></span>{chainId===id&&<ProductIcon name="check" size={18}/>}</button>)}
      </div>
      <p className="network-popover-note">Changes the app workspace. Your wallet network is checked when you connect.</p>
      {mismatch&&<p className="network-popover-warning" role="status">Wallet chain {walletChainId} differs from this workspace.</p>}
      {openWallet&&<button type="button" className="network-wallet-action" onClick={()=>{dismiss();openWallet();}}>Review wallet network<ProductIcon name="external" size={16}/></button>}
    </div>}
    {pending.length>0&&<span className="network-recovery-note" role="status">Original transaction needs recovery: {pending.map(p=><Link key={`${p.chainId}:${p.flow}`} href={p.href}>{testnetChainConfig(p.chainId).label} {p.flow} ↗ </Link>)}</span>}
    {unavailable&&<span className="sr-only" role="status">Checking recovery storage…</span>}
  </div>;
}
