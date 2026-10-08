import type { IncomingHttpHeaders } from "node:http";

// The private API only needs JSON content type; credentials and browser headers are not propagated.
export function toApiRequest(url: URL, method: string | undefined, body: string | undefined,
  headers: IncomingHttpHeaders): Request {
  const contentType = headers["content-type"];
  return new Request(url, { method, body,
    headers: typeof contentType === "string" ? { "content-type": contentType } : undefined });
}
