import { z } from "zod";
import { testnetLpStudyRequestSchema, testnetLpRecheckRequestSchema, testnetLpReceiptRequestSchema, parseTestnetLpStudy, parseTestnetLpReceipt } from "@vezta-dex/core";
import { boundedJson } from "./rehearsal-client";

import { testnetDemoEnabled } from "./testnet-demo-gate";
export { testnetDemoEnabled } from "./testnet-demo-gate";
import { safeTestnetLpCode } from "./testnet-lp-wallet-errors";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export function createTestnetLpWalletProxy(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, now = Date.now) {
  let active = false; let starts: number[] = [];
  return async (request: Request, action: string): Promise<Response> => {
    if (!["study", "recheck", "receipt"].includes(action)) return json({ error: "Not found" }, 404);
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
      body = (action === "study" ? testnetLpStudyRequestSchema : action === "recheck" ? testnetLpRecheckRequestSchema : testnetLpReceiptRequestSchema).parse(raw);
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
      const upstream = await fetcher(new URL(`/api/v1/testnet/base-sepolia/lp/${action}`, api).href, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(28000) });
      const raw = await boundedJson(upstream, upstream.ok ? 65536 : 4096);
      if (!upstream.ok) return json({ error: "Testnet action unavailable", code: safeTestnetLpCode(typeof raw === "object" && raw !== null && "code" in raw ? raw.code : undefined) }, [400, 409, 410, 413, 415, 429, 503].includes(upstream.status) ? upstream.status : 503);
      const enabled = testnetDemoEnabled(env);
      if (action === "study" || action === "recheck") {
        const response = z.object({ study: z.unknown() }).strict().parse(raw);
        const study = parseTestnetLpStudy(response.study, now());
        if (action === "study" && JSON.stringify(study.intent) !== JSON.stringify(testnetLpStudyRequestSchema.parse(body).intent)) throw new Error("LP intent mismatch");
        if (action === "recheck" && study.status === "prepared" && study.contextId !== testnetLpRecheckRequestSchema.parse(body).contextId) throw new Error("LP context mismatch");
        return json({ study: { ...study, executionEnabled: enabled && study.executionEnabled } });
      }
      const response = z.object({ observation: z.unknown() }).strict().parse(raw);
      const observation = parseTestnetLpReceipt(response.observation, now());
      const requested = testnetLpReceiptRequestSchema.parse(body);
      if (observation.contextId !== requested.contextId || observation.hash.toLowerCase() !== requested.hash.toLowerCase()) throw new Error("LP receipt mismatch");
      return json({ observation: { ...observation, executionEnabled: enabled && observation.executionEnabled } });
    } catch { return json({ error: "Testnet action unavailable", code: "TESTNET_BROWSER_UNAVAILABLE" }, 503); }
    finally { active = false; }
  };
}
