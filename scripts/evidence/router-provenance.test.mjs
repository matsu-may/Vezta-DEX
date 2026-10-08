import assert from "node:assert/strict";
import test from "node:test";
import { extractStructFields, inspectGitlink } from "./router-provenance.mjs";

test("reads the actual submodule revision rather than trusting a lockfile", () => {
  const sha = "a".repeat(40);
  assert.equal(inspectGitlink({ path: "lib/v4-periphery", sha, submodule_git_url: "https://github.com/Uniswap/v4-periphery" }), sha);
});

test("rejects wrong source repository, path and missing revision", () => {
  for (const value of [null, {}, { path: "lib/other", sha: "a".repeat(40), submodule_git_url: "https://github.com/Uniswap/v4-periphery" }, { path: "lib/v4-periphery", sha: "a".repeat(40), submodule_git_url: "https://example.com/other" }]) {
    assert.throws(() => inspectGitlink(value));
  }
});

test("distinguishes ABI field order and arrays, ignoring comments", () => {
  const source = "struct ExactInputParams { Currency currencyIn; /* price guard */ PathKey[] path; uint256[] minHopPriceX36; uint128 amountIn; uint128 amountOutMinimum; }";
  assert.deepEqual(extractStructFields(source, "ExactInputParams"), ["Currency currencyIn", "PathKey[] path", "uint256[] minHopPriceX36", "uint128 amountIn", "uint128 amountOutMinimum"]);
});

test("fails on missing, malformed or incomplete structures", () => {
  for (const source of ["", "struct ExactInputParams {}", "struct ExactInputParams { uint128 amountIn }", "struct ExactInputParams { uint128 amountIn; strange syntax!; }"]) {
    assert.throws(() => extractStructFields(source, "ExactInputParams"));
  }
});
