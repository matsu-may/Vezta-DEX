import { expect, it } from "vitest";
import { TESTNET_NOW, testnetQuoteSource } from "./testnet-quote.test-helper";

it("reports a canonical no-funds fee model study while keeping reference gas separate from execution evidence", async () => {
  const { runTestnetFeesProbe } = await import("./testnet-fees-probe");
  const source = { ...testnetQuoteSource(), async getGasPrice() { return 10000000n; },
    async getAdditionalFees() { return { l1FeeUpperBound: 3000000000n, operatorFeeUpperBound: 0n, fork: "jovian" as const }; } };
  expect(await runTestnetFeesProbe(() => source, () => TESTNET_NOW)).toMatchObject({ status: "testnet-fee-model-read-only",
    blockNumber: "123", referenceOnly: true, referenceGasLimit: "60000", model: "jovian",
    l1FeeUpperBound: "3000000000", operatorFeeUpperBound: "0", totalFeeBudget: "1206000000000", executionEnabled: false });
  source.getBlockHash = async () => `0x${"cd".repeat(32)}`;
  expect(await runTestnetFeesProbe(() => source, () => TESTNET_NOW)).toMatchObject({ status: "testnet-fee-model-unavailable",
    code: "TESTNET_BLOCK_CHANGED" });
  expect(await runTestnetFeesProbe(() => { throw new Error("private-provider-url"); }, () => TESTNET_NOW))
    .toEqual({ status: "testnet-fee-model-unavailable", code: "TESTNET_RPC_UNAVAILABLE" });
});
