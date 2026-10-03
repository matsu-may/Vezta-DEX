import { expect, it } from "vitest";
import { matchesTestnetFeeEnvelope, matchesTestnetReceiptGasPrice } from "./testnet-transaction-envelope";

const reviewed = { gasPrice: "20000000", feeModel: "eip1559" as const, maxFeePerGas: "20000000", maxPriorityFeePerGas: "1000000" };
const observed = { type: "eip1559", maxFeePerGas: 20000000n, maxPriorityFeePerGas: 1000000n, accessList: [] };
it("binds the original type-2 caps and rejects wrapped, altered or nonempty-access-list envelopes", () => {
  expect(matchesTestnetFeeEnvelope(observed, reviewed)).toBe(true);
  for (const change of [{ type: "eip7702" }, { type: "legacy", gasPrice: 20000000n },
    { maxFeePerGas: 20000001n }, { maxPriorityFeePerGas: 1000001n }, { accessList: [{}] }, { authorizationList: [{}] }]) {
    expect(matchesTestnetFeeEnvelope({ ...observed, ...change }, reviewed)).toBe(false);
  }
  expect(matchesTestnetFeeEnvelope(observed, { gasPrice: "20000000" })).toBe(false);
  expect(matchesTestnetFeeEnvelope({ type: "legacy", gasPrice: 20000000n }, { gasPrice: "20000000" })).toBe(true);
  expect(matchesTestnetFeeEnvelope({ type: "legacy", gasPrice: 20000001n }, { gasPrice: "20000000" })).toBe(false);
});
it("verifies canonical effective fees rather than treating the cap as the charged price", () => {
  expect(matchesTestnetReceiptGasPrice(6000000n, reviewed, 5000000n)).toBe(true);
  expect(matchesTestnetReceiptGasPrice(20000000n, reviewed, 19500000n)).toBe(true);
  for (const [effective, base] of [[20000000n, 5000000n], [0n, 0n], [20000000n, 20000001n], [6000000n, -1n]])
    expect(matchesTestnetReceiptGasPrice(effective, reviewed, base)).toBe(false);
  expect(matchesTestnetReceiptGasPrice(6000000n, reviewed)).toBe(false);
  expect(matchesTestnetReceiptGasPrice(20000000n, { gasPrice: "20000000" })).toBe(true);
});
