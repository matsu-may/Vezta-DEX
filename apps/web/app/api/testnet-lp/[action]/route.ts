import { createTestnetLpWalletProxy } from "../../../../lib/testnet-lp-wallet-proxy";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const proxy = createTestnetLpWalletProxy();
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) { return proxy(request, (await context.params).action); }
