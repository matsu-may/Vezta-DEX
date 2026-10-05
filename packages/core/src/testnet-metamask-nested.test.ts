import { expect, it } from "vitest";
import { padHex, toHex, decodeFunctionData, encodeFunctionData, parseAbi, type Hex } from "viem";
import { decodeMetaMaskExecution } from "./testnet-metamask";
import { metamaskExecutionFixture, metamaskFixtureAccount, metamaskFixtureTypes, nestedSwapFixture } from "./testnet-metamask.test-helper";
import { privateKeyToAccount } from "viem/accounts";

it("authenticates the exact nested reviewed fee for every newly qualified direct pool", async () => {
  const abi = parseAbi([
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
    "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
  ]);
  const base = await nestedSwapFixture();
  const outer = decodeFunctionData({ abi, data: base.expected.data });
  if (outer.functionName !== "multicall") throw new Error();
  const inner = decodeFunctionData({ abi, data: outer.args[1][0] });
  if (inner.functionName !== "exactInputSingle") throw new Error();
  for (const fee of [100, 500, 10000]) {
    const data = encodeFunctionData({ abi, functionName: "multicall", args: [outer.args[0], [
      encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{ ...inner.args[0], fee }] }),
    ]] });
    const expected = { ...base.expected, data }; const f = await nestedSwapFixture(false, expected);
    expect((await decodeMetaMaskExecution(f.input, f.owner, expected)).inner).toBeDefined();
    await expect(decodeMetaMaskExecution(f.input, f.owner, base.expected)).rejects.toThrow();
  }
});

it.each([false, true])("authenticates both owner signatures and the exact inner swap (reverse=%s)", async reverse => {
  const f = await nestedSwapFixture(reverse);
  const result = await decodeMetaMaskExecution(f.input, f.owner, f.expected);
  expect(result.inner?.execution.toLowerCase()).toBe(f.innerExecution.toLowerCase());
  expect(result).toMatchObject({ inner: { delegation: { delegate: f.owner, delegator: f.owner } } });
});

it("rejects even signed unusable guard amounts and the wrong inner signing domain or account", async () => {
  const f = await nestedSwapFixture();
  for (const [index, amount] of [[0, 1n], [1, 0n], [1, 6318049916069548n], [2, 999999n]] as const) {
    const d = structuredClone(f.inner); const c = d.caveats[index]!;
    c.terms = `${c.terms.slice(0, -64)}${padHex(toHex(amount), { size: 32 }).slice(2)}` as Hex;
    await expect(decodeMetaMaskExecution((await f.wrap(await f.signInner(d))).input, f.owner, f.expected)).rejects.toThrow();
  }
  const other = privateKeyToAccount(`0x${"22".repeat(32)}`);
  const wrongSigner = await other.signTypedData({ domain: f.domain, types: metamaskFixtureTypes, primaryType: "Delegation", message: f.inner });
  const wrongDomain = await metamaskFixtureAccount.signTypedData({ domain: { ...f.domain, chainId: 1 }, types: metamaskFixtureTypes, primaryType: "Delegation", message: f.inner });
  for (const signature of [wrongSigner, wrongDomain])
    await expect(decodeMetaMaskExecution((await f.wrap({ ...f.inner, signature })).input, f.owner, f.expected)).rejects.toThrow();
});

it("rejects signed changes to balance owners, currencies, guard directions, terms and arguments", async () => {
  const f = await nestedSwapFixture();
  for (const index of [0, 1, 2]) {
    for (const change of ["enforcer", "args", "terms", "owner", "direction"]) {
      const d = structuredClone(f.inner); const c = d.caveats[index]!;
      if (change === "enforcer") c.enforcer = "0x1111111111111111111111111111111111111111";
      if (change === "args") c.args = "0x00";
      if (change === "terms") c.terms = `${c.terms}00`;
      if (change === "owner") c.terms = c.terms.replace(f.owner.slice(2), "22".repeat(20)) as Hex;
      if (change === "direction") c.terms = `0x02${c.terms.slice(4)}`;
      const changed = await f.wrap(await f.signInner(d));
      await expect(decodeMetaMaskExecution(changed.input, f.owner, f.expected)).rejects.toThrow();
    }
  }
  const duplicate = structuredClone(f.inner); duplicate.caveats[2] = { ...duplicate.caveats[1]! };
  await expect(decodeMetaMaskExecution((await f.wrap(await f.signInner(duplicate))).input, f.owner, f.expected)).rejects.toThrow();
});

it("rejects wrong inner signer/delegate, additional layers, batches, modes and changed reviewed calldata", async () => {
  const f = await nestedSwapFixture();
  const wrongDelegate = await f.signInner({ ...f.inner, delegate: "0x0000000000000000000000000000000000000a11" });
  for (const input of [
    (await f.wrap({ ...f.inner, signature: `0x${"00".repeat(65)}` })).input,
    (await f.wrap(wrongDelegate)).input,
    (await f.wrap(f.inner, [f.innerExecution, f.innerExecution])).input,
    (await f.wrap(f.inner, [f.innerExecution], [padHex("0x01", { size: 32 })])).input,
    (await metamaskExecutionFixture({ to: f.domain.verifyingContract, value: "0", data: f.input })).input,
  ]) await expect(decodeMetaMaskExecution(input, f.owner, f.expected)).rejects.toThrow();
  await expect(decodeMetaMaskExecution(f.input, f.owner, { ...f.expected, data: "0x12345678" })).rejects.toThrow();
  await expect(decodeMetaMaskExecution(f.input, f.owner, { ...f.expected, to: "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2" })).rejects.toThrow();
});
