import { expect, it } from "vitest";
import { HttpRequestError, TimeoutError, ContractFunctionRevertedError } from "viem";
import { TestnetRpcDiagnostics, classifyTestnetRpcFailure } from "./testnet-rpc-diagnostics";
import { testnetQuoteSource, testnetIntent, TESTNET_NOW } from "../../modules/swap/testnet-quote.test-helper";
import { TestnetSwapQuoteReader } from "../../modules/swap/testnet-swap-quote";
import { runTestnetWalletQuoteProbe } from "../../tooling/probes/testnet-wallet-quote-probe";

const privateUrl = "https://rpc.example.invalid/private-key";
it("classifies nested viem failures without copying request, URL, message or revert bytes", () => {
  const rate = new HttpRequestError({ url: privateUrl, status: 429, details: "private response", body: { signature: "secret" } });
  const timeout = new TimeoutError({ url: privateUrl, body: { wallet: "private" } });
  const revert = new ContractFunctionRevertedError({ abi: [], functionName: "private-function", message: "private revert" });
  const cases = [
    [new Error("outer private", { cause: rate }), { kind: "rate-limited", httpStatus: 429 }],
    [new Error("outer", { cause: timeout }), { kind: "timeout" }],
    [new Error("outer", { cause: revert }), { kind: "contract-revert" }],
    [new HttpRequestError({ url: privateUrl, status: 503 }), { kind: "http-error", httpStatus: 503 }],
    [new HttpRequestError({ url: privateUrl, cause: new TypeError("private network detail") }), { kind: "transport" }],
    [new DOMException("private cancellation", "AbortError"), { kind: "aborted" }],
    [new HttpRequestError({ url: privateUrl, cause: new DOMException("private cancellation", "AbortError") }), { kind: "aborted" }],
    [{ name: "private error", code: "private", status: "private" }, { kind: "unclassified" }],
  ] as const;
  for (const [error, expected] of cases) {
    expect(classifyTestnetRpcFailure(error)).toEqual(expected);
    expect(JSON.stringify(classifyTestnetRpcFailure(error))).not.toContain("private");
  }
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  expect(classifyTestnetRpcFailure(cycle)).toEqual({ kind: "unclassified" });
  expect(classifyTestnetRpcFailure({ get cause() { throw new Error("private getter"); } })).toEqual({ kind: "unclassified" });
  let reads = 0;
  const changingStatus = { name: "HttpRequestError", get status() { return reads++ < 4 ? 503 : "private"; } };
  expect(classifyTestnetRpcFailure(changingStatus)).toEqual({ kind: "http-error", httpStatus: 503 });
});

it("preserves the original RPC result/error and exposes only bounded method counters", async () => {
  let time = 0;
  const diagnostics = new TestnetRpcDiagnostics(() => time);
  const original = testnetQuoteSource();
  const source = diagnostics.wrap(original);
  const quote = await source.quoteExactInput(testnetIntent().tokenIn, testnetIntent().tokenOut, 1000000n, 3000, 123n);
  expect(quote.amountOut).toBe(398600600000000n);
  const failure = new HttpRequestError({ url: privateUrl, status: 429 });
  original.getCode = async () => { time += 15; throw failure; };
  await expect(source.getCode(testnetIntent().tokenIn, 123n)).rejects.toBe(failure);
  const snapshot = diagnostics.snapshot();
  expect(snapshot.firstFailure).toEqual({ method: "getCode", kind: "rate-limited", httpStatus: 429 });
  expect(snapshot.methods).toContainEqual({ method: "getCode", calls: 1, failed: 1, totalMs: 15, maxMs: 15 });
  expect(JSON.stringify(snapshot)).not.toContain(privateUrl);
  expect(JSON.stringify(snapshot)).not.toContain(testnetIntent().wallet);
  snapshot.methods[0].calls = 999;
  expect(diagnostics.snapshot().methods[0].calls).toBe(1);
});

it("pinpoints a reverse quote failure while leaving the successful direction and gates intact", async () => {
  let diagnostics = new TestnetRpcDiagnostics();
  const create = () => {
    diagnostics = new TestnetRpcDiagnostics();
    const source = testnetQuoteSource(); const read = source.quoteExactInput;
    source.quoteExactInput = async (...args) => {
      if (args[0].toLowerCase() === testnetIntent(true).tokenIn.toLowerCase()) {
        throw new TimeoutError({ url: privateUrl, body: { apiKey: "private" } });
      }
      return read(...args);
    };
    return new TestnetSwapQuoteReader(() => diagnostics.wrap(source), undefined, () => TESTNET_NOW);
  };
  const rows = await runTestnetWalletQuoteProbe(testnetIntent().wallet, create, () => TESTNET_NOW,
    () => diagnostics.snapshot());
  expect(rows[0]).toMatchObject({ status: "testnet-wallet-quote-read-only", checks: { executionEnabled: false } });
  expect(rows[1]).toMatchObject({ status: "testnet-wallet-quote-unavailable", direction: "WETH_TO_USDC",
    code: "TESTNET_RPC_UNAVAILABLE", rpcDiagnostics: { firstFailure: { method: "quoteExactInput", kind: "timeout" } } });
  expect(JSON.stringify(rows)).not.toContain("private");
});
