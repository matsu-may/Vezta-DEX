// Deterministic PUBLIC test account. Never use this fixture key for funded wallets.
import { privateKeyToAccount } from "viem/accounts";
import { concatHex, decodeFunctionData, encodeAbiParameters, encodeFunctionData, padHex, parseAbi, toHex, type Hex } from "viem";

export const metamaskFixtureAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
export const metamaskFixtureAbi = parseAbi([
  "struct Caveat { address enforcer; bytes terms; bytes args; }",
  "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
  "function redeemDelegations(bytes[] permissionContexts, bytes32[] modes, bytes[] executionCallDatas)",
  "function decodeDelegation(Delegation[] delegations)",
]);
export const metamaskFixtureTypes = {
  Delegation: [{ name: "delegate", type: "address" }, { name: "delegator", type: "address" }, { name: "authority", type: "bytes32" }, { name: "caveats", type: "Caveat[]" }, { name: "salt", type: "uint256" }],
  Caveat: [{ name: "enforcer", type: "address" }, { name: "terms", type: "bytes" }],
} as const;
export async function metamaskExecutionFixture(expectedInput?: { to: Hex; value: string; data: Hex }) {
  const owner = metamaskFixtureAccount.address;
  const expected = expectedInput ?? { to: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Hex, value: "0", data: encodeFunctionData({ abi: parseAbi(["function approve(address spender,uint256 amount) returns(bool)"]), functionName: "approve", args: ["0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4", 1000000n] }) };
  const execution = concatHex([expected.to, padHex(toHex(0n), { size: 32 }), expected.data]);
  const domain = { name: "DelegationManager", version: "1", chainId: 84532, verifyingContract: "0xdb9b1e94b5b69df7e401ddbede43491141047db3" as Hex };
  const delegation = { delegate: "0x0000000000000000000000000000000000000a11" as Hex, delegator: owner,
    authority: `0x${"ff".repeat(32)}` as Hex, caveats: [
      { enforcer: "0x04658B29F6b82ed55274221a06Fc97D318E25416" as Hex, terms: padHex(toHex(1n), { size: 32 }), args: "0x" as Hex },
      { enforcer: "0x146713078D39eCC1F5338309c28405ccf85Abfbb" as Hex, terms: execution, args: "0x" as Hex },
    ], salt: 7n, signature: "0x" as Hex };
  delegation.signature = await metamaskFixtureAccount.signTypedData({ domain, types: metamaskFixtureTypes, primaryType: "Delegation", message: delegation });
  const params = metamaskFixtureAbi.find(a => a.type === "function" && a.name === "decodeDelegation")!.inputs;
  const encode = (d = delegation, executions = [execution], modes: Hex[] = [padHex("0x", { size: 32 })]) => encodeFunctionData({ abi: metamaskFixtureAbi, functionName: "redeemDelegations", args: [[encodeAbiParameters(params, [[d]])], modes, executions] });
  return { owner, expected, execution, delegation, domain, encode, input: encode() };
}

// Independent, signed two-level wallet fixture. Balance guardrails deliberately
// permit more than the reviewed router call; that exact call remains authoritative.
export async function nestedSwapFixture(reverse = false, expectedInput?: { to: Hex; value: string; data: Hex }) {
  const owner = metamaskFixtureAccount.address;
  const tokenIn = reverse ? "0x4200000000000000000000000000000000000006" : "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const tokenOut = reverse ? "0x036CbD53842c5426634e7929541eC2318f3dCF7e" : "0x4200000000000000000000000000000000000006";
  let amountIn = reverse ? 100000000000000n : 1000000n;
  let minimum = reverse ? 16000n : 6318049916069547n;
  const abi = parseAbi([
    "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
    "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
  ]);
  const swap = encodeFunctionData({ abi, functionName: "exactInputSingle", args: [{ tokenIn, tokenOut, fee: 3000,
    recipient: owner, amountIn, amountOutMinimum: minimum, sqrtPriceLimitX96: 0n }] });
  const expected = expectedInput ?? { to: "0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4" as Hex, value: "0",
    data: encodeFunctionData({ abi, functionName: "multicall", args: [1790800020n, [swap]] }) };
  if (expectedInput) {
    const outer = decodeFunctionData({ abi, data: expectedInput.data });
    if (outer.functionName !== "multicall") throw new Error("Fixture swap required");
    const inner = decodeFunctionData({ abi, data: outer.args[1][0] });
    if (inner.functionName !== "exactInputSingle") throw new Error("Fixture swap required");
    amountIn = inner.args[0].amountIn; minimum = inner.args[0].amountOutMinimum;
  }
  const base = await metamaskExecutionFixture(expected);
  const inner = { ...base.delegation, delegate: owner, salt: 9n, caveats: [
    { enforcer: "0xbD7B277507723490Cd50b12EaaFe87C616be6880" as Hex,
      terms: concatHex(["0x01", owner, padHex("0x", { size: 32 })]), args: "0x" as Hex },
    { enforcer: "0xcdF6aB796408598Cea671d79506d7D48E97a5437" as Hex,
      terms: concatHex(["0x00", tokenOut, owner, padHex(toHex(minimum * 9n / 10n), { size: 32 })]), args: "0x" as Hex },
    { enforcer: "0xcdF6aB796408598Cea671d79506d7D48E97a5437" as Hex,
      terms: concatHex(["0x01", tokenIn, owner, padHex(toHex(amountIn * 11n / 10n), { size: 32 })]), args: "0x" as Hex },
  ] };
  inner.signature = await metamaskFixtureAccount.signTypedData({ domain: base.domain, types: metamaskFixtureTypes, primaryType: "Delegation", message: inner });
  const wrap = async (delegation = inner, executions = [base.execution], modes: Hex[] = [padHex("0x", { size: 32 })]) => {
    const innerInput = base.encode(delegation, executions, modes);
    const outer = await metamaskExecutionFixture({ to: base.domain.verifyingContract, value: "0", data: innerInput });
    return { ...outer, expected, inner, innerInput, innerExecution: base.execution };
  };
  return { ...await wrap(), wrap, signInner: async (d: typeof inner) => ({ ...d, signature: await metamaskFixtureAccount.signTypedData({ domain: base.domain, types: metamaskFixtureTypes, primaryType: "Delegation", message: d }) }) };
}
