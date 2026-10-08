import { readHostedConfig } from "@vezta-dex/core";
// Consumer permission only; the API never signs or broadcasts a transaction.
export function testnetHttpExecutionEnabled(env: Record<string, string | undefined>, host: string, port: number) {
  try {
    const hosted = readHostedConfig(env);
    if (hosted) return hosted.writesEnabled && ["127.0.0.1", "0.0.0.0"].includes(host) && port === 3021;
  } catch { return false; }
  return env.NODE_ENV === "development" && env.DEX_TESTNET_DEMO_ENABLED === "1"
    && env.DEX_TESTNET_BOUND_HOST === "127.0.0.1" && host === "127.0.0.1" && port === 3021;
}
