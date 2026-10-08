import { expect, it, vi } from "vitest";
import { encodeAbiParameters, decodeFunctionData, parseAbi } from "viem";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TestnetSwapPreparer } from "./testnet-swap-preparation";
import { TestnetApprovalReader } from "./testnet-approval";
import { testnetActionFixture } from "../transaction/testnet-action.test-helper";
import { TESTNET_NOW, testnetIntent } from "./testnet-quote.test-helper";
import { routingSource } from "./testnet-routing.test-helper";
import { TestnetActionStore } from "../transaction/testnet-action";
it("rechecks the saved winning pool without comparing or switching it and preserves action restore", async () => {
  const base = await testnetActionFixture();
  const source = { ...base.source, ...routingSource() };
  const quotes = new TestnetSwapQuoteReader(() => source, undefined, () => TESTNET_NOW);
  const intent = { ...testnetIntent(), routing: "best-direct" as const };
  const quoted = await quotes.read(intent);
  // Make another pool much more attractive after quote. Prepare must not consider it.
  const oldQuote = source.quoteExactInput;
  source.quoteExactInput = vi.fn(async (...args: Parameters<typeof oldQuote>) => oldQuote(...args));
  source.simulateTestnetSwap = async () => encodeAbiParameters([{ type: "bytes[]" }], [
    [encodeAbiParameters([{ type: "uint256" }], [BigInt(quoted.quote.amountOut)])],
  ]);
  const request = { intent, quoteId: quoted.quoteId };
  expect(await new TestnetApprovalReader(() => source, quotes.store, () => TESTNET_NOW).read(request))
    .toMatchObject({ status: "allowance-ready" });
  const study = await new TestnetSwapPreparer(() => source, quotes.store, () => TESTNET_NOW).read(request);
  expect(study.status).toBe("unsigned-prepared");
  expect(source.quoteExactInput).toHaveBeenCalledTimes(1);
  expect(source.quoteExactInput).toHaveBeenCalledWith(intent.tokenIn, intent.tokenOut, 1000000n, 100, 123n);
  const tx = study.transaction!;
  const decoded = decodeFunctionData({ abi: parseAbi(["function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)"]), data: tx.data });
  expect(decoded.args[1][0]).toContain("0000000000000000000000000000000000000000000000000000000000000064");
  const store = new TestnetActionStore(() => TESTNET_NOW);
  const input = { ...base.input, intent: study.intent, quote: quoted.quote, transaction: tx };
  expect(() => store.issue(input, () => undefined)).not.toThrow();
  await expect(new TestnetSwapPreparer(() => source, quotes.store, () => TESTNET_NOW)
    .read({ ...request, intent: { ...testnetIntent(), poolFeeTier: 100 } })).rejects.toMatchObject({ code: "TESTNET_QUOTE_UNAVAILABLE" });
});
