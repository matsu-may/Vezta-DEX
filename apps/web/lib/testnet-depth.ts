import { z } from "zod";
import { parseTestnetDepth, testnetDepthSchema, type TestnetDepthReport } from "@vezta-dex/core";
import { boundedJson } from "./rehearsal-client";

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
    try {
      const api = new URL(env.DEX_API_URL ?? "http://127.0.0.1:3021");
      if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname)
        || api.port !== "3021" || api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
      const response = await fetcher(new URL("/api/v1/testnet/base-sepolia/depth", api).href, {
        method: "GET", headers: { Accept: "application/json" }, cache: "no-store", redirect: "error",
        signal: AbortSignal.timeout(50000),
      });
      if (!response.ok) {
        const body = z.object({ code: z.string().max(64).optional() }).passthrough()
          .parse(await boundedJson(response, 4096));
        const code = body.code && safeCodes.has(body.code) ? body.code : "TESTNET_RPC_UNAVAILABLE";
        return json({ error: "Testnet pool data unavailable", code }, 503);
      }
      return json({ depth: await readDepth(response) });
    } catch { return json({ error: "Testnet pool data unavailable", code: "TESTNET_RPC_UNAVAILABLE" }, 503); }
  };
}

export async function loadTestnetDepth(fetcher: typeof fetch = fetch): Promise<TestnetDepthReport> {
  try {
    const response = await fetcher("/api/testnet-depth", { method: "GET", headers: { Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(55000) });
    return await readDepth(response);
  } catch { throw new Error("Testnet pool data unavailable. Check Base Sepolia RPC configuration and refresh."); }
}
