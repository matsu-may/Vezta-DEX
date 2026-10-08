// Read-only Polygon RPC qualification: pinned ERC20 calls and an existing block receipt.
// The provider URL, wallet balances, transaction hash and response bodies are never printed.
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const HASH = /^0x[0-9a-fA-F]{64}$/;
const HEX = /^0x[0-9a-fA-F]+$/;
const WORD = /^0x[0-9a-fA-F]{64}$/;
const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const OWNER = "0xb4f286aeb57ab61af848f7c1619ff98144aed44e";
const MANAGER = "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const addressWord = address => address.slice(2).toLowerCase().padStart(64, "0");
const pauseDefault = ms => new Promise(resolve => setTimeout(resolve, ms));

export function inspectQualifiedRpcRead({ chainId, block, balance, allowance, receipt, confirmedBlock, now }) {
  const timestampMs = HEX.test(block?.timestamp ?? "") ? Number(BigInt(block.timestamp) * 1000n) : NaN;
  const txHash = block?.transactions?.[0];
  const checks = {
    sameChain: chainId === "0x89",
    blockIdentity: HEX.test(block?.number ?? "") && HASH.test(block?.hash ?? "")
      && HASH.test(txHash ?? ""),
    blockFresh: Number.isSafeInteger(timestampMs) && Number.isSafeInteger(now)
      && timestampMs <= now + 5_000 && now - timestampMs <= 120_000,
    pinnedErc20Reads: WORD.test(balance ?? "") && WORD.test(allowance ?? ""),
    receiptMatches: HASH.test(receipt?.transactionHash ?? "") && same(receipt?.transactionHash, txHash)
      && same(receipt?.blockHash, block?.hash) && same(receipt?.blockNumber, block?.number)
      && ["0x0", "0x1"].includes(receipt?.status),
    blockStable: same(confirmedBlock?.number, block?.number) && same(confirmedBlock?.hash, block?.hash),
  };
  return { ...checks, verified: Object.values(checks).every(Boolean) };
}

export async function runQualifiedRpcProbe({ rpcUrl, cycles = 3, fetcher = fetch, now = Date.now,
  pause = pauseDefault, write = line => process.stdout.write(line + "\n") }) {
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 5) throw new Error("cycles must be 1-5");
  let url;
  try { url = new URL(rpcUrl); } catch { throw new Error("Invalid Polygon RPC URL"); }
  if (url.protocol !== "https:" && !(url.protocol === "http:"
    && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Invalid Polygon RPC URL");
  const request = async (method, params) => {
    const response = await fetcher(url, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error("HTTP RPC failure");
    const body = await response.json();
    if (body?.error || body?.result === undefined || body?.result === null) throw new Error("RPC result unavailable");
    await pause(250);
    return body.result;
  };
  let allVerified = true;
  for (let cycle = 1; cycle <= cycles; cycle++) {
    const start = now();
    let stage = "chain";
    const timings = {};
    const timed = async (label, method, params) => {
      const began = now();
      try { return await request(method, params); }
      finally { timings[label] = (timings[label] ?? 0) + Math.max(0, now() - began); }
    };
    try {
      const chainId = await timed("chainMs", "eth_chainId", []);
      if (chainId !== "0x89") throw new Error("Wrong chain");
      stage = "latest-block";
      let block = await timed("latestBlockMs", "eth_getBlockByNumber", ["latest", false]);
      for (let depth = 0; depth < 2 && HEX.test(block?.number ?? "")
        && !HASH.test(block?.transactions?.[0] ?? ""); depth++) {
        stage = "recent-block";
        const previous = BigInt(block.number) - 1n;
        if (previous < 0n) break;
        block = await timed("recentBlockMs", "eth_getBlockByNumber", [`0x${previous.toString(16)}`, false]);
      }
      if (!HEX.test(block?.number ?? "") || !HASH.test(block?.hash ?? "")
        || !HASH.test(block?.transactions?.[0] ?? "")) throw new Error("No usable transaction block");
      stage = "pinned-balance";
      const balance = await timed("balanceMs", "eth_call", [{ to: USDC,
        data: `0x70a08231${addressWord(OWNER)}` }, block.number]);
      stage = "pinned-allowance";
      const allowance = await timed("allowanceMs", "eth_call", [{ to: USDC,
        data: `0xdd62ed3e${addressWord(OWNER)}${addressWord(MANAGER)}` }, block.number]);
      stage = "receipt";
      const receipt = await timed("receiptMs", "eth_getTransactionReceipt", [block.transactions[0]]);
      stage = "confirm-block";
      const confirmedBlock = await timed("confirmBlockMs", "eth_getBlockByNumber", [block.number, false]);
      const checks = inspectQualifiedRpcRead({ chainId, block, balance, allowance, receipt,
        confirmedBlock, now: now() });
      if (!checks.verified) allVerified = false;
      write(JSON.stringify({ cycle, stage: "complete", blockNumber: block.number,
        elapsedMs: Math.max(0, now() - start), timings, checks, verified: checks.verified }));
    } catch (error) {
      allVerified = false;
      write(JSON.stringify({ cycle, stage, elapsedMs: Math.max(0, now() - start), timings, verified: false,
        errorKind: error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name)
          ? "RPC_TIMEOUT" : "RPC_UNAVAILABLE" }));
    }
    if (cycle !== cycles) await pause(1_250);
  }
  return allVerified;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const envFile = new URL("../../apps/api/.env", import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  if (!await runQualifiedRpcProbe({ rpcUrl: process.env.POLYGON_RPC_URL })) process.exitCode = 1;
}
