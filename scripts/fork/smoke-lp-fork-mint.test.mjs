import test from "node:test";
import assert from "node:assert/strict";
import { assertLocalForkOrigin } from "./smoke-lp-fork-mint.mjs";

test("local fork executor rejects any remote or ambiguous RPC origin before a transaction", () => {
  assert.doesNotThrow(() => assertLocalForkOrigin("http://127.0.0.1:40555"));
  for (const origin of ["https://polygon.example", "http://0.0.0.0:8545", "http://localhost:8545",
    "http://127.0.0.1:8545/path", "http://user:pass@127.0.0.1:8545", "http://127.0.0.1:8545/#x"]) {
    assert.throws(() => assertLocalForkOrigin(origin));
  }
});
