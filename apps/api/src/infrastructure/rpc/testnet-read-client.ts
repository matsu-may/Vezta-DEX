import { createPublicClient, http, type Chain, type Transport } from "viem";
import { baseSepoliaRpcPacers } from "./testnet-rpc-pacer";

const readMethods = new Set(["eth_chainId", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getBalance", "eth_getCode", "eth_call", "eth_estimateGas", "eth_getTransactionByHash",
  "eth_getTransactionReceipt", "eth_getTransactionCount", "eth_gasPrice", "eth_maxPriorityFeePerGas"]);
// Bound bytes before JSON decoding, including chunked or incorrectly declared bodies.
const RPC_RESPONSE_BYTE_LIMIT = 1048576;
class RpcResponseTooLargeError extends Error {
  constructor() { super("Testnet RPC response exceeds byte limit"); this.name = "RpcResponseTooLargeError"; }
}
async function readRpcBody(response: Response, signal?: AbortSignal | null) {
  signal?.throwIfAborted();
  if (Number(response.headers.get("content-length")) > RPC_RESPONSE_BYTE_LIMIT) {
    void response.body?.cancel().catch(() => {});
    throw new RpcResponseTooLargeError();
  }
  if (!response.body) return new Uint8Array(0);
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const body = new Uint8Array(RPC_RESPONSE_BYTE_LIMIT); let size = 0;
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      if (value.byteLength > RPC_RESPONSE_BYTE_LIMIT - size) { cancel(); throw new RpcResponseTooLargeError(); }
      body.set(value, size); size += value.byteLength;
    }
    return body.subarray(0, size);
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
}


/** Read transport only. Chain metadata is not runtime/deployment qualification. */
export function createTestnetReadClient(rpcUrl: string, chain: Chain, signal?: AbortSignal, rps = 3) {
  let url: URL;
  try { url = new URL(rpcUrl); } catch { throw new Error("Invalid testnet RPC URL"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))
    throw new Error("Testnet RPC requires HTTPS or loopback HTTP");
  if (!Number.isInteger(rps) || rps < 1 || rps > 6) throw new Error("Invalid testnet RPC rate");
  const pacer = baseSepoliaRpcPacers.get(url, rps);
  const transport: Transport = options => {
    const inner = http(rpcUrl, { timeout: 8000, retryCount: 0,
      fetchFn: async (input, init) => {
        const requestSignal = signal ? init?.signal ? AbortSignal.any([signal, init.signal]) : signal : init?.signal;
        const response = await fetch(input, { ...init, signal: requestSignal });
        const body = await readRpcBody(response, requestSignal);
        return new Response([204,205,304].includes(response.status) ? null : body,
          {status:response.status, statusText:response.statusText, headers:response.headers});
      } })(options);
    const request: typeof inner.request = async (args, requestOptions) => {
      const method = args.method;
      if (!readMethods.has(method)) throw new Error("Testnet RPC client is read-only");
      // Pacing can defer dispatch. Retain only a snapshot of validated RPC input,
      // so a caller cannot turn a queued read into a write by mutating its args.
      const captured = { ...args, method, params: structuredClone(args.params) };
      return pacer.run(() => inner.request(captured, requestOptions), signal);
    };
    // viem exposes config.request through client.transport as well as request.
    return { ...inner, config: { ...inner.config, request }, request };
  };
  return createPublicClient({chain,transport});
}
