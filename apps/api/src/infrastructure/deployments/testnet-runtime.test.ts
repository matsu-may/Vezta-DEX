import { expect, it } from "vitest";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
import { runtimeFixtureCodes } from "./testnet-runtime.test-helper";

it("accepts all five independently rebuilt runtimes only on Base Sepolia, regardless of order/case", () => {
  const codes = runtimeFixtureCodes(); const before = structuredClone(codes);
  expect(() => verifyTestnetRuntimeCodes(84532, codes)).not.toThrow();
  expect(() => verifyTestnetRuntimeCodes(84532, codes.reverse().map(c => ({ ...c, address: c.address.toUpperCase(),
    code: "0x" + c.code.slice(2).toUpperCase() })))).not.toThrow();
  expect(runtimeFixtureCodes()).toEqual(before);
  expect(() => verifyTestnetRuntimeCodes(8453, before)).toThrow("TESTNET_RUNTIME_MISMATCH");
});

it.each(["router", "quoter", "factory", "pool", "manager"])("rejects any changed %s runtime even with correct address/length", role => {
  const codes = runtimeFixtureCodes(); const row = codes.find(c => c.role === role)!;
  row.code = `0x${row.code.slice(2, -1)}${row.code.endsWith("0") ? "1" : "0"}`;
  expect(() => verifyTestnetRuntimeCodes(84532, codes)).toThrow("TESTNET_RUNTIME_MISMATCH");
});

it("rejects incomplete, duplicate, swapped-address, malformed and oversized code sets", () => {
  const missing = runtimeFixtureCodes().slice(1); const duplicated = runtimeFixtureCodes(); duplicated[1] = duplicated[0];
  const swapped = runtimeFixtureCodes(); [swapped[0].address, swapped[1].address] = [swapped[1].address, swapped[0].address];
  for (const codes of [undefined, {}, missing, duplicated, swapped])
    expect(() => verifyTestnetRuntimeCodes(84532, codes)).toThrow("TESTNET_RUNTIME_MISMATCH");
  for (const code of ["0x", "0x6", "0xzz", "6000", "0x" + "00".repeat(70000), null]) {
    const codes = runtimeFixtureCodes(); Object.assign(codes[0], { code });
    expect(() => verifyTestnetRuntimeCodes(84532, codes)).toThrow("TESTNET_RUNTIME_MISMATCH");
  }
});
