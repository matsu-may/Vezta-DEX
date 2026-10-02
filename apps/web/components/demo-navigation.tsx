import Link from "next/link";

export function DemoNavigation({ active }: { active: "swap" | "liquidity" | "explore" | "pool" }) {
  return <nav className="recording-tabs" aria-label="Demo navigation">
    {([{ id: "swap", label: "Swap", href: "/demo/1" }, { id: "liquidity", label: "Liquidity", href: "/demo/2" },
      { id: "explore", label: "Explore", href: "/demo/3" }, { id: "pool", label: "Pool detail", href: "/demo/4" }] as const)
      .map(item => <Link key={item.id} href={item.href} aria-current={active === item.id ? "page" : undefined}>{item.label}</Link>)}
    <Link href="/testnet">Technical workspace ↗</Link>
  </nav>;
}
