const ROUTES: Record<string, string> = {
  "/api/v1/testnet/base-sepolia/depth": "testnet_depth",
  "/api/v1/testnet/base-sepolia/quote": "testnet_quote",
  "/health": "health",
  "/ready": "ready",
  "/api/v1/tokens": "tokens",
  "/api/v1/pools": "pools",
  "/api/v1/quote": "pool_quote",
  "/api/v1/lp/positions": "lp_positions",
  "/api/v1/trading-quote": "trading_quote",
  "/api/v1/wallet-state": "wallet_state",
  "/api/v1/approval-plan": "approval_plan",
  "/api/v1/permit-plan": "permit_plan",
  "/api/v1/swap-preparation": "swap_preparation",
  "/api/v1/swap-recheck": "swap_recheck",
  "/api/v1/transaction-observation": "transaction_observation",
};

function routeLabel(url: string | undefined): string {
  try {
    const path = new URL(url ?? "", "http://local").pathname;
    if (path.startsWith("/api/v1/pools/")) return "pool_detail";
    return ROUTES[path] ?? "other";
  } catch { return "other"; }
}

/** Structured allowlist only: no raw URL, body, wallet, upstream error or credential fields. */
export function formatRequestLog(input: { requestId: string; method: string | undefined; url: string | undefined;
  status: number; durationMs: number }): string {
  return JSON.stringify({ event: "dex_api_request", requestId: input.requestId,
    route: routeLabel(input.url), method: input.method === "GET" || input.method === "POST" ? input.method : "OTHER",
    status: input.status, durationMs: Number.isFinite(input.durationMs) ? Math.max(0, Math.round(input.durationMs)) : 0 });
}
