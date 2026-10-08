export type HostedEnv = Record<string, string | undefined>;
export type HostedConfig = { publicOrigin: string; apiOrigin: string; token: string; writesEnabled: boolean };
const invalid = (): never => { throw new Error("HOSTED_CONFIG_INVALID"); };

function httpsOrigin(value: string | undefined): string {
  if (!value || value !== value.trim()) return invalid();
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(url.hostname)
    || /^[\d.]+$/.test(url.hostname) || /\.(?:local|localhost|internal)$/i.test(url.hostname)) return invalid();
  return url.origin;
}

/** Server configuration only; never serialize the token into a browser response. */
export function readHostedConfig(env: HostedEnv): HostedConfig | undefined {
  if (env.DEX_HOSTED_MODE === undefined || env.DEX_HOSTED_MODE === "0") return undefined;
  try {
    if (env.DEX_HOSTED_MODE !== "1" || env.NODE_ENV !== "production"
      || !/^[a-f0-9]{64}$/i.test(env.DEX_BFF_TOKEN ?? "")
      || ![undefined, "0", "1"].includes(env.DEX_HOSTED_WRITES_ENABLED)) return invalid();
    return { publicOrigin: httpsOrigin(env.DEX_PUBLIC_ORIGIN), apiOrigin: httpsOrigin(env.DEX_API_URL),
      token: env.DEX_BFF_TOKEN!, writesEnabled: env.DEX_HOSTED_WRITES_ENABLED === "1" };
  } catch { return invalid(); }
}
