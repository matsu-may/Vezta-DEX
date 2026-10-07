"use client";
import { useEffect, useId, useRef, useState } from "react";
import { testnetNetworkId, testnetNetworkHref } from "../lib/testnet-network-selection";
import Link from "next/link";
import { usePathname } from "next/navigation";

function NavGroup({label,items,active}:{label:string;items:{label:string;href:string;unsupported?:boolean}[];active:boolean}) {
  const [open,setOpen]=useState(false), id=useId(), root=useRef<HTMLDivElement>(null), trigger=useRef<HTMLButtonElement>(null), focusMenu=useRef(false);
  useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);},[open]);
  useEffect(()=>{if(open && focusMenu.current){focusMenu.current=false;root.current?.querySelector<HTMLAnchorElement>("a")?.focus();}},[open]);
  return <div ref={root} className="product-nav-group" onMouseEnter={()=>setOpen(true)} onMouseLeave={()=>setOpen(false)}
    onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node))setOpen(false);}}
    onKeyDown={e=>{if(e.key==="Escape"){setOpen(false);trigger.current?.focus();}if(e.key==="ArrowDown"){e.preventDefault();if(open)root.current?.querySelector<HTMLAnchorElement>("a")?.focus();else {focusMenu.current=true;setOpen(true);}}}}>
    <button ref={trigger} className={`product-nav-trigger ${active?"is-active":""}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(true)}>{label}<span aria-hidden="true">⌄</span></button>
    <div id={id} className="product-nav-dropdown" hidden={!open}>{items.map(item=><Link key={item.href} href={item.href} onClick={()=>setOpen(false)}>{item.label}{item.unsupported&&<small>Not supported</small>}</Link>)}</div>
  </div>;
}
export function DemoNavigation() {
  const pathname=usePathname() ?? "", network=testnetNetworkId(pathname.split("/")[2] ?? "");
  if(pathname.startsWith("/networks/")&&network){const href=(view:string)=>testnetNetworkHref(network,view);return <nav className="demo-top-nav product-navigation" aria-label="DEX navigation">
    <Link href={href("swap")} aria-current={pathname.endsWith("/swap")?"page":undefined}>Swap</Link>
    <NavGroup label="Explore" active={pathname.includes("/explore/")||pathname.includes("/pools/")} items={[
      {label:"Tokens",href:href("explore/tokens")},{label:"Auctions",href:href("explore/auctions"),unsupported:true},{label:"Pools",href:href("explore/pools")},{label:"Transactions",href:href("explore/transactions")},
    ]}/>
    <NavGroup label="Pool" active={pathname.includes("/positions")} items={[
      {label:"View positions",href:href("positions")},{label:"Create position",href:href("positions/create")},{label:"Launch auction",href:href("liquidity/launch-auction"),unsupported:true},
    ]}/>
  </nav>;}
  if(!/^\/demo\/[1-4](?:\/|$)/.test(pathname))return null;
  return <nav className="demo-top-nav" aria-label="Demo navigation">{[{label:"Swap",href:"/demo/1"},{label:"Explore",href:"/demo/3"},{label:"Positions",href:"/demo/2"}].map(item=><Link key={item.href} href={item.href} aria-current={pathname===item.href?"page":undefined}>{item.label}</Link>)}</nav>;
}
