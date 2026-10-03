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

export class TestnetMetaMaskRuntimeError extends Error {
  readonly code = "TESTNET_METAMASK_RUNTIME_MISMATCH";
  constructor() { super("TESTNET_METAMASK_RUNTIME_MISMATCH"); }
}

export async function verifyTestnetMetaMaskRuntime(
  source: { getCode(address: Address, block: bigint): Promise<Hex> },
  block: bigint,
): Promise<void> {
  for (const pin of TESTNET_METAMASK_RUNTIME) {
    const code = await source.getCode(pin.address, block);
    if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(code) || keccak256(code) !== pin.runtimeHash)
      throw new TestnetMetaMaskRuntimeError();
  }
}
