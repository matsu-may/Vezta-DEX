import { createTestnetWalletProxy } from "../../../../../../features/swap/lib/testnet-wallet-proxy";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const proxy = createTestnetWalletProxy(process.env, fetch, Date.now, 1301);
export async function POST(request: Request, context: { params: Promise<{ action: string }> }) { return proxy(request, (await context.params).action); }
