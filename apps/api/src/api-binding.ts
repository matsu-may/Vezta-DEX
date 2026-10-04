import { readHostedConfig, type HostedEnv } from "@vezta-dex/core";
/** A container-wide listener requires the authenticated hosted boundary. */
export function requirePrivateApiHost(host: string, env: HostedEnv = {}): "127.0.0.1" | "0.0.0.0" {
  const hosted = readHostedConfig(env);
  if (host === "0.0.0.0" && hosted) return host;
  if (host !== "127.0.0.1") throw new Error("DEX API must bind to 127.0.0.1");
  return host;
}
