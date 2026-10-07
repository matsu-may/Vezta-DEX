"use client";
import Link from "next/link";
import {usePathname,useSearchParams} from "next/navigation";
import {testnetNetworkHref,productWorkspaceChain} from "../lib/testnet-network-selection";
export function ProductBrand(){const path=usePathname()??"",chainId=productWorkspaceChain(path,useSearchParams().get("network"));return <Link href={chainId?testnetNetworkHref(chainId,"swap"):"/"} className="brand" aria-label="Vezta DEX home"><span className="brand-mark">V</span><span>VEZTA <em>DEX</em></span></Link>;}
