import { expect, it } from "vitest";
import { guardedForkRequest, type ForkClientBoundary } from "./testnet-fork";
import { runTestnetLpWalletForkSteps } from "./testnet-lp-wallet-fork-steps";
it("requires the explicitly selected fork chain on every write and preserves the Base default", async () => {
  let writes = 0;
  const boundary: ForkClientBoundary = {transport: {type: "http", url: "http://127.0.0.1:34567"},
    getChainId: async () => 1301, getClientVersion: async () => "anvil/1", request: async () => { writes++; return "0x01"; }};
  await expect(guardedForkRequest(boundary, boundary.transport.url!, "evm_snapshot", [])).rejects.toThrow("FORK_CLIENT_INVALID");
  expect(await guardedForkRequest(boundary, boundary.transport.url!, "evm_snapshot", [], undefined, 1301)).toBe("0x01");
  expect(writes).toBe(1);
  boundary.getChainId = async () => 84532;
  await expect(guardedForkRequest(boundary, boundary.transport.url!, "evm_snapshot", [], undefined, 1301)).rejects.toThrow("FORK_CLIENT_INVALID");
  expect(writes).toBe(1);
});
it("binds the LP fork sequence to Unichain before requesting an actual study", async () => {
  let chain: number | undefined;
  await expect(runTestnetLpWalletForkSteps({owner: "0x1111111111111111111111111111111111111111",
    study: async intent => {chain = intent.chainId; throw new Error("stop-after-intent");}, execute: async () => {throw new Error("no-send");}}, 1301)).rejects.toThrow("stop-after-intent");
  expect(chain).toBe(1301);
});
