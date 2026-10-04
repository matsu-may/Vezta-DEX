import { createTestnetLpProxy } from "../../../../lib/testnet-lp";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const proxy = createTestnetLpProxy();
export async function POST(request: Request) { return proxy(request); }
