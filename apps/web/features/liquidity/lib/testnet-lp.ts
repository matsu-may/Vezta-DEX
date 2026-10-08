import { testnetBrowserAllowed, testnetApiTarget } from "../../../lib/hosted-boundary";
import { z } from "zod";
import { createTestnetLpPositionDomain, testnetChainConfig, type TestnetChainId, type TestnetChainLpRequest } from "@vezta-dex/core";
import { boundedJson } from "../../legacy/rehearsal/lib/rehearsal-client";

const safeCodes = new Set(["TESTNET_LP_REQUEST_INVALID", "TESTNET_LP_BUSY", "TESTNET_LP_TIMEOUT", "TESTNET_LP_RPC_UNAVAILABLE",
  "TESTNET_LP_RPC_NOT_CONFIGURED", "TESTNET_LP_WRONG_CHAIN", "TESTNET_LP_STALE", "TESTNET_LP_BLOCK_CHANGED",
  "TESTNET_LP_RUNTIME_MISMATCH", "TESTNET_LP_CONFIGURATION_INVALID", "TESTNET_LP_STATE_INVALID", "TESTNET_LP_OWNER_CHANGED"]);
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
function checkedPage(raw: unknown, request: TestnetChainLpRequest, now: number) {
  const {testnetLpPageSchema, parseTestnetLpPage} = createTestnetLpPositionDomain(request.chainId);
  const envelope = z.object({page: testnetLpPageSchema}).strict();
  const page = parseTestnetLpPage(envelope.parse(raw).page, now);
  if (page.owner.toLowerCase() !== request.owner.toLowerCase() || page.cursor !== request.cursor || page.scanned > request.limit
    || (request.snapshot && (page.snapshot.number !== request.snapshot.number || page.snapshot.hash.toLowerCase() !== request.snapshot.hash.toLowerCase()
      || page.snapshot.observedAt !== request.snapshot.observedAt))) throw new Error("LP response binding mismatch");
  return page;
}
export function createTestnetLpProxy(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch, now = Date.now, chainId: TestnetChainId = 84532) {
  const {testnetLpRequestSchema} = createTestnetLpPositionDomain(chainId);
  let active = false; let starts: number[] = [];
  return async (request: Request) => {
    if (env.DEX_HOSTED_MODE === "1" && chainId !== 84532) return json({error:"Chain hosting unavailable"},403);
    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const url = new URL(request.url);
    if (url.search) return json({ error: "Query unsupported" }, 400);
    if (!testnetBrowserAllowed(request, env)) return json({ error: "Local same-origin JSON required" }, 403);
    let body: TestnetChainLpRequest;
    try { body = testnetLpRequestSchema.parse(await boundedJson(new Response(request.body), 4096)); }
    catch { return json({ error: "Invalid LP request" }, 400); }
    let target: ReturnType<typeof testnetApiTarget>;
    try { target = testnetApiTarget(env); }
    catch { return json({ error: "LP API configuration unavailable" }, 503); }
    const time = now(); starts = starts.filter(t => time - t < 60000);
    if (active || starts.length >= 12) return json({ error: "LP read budget busy", code: "TESTNET_LP_BUSY" }, 429);
    active = true; starts.push(time);
    try {
      const response = await fetcher(new URL(`/api/v1/testnet/${testnetChainConfig(chainId).source.replace("-rpc", "")}/lp/positions`, target.url).href, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...target.headers }, body: JSON.stringify(body),
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
export async function loadTestnetLpPositions(value: unknown, fetcher: typeof fetch = fetch, now = Date.now, chainId: TestnetChainId = 84532) {
  const {testnetLpRequestSchema} = createTestnetLpPositionDomain(chainId);
  const body = testnetLpRequestSchema.parse(value);
  const response = await fetcher(chainId === 84532 ? "/api/testnet-lp/positions" : "/api/testnet-chains/unichain-sepolia/lp/positions", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(32000) });
  if (!response.ok) throw new Error("Testnet LP data unavailable. Refresh the read; check Base Sepolia RPC if it persists.");
  return checkedPage(await boundedJson(response, 65536), body, now());
}
