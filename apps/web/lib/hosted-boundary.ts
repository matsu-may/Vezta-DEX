import { readHostedConfig, type HostedEnv } from "@vezta-dex/core";

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
    // Vercel adds Forwarded metadata whose format is not an authority contract.
    // Never read it for origin, routing or credentials; those checks remain above.
    // The platform profile comes from server env, never an incoming header.
    if (request.headers.has("forwarded") && !(hosted && env.VERCEL === "1")) return "forwarded-header-present";
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
