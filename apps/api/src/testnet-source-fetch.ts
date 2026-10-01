import { TESTNET_ARTIFACT_MANIFEST, type TestnetArtifactRole } from "./testnet-artifacts";
import { TestnetSourceError } from "./testnet-source-evidence";

const LIMIT = 8000000;
export async function fetchTestnetSourceEvidence(role: TestnetArtifactRole, fetchFn: typeof fetch = fetch): Promise<unknown> {
  const pin = TESTNET_ARTIFACT_MANIFEST.find(x => x.role === role);
  if (!pin) throw new TestnetSourceError("SOURCE_INVALID_OPTION");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new TestnetSourceError("SOURCE_TIMEOUT")); }, 15000);
  });
  async function read() {
    const response = await fetchFn(`https://sourcify.dev/server/v2/contract/84532/${pin!.address}?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode`,
      { method: "GET", redirect: "error", headers: { "user-agent": "vezta-dex/0.1.0 (+https://vezta.io)" }, signal: controller.signal });
    controller.signal.throwIfAborted();
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new TestnetSourceError(response.status === 404 ? "SOURCE_NOT_FOUND" : response.status === 429 ? "SOURCE_RATE_LIMITED" : "SOURCE_HTTP_UNAVAILABLE", response.status);
    }
    if (Number(response.headers.get("content-length")) > LIMIT) {
      void response.body?.cancel().catch(() => {}); throw new TestnetSourceError("SOURCE_RESPONSE_TOO_LARGE");
    }
    if (!response.body) throw new TestnetSourceError("SOURCE_EVIDENCE_INVALID");
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    controller.signal.addEventListener("abort", cancel, { once: true });
    const body = new Uint8Array(LIMIT); let size = 0;
    try {
      while (true) {
        controller.signal.throwIfAborted(); const { done, value } = await reader.read(); controller.signal.throwIfAborted();
        if (done) break;
        if (value.byteLength > LIMIT - size) { cancel(); throw new TestnetSourceError("SOURCE_RESPONSE_TOO_LARGE"); }
        body.set(value, size); size += value.byteLength;
      }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body.subarray(0, size))) as unknown; }
      catch { throw new TestnetSourceError("SOURCE_EVIDENCE_INVALID"); }
    } finally { controller.signal.removeEventListener("abort", cancel); reader.releaseLock(); }
  }
  try { return await Promise.race([read(), timeout]); }
  catch (error) {
    if (error instanceof TestnetSourceError) throw error;
    throw new TestnetSourceError(controller.signal.aborted ? "SOURCE_TIMEOUT" : "SOURCE_NETWORK_UNAVAILABLE");
  } finally { clearTimeout(timer); controller.abort(); }
}
