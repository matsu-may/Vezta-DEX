"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {testnetNetworkHref,testnetNetworkId} from "../lib/testnet-network-selection";
export function ProductBrand(){const path=usePathname()??"",chainId=testnetNetworkId(path.split("/")[2]??"");return <Link href={chainId?testnetNetworkHref(chainId,"swap"):"/"} className="brand" aria-label="Vezta DEX home"><span className="brand-mark">V</span><span>VEZTA <em>DEX</em></span></Link>;}
