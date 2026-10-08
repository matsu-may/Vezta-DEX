import { createTestnetSwapDomain, type TestnetChainId, type TestnetChainSwapIntent, type TestnetChainSwapQuote } from "@vezta-dex/core";
import { randomBytes } from "node:crypto";

// Single-process demo only: restart invalidates all IDs. Consumption is synchronous and once-only.
export class TestnetQuoteStore<I extends TestnetChainId = 84532> {
  private readonly domain;
  private binding(value: unknown): string {
    const i: TestnetChainSwapIntent<I> = this.domain.parseTestnetSwapIntent(value);
    return JSON.stringify([i.chainId, i.wallet, i.tokenIn, i.tokenOut, i.amountIn, i.slippageBps, i.routing ?? null, i.poolFeeTier ?? null]);
  }
  private readonly entries = new Map<string, { quote: TestnetChainSwapQuote<I>; binding: string; expires: number }>();
  constructor(private readonly now = Date.now, private readonly capacity = 128, readonly chainId: I = 84532 as I) {
    this.domain = createTestnetSwapDomain(chainId);
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 128) throw new Error("Invalid quote capacity");
  }
  private prune(): void {
    const now = this.now();
    for (const [id, entry] of this.entries) if (entry.expires <= now) this.entries.delete(id);
  }
  get size(): number { this.prune(); return this.entries.size; }
  save(value: unknown): string {
    const quote = this.domain.parseTestnetSwapQuote(value, this.now());
    this.prune();
    if (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const id = randomBytes(24).toString("hex");
    const intent = this.domain.testnetSwapIntentFromQuote(quote);
    this.entries.set(id, { quote, binding: this.binding(intent),
      expires: Date.parse(this.domain.testnetQuoteExpiresAt(quote)) });
    return id;
  }
  read(id: string, value: unknown): TestnetChainSwapQuote<I> {
    this.prune();
    const entry = /^[a-f0-9]{48}$/.test(id) ? this.entries.get(id) : undefined;
    if (!entry || entry.binding !== this.binding(value)) throw new Error("Testnet quote unavailable");
    return this.domain.parseTestnetSwapQuote(entry.quote, this.now());
  }
  consume(id: string, intent: unknown): TestnetChainSwapQuote<I> {
    const quote = this.read(id, intent);
    this.entries.delete(id);
    return quote;
  }
}
