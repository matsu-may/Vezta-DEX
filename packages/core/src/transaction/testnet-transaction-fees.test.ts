import { expect, it } from "vitest";
import { sameTestnetFeeFields, testnetFeeFieldsSchema, testnetRpcFeeFields, validateTestnetFeeFields } from "../index";

const legacy = { gasPrice: "20000000" };
const dynamic = { ...legacy, feeModel: "eip1559" as const, maxFeePerGas: "20000000", maxPriorityFeePerGas: "1000000" };

it("accepts bounded historical and coupled EIP-1559 fee budgets", () => {
  expect(() => validateTestnetFeeFields(legacy)).not.toThrow();
  expect(() => validateTestnetFeeFields(dynamic)).not.toThrow();
  expect(testnetFeeFieldsSchema.parse({ ...dynamic, nonce: "7" })).toEqual({ ...dynamic, nonce: "7" });
});

it("rejects partial, mixed, excessive and conflicting fee descriptors", () => {
  for (const bad of [
    { ...legacy, feeModel: "eip1559" }, { ...legacy, maxFeePerGas: "20000000" },
    { ...dynamic, maxPriorityFeePerGas: undefined }, { ...dynamic, feeModel: "legacy" },
    { ...dynamic, gasPrice: "20000001" }, { ...dynamic, maxPriorityFeePerGas: "20000001" },
    { ...dynamic, maxPriorityFeePerGas: "0" }, { gasPrice: "2000000000001" },
    { gasPrice: "0" }, { ...dynamic, maxFeePerGas: "020000000" },
  ]) expect(() => validateTestnetFeeFields(bad)).toThrow();
});

it("emits explicit and mutually exclusive RPC transaction fee models", () => {
  expect(testnetRpcFeeFields(legacy)).toEqual({ type: "0x0", gasPrice: "0x1312d00" });
  expect(testnetRpcFeeFields(dynamic)).toEqual({ type: "0x2", maxFeePerGas: "0x1312d00", maxPriorityFeePerGas: "0xf4240" });
  expect(() => testnetRpcFeeFields({ ...dynamic, gasPrice: "1" })).toThrow();
});

it("binds every original fee field and rejects invalid comparisons", () => {
  expect(sameTestnetFeeFields(dynamic, { ...dynamic, nonce: "7" })).toBe(true);
  expect(sameTestnetFeeFields(dynamic, legacy)).toBe(false);
  expect(sameTestnetFeeFields(dynamic, { ...dynamic, maxPriorityFeePerGas: "2" })).toBe(false);
  expect(sameTestnetFeeFields(dynamic, { ...dynamic, maxFeePerGas: "1" })).toBe(false);
  expect(sameTestnetFeeFields(dynamic, { ...dynamic, maxPriorityFeePerGas: "invalid" })).toBe(false);
});
