import { expect, it } from "vitest";
import { runTestnetCompiler, type CompilerSpawn } from "./testnet-compiler-runner";
const version = "0.7.6+commit.7338295f.Emscripten.clang";

it("passes the literal input to the fixed compiler worker and returns the locally produced output", () => {
  const input = '{"language":"Solidity","sources":{"quoted.sol":{"content":"contract X {}"}}}';
  const spawn: CompilerSpawn = (command, args, options) => {
    expect(command).toBe(process.execPath);
    expect(args.slice(0, 3)).toEqual(["--max-old-space-size=512", "--import", "tsx"]);
    expect(args[3]).toMatch(/\/src\/tooling\/compiler\/testnet-router-compiler-worker\.ts$/);
    expect(options.input).toBe(input);
    expect(options.timeout).toBe(60000); expect(options.maxBuffer).toBe(16000000);
    return { status: 0, stdout: JSON.stringify({ compilerVersion: version, output: '{"contracts":{}}' }) };
  };
  expect(runTestnetCompiler(input, spawn)).toEqual({ compilerVersion: version, output: '{"contracts":{}}' });
});

it("rejects process failure, timeout, malformed protocol and unexpected compiler version without leaking output", () => {
  for (const result of [
    { status: 1, stdout: "private compiler stderr" }, { status: null, stdout: "private compiler stderr" },
    { status: 0, error: new Error("private worker path"), stdout: "private data" },
    { status: 0, stdout: "not-json" }, { status: 0, stdout: "null" },
    { status: 0, stdout: JSON.stringify({ compilerVersion: version, output: 123 }) },
    { status: 0, stdout: JSON.stringify({ compilerVersion: "unexpected", output: "{}" }) },
  ]) expect(() => runTestnetCompiler("{}", () => result)).toThrow(/^REBUILD_(COMPILE_UNAVAILABLE|OUTPUT_INVALID|COMPILER_INVALID)$/);
});

it("rejects oversized input before launch and oversized compiler output before returning it", () => {
  let launched = false;
  expect(() => runTestnetCompiler("x".repeat(5000001), () => { launched = true; return { status: 1, stdout: "" }; })).toThrow("REBUILD_COMPILE_UNAVAILABLE");
  expect(launched).toBe(false);
  expect(() => runTestnetCompiler("{}", () => ({ status: 0, stdout: JSON.stringify({ compilerVersion: version,
    output: "x".repeat(12000001) }) }))).toThrow("REBUILD_OUTPUT_INVALID");
});
