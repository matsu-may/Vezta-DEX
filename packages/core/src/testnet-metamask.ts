import { concatHex, decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData,
  hashStruct, padHex, parseAbi, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";

export const TESTNET_METAMASK = {
  chainId: 84532,
  manager: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  delegate: "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
  limitedCalls: "0x04658B29F6b82ed55274221a06Fc97D318E25416",
  exactExecution: "0x146713078D39eCC1F5338309c28405ccf85Abfbb",
  anyDelegate: "0x0000000000000000000000000000000000000a11",
} as const;
export const metamaskDelegationAbi = parseAbi([
  "struct Caveat { address enforcer; bytes terms; bytes args; }",
  "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
  "function redeemDelegations(bytes[] permissionContexts, bytes32[] modes, bytes[] executionCallDatas)",
  "function decodeDelegation(Delegation[] delegations)",
  "event RedeemedDelegation(address indexed rootDelegator, address indexed redeemer, Delegation delegation)",
  "event IncreasedCount(address indexed sender, address indexed redeemer, bytes32 indexed delegationHash, uint256 limit, uint256 callCount)",
]);
export const metamaskDelegationTypes = {
  Delegation: [{ name: "delegate", type: "address" }, { name: "delegator", type: "address" }, { name: "authority", type: "bytes32" }, { name: "caveats", type: "Caveat[]" }, { name: "salt", type: "uint256" }],
  Caveat: [{ name: "enforcer", type: "address" }, { name: "terms", type: "bytes" }],
} as const;
export const metamaskDelegationDomain = { name: "DelegationManager", version: "1", chainId: TESTNET_METAMASK.chainId, verifyingContract: TESTNET_METAMASK.manager } as const;
const contextParameters = metamaskDelegationAbi.find(a => a.type === "function" && a.name === "decodeDelegation")!.inputs;
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const invalid = (): never => { throw new Error("Unsupported MetaMask delegation or execution"); };
export function classifyTestnetWalletCode(code: unknown): "eoa" | "metamask-delegated" {
  if (code === "0x") return "eoa";
  if (typeof code === "string" && same(code, `0xef0100${TESTNET_METAMASK.delegate.slice(2)}`)) return "metamask-delegated";
  return invalid();
}
export async function decodeMetaMaskExecution(input: Hex, owner: Address, expected: { to: Address; value: string; data: string }) {
  if (!/^0x(?:[a-fA-F0-9]{2}){1,16384}$/.test(input) || !/^0x[0-9a-fA-F]{40}$/.test(owner)
    || !/^0x[0-9a-fA-F]{40}$/.test(expected.to) || expected.value !== "0"
    || !/^0x(?:[0-9a-fA-F]{2}){4,8192}$/.test(expected.data)) return invalid();
  const decoded = decodeFunctionData({ abi: metamaskDelegationAbi, data: input });
  if (decoded.functionName !== "redeemDelegations") return invalid();
  const [contexts, modes, executions] = decoded.args;
  if (contexts.length !== 1 || modes.length !== 1 || executions.length !== 1
    || !same(modes[0], padHex("0x", { size: 32 }))
    || !same(input, encodeFunctionData({ abi: metamaskDelegationAbi, functionName: "redeemDelegations", args: decoded.args }))) return invalid();
  const [chain] = decodeAbiParameters(contextParameters, contexts[0]);
  if (chain.length !== 1 || !same(contexts[0], encodeAbiParameters(contextParameters, [chain]))) return invalid();
  const delegation = chain[0]; const execution = concatHex([expected.to, padHex(toHex(0n), { size: 32 }), expected.data as Hex]);
  if (!same(execution, executions[0]) || !same(delegation.delegate, TESTNET_METAMASK.anyDelegate)
    || !same(delegation.delegator, owner) || !same(delegation.authority, `0x${"ff".repeat(32)}`)
    || delegation.caveats.length !== 2) return invalid();
  const [limited, exact] = delegation.caveats;
  if (!same(limited.enforcer, TESTNET_METAMASK.limitedCalls) || !same(limited.terms, padHex("0x01", { size: 32 }))
    || limited.args !== "0x" || !same(exact.enforcer, TESTNET_METAMASK.exactExecution)
    || !same(exact.terms, execution) || exact.args !== "0x") return invalid();
  const signature = delegation.signature;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return invalid();
  const r = BigInt(`0x${signature.slice(2, 66)}`); const s = BigInt(`0x${signature.slice(66, 130)}`); const v = signature.slice(130).toLowerCase();
  if (r === 0n || s === 0n || s > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n || (v !== "1b" && v !== "1c")) return invalid();
  const recovered = await recoverTypedDataAddress({ domain: metamaskDelegationDomain, types: metamaskDelegationTypes,
    primaryType: "Delegation", message: delegation, signature });
  if (!same(recovered, owner)) return invalid();
  const delegationHash = hashStruct({ types: metamaskDelegationTypes, primaryType: "Delegation", data: delegation });
  return { delegation, execution, delegationHash };
}
export type MetaMaskExecution = Awaited<ReturnType<typeof decodeMetaMaskExecution>>;
