import { testnetQuoteExpiresAt, testnetSwapIntentFromQuote } from "@vezta-dex/core";
import { randomBytes } from "node:crypto";
import { parseTestnetSwapIntent, parseTestnetSwapQuote,
  type TestnetSwapIntent, type TestnetSwapQuote } from "@vezta-dex/core";

function binding(value: unknown): string {
  const i: TestnetSwapIntent = parseTestnetSwapIntent(value);
  return JSON.stringify([i.chainId, i.wallet, i.tokenIn, i.tokenOut, i.amountIn, i.slippageBps, i.routing ?? null, i.poolFeeTier ?? null]);
}

// Single-process demo only: restart invalidates all IDs. Consumption is synchronous and once-only.
export class TestnetQuoteStore {
  private readonly entries = new Map<string, { quote: TestnetSwapQuote; binding: string; expires: number }>();
  constructor(private readonly now = Date.now, private readonly capacity = 128) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 128) throw new Error("Invalid quote capacity");
  }
  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
  }
  get size(): number { this.prune(); return this.entries.size; }
  save(value: unknown): string {
    const quote = parseTestnetSwapQuote(value, this.now());
    this.prune();
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const id = randomBytes(24).toString("hex");
    const intent = testnetSwapIntentFromQuote(quote);
    this.entries.set(id, { quote, binding: binding(intent),
      expires: Date.parse(testnetQuoteExpiresAt(quote)) });
    return id;
  }
  read(id: string, value: unknown): TestnetSwapQuote {
    this.prune();
    const entry = /^[a-f0-9]{48}$/.test(id) ? this.entries.get(id) : undefined;
    if (!entry || entry.binding !== binding(value)) throw new Error("Testnet quote unavailable");
    return parseTestnetSwapQuote(entry.quote, this.now());
  }
  consume(id: string, intent: unknown): TestnetSwapQuote {
    const quote = this.read(id, intent);
    this.entries.delete(id);
    return quote;
  }
}
