import { describe, expect, it } from "vitest";
import { padHex, type Hex } from "viem";
import { classifyTestnetWalletCode, decodeMetaMaskExecution } from "./testnet-metamask";
import { metamaskExecutionFixture } from "./testnet-metamask.test-helper";

describe("MetaMask constrained single execution", () => {
  it("authenticates the signed one-use exact execution and identifies its owner", async () => {
    const f = await metamaskExecutionFixture();
    const result = await decodeMetaMaskExecution(f.input, f.owner, f.expected);
    expect(result.delegation.delegator).toBe(f.owner);
    expect(result.execution.toLowerCase()).toBe(f.execution.toLowerCase());
    expect(result.delegationHash).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("rejects another owner, invalid signature and a replayable or expanded grant", async () => {
    const f = await metamaskExecutionFixture();
    await expect(decodeMetaMaskExecution(f.input, "0x1111111111111111111111111111111111111111", f.expected)).rejects.toThrow();
    for (const d of [ { ...f.delegation, signature: `0x${"00".repeat(65)}` as Hex },
      { ...f.delegation, caveats: [f.delegation.caveats[1]] },
      { ...f.delegation, caveats: [{ ...f.delegation.caveats[0], terms: padHex("0x02", { size: 32 }) }, f.delegation.caveats[1]] },
      { ...f.delegation, caveats: [{ ...f.delegation.caveats[0], args: "0x00" as Hex }, f.delegation.caveats[1]] },
      { ...f.delegation, salt: 8n } ]) await expect(decodeMetaMaskExecution(f.encode(d), f.owner, f.expected)).rejects.toThrow();
  });
  it("rejects added executions, changed target/calldata, modes and noncanonical trailing data", async () => {
    const f = await metamaskExecutionFixture();
    for (const input of [f.encode(f.delegation, [f.execution, f.execution]),
      f.encode(f.delegation, [f.execution], [`0x01${"00".repeat(31)}`]),
      f.encode(f.delegation, [f.execution], [`0x0001${"00".repeat(30)}`]), `${f.input}00` as Hex])
      await expect(decodeMetaMaskExecution(input, f.owner, f.expected)).rejects.toThrow();
    await expect(decodeMetaMaskExecution(f.input, f.owner, { ...f.expected, data: "0x12345678" })).rejects.toThrow();
    await expect(decodeMetaMaskExecution(f.input, f.owner, { ...f.expected, value: "1" })).rejects.toThrow();
  });
  it("allows only empty code or the exact pinned MetaMask delegation indicator", () => {
    expect(classifyTestnetWalletCode("0x")).toBe("eoa");
    expect(classifyTestnetWalletCode("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b")).toBe("metamask-delegated");
    for (const code of ["0x00", "0xef01000000000000000000000000000000000000000001", "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b00", null]) expect(() => classifyTestnetWalletCode(code)).toThrow();
  });
});
