import { expect, it, vi } from "vitest";
import { testnetActionFixture } from "../transaction/testnet-action.test-helper";
import { testnetLpWalletFixture } from "../liquidity/testnet-lp-wallet.test-helper";

it.each(["approve", "reset", "swap"] as const)("propagates the pinned type-2 fee plan through %s", async kind => {
  const f = await testnetActionFixture(kind);
  f.source.getEip1559Fees = async block => { expect(block).toBe(123n); return { baseFeePerGas: 5000000n, maxPriorityFeePerGas: 1000000n }; };
  const additional = vi.spyOn(f.source, "getAdditionalFees");
  const study = await (kind === "swap" ? f.preparer : f.approvals).read(f.request);
  const fee = { feeModel: "eip1559", gasPrice: "11000000", maxFeePerGas: "11000000", maxPriorityFeePerGas: "1000000" };
  expect(study.transaction).toMatchObject(fee); expect(study.gas).toMatchObject(fee);
  expect(additional.mock.calls[0][0]).toMatchObject(fee);
});
it("keeps LP original caps at recheck, refusing insufficient current base fee and missing fee source", async () => {
  const f = await testnetLpWalletFixture("approve");
  f.source.getEip1559Fees = async () => ({ baseFeePerGas: 5000000n, maxPriorityFeePerGas: 1000000n });
  f.source.getBlockBaseFee = async () => 6000000n;
  const study = await f.api.study({ intent: f.intent });
  expect(study.transaction).toMatchObject({ feeModel: "eip1559", maxFeePerGas: "11000000", maxPriorityFeePerGas: "1000000" });
  expect(await f.api.recheck({ contextId: study.contextId })).toEqual(study);
  f.source.getBlockBaseFee = async () => 11000000n;
  await expect(f.api.recheck({ contextId: study.contextId })).rejects.toThrow("TESTNET_LP_FEES_CHANGED");
  delete f.source.getBlockBaseFee;
  await expect(f.api.recheck({ contextId: study.contextId })).rejects.toThrow();
});
