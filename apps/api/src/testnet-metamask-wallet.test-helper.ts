import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { TESTNET_METAMASK as M, type Address } from "@vezta-dex/core";
import type { Hex } from "viem";

const rows = JSON.parse(gunzipSync(readFileSync(new URL(
  "./fixtures/metamask-v1.3-base-sepolia-runtime.json.gz", import.meta.url,
))).toString("utf8")) as { address: Address; code: Hex }[];

// Uses the independently rebuilt runtimes, rather than mocking the runtime verifier.
export function delegatedWalletCodeReader(
  original: (address: Address, block: bigint) => Promise<Hex>, wallet: string,
  changedRuntime = false,
): typeof original {
  return async (address, block) => {
    if (address.toLowerCase() === wallet.toLowerCase()) return `0xef0100${M.delegate.slice(2)}`;
    const row = rows.find(r => r.address.toLowerCase() === address.toLowerCase());
    if (row) return changedRuntime ? "0x6000" : row.code;
    return original(address, block);
  };
}
