import { createDexApi } from "../../../lib/api";
import { createQuoteHandler } from "../../../lib/quote-route";

export const dynamic = "force-dynamic";
export const GET = createQuoteHandler((intent) => createDexApi().getQuote(intent));
