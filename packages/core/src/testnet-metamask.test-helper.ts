// Deterministic PUBLIC test account. Never use this fixture key for funded wallets.
import { privateKeyToAccount } from "viem/accounts";
import { concatHex, encodeAbiParameters, encodeFunctionData, padHex, parseAbi, toHex, type Hex } from "viem";

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
