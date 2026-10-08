import { type TestnetChainId } from "@vezta-dex/core";
import { forkAssert, type ForkClientBoundary } from "./testnet-fork";
import { guardedForkRequest } from "./testnet-fork";

export async function withForkSnapshot<T>(client: ForkClientBoundary, origin: string, work: () => Promise<T>, chainId: TestnetChainId = 84532): Promise<T> {
  const snapshot = await guardedForkRequest(client, origin, "evm_snapshot", [], undefined, chainId);
  forkAssert(typeof snapshot === "string" && /^0x[0-9a-fA-F]+$/.test(snapshot), "FORK_SNAPSHOT_INVALID");
  try { return await work(); }
  finally {
    forkAssert(await guardedForkRequest(client, origin, "evm_revert", [snapshot], undefined, chainId) === true, "FORK_CLEANUP_FAILED");
  }
}
