import type { Metadata } from "next";
import { TestnetDiscovery } from "../../components/testnet-discovery";
export const metadata: Metadata = { title: "Vezta DEX — Base Sepolia testnet" };
export default function TestnetPage() { return <TestnetDiscovery />; }
