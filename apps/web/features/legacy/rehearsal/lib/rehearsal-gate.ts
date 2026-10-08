import { z } from "zod";
import { validatePermit2Data, type Permit2Data } from "@vezta-dex/core";
import { boundedJson } from "./rehearsal-client";
import { intentSchema, submissionRecordSchema, validateRehearsalIntent, rehearsalResponseSchemas } from "./rehearsal-contracts";
import type { RehearsalAction } from "./rehearsal-controller";
type Environment = Record<string, string | undefined>;
export function rehearsalEnabled(env: Environment = process.env): boolean { return env.NODE_ENV === "development" && env.DEX_REHEARSAL_ENABLED === "1" && env.DEX_REHEARSAL_BOUND_HOST === "127.0.0.1"; }
const paths = { quote: "trading-quote", approval: "approval-plan", state: "wallet-state", permit: "permit-plan", prepare: "swap-preparation", recheck: "swap-recheck", receipt: "transaction-observation" } as const;
function json(body: unknown, status = 200): Response { return Response.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export function createRehearsalProxy(env: Environment = process.env, fetcher: typeof fetch = fetch) {
  return async (request: Request, action: string): Promise<Response> => {
    if (!rehearsalEnabled(env) || !Object.hasOwn(paths, action))
      return json({ error: "Not found" }, 404);
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    const host = request.headers.get("host") ?? url.host;
    const origin = `http://${host}`;
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const forwardedFor = request.headers.get("x-forwarded-for");
    // The route Request.url may use Next's internal origin; browser Host and Origin remain the boundary.
    const boundaryCode = host !== "127.0.0.1:3020" ? "LOCAL_HOST"
      : request.headers.get("origin") !== origin ? "LOCAL_ORIGIN"
      : request.headers.get("content-type")?.split(";", 1)[0].trim() !== "application/json" ? "LOCAL_CONTENT_TYPE"
      : forwardedHost !== null && forwardedHost !== host ? "LOCAL_FORWARDED_HOST"
      : forwardedProto !== null && forwardedProto !== "http" ? "LOCAL_FORWARDED_PROTO"
      : forwardedFor !== null && !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(forwardedFor) ? "LOCAL_FORWARDED_FOR"
      : request.headers.has("forwarded") ? "LOCAL_FORWARDED" : null;
    if (boundaryCode)
      return json({ error: "Local same-origin JSON required", code: boundaryCode }, 403);
    let body: unknown;
    try {
      body = await boundedJson(new Response(request.body), 4096);
    }
    catch (error) {
      return json({ error: "Invalid request" }, error instanceof Error && error.message === "Response too large" ? 413 : 400);
    }
    const selected = action as RehearsalAction;
    try {
      if (selected === "receipt") {
        const parsed = submissionRecordSchema.parse(body);
        if (!parsed.hash)
          throw new Error();
        body = parsed;
      }
      else {
        const extra = selected === "permit" || selected === "prepare" || selected === "recheck";
        const schema = extra ? intentSchema.extend({ quoteId: z.string().regex(/^[0-9a-f]{48}$/), ...(selected === "prepare" ? { signature: z.string().regex(/^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/).optional() } : {}) }).strict() : intentSchema;
        const parsed = schema.parse(body);
        const { chainId, swapper, tokenIn, tokenOut, amountIn, slippageBps } = parsed;
        validateRehearsalIntent({ chainId, swapper, tokenIn, tokenOut, amountIn, slippageBps });
        body = parsed;
      }
    }
    catch {
      return json({ error: "Invalid local rehearsal request" }, 400);
    }
    try {
      const api = new URL(env.DEX_API_URL ?? "http://127.0.0.1:3021");
      if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "3021" || api.username || api.password || api.pathname !== "/" || api.search || api.hash)
        throw new Error();
      const response = await fetcher(new URL(`/api/v1/${paths[selected]}`, api).href, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(18000) });
      if (!response.ok)
        throw new Error();
      const output = rehearsalResponseSchemas[selected].parse(await boundedJson(response));
      if (selected === "permit" && "permitPlan" in output) {
        const permit = output.permitPlan.permit;
        if (permit.kind === "sign") {
          const data = permit.data as Permit2Data;
          const input = body as Record<string, unknown>;
          const intent = intentSchema.parse(Object.fromEntries(Object.keys(intentSchema.shape).map(key => [key, input[key]])));
          validatePermit2Data(data, intent, BigInt(data.values.details.nonce), Date.now());
        }
      }
      return json(JSON.parse(JSON.stringify(output, (_key, value) => typeof value === "bigint" ? value.toString() : value)));
    }
    catch {
      return json({ error: "Local rehearsal API unavailable" }, 503);
    }
  };
}
