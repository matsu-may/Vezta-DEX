import { z } from "zod";
import { testnetLpRequestSchema, testnetLpPageSchema, parseTestnetLpPage, type TestnetLpRequest } from "@vezta-dex/core";
import { boundedJson } from "./rehearsal-client";
const envelope = z.object({ page: testnetLpPageSchema }).strict();
const safeCodes = new Set(["TESTNET_LP_REQUEST_INVALID", "TESTNET_LP_BUSY", "TESTNET_LP_TIMEOUT", "TESTNET_LP_RPC_UNAVAILABLE",
  "TESTNET_LP_RPC_NOT_CONFIGURED", "TESTNET_LP_WRONG_CHAIN", "TESTNET_LP_STALE", "TESTNET_LP_BLOCK_CHANGED",
  "TESTNET_LP_RUNTIME_MISMATCH", "TESTNET_LP_CONFIGURATION_INVALID", "TESTNET_LP_STATE_INVALID", "TESTNET_LP_OWNER_CHANGED"]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function checkedPage(raw: unknown, request: TestnetLpRequest, now: number) {
  const page = parseTestnetLpPage(envelope.parse(raw).page, now);
  if (page.owner.toLowerCase() !== request.owner.toLowerCase() || page.cursor !== request.cursor || page.scanned > request.limit
    || (request.snapshot && (page.snapshot.number !== request.snapshot.number || page.snapshot.hash.toLowerCase() !== request.snapshot.hash.toLowerCase()
      || page.snapshot.observedAt !== request.snapshot.observedAt))) throw new Error("LP response binding mismatch");
  return page;
}
export function createTestnetLpProxy(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, now = Date.now) {
  let active = false; let starts: number[] = [];
  return async (request: Request) => {
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const url = new URL(request.url); const host = request.headers.get("host") ?? url.host;
    if (url.search) return json({ error: "Query unsupported" }, 400);
    if (host !== "127.0.0.1:3020" || request.headers.get("origin") !== "http://127.0.0.1:3020"
      || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
      || (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host)
      || (request.headers.has("x-forwarded-proto") && request.headers.get("x-forwarded-proto") !== "http")
      || (request.headers.has("x-forwarded-for") && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for")!))
      || request.headers.has("forwarded")) return json({ error: "Local same-origin JSON required" }, 403);
    let body: TestnetLpRequest;
    try { body = testnetLpRequestSchema.parse(await boundedJson(new Response(request.body), 4096)); }
    catch { return json({ error: "Invalid LP request" }, 400); }
    let api: URL;
    try { api = new URL(env.DEX_API_URL ?? "http://127.0.0.1:3021");
      if (api.origin !== "http://127.0.0.1:3021" || api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
    } catch { return json({ error: "LP API configuration unavailable" }, 503); }
    const time = now(); starts = starts.filter(t => time - t < 60000);
    if (active || starts.length >= 12) return json({ error: "LP read budget busy", code: "TESTNET_LP_BUSY" }, 429);
    active = true; starts.push(time);
    try {
      const response = await fetcher(new URL("/api/v1/testnet/base-sepolia/lp/positions", api).href, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body),
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(28000) });
      const raw = await boundedJson(response, response.ok ? 65536 : 4096);
      if (!response.ok) {
        const candidate = raw && typeof raw === "object" && "code" in raw ? raw.code : null;
        return json({ error: "Testnet LP read unavailable", code: typeof candidate === "string" && safeCodes.has(candidate) ? candidate : "TESTNET_LP_RPC_UNAVAILABLE" }, response.status === 429 ? 429 : 503);
      }
      return json({ page: checkedPage(raw, body, now()) });
    } catch { return json({ error: "Testnet LP read unavailable", code: "TESTNET_LP_RPC_UNAVAILABLE" }, 503); }
    finally { active = false; }
  };
}
export async function loadTestnetLpPositions(value: unknown, fetcher: typeof fetch = fetch, now = Date.now) {
  const body = testnetLpRequestSchema.parse(value);
  const response = await fetcher("/api/testnet-lp/positions", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(32000) });
  if (!response.ok) throw new Error("Testnet LP data unavailable. Refresh the read; check Base Sepolia RPC if it persists.");
  return checkedPage(await boundedJson(response, 65536), body, now());
}
