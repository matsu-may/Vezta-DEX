import { expect, it } from "vitest";
import { getAddress } from "viem";
import { TestnetQuoteStore } from "./testnet-quote-store";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";

it("binds IDs to the entire normalized intent, copies values and consumes synchronously once", async () => {
  const store = new TestnetQuoteStore(() => TESTNET_NOW);
  const { quote, quoteId } = await new TestnetSwapQuoteReader(() => testnetQuoteSource(), store, () => TESTNET_NOW).read(testnetIntent());
  quote.amountOut = "1";
  expect(store.read(quoteId, testnetIntent()).amountOut).not.toBe("1");
  expect(store.read(quoteId, { ...testnetIntent(), wallet: getAddress(testnetIntent().wallet) })).toBeDefined();
  for (const intent of [testnetIntent(true), { ...testnetIntent(), amountIn: "5000000" },
    { ...testnetIntent(), wallet: "0x1111111111111111111111111111111111111111" },
    { ...testnetIntent(), chainId: 137 }, { ...testnetIntent(), slippageBps: 100 }]) {
    expect(() => store.read(quoteId, intent)).toThrow();
  }
  const consumed = store.consume(quoteId, testnetIntent()); consumed.amountOut = "2";
  expect(() => store.consume(quoteId, testnetIntent())).toThrow();
  expect(() => store.read(quoteId, testnetIntent())).toThrow();
  expect(() => new TestnetQuoteStore().read(quoteId, testnetIntent())).toThrow();
});

it("expires at the original deadline, bounds capacity and rejects malformed quotes and IDs", async () => {
  let now = TESTNET_NOW;
  const store = new TestnetQuoteStore(() => now, 2);
  const reader = new TestnetSwapQuoteReader(() => testnetQuoteSource(), store, () => now);
  const a = await reader.read(testnetIntent()); const b = await reader.read(testnetIntent());
  const c = await reader.read(testnetIntent());
  expect(store.size).toBe(2);
  expect(() => store.read(a.quoteId, testnetIntent())).toThrow();
  expect(() => store.read("../secret", testnetIntent())).toThrow();
  expect(() => store.save({ ...c.quote, minimumAmountOut: "1" })).toThrow();
  now += 118000;
  expect(() => store.read(b.quoteId, testnetIntent())).toThrow();
  expect(store.size).toBe(0);
});

it("issues demo quotes for 120 seconds and never extends legacy quotes or reuses consumed IDs", async () => {
  let now = TESTNET_NOW;
  const store = new TestnetQuoteStore(() => now);
  const issued = await new TestnetSwapQuoteReader(() => testnetQuoteSource(), store, () => now).read(testnetIntent());
  const legacy = { ...issued.quote }; delete (legacy as Record<string, unknown>).quoteTtlSeconds;
  const legacyId = store.save(legacy);
  now += 35000;
  expect(() => store.read(legacyId, testnetIntent())).toThrow();
  expect(store.read(issued.quoteId, testnetIntent()).minimumAmountOut).toBe("396607597000000");
  now = TESTNET_NOW + 117999;
  store.consume(issued.quoteId, testnetIntent());
  expect(() => store.consume(issued.quoteId, testnetIntent())).toThrow();
});
