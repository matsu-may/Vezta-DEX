import { expect, it } from "vitest";
import { validateSwapCalldata, verifyPermitSignature, readTransactionReceipt } from "../index";
import { validateSwapCalldata as apiDecoder } from "../../../../apps/api/src/modules/swap/swap-calldata";
import { verifyPermitSignature as apiSignature } from "../../../../apps/api/src/modules/swap/permit-signature";
import { readTransactionReceipt as webReader } from "../../../../apps/web/features/legacy/polygon/lib/transaction-receipt";
it("uses the same browser-safe security policy through compatibility imports", () => {
  expect(apiDecoder).toBe(validateSwapCalldata);
  expect(apiSignature).toBe(verifyPermitSignature);
  expect(webReader).toBe(readTransactionReceipt);
});
