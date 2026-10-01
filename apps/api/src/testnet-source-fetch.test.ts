import { afterEach, expect, it, vi } from "vitest";
import { fetchTestnetSourceEvidence } from "./testnet-source-fetch";
import { sourceFixture } from "./testnet-source.test-helper";
afterEach(() => vi.useRealTimers());

it("uses one fixed public GET and only the compiler evidence fields", async () => {
  let calls = 0;
  const value = await fetchTestnetSourceEvidence("router", async (url, init) => {
    calls++;
    expect(String(url)).toBe("https://sourcify.dev/server/v2/contract/84532/0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4?fields=metadata,stdJsonInput,compilation,runtimeBytecode.onchainBytecode");
    expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { "user-agent": "vezta-dex/0.1.0 (+https://vezta.io)" } });
    return Response.json(sourceFixture());
  });
  expect(value).toMatchObject({ chainId: "84532", runtimeMatch: "exact_match" }); expect(calls).toBe(1);
});

it.each(["no-length", "understated-length", "declared-oversize"])("cancels oversized source streams before parsing (%s)", async mode => {
  let cancelled = false; let emitted = 0;
  const failure = fetchTestnetSourceEvidence("router", async () => new Response(new ReadableStream<Uint8Array>({
    pull(c) { emitted += 65536; c.enqueue(new Uint8Array(65536)); }, cancel() { cancelled = true; },
  }), { headers: mode === "no-length" ? {} : { "content-length": mode === "declared-oversize" ? "8000001" : "10" } }));
  await expect(failure).rejects.toMatchObject({ code: "SOURCE_RESPONSE_TOO_LARGE" });
  expect(cancelled).toBe(true); expect(emitted).toBeLessThanOrEqual(8131072);
});

it("accepts UTF-8 JSON exactly at the byte limit", async () => {
  const content = '{"source":"é"}'; const bytes = Buffer.byteLength(content);
  expect(await fetchTestnetSourceEvidence("router", async () => new Response(content + " ".repeat(8000000 - bytes))))
    .toEqual({ source: "é" });
});

it("bounds a late abort-ignoring fetch and cancels a hung body", async () => {
  vi.useFakeTimers(); let lateSignal: AbortSignal | undefined;
  const late = fetchTestnetSourceEvidence("router", async (_url, init) => {
    lateSignal = init?.signal as AbortSignal;
    await new Promise(resolve => setTimeout(resolve, 16000)); return Response.json(sourceFixture());
  });
  const failed = expect(late).rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(15000); await failed; expect(lateSignal?.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(1000);
  let cancelled = false;
  const hung = fetchTestnetSourceEvidence("router", async () => new Response(new ReadableStream({ cancel() { cancelled = true; } })));
  const hungFailure = expect(hung).rejects.toMatchObject({ code: "SOURCE_TIMEOUT" });
  await vi.advanceTimersByTimeAsync(15000); await hungFailure; expect(cancelled).toBe(true);
});

it.each([[404, "SOURCE_NOT_FOUND"], [429, "SOURCE_RATE_LIMITED"], [503, "SOURCE_HTTP_UNAVAILABLE"]])("sanitizes HTTP %s without retries", async (status, code) => {
  let calls = 0;
  const failed = fetchTestnetSourceEvidence("router", async () => { calls++; return new Response("credential=secret", { status: status as number }); });
  await expect(failed).rejects.toMatchObject({ code, httpStatus: status, message: code }); expect(calls).toBe(1);
});

it("sanitizes malformed JSON and network errors", async () => {
  await expect(fetchTestnetSourceEvidence("router", async () => new Response("private-response"))).rejects.toMatchObject({ code: "SOURCE_EVIDENCE_INVALID" });
  await expect(fetchTestnetSourceEvidence("router", async () => { throw new Error("https://private.invalid/secret"); }))
    .rejects.toMatchObject({ code: "SOURCE_NETWORK_UNAVAILABLE", message: "SOURCE_NETWORK_UNAVAILABLE" });
});
