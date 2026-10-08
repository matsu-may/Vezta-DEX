import { type TestnetChainId } from "@vezta-dex/core";
import { forkAssert, guardedForkRequest, type ForkClientBoundary } from "./testnet-fork";

export async function mineFreshForkBlock(client: ForkClientBoundary, origin: string, lastTimestamp: bigint,
  signal: AbortSignal, now = Date.now, chainId: TestnetChainId = 84532) {
  signal.throwIfAborted();
  const wall = now(); const seconds = Math.floor(wall / 1000);
  forkAssert(Number.isSafeInteger(wall) && wall > 0 && lastTimestamp >= 0n
    && lastTimestamp < BigInt(Number.MAX_SAFE_INTEGER), "FORK_CLOCK_INVALID");
  const timestamp = Math.max(seconds, Number(lastTimestamp) + 1);
  forkAssert(timestamp * 1000 <= wall + 10000, "FORK_CLOCK_INVALID");
  await guardedForkRequest(client, origin, "evm_setNextBlockTimestamp", [timestamp], () => signal.throwIfAborted(), chainId);
  await guardedForkRequest(client, origin, "evm_mine", [], () => signal.throwIfAborted(), chainId);
}
