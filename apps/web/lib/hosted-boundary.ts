import { readHostedConfig, type HostedEnv } from "@vezta-dex/core";

export function testnetBrowserAllowed(request: Request, env: HostedEnv): boolean {
  try {
    const hosted = readHostedConfig(env);
    const url = new URL(request.url), host = request.headers.get("host") ?? url.host;
    const origin = hosted?.publicOrigin ?? "http://127.0.0.1:3020";
    const expected = new URL(origin);
    return host === expected.host && request.headers.get("origin") === origin
      && request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() === "application/json"
      && (!hosted || url.protocol === "https:")
      && (!request.headers.has("x-forwarded-host") || request.headers.get("x-forwarded-host") === host)
      && (!request.headers.has("x-forwarded-proto") || request.headers.get("x-forwarded-proto") === expected.protocol.slice(0, -1))
      && (Boolean(hosted) || !request.headers.has("x-forwarded-for") || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for")!))
      && !request.headers.has("forwarded");
  } catch { return false; }
}

/** Used only by server BFFs, never by browser fetch clients. */
export function testnetApiTarget(env: HostedEnv, allowLocalAlias = false): { url: URL; headers: Record<string, string> } {
  const hosted = readHostedConfig(env);
  if (hosted) return { url: new URL(hosted.apiOrigin), headers: { Authorization: `Bearer ${hosted.token}` } };
  const url = new URL(env.DEX_API_URL ?? "http://127.0.0.1:3021");
  if (url.protocol !== "http:" || !["127.0.0.1", ...(allowLocalAlias ? ["localhost"] : [])].includes(url.hostname)
    || url.port !== "3021" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("TESTNET_BROWSER_CONFIG");
  return { url, headers: {} };
}
