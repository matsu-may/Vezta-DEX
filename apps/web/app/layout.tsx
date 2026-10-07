import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import localFont from "next/font/local";
import "./globals.css";
import { ProductBrand } from "../components/product-brand";
import { DemoWalletWorkspace } from "../components/demo-wallet-workspace";
import { DemoNavigation } from "../components/demo-navigation";
import {TestnetNetworkSelector} from "../components/testnet-network-selector";
import { DemoWalletHeader } from "../components/demo-wallet-header";

const displayFont = localFont({ src: "../public/fonts/SpaceGrotesk[wght].ttf", variable: "--font-display", weight: "300 700", display: "swap", preload: false });
const dataFont = localFont({ src: "../public/fonts/JetBrainsMono[wght].ttf", variable: "--font-data", weight: "100 800", display: "swap", preload: false });

export const metadata: Metadata = {
  title: "Vezta DEX — Swap, explore and provide liquidity",
  description: "An independent Uniswap workspace for Base Sepolia and Unichain Sepolia swaps and liquidity.",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${displayFont.variable} ${dataFont.variable}`}>
      <body>
        <DemoWalletWorkspace>
          <div className="site-shell">
            <header className="site-header">
              <ProductBrand />
              <DemoNavigation />
              <nav aria-label="Main navigation" className="main-nav">
                <Link href="/demo">Demo</Link>
                <Link href="/testnet">Testnet</Link>
                <Link href="/explore">Explore</Link>
                <Link href="/pools">Pools</Link>
                <Link href="/positions">Positions</Link>
                <Link href="/swap">Swap preview</Link>
              </nav>
              <span className="network-pill"><span className="network-dot" /> Standalone · chain shown per page</span>
              <div className="demo-header-meta"><span className="badge">TESTNET</span><TestnetNetworkSelector/><DemoWalletHeader /></div>
            </header>
            <main>{children}</main>
            <footer className="site-footer">
              <span>Vezta DEX · Independent preview</span><Link className="demo-technical-link" href="/testnet">Technical workspace ↗</Link>
              <span>Chain-sourced pool discovery · Independent development app</span>
            </footer>
          </div>
        </DemoWalletWorkspace>
      </body>
    </html>
  );
}
