import { parseTestnetDepth, type TestnetDepthReport } from "@vezta-dex/core";
import { BaseSepoliaPreflightError } from "./base-sepolia-preflight";

class TestnetDiscoveryError extends Error {
  constructor(readonly code: "DEPTH_TIMEOUT" | "INVALID_DEPTH") { super(code); }
}

export class TestnetDiscoveryReader {
  private pending: Promise<TestnetDepthReport> | undefined;
  constructor(private readonly probe: (signal: AbortSignal) => Promise<unknown>) {}

  read(): Promise<TestnetDepthReport> {
    if (this.pending) return this.pending;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new TestnetDiscoveryError("DEPTH_TIMEOUT"));
      }, 45000);
    });
    const work = (async () => {
      const value = await this.probe(controller.signal);
      try { return parseTestnetDepth(value); }
      catch { throw new TestnetDiscoveryError("INVALID_DEPTH"); }
    })();
    this.pending = Promise.race([work, timeout]).finally(() => {
      clearTimeout(timer); this.pending = undefined;
    });
    return this.pending;
  }
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function handleTestnetDiscovery(request: Request, reader?: TestnetDiscoveryReader): Promise<Response> {
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (new URL(request.url).search) return json({ error: "Query parameters are not supported" }, 400);
  if (!reader) return json({ error: "Testnet RPC is not configured", code: "TESTNET_RPC_NOT_CONFIGURED" }, 503);
  try { return json({ depth: await reader.read() }); }
  catch (error) {
    const code = error instanceof TestnetDiscoveryError || error instanceof BaseSepoliaPreflightError
      ? error.code : "TESTNET_RPC_UNAVAILABLE";
    return json({ error: "Testnet pool data unavailable", code }, 503);
  }
}
