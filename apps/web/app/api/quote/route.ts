import { createDexApi } from "../../../features/legacy/polygon/lib/api";
import { createQuoteHandler } from "../../../features/legacy/polygon/lib/quote-route";

export const dynamic = "force-dynamic";
export const GET = createQuoteHandler((intent) => createDexApi().getQuote(intent));
