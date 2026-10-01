import { parseTestnetSwapIntent } from "@vezta-dex/core";
import { handleTestnetDiscovery, type TestnetDiscoveryReader } from "./testnet-discovery";
import { TestnetQuoteError, type TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetWalletStateError, type TestnetWalletStateReader } from "./testnet-wallet-state";

const json = (body: unknown, status = 200) => Response.json(body, {
  status, headers: { "Cache-Control": "no-store" },
});

async function readJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Invalid JSON");
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new RangeError("Request too large"); }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function handleTestnetRequest(request: Request, discovery?: TestnetDiscoveryReader,
  quotes?: TestnetSwapQuoteReader, states?: TestnetWalletStateReader): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/testnet/base-sepolia/depth") return handleTestnetDiscovery(request, discovery);
  const stateRequest = url.pathname === "/api/v1/testnet/base-sepolia/state";
  if (!stateRequest && url.pathname !== "/api/v1/testnet/base-sepolia/quote") return undefined;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Query parameters are not supported" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "JSON required" }, 415);
  }
  let intent;
  try { intent = parseTestnetSwapIntent(await readJson(request)); }
  catch (error) {
    return error instanceof RangeError ? json({ error: "Request too large" }, 413)
      : json({ error: "Invalid testnet intent", code: "TESTNET_INTENT_INVALID" }, 400);
  }
  if (stateRequest ? !states : !quotes) return json({ error: "Testnet RPC is not configured", code: "TESTNET_RPC_NOT_CONFIGURED" }, 503);
  try { return stateRequest ? json({ state: await states!.read(intent) }) : json(await quotes!.read(intent)); }
  catch (error) {
    const code = error instanceof TestnetQuoteError || error instanceof TestnetWalletStateError ? error.code : "TESTNET_RPC_UNAVAILABLE";
    return json({ error: stateRequest ? "Testnet state unavailable" : "Testnet quote unavailable", code },
      code === "TESTNET_QUOTE_BUSY" || code === "TESTNET_STATE_BUSY" ? 429 : 503);
  }
}
