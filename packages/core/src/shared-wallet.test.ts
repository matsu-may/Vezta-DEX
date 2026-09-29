import { expect, it } from "vitest";
import { validateSwapCalldata, verifyPermitSignature, readTransactionReceipt } from "./index";
import { validateSwapCalldata as apiDecoder } from "../../../apps/api/src/swap-calldata";
import { verifyPermitSignature as apiSignature } from "../../../apps/api/src/permit-signature";
import { readTransactionReceipt as webReader } from "../../../apps/web/lib/transaction-receipt";
it("uses the same browser-safe security policy through compatibility imports", () => {
  expect(apiDecoder).toBe(validateSwapCalldata);
  expect(apiSignature).toBe(verifyPermitSignature);
  expect(webReader).toBe(readTransactionReceipt);
});
