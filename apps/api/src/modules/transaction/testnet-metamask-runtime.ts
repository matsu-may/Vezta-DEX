import { TESTNET_METAMASK as M } from "@vezta-dex/core";
import { keccak256, type Address, type Hex } from "viem";

// Full runtimes, including AST-bound immutable values and metadata, independently
// rebuilt at Base Sepolia block 47629077. See the committed research proof manifest.
export const TESTNET_METAMASK_RUNTIME = [
  { address: M.manager, runtimeHash: "0xa6f025f7bb23ddc0e2546eec56400672c3dfac88c12963bfeb2b5e1121aeee4a", role: "manager" },
  { address: M.delegate, runtimeHash: "0x83805f9ac7395294043b10c3b7c1839b7e4582a3e693028c36df84978b09d4e2", role: "delegate" },
  { address: M.limitedCalls, runtimeHash: "0x3a07a1b31d8f8f29cde4260f88fc5011e003e4bdbd519c8274fc7092d2356468", role: "limitedCalls" },
  { address: M.exactExecution, runtimeHash: "0xd695eefffb5a4da6d7db7dbae12d3a85dff43d9b274b1217ad1498d73539dc5e", role: "exactExecution" },
] as const satisfies readonly { address: Address; runtimeHash: Hex; role: string }[];

// Additional gates only for the qualified two-level swap. Independently rebuilt
// at the original receipt block 47660523, with no byte masking or immutables.
export const TESTNET_METAMASK_BALANCE_RUNTIME = [
  { address: M.nativeBalance, runtimeHash: "0x61f455a893e4dcb39599bfcd8f59000e438c52639b278b933e469610c7761b76" },
  { address: M.erc20Balance, runtimeHash: "0x7661ade9afeeb057a8189e93979ce5d812bfb3cfba24c5d6be54f19bd02647a3" },
] as const;

export class TestnetMetaMaskRuntimeError extends Error {
  readonly code = "TESTNET_METAMASK_RUNTIME_MISMATCH";
  constructor() { super("TESTNET_METAMASK_RUNTIME_MISMATCH"); }
}

export async function verifyTestnetMetaMaskRuntime(
  source: { getCode(address: Address, block: bigint): Promise<Hex> },
  block: bigint,
): Promise<void> {
  return verifyPins(source, block, TESTNET_METAMASK_RUNTIME);
}

export async function verifyTestnetMetaMaskBalanceRuntime(
  source: { getCode(address: Address, block: bigint): Promise<Hex> },
  block: bigint,
): Promise<void> {
  return verifyPins(source, block, TESTNET_METAMASK_BALANCE_RUNTIME);
}

async function verifyPins(
  source: { getCode(address: Address, block: bigint): Promise<Hex> },
  block: bigint,
  pins: readonly { address: Address; runtimeHash: Hex }[],
): Promise<void> {
  for (const pin of pins) {
    const code = await source.getCode(pin.address, block);
    if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(code) || keccak256(code) !== pin.runtimeHash)
      throw new TestnetMetaMaskRuntimeError();
  }
}
