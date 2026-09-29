import type { RehearsalApi } from "./rehearsal-controller";
export async function boundedJson(response: Response, maxBytes = 262144): Promise<unknown> {
  if (!response.body)
    throw new Error("Invalid rehearsal response");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done)
        break;
      size += next.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Response too large");
      }
      chunks.push(next.value);
    }
  }
  finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export function createRehearsalClient(fetcher: typeof fetch = fetch): RehearsalApi {
  return { async call(action, body) {
      try {
        const response = await fetcher(`/api/rehearsal/${action}`, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, cache: "no-store", redirect: "error", body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
        if (!response.ok)
          throw new Error();
        return await boundedJson(response);
      }
      catch {
        throw new Error("Rehearsal API unavailable. Check the original transaction before retrying any action.");
      }
    } };
}
