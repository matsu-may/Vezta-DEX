import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Vezta DEX — Polygon pools",
  description: "Explore curated Uniswap pools on Polygon with chain-sourced data.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="site-shell">
          <header className="site-header">
            <Link href="/explore" className="brand" aria-label="Vezta DEX home">
              <span className="brand-mark">V</span>
              <span>VEZTA <em>DEX</em></span>
            </Link>
            <nav aria-label="Main navigation" className="main-nav">
              <Link href="/demo">Demo</Link>
              <Link href="/testnet">Testnet</Link>
              <Link href="/explore">Explore</Link>
              <Link href="/pools">Pools</Link>
              <Link href="/positions">Positions</Link>
              <Link href="/swap">Swap preview</Link>
            </nav>
            <span className="network-pill"><span className="network-dot" /> Live pages: Polygon</span>
          </header>
          <main>{children}</main>
          <footer className="site-footer">
            <span>Vezta DEX · Independent preview</span>
            <span>Chain-sourced pool discovery · Independent development app</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
