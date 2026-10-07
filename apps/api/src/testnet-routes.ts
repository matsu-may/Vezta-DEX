import { createTestnetSwapDomain, type TestnetChainId } from "@vezta-dex/core";
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

export async function handleTestnetRequest<I extends TestnetChainId = 84532>(request: Request, discovery?: TestnetDiscoveryReader,
  quotes?: TestnetSwapQuoteReader<I>, states?: TestnetWalletStateReader<I>,
  approvals?: TestnetApprovalReader<I>, preparer?: TestnetSwapPreparer<I>,
  rechecker?: TestnetRechecker<I>, receipts?: TestnetReceiptReader<I>, executionEnabled = false, chainId: I = 84532 as I): Promise<Response | undefined> {
  const url = new URL(request.url);
  const slug = chainId === 84532 ? "base-sepolia" : "unichain-sepolia";
  const prefix = `/api/v1/testnet/${slug}`;
  const domain = createTestnetSwapDomain(chainId);
  if (chainId === 84532 && url.pathname === `${prefix}/depth`) return handleTestnetDiscovery(request, discovery);
  const stateRequest = url.pathname === `${prefix}/state`;
  const approvalRequest = url.pathname === `${prefix}/approval`;
  const prepareRequest = url.pathname === `${prefix}/prepare`;
  const recheckRequest = url.pathname === `${prefix}/recheck`;
  const receiptRequest = url.pathname === `${prefix}/receipt`;
  if (!stateRequest && !approvalRequest && !prepareRequest && !recheckRequest && !receiptRequest
    && url.pathname !== `${prefix}/quote`) return undefined;
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (url.search) return json({ error: "Query parameters are not supported" }, 400);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return json({ error: "JSON required" }, 415);
  }
  let intent;
  try {
    const body = await readJson(request);
    intent = receiptRequest ? parseTestnetReceiptRequest(body) : recheckRequest ? parseTestnetRecheckRequest(body, chainId)
      : approvalRequest || prepareRequest ? parseTestnetApprovalRequest(body, chainId) : domain.parseTestnetSwapIntent(body);
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
    if (recheckRequest) {
      const result = await rechecker!.read(intent);
      return json({ study: { ...result.study, executionEnabled }, action: result.action ? { ...result.action, executionEnabled } : null });
    }
    if (prepareRequest) return json({ preparation: await preparer!.read(intent) });
    if (approvalRequest) return json({ approval: await approvals!.read(intent) });
    if (stateRequest) return json({ state: await states!.read(intent) });
    const result = await quotes!.read(intent);
    return json({ ...result, qualification: { ...result.qualification, executionEnabled } });
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
