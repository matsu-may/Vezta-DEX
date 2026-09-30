// Read-only local API probe. Never signs, submits, or prints response bodies.
import { pathToFileURL } from "node:url";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const safeCodes = new Set([
  "TRADING_API_NOT_CONFIGURED", "TRADING_API_UNAVAILABLE", "TRADING_API_QUEUE_FULL",
  "TRADING_API_TIMEOUT", "TRADING_API_NETWORK_ERROR", "TRADING_API_AUTH_FAILED",
  "TRADING_API_RATE_LIMITED", "TRADING_API_HTTP_ERROR", "TRADING_API_INVALID_RESPONSE",
  "TRADING_API_SIMULATION_FAILED", "TRADING_API_UNSUPPORTED_ROUTE", "TRADING_API_INTENT_MISMATCH",
  "TRADING_API_QUOTE_EXPIRED", "TRADING_API_INVALID_AMOUNTS", "TRADING_QUOTE_STORE_UNAVAILABLE",
  "WALLET_STATE_BLOCK_UNAVAILABLE", "WALLET_STATE_ACCOUNT_CODE_UNAVAILABLE",
  "WALLET_STATE_READS_UNAVAILABLE", "WALLET_STATE_APPROVAL_SIMULATION_UNAVAILABLE",
  "WALLET_STATE_APPROVAL_GAS_UNAVAILABLE", "WALLET_STATE_STALE_BLOCK",
  "WALLET_STATE_NONCE_UNAVAILABLE",
]);

export async function runReadDiagnostics({
  swapper, cycles = 4, apiUrl = "http://127.0.0.1:3021", fetcher = fetch,
  now = Date.now, pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
  write = line => process.stdout.write(line + "\n"),
}) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(swapper)) throw new Error("DEX_SMOKE_WALLET must be an EVM address");
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 10) throw new Error("cycles must be 1-10");
  const api = new URL(apiUrl);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(api.hostname) || api.port !== "3021" || api.username || api.password || api.pathname !== "/" || api.search || api.hash)
    throw new Error("DEX_API_URL must be local port 3021");
  const intent = { chainId: 137, swapper, tokenIn: USDC, tokenOut: WETH, amountIn: "1000000", slippageBps: 50 };
  const endpoints = [["quote", "trading-quote"], ["state", "wallet-state"]];
  for (let cycle = 1; cycle <= cycles; cycle++) {
    for (const [endpoint, path] of endpoints) {
      const start = now();
      try {
        const response = await fetcher(new URL(`/api/v1/${path}`, api), {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(intent), signal: AbortSignal.timeout(18_000),
        });
        let body;
        try { body = await response.json(); } catch { body = null; }
        const code = safeCodes.has(body?.code) ? body.code : undefined;
        const upstreamStatus = Number.isInteger(body?.upstreamStatus) && body.upstreamStatus >= 100 && body.upstreamStatus <= 599 ? body.upstreamStatus : undefined;
        write(JSON.stringify({ cycle, endpoint, status: response.status, elapsedMs: Math.max(0, now() - start), code, upstreamStatus, hasData: response.ok ? Boolean(endpoint === "quote" ? body?.quote : body?.state) : undefined }));
      } catch (error) {
        write(JSON.stringify({ cycle, endpoint, elapsedMs: Math.max(0, now() - start), networkError: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name) ? "TimeoutError" : "Error" }));
      }
      if (cycle !== cycles || endpoint !== "state") await pause(1_250);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runReadDiagnostics({ swapper: process.env.DEX_SMOKE_WALLET, apiUrl: process.env.DEX_API_URL });
}
