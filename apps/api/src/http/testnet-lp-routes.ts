import { createTestnetLpPositionDomain, type TestnetChainId } from "@vezta-dex/core";
import { TestnetLpError, type TestnetLpPositionReader } from "../modules/liquidity/testnet-lp-position";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function handleTestnetLpRequest<I extends TestnetChainId = 84532>(request: Request, positions?: TestnetLpPositionReader<I>, chainId: I = 84532 as I): Promise<Response | undefined> {
  const url = new URL(request.url);
  const {testnetLpRequestSchema} = createTestnetLpPositionDomain(chainId);
  if (url.pathname !== `/api/v1/testnet/${chainId === 84532 ? "base-sepolia" : "unichain-sepolia"}/lp/positions`) return undefined;
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (url.search) return json({ error: "Query unsupported" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "JSON required" }, 415);
  let body; const reader = request.body?.getReader();
  if (!reader) return json({ error: "JSON required" }, 400);
  try {
    const chunks = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > 4096) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
      chunks.push(chunk.value);
    }
    body = testnetLpRequestSchema.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return json({ error: "Invalid LP request", code: "TESTNET_LP_REQUEST_INVALID" }, 400); }
  finally { reader.releaseLock(); }
  if (!positions) return json({ error: "Testnet RPC not configured", code: "TESTNET_LP_RPC_NOT_CONFIGURED" }, 503);
  try { return json({ page: await positions.read(body) }); }
  catch (error) {
    const code = error instanceof TestnetLpError ? error.code : "TESTNET_LP_RPC_UNAVAILABLE";
    return json({ error: "Testnet LP read unavailable", code }, code === "TESTNET_LP_BUSY" ? 429 : 503);
  }
}
