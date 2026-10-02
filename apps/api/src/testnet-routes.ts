import { parseTestnetSwapIntent } from "@vezta-dex/core";
import { handleTestnetDiscovery, type TestnetDiscoveryReader } from "./testnet-discovery";
import { TestnetQuoteError, type TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetWalletStateError, type TestnetWalletStateReader } from "./testnet-wallet-state";
import { TestnetApprovalError, parseTestnetApprovalRequest, type TestnetApprovalReader } from "./testnet-approval";
import { TestnetPreparationError, type TestnetSwapPreparer } from "./testnet-swap-preparation";
import { TestnetActionError, parseTestnetRecheckRequest, type TestnetRechecker } from "./testnet-action";
import { TestnetReceiptError, parseTestnetReceiptRequest, type TestnetReceiptReader } from "./testnet-receipt";

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
  quotes?: TestnetSwapQuoteReader, states?: TestnetWalletStateReader,
  approvals?: TestnetApprovalReader, preparer?: TestnetSwapPreparer,
  rechecker?: TestnetRechecker, receipts?: TestnetReceiptReader): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (url.pathname === "/api/v1/testnet/base-sepolia/depth") return handleTestnetDiscovery(request, discovery);
  const stateRequest = url.pathname === "/api/v1/testnet/base-sepolia/state";
  const approvalRequest = url.pathname === "/api/v1/testnet/base-sepolia/approval";
  const prepareRequest = url.pathname === "/api/v1/testnet/base-sepolia/prepare";
  const recheckRequest = url.pathname === "/api/v1/testnet/base-sepolia/recheck";
  const receiptRequest = url.pathname === "/api/v1/testnet/base-sepolia/receipt";
  if (!stateRequest && !approvalRequest && !prepareRequest && !recheckRequest && !receiptRequest
    && url.pathname !== "/api/v1/testnet/base-sepolia/quote") return undefined;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Query parameters are not supported" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "JSON required" }, 415);
  }
  let intent;
  try {
    const body = await readJson(request);
    intent = receiptRequest ? parseTestnetReceiptRequest(body) : recheckRequest ? parseTestnetRecheckRequest(body)
      : approvalRequest || prepareRequest ? parseTestnetApprovalRequest(body) : parseTestnetSwapIntent(body);
  }
  catch (error) {
    return error instanceof RangeError ? json({ error: "Request too large" }, 413)
      : json({ error: "Invalid testnet intent", code: "TESTNET_INTENT_INVALID" }, 400);
  }
  if (receiptRequest ? !receipts : recheckRequest ? !rechecker : prepareRequest ? !preparer : approvalRequest ? !approvals : stateRequest ? !states : !quotes) {
    return json({ error: "Testnet RPC is not configured", code: "TESTNET_RPC_NOT_CONFIGURED" }, 503);
  }
  try {
    if (receiptRequest) return json({ observation: await receipts!.observe(intent) });
    if (recheckRequest) return json(await rechecker!.read(intent));
    return prepareRequest ? json({ preparation: await preparer!.read(intent) }) : approvalRequest ? json({ approval: await approvals!.read(intent) })
      : stateRequest ? json({ state: await states!.read(intent) }) : json(await quotes!.read(intent));
  }
  catch (error) {
    const code = error instanceof TestnetQuoteError || error instanceof TestnetWalletStateError
      || error instanceof TestnetApprovalError || error instanceof TestnetPreparationError
      || error instanceof TestnetActionError || error instanceof TestnetReceiptError ? error.code : "TESTNET_RPC_UNAVAILABLE";
    return json({ error: receiptRequest ? "Testnet receipt unavailable" : recheckRequest ? "Testnet recheck unavailable"
      : prepareRequest ? "Testnet preparation unavailable" : approvalRequest ? "Testnet approval unavailable"
      : stateRequest ? "Testnet state unavailable" : "Testnet quote unavailable", code },
    code === "TESTNET_CONTEXT_UNAVAILABLE" ? 410 : code === "TESTNET_CONTEXT_HASH_CHANGED" ? 409
      : code.endsWith("_BUSY") ? 429 : 503);
  }
}
