// Read-only Polygon JSON-RPC probe. The URL and provider response bodies are never printed.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function runPolygonRpcProbe({
  rpcUrl, cycles = 5, fetcher = fetch, now = Date.now,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  write = line => process.stdout.write(line + "\n"),
}) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) throw new Error("cycles must be 1-10");
  const url = new URL(rpcUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error("POLYGON_RPC_URL must be HTTPS or local HTTP");
  const methods = [["eth_chainId", []], ["eth_getBlockByNumber", ["latest", false]]];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const [method, params] of methods) {
      const start = now();
      try {
        const response = await fetcher(url, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
          signal: AbortSignal.timeout(8_000),
        });
        let payload;
        try { payload = await response.json(); } catch { payload = null; }
        const rpcErrorCode = Number.isInteger(payload?.error?.code) ? payload.error.code : undefined;
        const validResult = response.ok && !payload?.error && (method === "eth_chainId"
          ? payload?.result === "0x89"
          : typeof payload?.result?.number === "string" && /^0x[0-9a-fA-F]+$/.test(payload.result.number)
            && typeof payload?.result?.timestamp === "string" && /^0x[0-9a-fA-F]+$/.test(payload.result.timestamp));
        write(JSON.stringify({ cycle, method, status: response.status, elapsedMs: Math.max(0, now() - start), rpcErrorCode, validResult: Boolean(validResult) }));
      } catch (error) {
        write(JSON.stringify({ cycle, method, elapsedMs: Math.max(0, now() - start), networkError: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TimeoutError" : "Error" }));
      }
      if (cycle !== cycles || method !== "eth_getBlockByNumber") await pause(1_250);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  await runPolygonRpcProbe({ rpcUrl: process.env.POLYGON_RPC_URL ?? "https://polygon-bor-rpc.publicnode.com" });
}
