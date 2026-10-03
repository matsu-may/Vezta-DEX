import {expect,it} from "vitest";
import {padHex} from "viem";
import {metamaskFixtureAccount} from "../../../packages/core/src/testnet-metamask.test-helper";
import {verifyMetaMaskExecution} from "./testnet-metamask-execution";
import {wrappedReceiptFixture} from "./testnet-metamask-execution.test-helper";

it("verifies the constrained relayed approval independently of relayer nonce, gas and caps",async()=>{
  const f=await wrappedReceiptFixture();expect(await verifyMetaMaskExecution(f.source,f.tx,f.receipt,f.expected)).toMatchObject({executionModel:"metamask-delegation",gasPayer:f.tx.from});
});
it("rejects changed authorizations, ambiguous execution-time state and missing one-use event",async()=>{
  for(const change of ["auth","nonce","code","sameblock","counter","fee"]) {
    const f=await wrappedReceiptFixture();
    if(change==="auth")f.tx.authorizationList=[await metamaskFixtureAccount.signAuthorization({contractAddress:"0x1111111111111111111111111111111111111111",chainId:84532,nonce:7})];
    if(change==="nonce")f.source.getAccountNonce=async()=>8n;
    if(change==="code")f.source.getCode=async()=>"0x";
    if(change==="sameblock")f.source.getBlockTransactions=async()=>[f.tx,{...f.tx,hash:padHex("0x99",{size:32})}];
    if(change==="counter")f.receipt.logs.shift();
    if(change==="fee")f.receipt.effectiveGasPrice=10000000n;
    await expect(verifyMetaMaskExecution(f.source,f.tx,f.receipt,f.expected)).rejects.toThrow();
  }
});
it("supports subsequent relayed type2 only with a proven parent delegation",async()=>{
  const f=await wrappedReceiptFixture();f.tx.type="eip1559";f.tx.authorizationList=[];
  const get=f.source.getCode;f.source.getCode=(a,b)=>get(a,a.toLowerCase()===f.f.owner.toLowerCase()?124n:b);
  expect(await verifyMetaMaskExecution(f.source,f.tx,f.receipt,f.expected)).toMatchObject({executionModel:"metamask-delegation"});
});
it("accepts RPC authorization scalars encoded as unpadded hex quantities without changing their signed value",async()=>{
  const f=await wrappedReceiptFixture();
  const {TESTNET_METAMASK:M}=await import("@vezta-dex/core");
  for(let nonce=0;nonce<100;nonce++){
    const auth=await metamaskFixtureAccount.signAuthorization({contractAddress:M.delegate,chainId:84532,nonce});
    if(!auth.s.startsWith("0x0")&&!auth.r.startsWith("0x0"))continue;
    auth.s=`0x${auth.s.slice(2).replace(/^0+/,"")}`;auth.r=`0x${auth.r.slice(2).replace(/^0+/,"")}`;
    f.tx.authorizationList=[auth];f.source.getAccountNonce=async()=>BigInt(nonce);f.expected.nonce=String(nonce);
    expect(await verifyMetaMaskExecution(f.source,f.tx,f.receipt,f.expected)).toMatchObject({executionModel:"metamask-delegation"});return;
  }
  throw Error("Fixture did not produce a scalar with a leading zero");
});
