import { expect, it } from "vitest";
import { reviewedFixture, memoryStorage } from "./testnet-wallet.test-helper";
import { TestnetWalletController } from "./testnet-wallet-controller";
it("exposes validated funding/fee review and clears it on input edits without forgetting the connected wallet", async () => {
  const f = await reviewedFixture();
  const wallet = { async request({ method }: { method: string }) { return method === "eth_chainId" ? "0x14a34" : [f.f.request.intent.wallet]; } };
  const controller = new TestnetWalletController(wallet, { async call(action) { return action === "quote" ? f.f.quoted : f.checked; } }, memoryStorage(), f.f.clock, { async run(fn) { await fn(); } });
  await controller.connect(); await controller.quote(f.f.request.intent); await controller.review("swap");
  expect(controller.snapshot().review?.gas?.totalFeeBudget).toBe(f.checked.study.gas?.totalFeeBudget);
  controller.invalidateInput();
  expect(controller.snapshot()).toMatchObject({ account: f.f.request.intent.wallet, quote: null, action: null, review: null, stage: "connected" });
});
