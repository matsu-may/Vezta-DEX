"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoWalletProvider } from "./demo-wallet-header";
export function DemoWalletWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <DemoWalletProvider enabled={/^\/demo\/[1-4](?:\/|$)/.test(pathname ?? "")}>{children}</DemoWalletProvider>;
}
