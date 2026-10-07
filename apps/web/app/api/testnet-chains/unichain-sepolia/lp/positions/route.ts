import {createTestnetLpProxy} from "../../../../../../lib/testnet-lp";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const proxy = createTestnetLpProxy(process.env,fetch,Date.now,1301);
export const POST = proxy;
