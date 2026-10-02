import { createTestnetLpProxy } from "../../../../lib/testnet-lp";
export const dynamic = "force-dynamic";
const proxy = createTestnetLpProxy();
export async function POST(request: Request) { return proxy(request); }
