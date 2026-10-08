export const TRADING_QUOTE_FAILURE_CODES = Object.freeze([
  "TRADING_API_NOT_CONFIGURED", "TRADING_API_NETWORK_ERROR", "TRADING_API_TIMEOUT", "TRADING_API_QUEUE_FULL",
  "TRADING_API_AUTH_FAILED", "TRADING_API_RATE_LIMITED", "TRADING_API_HTTP_ERROR", "TRADING_API_INVALID_RESPONSE",
  "TRADING_API_SIMULATION_FAILED", "TRADING_API_UNSUPPORTED_ROUTE", "TRADING_API_INTENT_MISMATCH",
  "TRADING_API_INVALID_AMOUNTS", "TRADING_API_QUOTE_EXPIRED", "TRADING_QUOTE_STORE_UNAVAILABLE", "TRADING_API_UNAVAILABLE",
] as const);

export type TradingQuoteFailureCode = typeof TRADING_QUOTE_FAILURE_CODES[number];

/** Select known diagnostic fields only; never echo an arbitrary error or upstream body. */
export function summarizeTradingFailure(value: unknown): { code?: TradingQuoteFailureCode; upstreamStatus?: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const body = value as Record<string, unknown>;
  if (typeof body.code !== "string" || !TRADING_QUOTE_FAILURE_CODES.some((code) => code === body.code)) return {};
  const result: { code: TradingQuoteFailureCode; upstreamStatus?: number } = { code: body.code as TradingQuoteFailureCode };
  if (typeof body.upstreamStatus === "number" && Number.isInteger(body.upstreamStatus) && body.upstreamStatus >= 100 && body.upstreamStatus <= 599) result.upstreamStatus = body.upstreamStatus;
  return result;
}
