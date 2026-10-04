import { expect, it } from "vitest";
import { memoryStorage } from "./testnet-wallet.test-helper";
import { readTestnetActivity, saveTestnetActivity, TESTNET_ACTIVITY_KEY } from "./testnet-activity";

const account = "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e";
const entry = { chainId: 84532 as const, account, flow: "swap" as const, kind: "swap" as const,
  hash: `0x${"11".repeat(32)}`, status: "pending" as const, observedAt: "2026-10-04T00:00:00.000Z" };
it("upserts original hashes, scopes accounts and preserves reorg/unverified regressions", () => {
  const storage = memoryStorage();
  expect(saveTestnetActivity(storage, entry)).toBe(true);
  saveTestnetActivity(storage, { ...entry, status: "confirmed", l2GasCost: "1000", amountIn: "1000000", amountOut: "200", tokenIn: "USDC", tokenOut: "WETH" });
  expect(readTestnetActivity(storage, account).entries).toHaveLength(1);
  expect(readTestnetActivity(storage, account.toLowerCase()).entries[0].status).toBe("confirmed");
  expect(readTestnetActivity(storage, "0x1111111111111111111111111111111111111111").entries).toHaveLength(0);
  saveTestnetActivity(storage, { ...entry, status: "reorged" });
  expect(readTestnetActivity(storage, account).entries[0].status).toBe("reorged");
  expect(readTestnetActivity(storage, account).entries[0].amountOut).toBeUndefined();
});
it("bounds history and rejects unexpected secrets, invalid chain/amount and unsafe stored envelopes", () => {
  const storage = memoryStorage();
  for (let i = 1; i <= 105; i++) saveTestnetActivity(storage, { ...entry, hash: `0x${i.toString(16).padStart(64, "0")}` });
  expect(readTestnetActivity(storage, account).entries).toHaveLength(100);
  for (const patch of [{ chainId: 137 }, { amountIn: "-1" }, { signature: "secret" }, { hash: "javascript:alert(1)" }]) expect(saveTestnetActivity(storage, { ...entry, ...patch })).toBe(false);
  storage.setItem(TESTNET_ACTIVITY_KEY, JSON.stringify({ version: 99, entries: [entry] }));
  expect(readTestnetActivity(storage, account).available).toBe(false);
  expect(saveTestnetActivity(storage, entry)).toBe(false);
});
it("optional activity failure never throws or clears active recovery keys", () => {
  const storage = memoryStorage(); storage.setItem("recovery", "keep");
  const blocked = { ...storage, setItem() { throw new Error("quota"); } };
  expect(saveTestnetActivity(blocked, entry)).toBe(false);
  expect(storage.getItem("recovery")).toBe("keep");
});
