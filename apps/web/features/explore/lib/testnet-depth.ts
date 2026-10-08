import { testnetApiTarget } from "../../../lib/hosted-boundary";
import { z } from "zod";
import { parseTestnetDepth, testnetDepthSchema, type TestnetDepthReport } from "@vezta-dex/core";
import { boundedJson } from "../../legacy/rehearsal/lib/rehearsal-client";

const envelope = z.object({ depth: testnetDepthSchema }).strict();
const safeCodes = new Set(["TESTNET_RPC_NOT_CONFIGURED", "TESTNET_RPC_UNAVAILABLE", "DEPTH_TIMEOUT",
  "INVALID_DEPTH", "WRONG_CHAIN", "STALE_BLOCK", "MISSING_CODE", "TOKEN_DECIMALS", "POOL_IDENTITY", "BLOCK_CHANGED"]);

async function readDepth(response: Response): Promise<TestnetDepthReport> {
  if (!response.ok) throw new Error("Testnet pool data unavailable");
  return parseTestnetDepth(envelope.parse(await boundedJson(response, 65536)).depth);
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function createTestnetDepthProxy(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (new URL(request.url).search) return json({ error: "Query parameters are not supported" }, 400);
    let target: ReturnType<typeof testnetApiTarget>;
    try { target = testnetApiTarget(env, true); }
    catch { return json({ error: "Testnet pool data unavailable", code: "TESTNET_API_CONFIG_INVALID" }, 503); }
    let response: Response;
    try {
      response = await fetcher(new URL("/api/v1/testnet/base-sepolia/depth", target.url).href, {
        method: "GET", headers: { Accept: "application/json", ...target.headers }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(50000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
      return json({ error: "Testnet pool data unavailable", code: timedOut ? "TESTNET_API_TIMEOUT" : "TESTNET_API_UNREACHABLE" }, 503);
    }
    try {
      if (!response.ok) {
        const body = z.object({ code: z.string().max(64).optional() }).passthrough()
          .parse(await boundedJson(response, 4096));
        const code = body.code && safeCodes.has(body.code) ? body.code : "TESTNET_API_HTTP_ERROR";
        return json({ error: "Testnet pool data unavailable", code, upstreamStatus: response.status }, 503);
      }
      return json({ depth: await readDepth(response) });
    } catch { return json({ error: "Testnet pool data unavailable", code: "TESTNET_API_INVALID_RESPONSE", upstreamStatus: response.status }, 503); }
  };
}

export async function loadTestnetDepth(fetcher: typeof fetch = fetch): Promise<TestnetDepthReport> {
  try {
    const response = await fetcher("/api/testnet-depth", { method: "GET", headers: { Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(55000) });
    return await readDepth(response);
  } catch { throw new Error("Testnet pool data unavailable. Check Base Sepolia RPC configuration and refresh."); }
}
