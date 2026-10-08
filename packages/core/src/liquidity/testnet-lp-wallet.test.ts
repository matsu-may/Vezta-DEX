import { encodeFunctionData,erc20Abi } from "viem";
import { expect,it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as C } from "../chains/testnet";
import { testnetLpIntentSchema,testnetLpStudySchema,testnetLpReceiptSchema,inspectTestnetLpTransaction,type TestnetLpStudy,type TestnetLpReceipt } from "./testnet-lp-wallet";
const wallet="0x3333333333333333333333333333333333333333",now=1790800002000,hash=`0x${"ab".repeat(32)}`;
const fixture=():TestnetLpStudy=>({contextId:"ab".repeat(24),intent:{chainId:84532,wallet,kind:"mint",amount0Cap:"1000000",amount1Cap:"1000000000000000"},
  status:"prepared",reason:null,actionKind:"approve",approvalToken:"USDC",plan:{amount0Cap:"1000000",amount1Cap:"1000000000000000",amount0Desired:"900000",amount1Desired:"900000",
    amount0Minimum:"850000",amount1Minimum:"850000",liquidity:"1000",positionLiquidity:"0",storedOwed0:"0",storedOwed1:"0",tickLower:-887220,tickUpper:887220,deadline:"1790800120"},
  transaction:{chainId:84532,from:wallet,to:C.USDC.address,data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[C.v3PositionManager,1000000n]}),value:"0",nonce:"7",gas:"60000",gasPrice:"20000000"},
  gas:{estimatedGas:"50000",gasLimit:"60000",gasPrice:"20000000",l2FeeCeiling:"1200000000000",l1FeeUpperBound:"3000000000",operatorFeeUpperBound:"0",totalFeeBudget:"1206000000000",totalFeeQualified:true,fork:"jovian"},
  balances:{USDC:"1000000",WETH:"1000000000000000",ETH:"1000000000000000000"},allowances:{USDC:"0",WETH:"0"},blockNumber:"123",blockHash:hash,
  observedAt:"2026-09-30T20:26:40.000Z",expiresAt:"2026-09-30T20:28:40.000Z",source:"base-sepolia-rpc",runtimeVerified:true,executionEnabled:false});
// Derive ISO literals from the same explicit fixed timestamp, without altering the review economics.
function study(){const f=fixture();f.observedAt=new Date(1790800000000).toISOString();f.expiresAt=new Date(1790800120000).toISOString();return f;}
it("accepts only bounded chain84532 LP intent fields and exact cap approvals",()=>{
  const f=study();expect(()=>inspectTestnetLpTransaction(f,now)).not.toThrow();
  for(const intent of [{...f.intent,chainId:137},{...f.intent,amount0Cap:"5000001"},{...f.intent,amount1Cap:"50000000000000001"},{...f.intent,recipient:wallet},{...f.intent,kind:"decrease",percentage:75}])expect(testnetLpIntentSchema.safeParse(intent).success).toBe(false);
  f.transaction!.data=encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[C.v3PositionManager,900000n]});expect(()=>inspectTestnetLpTransaction(f,now)).toThrow();
});
it("independently rejects wrong manager, owner, spend, funding and expired deadlines",()=>{
  for(const mutate of [(f:TestnetLpStudy)=>{f.transaction!.from="0x4444444444444444444444444444444444444444";},
    (f:TestnetLpStudy)=>{f.transaction!.to=C.WETH.address;},(f:TestnetLpStudy)=>{f.plan.amount0Desired="1000001";},
    (f:TestnetLpStudy)=>{f.plan.amount0Minimum="1000001";},(f:TestnetLpStudy)=>{f.plan.deadline="1790800121";},
    (f:TestnetLpStudy)=>{f.gas!.totalFeeBudget="1";},(f:TestnetLpStudy)=>{f.balances.ETH="0";}]){
    const f=study();mutate(f);expect(()=>inspectTestnetLpTransaction(f,now)).toThrow();
  }
  expect(()=>inspectTestnetLpTransaction(study(),1790800120000)).toThrow();
});
it("binds receipt block, exact confirmations, diagnostics and verified economics",()=>{
  const receipt:TestnetLpReceipt={contextId:"ab".repeat(24),hash,intent:study().intent,actionKind:"mint",approvalToken:null,chainId:84532,source:"base-sepolia-rpc",observedAt:study().observedAt,
    blockNumber:"126",blockHash:hash,receiptBlockNumber:"125",receiptBlockHash:hash,status:"confirmed",confirmations:"2",diagnostic:null,verified:true,tokenId:"42",amount0:"100",amount1:"200",actualTotalFeeQualified:false,executionEnabled:false};
  expect(testnetLpReceiptSchema.safeParse(receipt).success).toBe(true);
  for(const bad of [{...receipt,receiptBlockHash:null},{...receipt,receiptBlockNumber:"127"},{...receipt,confirmations:"3"},{...receipt,diagnostic:"state-mismatch"},
    {...receipt,status:"unknown",verified:false,receiptBlockNumber:null,receiptBlockHash:null,confirmations:"0"}])expect(testnetLpReceiptSchema.safeParse(bad).success).toBe(false);
});
it("requires complete explicit plan fields and strict study keys",()=>{
  expect(testnetLpStudySchema.safeParse({...study(),rpcUrl:"https://private"}).success).toBe(false);
});

it("validates coupled LP fee descriptors and independently binds the gas budget to the transaction", () => {
  const f = study(); const fees = { feeModel: "eip1559", maxFeePerGas: f.transaction!.gasPrice, maxPriorityFeePerGas: "1000000" };
  Object.assign(f.transaction!, fees); Object.assign(f.gas!, fees);
  expect(() => inspectTestnetLpTransaction(f, now)).not.toThrow();
  expect(testnetLpStudySchema.parse(f).transaction).toMatchObject(fees);
  for (const target of ["gas", "transaction"] as const) {
    const bad = structuredClone(f); Object.assign(bad[target]!, { maxPriorityFeePerGas: "2" });
    expect(testnetLpStudySchema.safeParse(bad).success).toBe(false);
    delete (bad[target] as unknown as Record<string, unknown>).maxPriorityFeePerGas;
    expect(testnetLpStudySchema.safeParse(bad).success).toBe(false);
  }
});

it("binds optional custom mint ranges and preserves legacy full-range intents", () => {
  const f = study(); const range = { tickLower: 199920, tickUpper: 202980 };
  expect(testnetLpIntentSchema.safeParse({ ...f.intent, range }).success).toBe(true);
  Object.assign(f.intent, { range }); Object.assign(f.plan, range);
  expect(() => inspectTestnetLpTransaction(f, now)).not.toThrow();
  f.plan.tickUpper += 60;
  expect(() => inspectTestnetLpTransaction(f, now)).toThrow("Invalid mint range");
  for (const range of [{ tickLower: 0, tickUpper: 0 }, { tickLower: 60, tickUpper: 0 },
    { tickLower: 1, tickUpper: 60 }, { tickLower: 0, tickUpper: 30 }, { tickLower: -887280, tickUpper: 60 }, { tickLower: 0, tickUpper: 887280 }]) {
    expect(testnetLpIntentSchema.safeParse({ ...study().intent, range }).success).toBe(false);
  }
  const legacy = study(); legacy.plan.tickLower = 0;
  expect(() => inspectTestnetLpTransaction(legacy, now)).toThrow("Invalid mint range");
});
