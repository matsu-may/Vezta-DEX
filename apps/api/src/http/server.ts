import { TOKENS, parsePoolKey, summarizeTradingFailure, type Address, type TradingIntent } from "@vezta-dex/core";
import { z } from "zod";
import type { PoolReader } from "../modules/discovery/pools";
import { QuoteInputError, type QuoteReader } from "../modules/swap/quote";
import { TradingApiInputError, TradingApiUnavailableError, type TradingApiQuoteReader } from "../modules/swap/trading-api";
import { ApprovalInputError, type AllowanceReader } from "../modules/swap/allowance-reader";
import { PermitInputError, type PermitReader } from "../modules/swap/permit-reader";
import { SwapPreparationInputError, type SwapPreparer } from "../modules/swap/swap-preparation";

import { WalletStateUnavailableError, type WalletStateReader } from "../modules/wallet/wallet-state";
import { submissionSchema, type WalletObservationReader } from "../modules/wallet/wallet-observation";
import type { ReadinessReader } from "../infrastructure/http/readiness";

const tradingIntentSchema = z.object({
  chainId: z.literal(137),
  swapper: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenIn: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  tokenOut: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  amountIn: z.string().regex(/^[1-9]\d{0,18}$/),
  slippageBps: z.number().int().min(10).max(300),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export interface PositionPageReader {
  getPage(input: { owner: Address; cursor: bigint; limit: number }): Promise<unknown>;
}

export async function handleRequest(request: Request, reader: PoolReader, quotes?: QuoteReader, trading?: TradingApiQuoteReader, approval?: AllowanceReader, permits?: PermitReader, swaps?: SwapPreparer, wallet?: WalletStateReader, observations?: WalletObservationReader, positions?: PositionPageReader, readiness?: Pick<ReadinessReader, "check">): Promise<Response> {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/api/v1/wallet-state" || pathname === "/api/v1/transaction-observation" || pathname === "/api/v1/swap-recheck") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    let body: unknown; try { body = await request.json(); } catch { return json({ error: "Invalid observation request" }, 400); }
    try {
      if (pathname.endsWith("wallet-state")) {
        const parsed = tradingIntentSchema.strict().safeParse(body);
        if (!parsed.success) return json({ error: "Invalid wallet state request" }, 400);
        if (!wallet) return json({ error: "Wallet state unavailable" }, 503);
        return json({ state: await wallet.getState(parsed.data as TradingIntent) });
      }
      if (pathname.endsWith("swap-recheck")) {
        const parsed = tradingIntentSchema.extend({ quoteId: z.string().regex(/^[0-9a-f]{48}$/) }).strict().safeParse(body);
        if (!parsed.success) return json({ error: "Invalid recheck request" }, 400);
        if (!swaps) return json({ error: "Swap recheck unavailable" }, 503);
        const { quoteId, ...intent } = parsed.data;
        return json({ preparation: await swaps.recheck(intent as TradingIntent, quoteId) });
      }
      const parsed = submissionSchema.safeParse(body);
      if (!parsed.success) return json({ error: "Invalid submission record" }, 400);
      if (!observations) return json({ error: "Receipt observation unavailable" }, 503);
      const result = await observations.observe(parsed.data);
      return json(JSON.parse(JSON.stringify(result, (_key, value) => typeof value === "bigint" ? value.toString() : value)));
    } catch (error) {
      return json({ error: "Polygon observation is unavailable", ...(pathname.endsWith("wallet-state") && error instanceof WalletStateUnavailableError ? { code: error.code } : {}) }, 503);
    }
  }
  if (pathname === "/api/v1/swap-preparation") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!swaps) return json({ error: "Swap preparation is unavailable" }, 503);
    let body: unknown;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid swap preparation request" }, 400); }
    const parsed = tradingIntentSchema.extend({
      quoteId: z.string().regex(/^[0-9a-f]{48}$/),
      signature: z.string().regex(/^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/).optional(),
    }).strict().safeParse(body);
    if (!parsed.success) return json({ error: "Invalid swap preparation request" }, 400);
    const { quoteId, signature, ...intent } = parsed.data;
    try { return json({ preparation: await swaps.prepare(intent as TradingIntent, quoteId, signature as `0x${string}` | undefined) }); }
    catch (error) {
      return error instanceof SwapPreparationInputError ? json({ error: "Invalid swap preparation request" }, 400) : json({ error: "Swap preparation is unavailable" }, 503);
    }
  }
  if (pathname === "/api/v1/permit-plan") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!permits) return json({ error: "Permit planning is unavailable" }, 503);
    let body: unknown;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid permit plan request" }, 400); }
    const parsed = tradingIntentSchema.extend({ quoteId: z.string().regex(/^[0-9a-f]{48}$/) }).strict().safeParse(body);
    if (!parsed.success) return json({ error: "Invalid permit plan request" }, 400);
    const { quoteId, ...intent } = parsed.data;
    try { return json({ permitPlan: await permits.getPlan(intent as TradingIntent, quoteId) }); }
    catch (error) {
      return error instanceof PermitInputError ? json({ error: "Invalid permit plan request" }, 400) : json({ error: "Polygon permit state is unavailable" }, 503);
    }
  }
  if (pathname === "/api/v1/approval-plan") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!approval) return json({ error: "Approval planning is unavailable" }, 503);
    let body: unknown;
    try { body = await request.json(); }
    catch { return json({ error: "Invalid approval request" }, 400); }
    const parsed = tradingIntentSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid approval request" }, 400);
    try { return json({ approval: await approval.getPlan(parsed.data as TradingIntent) }); }
    catch (error) {
      return error instanceof ApprovalInputError ? json({ error: error.message }, 400) : json({ error: "Polygon approval state is unavailable" }, 503);
    }
  }
  if (pathname === "/api/v1/trading-quote") {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    if (!trading) return json({ error: "Trading API is not configured", code: "TRADING_API_NOT_CONFIGURED" }, 503);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid quote request" }, 400);
    }
    const parsed = tradingIntentSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid quote request" }, 400);
    try {
      return json(await trading.getQuote(parsed.data as TradingIntent));
    } catch (error) {
      return error instanceof TradingApiInputError ? json({ error: error.message }, 400)
        : json({ error: "Trading API quote is unavailable", ...summarizeTradingFailure(error instanceof TradingApiUnavailableError ? error : { code: "TRADING_API_UNAVAILABLE" }) }, 503);
    }
  }
  if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);

  if (pathname === "/health") return json({ status: "ok" });
  if (pathname === "/ready") {
    if (!readiness) return json({ status: "unavailable", polygon: "unavailable" }, 503);
    const result = await readiness.check();
    return json(result, result.status === "ready" ? 200 : 503);
  }
  if (pathname === "/api/v1/tokens") return json({ tokens: [TOKENS.USDC, TOKENS.WETH] });

  if (pathname === "/api/v1/lp/positions") {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !["chainId", "owner", "cursor", "limit"].includes(key))
      || ["chainId", "owner", "cursor", "limit"].some(key => params.getAll(key).length !== 1)) {
      return json({ error: "Invalid LP position request" }, 400);
    }
    const parsed = z.object({ chainId: z.literal("137"), owner: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      cursor: z.string().regex(/^(0|[1-9]\d{0,6})$/), limit: z.coerce.number().int().min(1).max(5) })
      .safeParse(Object.fromEntries(params));
    if (!parsed.success) return json({ error: "Invalid LP position request" }, 400);
    if (!positions) return json({ error: "LP position read is unavailable" }, 503);
    try {
      return json({ page: await positions.getPage({ owner: parsed.data.owner as Address,
        cursor: BigInt(parsed.data.cursor), limit: parsed.data.limit }) });
    } catch {
      return json({ error: "Polygon LP positions are unavailable" }, 503);
    }
  }

  if (pathname === "/api/v1/quote") {
    if (!quotes) return json({ error: "Quote service is unavailable" }, 503);
    const params = new URL(request.url).searchParams;
    try {
      const quote = await quotes.getQuote({
        chainId: Number(params.get("chainId")),
        tokenIn: (params.get("tokenIn") ?? "") as `0x${string}`,
        amountIn: params.get("amountIn") ?? "",
      });
      return json({ quote });
    } catch (error) {
      return error instanceof QuoteInputError ? json({ error: error.message }, 400) : json({ error: "Polygon quote is unavailable" }, 503);
    }
  }

  if (pathname === "/api/v1/pools") {
    try {
      return json({ pools: await reader.listCuratedPools() });
    } catch {
      return json({ error: "Polygon pool data is unavailable" }, 503);
    }
  }

  if (pathname.startsWith("/api/v1/pools/")) {
    let key: string;
    try {
      key = decodeURIComponent(pathname.slice("/api/v1/pools/".length));
      parsePoolKey(key);
    } catch {
      return json({ error: "Invalid pool ID" }, 400);
    }
    try {
      const pool = await reader.getPool(key);
      return pool ? json({ pool }) : json({ error: "Pool not found" }, 404);
    } catch {
      return json({ error: "Polygon pool data is unavailable" }, 503);
    }
  }

  return json({ error: "Not found" }, 404);
}
