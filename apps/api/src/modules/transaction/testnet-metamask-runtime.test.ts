import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { verifyTestnetMetaMaskRuntime } from "./testnet-metamask-runtime";

type Runtime = { address: Address; code: Hex };
function runtimes(): Runtime[] {
  return JSON.parse(gunzipSync(readFileSync(new URL("../../fixtures/metamask-v1.3-base-sepolia-runtime.json.gz", import.meta.url))).toString("utf8")) as Runtime[];
}

const block = 47629077n;
function sourceFor(rows: Runtime[]) {
  return {
    async getCode(address: Address, requestedBlock: bigint): Promise<Hex> {
      if (requestedBlock !== block) throw new Error("Wrong block");
      const row = rows.find(candidate => candidate.address.toLowerCase() === address.toLowerCase());
      if (!row) throw new Error("Unexpected contract address");
      return row.code;
    },
  };
}

describe("MetaMask v1.3 runtime verification", () => {
  it("accepts the four independently rebuilt full runtimes at the requested block", async () => {
    await expect(verifyTestnetMetaMaskRuntime(sourceFor(runtimes()), block)).resolves.toBeUndefined();
  });

  it.each([0, 1, 2, 3])("rejects a changed byte in contract %i, including metadata bytes", async index => {
    const rows = runtimes();
    const row = rows[index]!;
    row.code = `0x${row.code.slice(2, -1)}${row.code.endsWith("0") ? "1" : "0"}`;
    await expect(verifyTestnetMetaMaskRuntime(sourceFor(rows), block)).rejects.toThrow("TESTNET_METAMASK_RUNTIME_MISMATCH");
  });

  it.each(["0x", "0x00", "0xzz", "0x6", "6000"])("rejects absent or invalid runtime %s", async code => {
    const rows = runtimes();
    rows[0]!.code = code as Hex;
    await expect(verifyTestnetMetaMaskRuntime(sourceFor(rows), block)).rejects.toThrow("TESTNET_METAMASK_RUNTIME_MISMATCH");
  });

  it("rejects a provider failure while reading any contract", async () => {
    const rows = runtimes();
    const normal = sourceFor(rows);
    const failure = new Error("Pinned block unavailable");
    const source = {
      async getCode(address: Address, requestedBlock: bigint): Promise<Hex> {
        if (address.toLowerCase() === rows[3]!.address.toLowerCase()) throw failure;
        return normal.getCode(address, requestedBlock);
      },
    };
    await expect(verifyTestnetMetaMaskRuntime(source, block)).rejects.toBe(failure);
  });
});
