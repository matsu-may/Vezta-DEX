"use client";
import {testnetNetworkId,testnetNetworkHref} from "../lib/testnet-network-selection";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Only the recording workspace participates in this navigation. */
export function DemoNavigation() {
  const pathname = usePathname();
  const network=testnetNetworkId(pathname.split("/")[2] ?? "");
  if (pathname.startsWith("/networks/") && network) return <nav className="demo-top-nav" aria-label="DEX navigation">{["swap","explore","positions"].map(view=><Link key={view} href={testnetNetworkHref(network,view)} aria-current={pathname.endsWith(`/${view}`) ? "page" : undefined}>{view[0].toUpperCase()+view.slice(1)}</Link>)}</nav>;
  if (!/^\/demo\/[1-4](?:\/|$)/.test(pathname ?? "")) return null;
  return <nav className="demo-top-nav" aria-label="Demo navigation">
    {([{ label: "Swap", href: "/demo/1" }, { label: "Explore", href: "/demo/3" }, { label: "Positions", href: "/demo/2" }] as const).map(item =>
      <Link key={item.href} href={item.href} aria-current={pathname === item.href || (pathname === "/demo/4" && item.href === "/demo/3") ? "page" : undefined}>{item.label}</Link>)}
  </nav>;
}
