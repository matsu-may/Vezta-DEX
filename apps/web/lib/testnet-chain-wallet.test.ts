import { expect, it } from "vitest";
import { createTestnetSwapDomain, testnetChainConfig } from "@vezta-dex/core";
import { TestnetWalletController } from "../features/swap/lib/testnet-wallet-controller";
import { createTestnetWalletContracts } from "../features/swap/lib/testnet-wallet-contracts";
import { createTestnetSubmissionStorageDomain, TESTNET_SUBMISSION_KEY } from "../features/swap/lib/testnet-wallet-storage";
import { memoryStorage, reviewedFixture } from "../features/swap/lib/testnet-wallet.test-helper";
const cfg = testnetChainConfig(1301), domain = createTestnetSwapDomain(1301);
async function fixture() {
  const b = await reviewedFixture(), intent = domain.parseTestnetSwapIntent({...b.f.request.intent, chainId: 1301,
    tokenIn: cfg.candidate.USDC.address, tokenOut: cfg.candidate.WETH.address});
  const quote = domain.parseTestnetSwapQuote({...b.q.quote, ...intent, source: cfg.source, pool: cfg.policy.pool}, b.f.clock());
  const transaction = {...b.checked.action!.transaction, ...domain.buildTestnetSwapTransaction(quote, b.f.clock())};
  const action = {...b.checked.action!, chainId: 1301, transaction, executionEnabled: true};
  const study = {...b.checked.study, chainId: 1301, intent, transaction, source: cfg.source, executionEnabled: true};
  return {b, intent, quote, action, study, quoted: {...b.f.quoted, quote, qualification: {...b.f.quoted.qualification, executionEnabled: true}}};
}
it("submits on Unichain and reloads only its original chain record without wallet prompts", async () => {
  const f = await fixture(), storage = memoryStorage(), methods: string[] = [], sent: unknown[] = [], hash = `0x${"ab".repeat(32)}`;
  const wallet = {async request({method, params}: {method: string; params?: unknown[]}) {
    methods.push(method);
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [f.intent.wallet];
    if (method === "eth_chainId") return "0x515";
    if (method === "eth_getCode") return "0x";
    if (method === "eth_sendTransaction") {sent.push(params); return hash;}
    throw Error("Unexpected wallet method");
  }};
  const api = {async call(action: string) {
    if (action === "quote") return f.quoted;
    if (action === "recheck") return {study: f.study, action: f.action};
    if (action === "receipt") return {observation: {contextId: f.action.contextId, hash, kind: "swap", chainId: 1301,
      source: cfg.source, observedAt: new Date(f.b.f.clock()).toISOString(), executionEnabled: false, status: "pending", confirmations: "0", execution: null}};
    throw Error("Unexpected API action");
  }};
  const lock = {async run(fn: () => Promise<void>) {await fn();}};
  const controller = new TestnetWalletController(wallet, api, storage, f.b.f.clock, lock, () => true, 1301);
  await controller.connect(); expect(controller.snapshot().stage).toBe("connected");
  await controller.quote(f.intent); await controller.review("swap");
  expect(controller.snapshot().stage).toBe("action-review");
  await controller.submit(); expect(controller.snapshot().stage).toBe("pending");
  expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject([{chainId: "0x515", to: cfg.policy.router}]);
  const records = createTestnetSubmissionStorageDomain(1301);
  expect(records.readTestnetSubmission(storage)).toMatchObject({kind: "record", record: {intent: {chainId: 1301}, hash}});
  expect(storage.getItem(TESTNET_SUBMISSION_KEY)).toBeNull();
  const before = methods.length;
  const restarted = new TestnetWalletController(wallet, api, storage, f.b.f.clock, lock, () => true, 1301);
  expect(restarted.snapshot().stage).toBe("pending"); expect(methods).toHaveLength(before);
  await restarted.observe(); expect(restarted.snapshot().observation?.chainId).toBe(1301); expect(sent).toHaveLength(1);
  const parser = createTestnetWalletContracts(84532);
  expect(() => parser.parseTestnetSubmission(records.readTestnetSubmission(storage).kind === "record" ? restarted.snapshot().submission : null)).toThrow();
  controller.dispose(); restarted.dispose();
});
it("blocks new Unichain work while a Base recovery exists and refuses delegated Unichain wallets", async () => {
  const f = await fixture(), storage = memoryStorage(); let calls = 0;
  const wallet = {async request({method}: {method: string}): Promise<unknown> {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [f.intent.wallet];
    if (method === "eth_chainId") return "0x515";
    if (method === "eth_getCode") return "0x";
    throw Error("No send permitted");
  }};
  const lock = {async run(fn: () => Promise<void>) {await fn();}};
  const controller = new TestnetWalletController(wallet, {async call() {calls++; return f.quoted;}}, storage, f.b.f.clock, lock, () => true, 1301);
  await controller.connect(); storage.setItem(TESTNET_SUBMISSION_KEY, "malformed-but-must-block");
  await controller.quote(f.intent); expect(calls).toBe(0); expect(controller.snapshot().quote).toBeNull();
  storage.removeItem(TESTNET_SUBMISSION_KEY);
  const original = wallet.request;
  wallet.request = async arg => arg.method === "eth_getCode" ? "0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b" : original(arg);
  await controller.connect(); expect(controller.snapshot().stage).toBe("error"); expect(controller.snapshot().message).toContain("EOA");
  controller.dispose();
});
