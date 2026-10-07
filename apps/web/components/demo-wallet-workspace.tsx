"use client";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import {productWorkspaceChain} from "../lib/testnet-network-selection";
import { DemoWalletProvider } from "./demo-wallet-header";
export function DemoWalletWorkspace({ children }: { children: ReactNode }) {
  const pathname=usePathname()??"",query=useSearchParams();
  const chainId=productWorkspaceChain(pathname,query.get("network"));
  return <DemoWalletProvider key={chainId??84532} chainId={chainId??84532} enabled={chainId!==null||/^\/demo\/[1-4](?:\/|$)/.test(pathname)}>{children}</DemoWalletProvider>;
}
