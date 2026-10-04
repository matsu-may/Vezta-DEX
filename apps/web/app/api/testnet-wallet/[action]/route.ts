import { createTestnetWalletProxy } from "../../../../lib/testnet-wallet-proxy";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const proxy = createTestnetWalletProxy();
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) { return proxy(request, (await context.params).action); }
