import { readHostedConfig, type HostedEnv } from "@vezta-dex/core";

/** Bounded single-proxy profile; these fields never determine the API target. */
function hostedForwardedMatches(value: string, expected: URL): boolean {
  if (value.length > 2048 || value.includes(",")) return false;
  const fields = new Map<string, string>();
  for (const pair of value.split(";")) {
    const match = /^([a-z][a-z0-9_-]*)=(?:"([^"\\\r\n]*)"|([a-z0-9!#$%&'*+.^_|~-]+))$/i.exec(pair.trim());
    if (!match) return false;
    const key = match[1].toLowerCase();
    if (fields.has(key)) return false;
    fields.set(key, match[2] ?? match[3]);
  }
  return fields.get("host")?.toLowerCase() === expected.host
    && fields.get("proto")?.toLowerCase() === expected.protocol.slice(0, -1);
}

/** Returns only fixed diagnostic labels, never credentials or header values. */
export function testnetBrowserRejection(request: Request, env: HostedEnv): string | null {
  let hosted: ReturnType<typeof readHostedConfig>;
  try { hosted = readHostedConfig(env); }
  catch { return "hosted-configuration-invalid"; }
  try {
    const url = new URL(request.url), host = request.headers.get("host") ?? url.host;
    const origin = hosted?.publicOrigin ?? "http://127.0.0.1:3020";
    const expected = new URL(origin);
    if (host !== expected.host) return "host-mismatch";
    if (request.headers.get("origin") !== origin) return "origin-mismatch";
    if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return "content-type-invalid";
    if (hosted && url.protocol !== "https:") return "https-required";
    if (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host) return "forwarded-host-mismatch";
    if (request.headers.has("x-forwarded-proto") && request.headers.get("x-forwarded-proto") !== expected.protocol.slice(0, -1)) return "forwarded-protocol-mismatch";
    if (!hosted && request.headers.has("x-forwarded-for") && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for")!)) return "local-forwarded-client";
    const forwarded = request.headers.get("forwarded");
    if (forwarded !== null) {
      if (!hosted) return "forwarded-header-present";
      if (!hostedForwardedMatches(forwarded, expected)) return "forwarded-header-invalid";
    }
    return null;
  } catch { return "request-invalid"; }
}

export function testnetBrowserAllowed(request: Request, env: HostedEnv): boolean {
  return testnetBrowserRejection(request, env) === null;
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
