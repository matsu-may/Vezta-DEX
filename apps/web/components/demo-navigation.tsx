"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Only the recording workspace participates in this navigation. */
export function DemoNavigation() {
  const pathname = usePathname();
  if (!/^\/demo\/[1-4](?:\/|$)/.test(pathname ?? "")) return null;
  return <nav className="demo-top-nav" aria-label="Demo navigation">
    {([{ label: "Swap", href: "/demo/1" }, { label: "Explore", href: "/demo/3" }, { label: "Positions", href: "/demo/2" }] as const).map(item =>
      <Link key={item.href} href={item.href} aria-current={pathname === item.href || (pathname === "/demo/4" && item.href === "/demo/3") ? "page" : undefined}>{item.label}</Link>)}
  </nav>;
}
