import { historicalTestnetApprovalRequestSchema, parseHistoricalTestnetApprovalResponse } from "./testnet-wallet-historical";
import { z } from "zod";
import { parseTestnetSwapIntent } from "@vezta-dex/core";
import { boundedJson } from "./rehearsal-client";
import { parseTestnetWalletQuote, walletReviewSchema, walletObservationResponseSchema, walletHash } from "./testnet-wallet-contracts";
import { testnetDemoEnabled } from "./testnet-demo-gate";
export { testnetDemoEnabled } from "./testnet-demo-gate";
import { safeTestnetCode } from "./testnet-browser-errors";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const id = z.string().regex(/^[a-f0-9]{48}$/);
const recheck = z.object({ kind: z.enum(["approval", "swap"]), quoteId: id, intent: z.unknown() }).strict();
const receipt = z.object({ contextId: id, hash: walletHash }).strict();
export function createTestnetWalletProxy(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, now = Date.now) {
  let active = false; let starts: number[] = [];
  return async (request: Request, action: string): Promise<Response> => {
    if (!["quote", "recheck", "receipt", "historical-approval"].includes(action)) return json({ error: "Not found" }, 404);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const url = new URL(request.url); const host = request.headers.get("host") ?? url.host;
    if (url.search) return json({ error: "Query parameters are not supported" }, 400);
    if (host !== "127.0.0.1:3020" || request.headers.get("origin") !== "http://127.0.0.1:3020"
      || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
      || (request.headers.has("x-forwarded-host") && request.headers.get("x-forwarded-host") !== host)
      || (request.headers.has("x-forwarded-proto") && request.headers.get("x-forwarded-proto") !== "http")
      || (request.headers.has("x-forwarded-for") && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.headers.get("x-forwarded-for")!))
      || request.headers.has("forwarded")) return json({ error: "Local same-origin JSON required", code: "TESTNET_BROWSER_ORIGIN" }, 403);
    let body: unknown;
    try {
      const raw = await boundedJson(new Response(request.body), 4096);
      if (action === "quote") body = parseTestnetSwapIntent(raw);
      else if (action === "recheck") { const parsed = recheck.parse(raw); body = { ...parsed, intent: parseTestnetSwapIntent(parsed.intent) }; }
      else if (action === "historical-approval") body = historicalTestnetApprovalRequestSchema.parse(raw);
      else body = receipt.parse(raw);
    } catch (error) { return json({ error: "Invalid testnet request", code: "TESTNET_INTENT_INVALID" }, error instanceof Error && error.message === "Response too large" ? 413 : 400); }
    let api: URL;
    try {
      api = new URL(env.DEX_API_URL ?? "http://127.0.0.1:3021");
      if (api.origin !== "http://127.0.0.1:3021" || api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
    } catch { return json({ error: "Testnet API configuration unavailable", code: "TESTNET_BROWSER_CONFIG" }, 503); }
    const time = now(); starts = starts.filter(t => time - t < 60000);
    if (active || starts.length >= 24) return json({ error: "Testnet read budget busy. Try an explicit fresh action later.", code: "TESTNET_BROWSER_BUSY" }, 429);
    active = true; starts.push(time);
    try {
      const upstream = await fetcher(new URL(`/api/v1/testnet/base-sepolia/${action}`, api).href, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(28000) });
      const raw = await boundedJson(upstream, upstream.ok ? 65536 : 4096);
      if (!upstream.ok) return json({ error: "Testnet action unavailable", code: safeTestnetCode(typeof raw === "object" && raw !== null && "code" in raw ? raw.code : undefined) }, [400, 409, 410, 413, 415, 429, 503].includes(upstream.status) ? upstream.status : 503);
      const enabled = testnetDemoEnabled(env);
      if (action === "quote") {
        const parsed = z.object({ quote: z.unknown(), quoteId: id, priceImpactBps: z.number().int().min(0).max(100), qualification: z.object({ configurationVerified: z.literal(true), runtimeVerified: z.literal(true), executionEnabled: z.boolean() }).strict() }).strict().parse(raw);
        const checked = parseTestnetWalletQuote(parsed, parseTestnetSwapIntent(body), now());
        return json({ ...parsed, quote: checked.quote, qualification: { ...parsed.qualification, executionEnabled: enabled && parsed.qualification.executionEnabled } });
      }
      if (action === "recheck") {
        const parsed = walletReviewSchema.parse(raw); parsed.study.intent = parseTestnetSwapIntent(parsed.study.intent);
        return json({ study: { ...parsed.study, executionEnabled: enabled && parsed.study.executionEnabled },
          action: parsed.action ? { ...parsed.action, executionEnabled: enabled && parsed.action.executionEnabled } : null });
      }
      if (action === "historical-approval") return json({reconciliation:parseHistoricalTestnetApprovalResponse(raw,historicalTestnetApprovalRequestSchema.parse(body),now())});
      return json(walletObservationResponseSchema.parse(raw));
    } catch { return json({ error: "Testnet action unavailable", code: "TESTNET_BROWSER_UNAVAILABLE" }, 503); }
    finally { active = false; }
  };
}
