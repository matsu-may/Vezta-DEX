import { createDexApi } from "../../../lib/api";
import { createTradingQuoteHandler } from "../../../lib/trading-quote-route";

export const dynamic = "force-dynamic";
export const POST = createTradingQuoteHandler((intent) => createDexApi().getTradingQuote(intent));
