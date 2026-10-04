import Link from "next/link";

export function DemoNavigation({ active }: { active: "swap" | "liquidity" | "explore" | "pool" }) {
  return <nav className="recording-tabs" aria-label="Demo navigation">
    <span className="rail-heading" aria-hidden="true">WORKSPACE</span>
    {([{ id: "swap", label: "Swap", href: "/demo/1" }, { id: "liquidity", label: "Liquidity", href: "/demo/2" },
      { id: "explore", label: "Explore", href: "/demo/3" }, { id: "pool", label: "Pool detail", href: "/demo/4" }] as const)
      .map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={item.id === "swap" ? "M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" : item.id === "liquidity" ? "M4 10h4v10H4zm6-6h4v16h-4zm6 3h4v13h-4z" : item.id === "explore" ? "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16m6-2 5 5" : "M4 4h16v16H4zM4 10h16M10 10v10"} /></svg>{item.label}</Link>)}
    <span className="rail-caption">Test tokens only<br />Uniswap v3 · Base Sepolia</span>
    <Link href="/testnet">Technical workspace ↗</Link>
  </nav>;
}
