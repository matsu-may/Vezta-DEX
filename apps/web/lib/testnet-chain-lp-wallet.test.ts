import {testnetLpMessage} from "./testnet-lp-wallet-errors";
import { expect, it } from "vitest";
import { encodeFunctionData, erc20Abi } from "viem";
import { createTestnetLpDomain, testnetChainConfig } from "@vezta-dex/core";
import { lpWalletFixture } from "./testnet-lp-wallet.test-helper";
import { memoryStorage } from "./testnet-wallet.test-helper";
import { TestnetLpWalletController } from "./testnet-lp-wallet-controller";
import { createTestnetLpStorageDomain } from "./testnet-lp-wallet-storage";
const cfg = testnetChainConfig(1301), domain = createTestnetLpDomain(1301);
it("reviews exact LP approval and retains original Unichain recovery across reload", async () => {
  const b = lpWalletFixture("approve"), intent = {...b.intent, chainId: 1301};
  const study = domain.parseTestnetLpStudy({...b.study, intent, source: cfg.source,
    transaction: {...b.study.transaction, chainId: 1301, to: cfg.candidate.USDC.address,
      data: encodeFunctionData({abi: erc20Abi, functionName: "approve", args: [cfg.candidate.v3PositionManager, 1000000n]})}}, b.now);
  const observation = {...b.observation, intent, chainId: 1301, source: cfg.source};
  const sent: unknown[] = [], storage = memoryStorage(); let prompts = 0;
  const wallet = {async request({method, params}: {method: string; params?: unknown[]}) {
    if (method === "eth_accounts" || method === "eth_requestAccounts") {if (method === "eth_requestAccounts") prompts++; return [study.intent.wallet];}
    if (method === "eth_chainId") return "0x515";
    if (method === "eth_getCode") return "0x";
    if (method === "eth_sendTransaction") {sent.push(params); return b.observation.hash;}
    throw Error("Unexpected method");
  }};
  const api = {async call(action: string) {return action === "receipt" ? {observation} : {study};}};
  const lock = {async run(fn: () => Promise<void>) {await fn();}};
  const c = new TestnetLpWalletController(wallet, api, storage, () => b.now, lock, () => true, 1301);
  await c.connect(); await c.study(study.intent); expect(c.snapshot().stage).toBe("review");
  await c.submit(); expect(sent).toHaveLength(1); expect(sent[0]).toMatchObject([{chainId: "0x515", to: cfg.candidate.USDC.address}]);
  expect(createTestnetLpStorageDomain(1301).readTestnetLpSubmission(storage)).toMatchObject({kind: "record", record: {study: {intent: {chainId: 1301}}}});
  const n = prompts, r = new TestnetLpWalletController(wallet, api, storage, () => b.now, lock, () => true, 1301);
  expect(prompts).toBe(n); await r.observe(); expect(r.snapshot().stage).toBe("confirmed");
  await r.acknowledge(); expect(r.snapshot().submission).toBeNull(); expect(sent).toHaveLength(1);
  c.dispose(); r.dispose();
});

it("labels RPC and wallet errors with the selected chain and EOA scope",()=>{
 expect(testnetLpMessage("TESTNET_LP_WRONG_CHAIN",false,1301)).toContain("Unichain Sepolia (1301)");
 expect(testnetLpMessage("TESTNET_LP_RPC_UNAVAILABLE",false,1301)).not.toContain("Base Sepolia");
 expect(testnetLpMessage("TESTNET_LP_EOA_REQUIRED",false,1301)).toContain("EOA");
});
