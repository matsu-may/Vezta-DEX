import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { compactSignatureToHex, parseSignature, signatureToCompactSignature, type Hex } from "viem";
import { POLYGON_PERMIT2, POLYGON_UNIVERSAL_ROUTER_212, TOKENS, type Permit2Data } from "@vezta-dex/core";
import { verifyPermitSignature } from "./permit-signature";

// Public deterministic TEST key only, never used by runtime code or network probes.
const account = privateKeyToAccount(`0x${"01".repeat(32)}`);
const data: Permit2Data = {
  domain: { name: "Permit2", chainId: 137, verifyingContract: POLYGON_PERMIT2 },
  types: {
    PermitSingle: [{ name: "details", type: "PermitDetails" }, { name: "spender", type: "address" }, { name: "sigDeadline", type: "uint256" }],
    PermitDetails: [{ name: "token", type: "address" }, { name: "amount", type: "uint160" }, { name: "expiration", type: "uint48" }, { name: "nonce", type: "uint48" }],
  },
  values: { details: { token: TOKENS.USDC.address, amount: "1000000", expiration: 1_900_000_000, nonce: 7 }, spender: POLYGON_UNIVERSAL_ROUTER_212, sigDeadline: "1899999000" },
};
const sign = () => account.signTypedData({ domain: data.domain, types: data.types, primaryType: "PermitSingle", message: { details: { token: data.values.details.token, amount: 1_000_000n, expiration: 1_900_000_000, nonce: 7 }, spender: data.values.spender, sigDeadline: 1_899_999_000n } });

describe("canonical EOA Permit2 signature", () => {
  it("verifies and returns unchanged 65-byte bytes without changing saved data", async () => {
    const original = structuredClone(data);
    const signature = await sign();
    expect(await verifyPermitSignature(data, signature, account.address)).toBe(signature);
    expect(data).toEqual(original);
  });

  it("verifies canonical EIP-2098 compact 64-byte signatures without expanding API bytes", async () => {
    const compact = compactSignatureToHex(signatureToCompactSignature(parseSignature(await sign())));
    expect(await verifyPermitSignature(data, compact, account.address)).toBe(compact);
  });

  it("rejects another account and changes to every signed binding", async () => {
    const signature = await sign();
    await expect(verifyPermitSignature(data, signature, "0x1111111111111111111111111111111111111111")).rejects.toThrow();
    const variants = [
      { ...data, domain: { ...data.domain, chainId: 1 } },
      { ...data, domain: { ...data.domain, verifyingContract: TOKENS.USDC.address } },
      { ...data, values: { ...data.values, spender: TOKENS.USDC.address } },
      { ...data, values: { ...data.values, sigDeadline: "1899999001" } },
      ...["token", "amount", "expiration", "nonce"].map((key) => ({ ...data, values: { ...data.values, details: { ...data.values.details, [key]: key === "token" ? TOKENS.WETH.address : "1" } } })),
    ];
    for (const changed of variants) await expect(verifyPermitSignature(changed as Permit2Data, signature, account.address)).rejects.toThrow();
  });

  it.each([undefined, "0x", "0x00", `0x${"00".repeat(64)}`, `0x${"00".repeat(65)}`, `0x${"gg".repeat(65)}`, `0x${"11".repeat(66)}`])("rejects malformed or zero signatures %s", async (signature) => {
    await expect(verifyPermitSignature(data, signature, account.address)).rejects.toThrow();
  });

  it.each(["00", "01", "1d", "ff"])("rejects 65-byte recovery byte %s incompatible with canonical Permit2", async (v) => {
    const signature = await sign();
    await expect(verifyPermitSignature(data, `${signature.slice(0, -2)}${v}` as Hex, account.address)).rejects.toThrow();
  });

  it("rejects noncanonical high-s bytes", async () => {
    const signature = await sign();
    const parsed = parseSignature(signature);
    const order = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");
    const highS = (order - BigInt(parsed.s)).toString(16).padStart(64, "0");
    const v = signature.endsWith("1b") ? "1c" : "1b";
    await expect(verifyPermitSignature(data, `0x${parsed.r.slice(2)}${highS}${v}`, account.address)).rejects.toThrow();
  });
});
