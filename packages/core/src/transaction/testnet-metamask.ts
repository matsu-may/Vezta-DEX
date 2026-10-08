import { TESTNET_DIRECT_POOLS } from "../swap/testnet-swap-pools";
import { concatHex, decodeAbiParameters, decodeFunctionData, encodeAbiParameters, encodeFunctionData,
  hashStruct, padHex, parseAbi, recoverTypedDataAddress, toHex, type Address, type Hex } from "viem";

import { BASE_SEPOLIA_CANDIDATE as C } from "../chains/testnet";
import { TESTNET_SWAP_POLICY as P } from "../swap/testnet-swap";

export const TESTNET_METAMASK = {
  chainId: 84532,
  manager: "0xdb9b1e94b5b69df7e401ddbede43491141047db3",
  delegate: "0x63c0c19a282a1b52b07dd5a65b58948a07dae32b",
  limitedCalls: "0x04658B29F6b82ed55274221a06Fc97D318E25416",
  exactExecution: "0x146713078D39eCC1F5338309c28405ccf85Abfbb",
  nativeBalance: "0xbD7B277507723490Cd50b12EaaFe87C616be6880",
  erc20Balance: "0xcdF6aB796408598Cea671d79506d7D48E97a5437",
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
type ExpectedExecution = { to: Address; value: string; data: string };
function readSingle(input: Hex) {
  if (!/^0x(?:[a-fA-F0-9]{2}){1,16384}$/.test(input)) return invalid();
  const decoded = decodeFunctionData({ abi: metamaskDelegationAbi, data: input });
  if (decoded.functionName !== "redeemDelegations") return invalid();
  const [contexts, modes, executions] = decoded.args;
  if (contexts.length !== 1 || modes.length !== 1 || executions.length !== 1
    || !same(modes[0], padHex("0x", { size: 32 }))
    || !same(input, encodeFunctionData({ abi: metamaskDelegationAbi, functionName: "redeemDelegations", args: decoded.args }))) return invalid();
  const [chain] = decodeAbiParameters(contextParameters, contexts[0]);
  if (chain.length !== 1 || !same(contexts[0], encodeAbiParameters(contextParameters, [chain]))) return invalid();
  return { delegation: chain[0], execution: executions[0] };
}
type SingleExecution = ReturnType<typeof readSingle>;
async function authenticate(single: SingleExecution, owner: Address) {
  const { delegation } = single;
  if (!same(delegation.delegator, owner) || !same(delegation.authority, `0x${"ff".repeat(32)}`)) return invalid();
  const signature = delegation.signature;
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) return invalid();
  const r = BigInt(`0x${signature.slice(2, 66)}`); const s = BigInt(`0x${signature.slice(66, 130)}`); const v = signature.slice(130).toLowerCase();
  if (r === 0n || s === 0n || s > 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n || (v !== "1b" && v !== "1c")) return invalid();
  const recovered = await recoverTypedDataAddress({ domain: metamaskDelegationDomain, types: metamaskDelegationTypes,
    primaryType: "Delegation", message: delegation, signature });
  if (!same(recovered, owner)) return invalid();
  const delegationHash = hashStruct({ types: metamaskDelegationTypes, primaryType: "Delegation", data: delegation });
  return { ...single, delegationHash };
}
function requireOneUseExact(single: SingleExecution) {
  const { delegation, execution } = single;
  if (!same(delegation.delegate, TESTNET_METAMASK.anyDelegate) || delegation.caveats.length !== 2) return invalid();
  const [limited, exact] = delegation.caveats;
  if (!same(limited.enforcer, TESTNET_METAMASK.limitedCalls) || !same(limited.terms, padHex("0x01", { size: 32 }))
    || limited.args !== "0x" || !same(exact.enforcer, TESTNET_METAMASK.exactExecution)
    || !same(exact.terms, execution) || exact.args !== "0x") return invalid();
}
const nestedSwapAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[])",
]);
function requireSwapBalances(single: SingleExecution, owner: Address, expected: ExpectedExecution) {
  // Explicitly qualified swap profile only. This does not admit nested LP or approval calls.
  if (!same(expected.to, P.router) || !same(single.delegation.delegate, owner)
    || single.delegation.caveats.length !== 3) return invalid();
  const outer = decodeFunctionData({ abi: nestedSwapAbi, data: expected.data as Hex });
  if (outer.functionName !== "multicall" || outer.args[0] === 0n || outer.args[1].length !== 1
    || !same(expected.data, encodeFunctionData({ abi: nestedSwapAbi, functionName: "multicall", args: outer.args }))) return invalid();
  const call = decodeFunctionData({ abi: nestedSwapAbi, data: outer.args[1][0] });
  if (call.functionName !== "exactInputSingle"
    || !same(outer.args[1][0], encodeFunctionData({ abi: nestedSwapAbi, functionName: "exactInputSingle", args: call.args }))) return invalid();
  const swap = call.args[0];
  if (!(same(swap.tokenIn, C.USDC.address) && same(swap.tokenOut, C.WETH.address)
    || same(swap.tokenIn, C.WETH.address) && same(swap.tokenOut, C.USDC.address))
    || !same(swap.recipient, owner) || !TESTNET_DIRECT_POOLS.some(p => p.feeTier === swap.fee) || swap.amountIn === 0n
    || swap.amountOutMinimum === 0n || swap.sqrtPriceLimitX96 !== 0n) return invalid();
  const [native, output, input] = single.delegation.caveats;
  const word = (n: bigint) => padHex(toHex(n), { size: 32 });
  if (!same(native.enforcer, TESTNET_METAMASK.nativeBalance) || native.args !== "0x"
    || !same(native.terms, concatHex(["0x01", owner, word(0n)]))) return invalid();
  for (const [caveat, direction, token] of [[output, "0x00", swap.tokenOut], [input, "0x01", swap.tokenIn]] as const) {
    if (!same(caveat.enforcer, TESTNET_METAMASK.erc20Balance) || caveat.args !== "0x"
      || !/^0x[0-9a-fA-F]{146}$/.test(caveat.terms)
      || !same(caveat.terms.slice(0, 84), concatHex([direction, token, owner]))) return invalid();
  }
  const outputFloor = BigInt(`0x${output.terms.slice(84)}`);
  const inputCeiling = BigInt(`0x${input.terms.slice(84)}`);
  // Wallet guardrails can be looser. They never replace the exact reviewed call's
  // input/minimum or the receipt's actual transfer checks.
  if (outputFloor === 0n || outputFloor > swap.amountOutMinimum || inputCeiling < swap.amountIn) return invalid();
}
type AuthenticatedExecution = Awaited<ReturnType<typeof authenticate>>;
export type MetaMaskExecution = AuthenticatedExecution & { inner?: AuthenticatedExecution };
export async function decodeMetaMaskExecution(input: Hex, owner: Address, expected: ExpectedExecution): Promise<MetaMaskExecution> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(owner) || !/^0x[0-9a-fA-F]{40}$/.test(expected.to)
    || expected.value !== "0" || !/^0x(?:[0-9a-fA-F]{2}){4,8192}$/.test(expected.data)) return invalid();
  const outer = readSingle(input);
  requireOneUseExact(outer);
  const execution = concatHex([expected.to, padHex("0x", { size: 32 }), expected.data as Hex]);
  if (same(outer.execution, execution)) return authenticate(outer, owner);
  const prefix = concatHex([TESTNET_METAMASK.manager, padHex("0x", { size: 32 })]);
  if (!same(outer.execution.slice(0, prefix.length), prefix)) return invalid();
  const inner = readSingle(`0x${outer.execution.slice(prefix.length)}`);
  if (!same(inner.execution, execution)) return invalid();
  requireSwapBalances(inner, owner, expected);
  return { ...await authenticate(outer, owner), inner: await authenticate(inner, owner) };
}
