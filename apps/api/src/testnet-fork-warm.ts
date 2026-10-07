import { createPublicClient, http, isAddress, type Address, type Hex } from "viem";
import { baseSepolia, unichainSepolia } from "viem/chains";
import { testnetChainConfig, type TestnetChainId } from "@vezta-dex/core";
import { assertTestnetForkOrigin, forkAssert, type ForkClientBoundary } from "./testnet-fork";

/** Cache-only fixture warmup. Never supplies a gas estimate or execution proof. */
export async function warmOwnedForkCall(boundary: ForkClientBoundary, origin: string,
  transaction: { from: Address; to: Address; data: Hex; value: "0" }, blockNumber: bigint, signal: AbortSignal, chainId: TestnetChainId = 84532) {
  const C = testnetChainConfig(chainId).candidate;
  signal.throwIfAborted();
  assertTestnetForkOrigin(origin);
  forkAssert(boundary.transport.type === "http" && boundary.transport.url === origin && blockNumber > 0n
    && isAddress(transaction.from) && transaction.to.toLowerCase() === C.v3PositionManager.toLowerCase()
    && transaction.value === "0" && /^0x(?:[a-fA-F0-9]{2})+$/.test(transaction.data)
    && transaction.data.length <= 8194, "FORK_WARM_INVALID");
  const captured = { ...transaction };
  const [chain, version] = await Promise.all([boundary.getChainId(), boundary.getClientVersion()]);
  forkAssert(chain === chainId && /\banvil\b/i.test(version), "FORK_CLIENT_INVALID");
  signal.throwIfAborted();
  const client = createPublicClient({ chain: chainId === 84532 ? baseSepolia : unichainSepolia, transport: http(origin, { timeout: 30000, retryCount: 0,
    fetchFn: async (input, init) => {
      const abort = init?.signal ? AbortSignal.any([signal, init.signal]) : signal;
      const response = await fetch(input, { ...init, signal: abort });
      const reader = response.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        if (reader) while (true) {
          abort.throwIfAborted(); const { done, value } = await reader.read(); abort.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) { await reader.cancel(); throw new Error("Fork warm response exceeds limit"); }
          chunks.push(value);
        }
      } finally { reader?.releaseLock(); }
      const body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(body, { status: response.status, headers: response.headers });
    } }) });
  await client.call({ account: captured.from, to: captured.to, data: captured.data, value: 0n,
    gas: 1500000n, blockNumber });
}
