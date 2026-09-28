// Keep this module dependency-free: Node 24 smoke scripts import it directly.
export const TRADING_ROUTING_POLICY = Object.freeze({
  protocols: Object.freeze(["V2", "V3", "V4"] as const),
  hooksOptions: "V4_NO_HOOKS" as const,
});

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const POOL_ID = /^0x[0-9a-fA-F]{64}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid route metadata");
  return value as Record<string, unknown>;
}

function currency(value: unknown): string {
  const token = record(value);
  if ((token.chainId !== 137 && token.chainId !== "137") || typeof token.address !== "string" || !ADDRESS.test(token.address)) {
    throw new Error("Invalid route currency");
  }
  return token.address.toLowerCase();
}

export function inspectTradingRoute(route: unknown, intent: { chainId: number; tokenIn: string; tokenOut: string }): {
  pathCount: number; poolCount: number; v4PoolCount: number;
} {
  if (intent.chainId !== 137 || !ADDRESS.test(intent.tokenIn) || !ADDRESS.test(intent.tokenOut)
    || intent.tokenIn.toLowerCase() === intent.tokenOut.toLowerCase()
    || !Array.isArray(route) || route.length === 0 || route.length > 32) throw new Error("Invalid route");

  let poolCount = 0;
  let v4PoolCount = 0;
  for (const path of route) {
    if (!Array.isArray(path) || path.length === 0 || path.length > 16) throw new Error("Invalid route path");
    let previousOutput = intent.tokenIn.toLowerCase();
    for (const value of path) {
      const pool = record(value);
      const isV4 = pool.type === "v4-pool";
      if (!isV4 && pool.type !== "v2-pool" && pool.type !== "v3-pool") throw new Error("Unsupported route pool");
      if (typeof pool.address !== "string" || !(isV4 ? POOL_ID : ADDRESS).test(pool.address)
        || /^0x0+$/.test(pool.address)) throw new Error("Invalid route pool reference");
      if (isV4 ? pool.hooks !== ZERO_ADDRESS : pool.hooks !== undefined && pool.hooks !== ZERO_ADDRESS) {
        throw new Error("Unsupported route hooks");
      }
      const input = currency(pool.tokenIn);
      const output = currency(pool.tokenOut);
      if (input !== previousOutput || input === output) throw new Error("Disconnected route path");
      previousOutput = output;
      poolCount += 1;
      if (isV4) v4PoolCount += 1;
    }
    if (previousOutput !== intent.tokenOut.toLowerCase()) throw new Error("Route output does not match intent");
  }
  return { pathCount: route.length, poolCount, v4PoolCount };
}
