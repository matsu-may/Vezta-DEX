import { compactSignatureToSignature, parseCompactSignature, parseSignature, recoverTypedDataAddress, type Hex } from "viem";
import type { Address, Permit2Data } from "../index";

const ORDER = BigInt("0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141");

/** Call only with the unchanged message already accepted by validatePermit2Data. No RPC/smart-account fallback. */
export async function verifyPermitSignature(data: Permit2Data, signature: unknown, owner: Address): Promise<Hex> {
  try {
    if (typeof signature !== "string" || !/^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/.test(signature)) throw new Error();
    if (signature.length === 132 && !["1b", "1c"].includes(signature.slice(-2).toLowerCase())) throw new Error();
    const parsed = signature.length === 130
      ? compactSignatureToSignature(parseCompactSignature(signature as Hex)) : parseSignature(signature as Hex);
    const r = BigInt(parsed.r);
    const s = BigInt(parsed.s);
    if (r === 0n || r >= ORDER || s === 0n || s > ORDER / 2n) throw new Error();
    const recovered = await recoverTypedDataAddress({
      domain: data.domain, types: data.types, primaryType: "PermitSingle",
      message: {
        details: { token: data.values.details.token, amount: BigInt(data.values.details.amount), expiration: Number(data.values.details.expiration), nonce: Number(data.values.details.nonce) },
        spender: data.values.spender, sigDeadline: BigInt(data.values.sigDeadline),
      },
      signature: parsed,
    });
    if (recovered.toLowerCase() !== owner.toLowerCase()) throw new Error();
    return signature as Hex;
  } catch {
    throw new Error("Invalid Permit2 signature");
  }
}
