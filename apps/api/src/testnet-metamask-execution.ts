import { decodeMetaMaskExecution, classifyTestnetWalletCode, metamaskDelegationAbi, TESTNET_METAMASK as M, type MetaMaskExecution } from "@vezta-dex/core";
import { encodeAbiParameters, encodeEventTopics, padHex, type Address, type Hex } from "viem";
import { recoverAuthorizationAddress } from "viem/experimental";
import { verifyTestnetMetaMaskRuntime, verifyTestnetMetaMaskBalanceRuntime } from "./testnet-metamask-runtime";
import type { BaseSepoliaReceiptSource, TestnetObservedReceipt, TestnetObservedTransaction } from "./testnet-receipt";
const same = (a: string | null | undefined,b:string)=>typeof a==="string"&&a.toLowerCase()===b.toLowerCase();
const assert = (ok:unknown):void=>{if(!ok)throw new Error("Unsupported MetaMask execution");};
const uint=(v:unknown):v is bigint=>typeof v==="bigint"&&v>=0n&&v<2n**256n;
const rootAuth = async (raw:unknown) => {
  assert(raw && typeof raw==="object");
  const a=raw as {address:Address;chainId:number;nonce:number;r:Hex;s:Hex;yParity:number};
  assert(/^0x[0-9a-fA-F]{40}$/.test(a.address)&&Number.isSafeInteger(a.chainId)&&Number.isSafeInteger(a.nonce)&&a.nonce>=0
    &&/^0x[0-9a-fA-F]{1,64}$/.test(a.r)&&/^0x[0-9a-fA-F]{1,64}$/.test(a.s)&&(a.yParity===0||a.yParity===1)
    &&BigInt(a.r)>0n&&BigInt(a.s)>0n&&BigInt(a.s)<=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n);
  // RPC encodes r/s as integer quantities, which can have an odd number of hex digits.
  const authorization={...a,r:padHex(a.r,{size:32}),s:padHex(a.s,{size:32})};
  return {authorization,owner:await recoverAuthorizationAddress({authorization})};
};
function matchesLog(log:TestnetObservedReceipt["logs"][number], address:Address,topics:readonly Hex[],data:Hex) {
  return same(log.address,address)&&log.topics.length===topics.length&&log.topics.every((t,i)=>same(t,topics[i]))&&same(log.data,data);
}
export function verifyMetaMaskEvents(profile:MetaMaskExecution,tx:TestnetObservedTransaction,r:TestnetObservedReceipt) {
  const counterTopics=encodeEventTopics({abi:metamaskDelegationAbi,eventName:"IncreasedCount",args:{sender:M.manager,redeemer:tx.from as Address,delegationHash:profile.delegationHash}});
  const counterData=encodeAbiParameters([{type:"uint256"},{type:"uint256"}],[1n,1n]);
  const redeemTopics=encodeEventTopics({abi:metamaskDelegationAbi,eventName:"RedeemedDelegation",args:{rootDelegator:profile.delegation.delegator,redeemer:tx.from as Address}});
  const event=metamaskDelegationAbi.find(a=>a.type==="event"&&a.name==="RedeemedDelegation")!;
  const redeemData=encodeAbiParameters(event.inputs.filter(a=>!("indexed" in a && a.indexed)),[profile.delegation]);
  const counters=r.logs.filter(l=>same(l.address,M.limitedCalls));const redeems=r.logs.filter(l=>same(l.address,M.manager));
  assert(counters.length===1&&matchesLog(counters[0],M.limitedCalls,counterTopics as Hex[],counterData));
  if (!profile.inner) {
    assert(redeems.length===1&&matchesLog(redeems[0],M.manager,redeemTopics as Hex[],redeemData));
    return;
  }
  // Inner execution completes before the outer redemption event. Its caller is
  // the delegated owner; the outer caller is the transaction's relayer.
  const innerTopics=encodeEventTopics({abi:metamaskDelegationAbi,eventName:"RedeemedDelegation",args:{rootDelegator:profile.inner.delegation.delegator,redeemer:profile.delegation.delegator}});
  const innerData=encodeAbiParameters(event.inputs.filter(a=>!("indexed" in a && a.indexed)),[profile.inner.delegation]);
  assert(redeems.length===2&&matchesLog(redeems[0],M.manager,innerTopics as Hex[],innerData)
    &&matchesLog(redeems[1],M.manager,redeemTopics as Hex[],redeemData));
}
// End-of-block code alone is insufficient: prove parent code/nonce plus the complete canonical block's authorizations.
export async function verifyMetaMaskExecution(source:Pick<BaseSepoliaReceiptSource,"getCode"|"getAccountNonce"|"getBlockBaseFee"|"getBlockTransactions">,
  tx:TestnetObservedTransaction,r:TestnetObservedReceipt,expected:{from:string;to:string;data:string;value:string;nonce:string}) {
  assert(tx.chainId===84532&&(tx.type==="eip7702"||tx.type==="eip1559")&&same(tx.to,M.manager)&&tx.value===0n
    &&/^0x[0-9a-fA-F]{40}$/.test(tx.from)&&!same(tx.from,expected.from)&&Number.isSafeInteger(tx.nonce)&&tx.nonce>=0
    &&uint(tx.gas)&&tx.gas>=21000n&&tx.gas<=2000000n
    &&uint(tx.maxFeePerGas)&&tx.maxFeePerGas>0n&&tx.maxFeePerGas<=2000000000000n
    &&uint(tx.maxPriorityFeePerGas)&&tx.maxPriorityFeePerGas<=tx.maxFeePerGas
    &&(tx.accessList==null||Array.isArray(tx.accessList)&&tx.accessList.length===0)
    &&r.blockNumber>0n&&tx.blockNumber===r.blockNumber&&same(tx.blockHash,r.blockHash)
    &&same(r.transactionHash,tx.hash)&&same(r.from,tx.from)&&same(r.to,M.manager)
    &&uint(r.gasUsed)&&r.gasUsed>0n&&r.gasUsed<=tx.gas&&Array.isArray(r.logs)&&r.logs.length<=128);
  const profile=await decodeMetaMaskExecution(tx.input,expected.from as Address,{to:expected.to as Address,data:expected.data,value:expected.value});
  if (profile.inner) await verifyTestnetMetaMaskBalanceRuntime(source,r.blockNumber);
  const parent=r.blockNumber-1n;
  assert(source.getBlockTransactions&&source.getBlockBaseFee);
  const [parentCode,receiptCode,parentNonce,blockTxs,baseFee]=await Promise.all([
    source.getCode(expected.from as Address,parent),source.getCode(expected.from as Address,r.blockNumber),source.getAccountNonce(expected.from as Address,parent),
    source.getBlockTransactions!(r.blockNumber),source.getBlockBaseFee!(r.blockNumber),verifyTestnetMetaMaskRuntime(source,r.blockNumber),
  ]);
  const parentKind=classifyTestnetWalletCode(parentCode);
  assert(classifyTestnetWalletCode(receiptCode)==="metamask-delegated"&&uint(parentNonce)&&parentNonce===BigInt(expected.nonce)
    &&Array.isArray(blockTxs)&&blockTxs.length<=4096&&blockTxs.filter(t=>same(t.hash,tx.hash)).length===1
    &&uint(baseFee)&&baseFee<=tx.maxFeePerGas!);
  const sum=baseFee+tx.maxPriorityFeePerGas!;assert(r.effectiveGasPrice===(sum<tx.maxFeePerGas!?sum:tx.maxFeePerGas));
  let currentAuth=0;
  for(const other of blockTxs) {
    assert(other.blockNumber===r.blockNumber&&same(other.blockHash,r.blockHash));
    // An owner transaction or another authorization in this block makes nonce/code at this index ambiguous.
    assert(!same(other.from,expected.from));
    if(other.authorizationList==null)continue;
    assert(Array.isArray(other.authorizationList)&&other.authorizationList.length<=64);
    for(const raw of other.authorizationList) {
      const {authorization:a,owner}=await rootAuth(raw);
      if(!same(owner,expected.from))continue;
      assert(same(other.hash,tx.hash)&&a.chainId===84532&&same(a.address,M.delegate)&&BigInt(a.nonce)===parentNonce);
      currentAuth++;
    }
  }
  if(tx.type==="eip7702") {
    assert(Array.isArray(tx.authorizationList)&&tx.authorizationList.length===1&&currentAuth===1);
    const a=await rootAuth(tx.authorizationList![0]);assert(same(a.owner,expected.from));
  } else assert(currentAuth===0&&parentKind==="metamask-delegated"&&(tx.authorizationList==null||tx.authorizationList.length===0));
  // Delegate is executed after EIP-7702 authorization processing and has no upgrade/configuration setter.
  for(const log of r.logs)assert(!log.removed&&log.blockNumber===r.blockNumber&&same(log.blockHash,r.blockHash)&&same(log.transactionHash,r.transactionHash));
  if(r.status==="success")verifyMetaMaskEvents(profile,tx,r);
  else assert(r.status==="reverted"&&r.logs.length===0);
  return {executionModel:"metamask-delegation" as const,gasPayer:tx.from as Address,profile};
}
