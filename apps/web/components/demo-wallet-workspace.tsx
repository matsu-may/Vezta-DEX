"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {testnetNetworkId} from "../lib/testnet-network-selection";
import { DemoWalletProvider } from "./demo-wallet-header";
export function DemoWalletWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <DemoWalletProvider key={pathname?.split("/")[2]} chainId={testnetNetworkId(pathname?.split("/")[2] ?? "") ?? 84532} enabled={/^\/(?:demo\/[1-4]|networks\/(?:base-sepolia|unichain-sepolia))(?:\/|$)/.test(pathname ?? "")}>{children}</DemoWalletProvider>;
}
