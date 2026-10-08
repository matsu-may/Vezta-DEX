import { createDexApi } from "../../../features/legacy/polygon/lib/api";
import { createTradingQuoteHandler } from "../../../features/legacy/polygon/lib/trading-quote-route";

export const dynamic = "force-dynamic";
export const POST = createTradingQuoteHandler((intent) => createDexApi().getTradingQuote(intent));
