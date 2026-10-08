import { expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, erc20Abi, type Hex } from "viem";
import { TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetActionStore } from "./testnet-action";
import { TestnetReceiptReader, type BaseSepoliaReceiptSource } from "./testnet-receipt";
import { testnetActionFixture } from "./testnet-action.test-helper";
import { wrappedReceiptFixture } from "./testnet-metamask-execution.test-helper";
async function fixture() {
  const w=await wrappedReceiptFixture(),f=await testnetActionFixture("approve");
  const owner=w.f.owner; f.input.intent.wallet=owner;f.input.quote.wallet=owner;f.input.transaction.from=owner;
  const store=new TestnetActionStore(f.clock);const action=store.issue(f.input,()=>{});
  w.receipt.logs.push({address:f.input.intent.tokenIn,topics:encodeEventTopics({abi:erc20Abi,eventName:"Approval",args:{owner,spender:P.router}}) as Hex[],data:encodeAbiParameters([{type:"uint256"}],[1000000n]),blockNumber:124n,blockHash:w.tx.blockHash,transactionHash:w.tx.hash});
  const source: BaseSepoliaReceiptSource={...f.source,...w.source,async getLatestBlock(){return{number:125n,timestamp:1790800000n,hash:w.tx.blockHash};},async getBlockHash(){return w.tx.blockHash;},async getTransaction(){return w.tx;},async getReceipt(){return w.receipt;},async getTokenAllowance(){return 1000000n;}};
  const reader=new TestnetReceiptReader(()=>source,store,f.clock);
  return { w, f, source, store, action, reader };
}
it("qualifies the original reviewed approval behind the constrained MetaMask wrapper", async()=>{
  const { w, store, action, reader } = await fixture();
  const result=await reader.observe({contextId:action.contextId,hash:w.tx.hash});
  expect(result).toMatchObject({status:"confirmed",executionModel:"metamask-delegation",gasPayer:w.tx.from,execution:{status:"verified",approvedAmount:"1000000",allowanceMatchesExpected:true}});
  expect(store.read(action.contextId).originalHash).toBe(w.tx.hash);
});

it.each(["valid", "malformed"])("keeps a %s pending manager candidate unverified and unbound until inclusion", async kind => {
  const { w, source, store, action, reader } = await fixture();
  source.getTransaction = async () => ({ ...w.tx, input: kind === "malformed" ? "0x1234" : w.tx.input, blockNumber: null, blockHash: null });
  source.getReceipt = async () => null;
  expect(await reader.observe({ contextId: action.contextId, hash: w.tx.hash })).toMatchObject({ status: "unverified", execution: null });
  expect(store.read(action.contextId).originalHash).toBeNull();
});

it("does not bind an older same-call type2 approval to a newly issued context", async () => {
  const { w, source, store, action, reader } = await fixture();
  w.tx.type = "eip1559"; w.tx.authorizationList = [];
  const { TESTNET_METAMASK: M } = await import("@vezta-dex/core");
  const getCode = source.getCode;
  source.getCode = (address, block) => address.toLowerCase() === w.f.owner.toLowerCase()
    ? Promise.resolve(`0xef0100${M.delegate.slice(2)}` as Hex) : getCode(address, block);
  // The relayer does not increment the owner nonce. This old approval can therefore
  // match the reviewed call/owner nonce, but must still fail issuance chronology.
  w.tx.blockNumber = 123n; w.receipt.blockNumber = 123n;
  for (const log of w.receipt.logs) log.blockNumber = 123n;
  expect(await reader.observe({ contextId: action.contextId, hash: w.tx.hash })).toMatchObject({ status: "unverified", diagnostic: "receipt-mismatch" });
  expect(store.read(action.contextId).originalHash).toBeNull();
  const correctHash = `0x${"77".repeat(32)}`;
  w.tx.hash = correctHash as Hex; w.receipt.transactionHash = correctHash;
  w.tx.blockNumber = 124n; w.receipt.blockNumber = 124n;
  for (const log of w.receipt.logs) { log.blockNumber = 124n; log.transactionHash = correctHash; }
  expect(await reader.observe({ contextId: action.contextId, hash: correctHash })).toMatchObject({ status: "confirmed" });
  expect(store.read(action.contextId).originalHash).toBe(correctHash);
});
