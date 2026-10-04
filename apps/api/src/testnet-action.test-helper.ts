import { encodeAbiParameters } from "viem";
import { TestnetApprovalReader } from "./testnet-approval";
import { TestnetSwapPreparer } from "./testnet-swap-preparation";
import { TestnetSwapQuoteReader } from "./testnet-swap-quote";
import { TESTNET_NOW, testnetIntent, testnetQuoteSource } from "./testnet-quote.test-helper";
import type { BaseSepoliaApprovalSource } from "./testnet-approval";
import type { BaseSepoliaPreparationSource } from "./testnet-swap-preparation";

export async function testnetActionFixture(kind: "swap" | "approve" | "reset" = "swap", reverse = false) {
  let now = TESTNET_NOW;
  const intent = testnetIntent(reverse);
  const source: BaseSepoliaApprovalSource & BaseSepoliaPreparationSource = { ...testnetQuoteSource(),
    async getTokenBalance() { return 10n ** 18n; }, async getNativeBalance() { return 10n ** 18n; },
    async getTokenAllowance() { return kind === "swap" ? BigInt(intent.amountIn) : kind === "reset" ? 1n : 0n; },
    async getAccountNonce() { return 7n; }, async getPendingNonce() { return 7n; },
    async simulateApproval() { return `0x${"0".repeat(63)}1`; }, async estimateApprovalGas() { return 50001n; },
    async simulateTestnetSwap() {
      const q = await source.quoteExactInput(intent.tokenIn, intent.tokenOut, BigInt(intent.amountIn), 3000, 123n);
      return encodeAbiParameters([{ type: "bytes[]" }], [[encodeAbiParameters([{ type: "uint256" }], [q.amountOut])]]);
    },
    async estimateTestnetSwapGas() { return 150001n; }, async getGasPrice() { return 10000000n; },
    async getAdditionalFees() { return { l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 0n, fork: "jovian" }; },
  };
  const clock = () => now;
  const quotes = new TestnetSwapQuoteReader(() => source, undefined, clock);
  const quoted = await quotes.read(intent);
  const approvals = new TestnetApprovalReader(() => source, quotes.store, clock);
  const preparer = new TestnetSwapPreparer(() => source, quotes.store, clock);
  const request = { intent, quoteId: quoted.quoteId };
  const study = await (kind === "swap" ? preparer : approvals).read(request);
  if (!study.transaction) throw new Error("funded fixture");
  const input = { kind, quote: quoted.quote, intent: study.intent, transaction: study.transaction,
    observedAt: study.observedAt, blockNumber: study.blockNumber, blockHash: study.blockHash, currentAllowance: study.currentAllowance };
  return { quotes, quoted, request, input, source, approvals, preparer, clock, setNow: (value: number) => { now = value; } };
}
