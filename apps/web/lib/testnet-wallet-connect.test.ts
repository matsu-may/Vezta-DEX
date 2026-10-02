import { expect, it, vi } from "vitest";
import { TestnetWalletController } from "./testnet-wallet-controller";
import { memoryStorage } from "./testnet-wallet.test-helper";
const owner = "0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e";
const coordination = { async run(action: () => Promise<void>) { await action(); } };
it("explains wrong network on connection without calling an API or sending a transaction", async () => {
  const api = { call: vi.fn() }; const methods: string[] = []; let chain = "0x2105";
  const wallet = { async request({ method }: { method: string }) { methods.push(method); return method === "eth_chainId" ? chain : [owner]; } };
  const c = new TestnetWalletController(wallet, api, memoryStorage(), Date.now, coordination);
  await c.connect(); expect(c.snapshot().account).toBeNull();
  expect(c.snapshot().message).toBe("Wrong wallet network. Select Base Sepolia (chain 84532), then connect again.");
  expect(api.call).not.toHaveBeenCalled(); expect(methods).not.toContain("eth_sendTransaction");
  chain = "0x14a34"; await c.connect(); expect(c.snapshot()).toMatchObject({ stage: "connected", account: owner, message: "" });
});
it("gives safe connection-specific instructions for rejection, pending requests and unknown provider failures", async () => {
  for (const [code, expected] of [[4001, "Wallet connection rejected"], [-32002, "A wallet request is already pending"], [9999, "Unable to connect wallet"]] as const) {
    const c = new TestnetWalletController({ async request() { throw { code, message: "private provider URL" }; } }, { call: vi.fn() }, memoryStorage(), Date.now, coordination);
    await c.connect(); expect(c.snapshot().message).toContain(expected);
    expect(c.snapshot().message).not.toContain("private"); expect(c.snapshot().message).not.toContain("fresh Base Sepolia quote");
  }
});
