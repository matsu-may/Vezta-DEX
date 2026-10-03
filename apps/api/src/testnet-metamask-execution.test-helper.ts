import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { metamaskExecutionFixture, metamaskFixtureAccount } from "../../../packages/core/src/testnet-metamask.test-helper";
import { decodeMetaMaskExecution, metamaskDelegationAbi, TESTNET_METAMASK as M } from "@vezta-dex/core";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";

export async function wrappedReceiptFixture(expectedInput?: { to: Hex; value: string; data: Hex }, block = 124n) {
  const f = await metamaskExecutionFixture(expectedInput); const profile = await decodeMetaMaskExecution(f.input, f.owner, f.expected);
  const hash = `0x${"12".repeat(32)}` as Hex; const blockHash = `0x${"cd".repeat(32)}` as Hex;
  const relayer = "0x1111111111111111111111111111111111111111" as Hex;
  const auth = await metamaskFixtureAccount.signAuthorization({ contractAddress: M.delegate, chainId: 84532, nonce: 7 });
  const tx = { hash, type: "eip7702", chainId: 84532, from: relayer, to: M.manager, input: f.input, value: 0n,
    nonce: 1234, gas: 300000n, maxFeePerGas: 10000000n, maxPriorityFeePerGas: 1000000n, accessList: [], authorizationList: [auth], blockNumber: block, blockHash };
  const counter = { address: M.limitedCalls, topics: encodeEventTopics({abi:metamaskDelegationAbi,eventName:"IncreasedCount",args:{sender:M.manager,redeemer:relayer,delegationHash:profile.delegationHash}}) as Hex[], data: encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[1n,1n]) };
  const event = metamaskDelegationAbi.find(a=>a.type==="event"&&a.name==="RedeemedDelegation")!;
  const redeemed = { address: M.manager, topics:encodeEventTopics({abi:metamaskDelegationAbi,eventName:"RedeemedDelegation",args:{rootDelegator:f.owner,redeemer:relayer}}) as Hex[],data:encodeAbiParameters(event.inputs.filter(a=>!("indexed" in a && a.indexed)),[profile.delegation]) };
  const receipt: import("./testnet-receipt").TestnetObservedReceipt = { transactionHash:hash,from:relayer,to:M.manager,blockNumber:block,blockHash,status:"success" as const,gasUsed:200000n,effectiveGasPrice:6000000n,logs:[counter,redeemed].map(l=>({...l,blockNumber:block,blockHash,transactionHash:hash})) };
  const runtime = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/metamask-v1.3-base-sepolia-runtime.json.gz",import.meta.url))).toString());
  const blockNumber=block;
  const source = { async getCode(address:Hex,block:bigint) { if(address.toLowerCase()===f.owner.toLowerCase()) return block===blockNumber-1n?"0x" as Hex:`0xef0100${M.delegate.slice(2)}` as Hex;
    const row = (Array.isArray(runtime)?runtime:runtime.contracts).find((r:{address:string})=>r.address.toLowerCase()===address.toLowerCase());return row.code??row.runtime??row.runtimeCode; },
    async getAccountNonce(){return 7n;},async getBlockTransactions(){return [tx];},async getBlockBaseFee(){return 5000000n;} };
  const expected = {...f.expected,from:f.owner,nonce:"7"};
  return { f,tx,receipt,source,expected };
}
