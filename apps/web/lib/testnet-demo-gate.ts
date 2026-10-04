import { readHostedConfig } from "@vezta-dex/core";
export function testnetDemoEnabled(env: Record<string, string | undefined> = process.env): boolean {
  try {
    const hosted = readHostedConfig(env);
    if (hosted) return hosted.writesEnabled;
  } catch { return false; }
  return env.NODE_ENV === "development" && env.DEX_TESTNET_DEMO_ENABLED === "1" && env.DEX_TESTNET_BOUND_HOST === "127.0.0.1";
}
