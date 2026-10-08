import { UNIVERSAL_ROUTER_VERSION } from "@vezta-dex/core";
import { TradingApiRateLimiter, type TradingApiPriority } from "./trading-rate-limit";

const BASE_URL = "https://trade-api.gateway.uniswap.org/v1";

function retryAfterMilliseconds(header: string | null): number {
  const seconds = header === null ? NaN : Number(header);
  const date = header === null ? NaN : Date.parse(header);
  const requested = Number.isFinite(seconds) && seconds >= 0
    ? seconds * 1_000
    : Number.isFinite(date) ? date - Date.now() : 5_000;
  return Math.min(60_000, Math.max(1_000, requested));
}

/** All Trading API endpoints for one key must share this instance. */
export class TradingApiClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
    private readonly limiter = new TradingApiRateLimiter(),
  ) {
    if (!apiKey.trim()) throw new Error("UNISWAP_API_KEY is required");
  }

  post(path: "/quote" | "/check_approval" | "/swap", body: unknown, priority: TradingApiPriority): Promise<Response> {
    return this.limiter.schedule(async () => {
      const response = await this.fetcher(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          ...(path === "/check_approval" ? {} : { "x-universal-router-version": UNIVERSAL_ROUTER_VERSION }),
          "x-agent-info": JSON.stringify({ integration_name: "swap-integration", decision_origin: "human_mediated", version: "1.6.0" }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      });
      if (response.status === 429) this.limiter.pauseFor(retryAfterMilliseconds(response.headers.get("Retry-After")));
      return response;
    }, priority);
  }
}
