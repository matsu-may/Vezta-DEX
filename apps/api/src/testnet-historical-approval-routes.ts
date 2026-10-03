import { parseTestnetHistoricalApprovalRequest, TestnetHistoricalApprovalError,
  type TestnetHistoricalApprovalReader } from "./testnet-historical-approval";
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export async function handleTestnetHistoricalApprovalRequest(request: Request,
  historical?: TestnetHistoricalApprovalReader): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/v1/testnet/base-sepolia/historical-approval") return undefined;
  if (request.method !== "POST") return json({ error: "POST required" }, 405);
  if (url.search) return json({ error: "Query unsupported" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return json({ error: "JSON required" }, 415);
  const reader = request.body?.getReader(); if (!reader) return json({ error: "JSON required" }, 400);
  let body: unknown;
  try {
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break; length += chunk.value.byteLength;
      if (length > 4096) { await reader.cancel(); return json({ error: "Request too large" }, 413); }
      chunks.push(chunk.value);
    }
    body = parseTestnetHistoricalApprovalRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch { return json({ error: "Invalid historical approval request", code: "TESTNET_HISTORICAL_REQUEST_INVALID" }, 400); }
  finally { reader.releaseLock(); }
  if (!historical) return json({ error: "Testnet RPC is not configured", code: "TESTNET_RPC_NOT_CONFIGURED" }, 503);
  try { return json({ reconciliation: await historical.read(body) }); }
  catch (error) {
    const code = error instanceof TestnetHistoricalApprovalError ? error.code : "TESTNET_HISTORICAL_RPC_UNAVAILABLE";
    return json({ error: "Historical approval could not be verified", code }, code === "TESTNET_HISTORICAL_BUSY" ? 429 : 503);
  }
}
