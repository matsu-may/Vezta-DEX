// Fixed local read-only endpoints. No wallet methods, keys or raw response bodies.
import { pathToFileURL } from "node:url";

const safeCodes = new Set(["TESTNET_RPC_NOT_CONFIGURED", "TESTNET_RPC_UNAVAILABLE", "DEPTH_TIMEOUT",
  "INVALID_DEPTH", "WRONG_CHAIN", "STALE_BLOCK", "MISSING_CODE", "TOKEN_DECIMALS", "POOL_IDENTITY", "BLOCK_CHANGED",
  "TESTNET_API_CONFIG_INVALID", "TESTNET_API_TIMEOUT", "TESTNET_API_UNREACHABLE", "TESTNET_API_HTTP_ERROR", "TESTNET_API_INVALID_RESPONSE"]);

async function readJson(response) {
  if (!response.body) throw new Error();
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 65536) { await reader.cancel(); throw new Error(); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function diagnoseTestnetDiscovery({ fetcher = fetch, now = Date.now,
  write = line => process.stdout.write(line + "\n") } = {}) {
  const endpoints = [
    ["api-depth", "http://127.0.0.1:3021/api/v1/testnet/base-sepolia/depth"],
    ["web-depth", "http://127.0.0.1:3020/api/testnet-depth"],
  ];
  for (const [endpoint, url] of endpoints) {
    const start = now();
    try {
      const response = await fetcher(url, { method: "GET", headers: { Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(55000) });
      let body;
      try { body = await readJson(response); } catch { body = null; }
      const hasDepth = response.ok && body?.depth?.chainId === 84532 && body.depth.source === "base-sepolia-rpc"
        && Array.isArray(body.depth.pools) && Array.isArray(body.depth.candidateFeeTiers)
        && typeof body.depth.depthQualified === "boolean";
      const code = safeCodes.has(body?.code) ? body.code : !body || response.ok && !hasDepth ? "INVALID_DIAGNOSTIC_RESPONSE" : undefined;
      const upstreamStatus = Number.isInteger(body?.upstreamStatus) && body.upstreamStatus >= 100 && body.upstreamStatus <= 599 ? body.upstreamStatus : undefined;
      write(JSON.stringify({ endpoint, status: response.status, elapsedMs: Math.max(0, now() - start), code, upstreamStatus,
        hasDepth, ...(hasDepth ? { depthQualified: body.depth.depthQualified,
          candidateFeeTiers: body.depth.candidateFeeTiers.filter(fee => [100, 500, 3000, 10000].includes(fee)).slice(0, 4),
          poolCount: Math.min(body.depth.pools.length, 4) } : {}) }));
    } catch (error) {
      const networkError = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TimeoutError" : "Error";
      const cause = error?.cause?.code;
      write(JSON.stringify({ endpoint, elapsedMs: Math.max(0, now() - start), networkError,
        localErrorCode: ["EPERM", "EACCES", "ECONNREFUSED"].includes(cause) ? cause : undefined }));
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await diagnoseTestnetDiscovery();
