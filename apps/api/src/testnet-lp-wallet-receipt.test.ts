import { encodeAbiParameters,encodeEventTopics,parseAbi,type Hex,type Address } from "viem";
import { expect,it } from "vitest";
import { BASE_SEPOLIA_CANDIDATE as C,TESTNET_SWAP_POLICY as P } from "@vezta-dex/core";
import { TestnetLpWalletReceiptReader,type BaseSepoliaLpReceiptSource } from "./testnet-lp-wallet-receipt";
import { testnetLpWalletFixture } from "./testnet-lp-wallet.test-helper";
import type { TestnetObservedReceipt,TestnetObservedTransaction } from "./testnet-receipt";
const events=parseAbi([
  "event IncreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event DecreaseLiquidity(uint256 indexed tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
  "event Collect(uint256 indexed tokenId,address recipient,uint256 amount0,uint256 amount1)",
  "event Transfer(address indexed from,address indexed to,uint256 indexed tokenId)",
  "event Approval(address indexed owner,address indexed approved,uint256 indexed tokenId)",
]);
const poolEvents=parseAbi([
  "event Mint(address sender,address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)",
  "event Burn(address indexed owner,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount,uint256 amount0,uint256 amount1)",
  "event Collect(address indexed owner,address recipient,int24 indexed tickLower,int24 indexed tickUpper,uint128 amount0,uint128 amount1)",
]);
const erc20=parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)","event Approval(address indexed owner,address indexed spender,uint256 value)"]);
const hash=`0x${"cc".repeat(32)}` as Hex,rhash=`0x${"dd".repeat(32)}` as Hex,hhash=`0x${"ee".repeat(32)}` as Hex,zero="0x0000000000000000000000000000000000000000";
async function fixture(kind:"mint"|"increase"|"decrease"|"collect"|"burn"|"approve"|"reset",eip1559=false,wallet?:Address) {
  const f=await testnetLpWalletFixture(kind,wallet),p=f.study.plan,t=f.study.transaction!,logs:TestnetObservedReceipt["logs"]=[];
  const log=(address:string,topics:ReturnType<typeof encodeEventTopics>,data:Hex)=>logs.push({address,topics:topics as Hex[],data,blockNumber:125n,blockHash:rhash,transactionHash:hash});
  const liquidity=kind==="decrease"?BigInt(p.liquidity):1000n;
  const amount0=kind==="collect"?5n:BigInt(kind==="decrease"?p.amount0Minimum:p.amount0Desired),amount1=kind==="collect"?7n:BigInt(kind==="decrease"?p.amount1Minimum:p.amount1Desired);
  const tokenTransfer=(token:Hex,from:Hex,to:Hex,value:bigint)=>{if(value>0n)log(token,encodeEventTopics({abi:erc20,eventName:"Transfer",args:{from,to}}),encodeAbiParameters([{type:"uint256"}],[value]));};
  if(kind==="approve"||kind==="reset"){
    const cap=kind==="reset"?0n:BigInt(p.amount0Cap);
    log(C.USDC.address,encodeEventTopics({abi:erc20,eventName:"Approval",args:{owner:f.study.intent.wallet,spender:C.v3PositionManager}}),encodeAbiParameters([{type:"uint256"}],[cap]));
  }else if(kind==="burn"){
    log(C.v3PositionManager,encodeEventTopics({abi:events,eventName:"Approval",args:{owner:f.study.intent.wallet,approved:zero,tokenId:42n}}),"0x");
    log(C.v3PositionManager,encodeEventTopics({abi:events,eventName:"Transfer",args:{from:f.study.intent.wallet,to:zero,tokenId:42n}}),"0x");
  }else{
    if(kind==="mint")log(C.v3PositionManager,encodeEventTopics({abi:events,eventName:"Transfer",args:{from:zero,to:f.study.intent.wallet,tokenId:42n}}),"0x");
    if(kind==="collect"){
      log(C.v3PositionManager,encodeEventTopics({abi:events,eventName:"Collect",args:{tokenId:42n}}),encodeAbiParameters([{type:"address"},{type:"uint256"},{type:"uint256"}],[f.study.intent.wallet,amount0,amount1]));
      log(P.pool,encodeEventTopics({abi:poolEvents,eventName:"Collect",args:{owner:C.v3PositionManager,tickLower:p.tickLower,tickUpper:p.tickUpper}}),encodeAbiParameters([{type:"address"},{type:"uint128"},{type:"uint128"}],[f.study.intent.wallet,amount0-1n,amount1-1n]));
      tokenTransfer(C.USDC.address,P.pool,f.study.intent.wallet,amount0-1n);tokenTransfer(C.WETH.address,P.pool,f.study.intent.wallet,amount1-1n);
    }else{
      log(C.v3PositionManager,encodeEventTopics({abi:events,eventName:kind==="decrease"?"DecreaseLiquidity":"IncreaseLiquidity",args:{tokenId:42n}}),encodeAbiParameters([{type:"uint128"},{type:"uint256"},{type:"uint256"}],[liquidity,amount0,amount1]));
      log(P.pool,encodeEventTopics({abi:poolEvents,eventName:kind==="decrease"?"Burn":"Mint",args:{owner:C.v3PositionManager,tickLower:p.tickLower,tickUpper:p.tickUpper}}),
        kind==="decrease"?encodeAbiParameters([{type:"uint128"},{type:"uint256"},{type:"uint256"}],[liquidity,amount0,amount1]):encodeAbiParameters([{type:"address"},{type:"uint128"},{type:"uint256"},{type:"uint256"}],[C.v3PositionManager,liquidity,amount0,amount1]));
      if(kind!=="decrease"){tokenTransfer(C.USDC.address,f.study.intent.wallet,P.pool,amount0);tokenTransfer(C.WETH.address,f.study.intent.wallet,P.pool,amount1);}
    }
  }
  if(eip1559){
    Object.assign(t,{feeModel:"eip1559",maxFeePerGas:t.gasPrice,maxPriorityFeePerGas:"1000000"});
    Object.assign(f.study.gas!,{feeModel:"eip1559",maxFeePerGas:t.gasPrice,maxPriorityFeePerGas:"1000000"});
    const context=f.store.read(f.study.contextId!);
    const issued=f.store.issue(f.study,context.state);Object.assign(f.study,issued);
  }
  const tx:TestnetObservedTransaction={hash,type:eip1559?"eip1559":"legacy",...(eip1559?{maxFeePerGas:BigInt(t.gasPrice),maxPriorityFeePerGas:1000000n,accessList:[]}:{}),chainId:84532,from:t.from,to:t.to,input:t.data as Hex,value:0n,nonce:Number(t.nonce),gas:BigInt(t.gas),gasPrice:BigInt(t.gasPrice),blockNumber:125n,blockHash:rhash};
  const receipt:TestnetObservedReceipt={transactionHash:hash,from:t.from,to:t.to,blockNumber:125n,blockHash:rhash,status:"success",gasUsed:100000n,effectiveGasPrice:eip1559?6000000n:BigInt(t.gasPrice),logs};
  const source:BaseSepoliaLpReceiptSource={...f.source,async getBlockBaseFee(block){expect(block).toBe(125n);return 5000000n;},async getLatestBlock(){return {number:126n,timestamp:1790800004n,hash:hhash};},
    async getBlockHash(block){return block===125n?rhash:block===126n?hhash:f.study.blockHash as Hex;},async getTransaction(){return tx;},async getReceipt(){return receipt;},
    async getPositionOwnerOrNull(){return kind==="burn"?null:f.study.intent.wallet;},
    async getTokenAllowance(token){return kind==="reset"?0n:token.toLowerCase()===C.USDC.address.toLowerCase()?BigInt(p.amount0Cap):BigInt(p.amount1Cap);},
    async getPosition(){const before=await f.source.getPosition(42n,123n);return {...before,tickLower:p.tickLower,tickUpper:p.tickUpper,
      liquidity:kind==="mint"||kind==="increase"?BigInt(p.positionLiquidity)+liquidity:kind==="decrease"?BigInt(p.positionLiquidity)-liquidity:BigInt(p.positionLiquidity),
      tokensOwed0:kind==="decrease"?BigInt(p.storedOwed0)+amount0:0n,tokensOwed1:kind==="decrease"?BigInt(p.storedOwed1)+amount1:0n};},
  };
  const reader=new TestnetLpWalletReceiptReader(()=>source,f.store,f.clock);const query={contextId:f.study.contextId,hash};return {...f,source,reader,query,tx,receipt};
}
it.each(["mint","increase","decrease","collect","burn","approve","reset"] as const)("qualifies canonical %s receipt and pinned NFT state",async kind=>{
  const f=await fixture(kind);const r=await f.reader.observe(f.query);expect(r).toMatchObject({status:"confirmed",verified:true,confirmations:"2",actualTotalFeeQualified:false});
  if(kind==="collect")expect(r).toMatchObject({amount0:"4",amount1:"6"});
});
it("unknown or mismatched recovery candidates do not bind until the original envelope is verified",async()=>{
  const f=await fixture("mint"),candidate=`0x${"ff".repeat(32)}`;
  f.source.getTransaction=async()=>null;f.source.getReceipt=async()=>null;
  expect(await f.reader.observe({...f.query,hash:candidate})).toMatchObject({status:"unknown",verified:false});
  expect(f.store.read(f.study.contextId!).originalHash).toBeNull();
  f.source.getTransaction=async()=>({...f.tx,input:"0x1234"});
  expect(await f.reader.observe(f.query)).toMatchObject({status:"unverified",diagnostic:"transaction-mismatch"});
  expect(f.store.read(f.study.contextId!).originalHash).toBeNull();
  f.source.getTransaction=async()=>f.tx;f.source.getReceipt=async()=>f.receipt;
  expect(await f.reader.observe(f.query)).toMatchObject({status:"confirmed",verified:true});
  expect(f.store.read(f.study.contextId!).originalHash).toBe(f.query.hash);
  await expect(f.reader.observe({...f.query,hash:candidate})).rejects.toThrow("TESTNET_LP_CONTEXT_HASH_CHANGED");
  await expect(f.api.recheck({contextId:f.study.contextId})).rejects.toThrow("TESTNET_LP_CONTEXT_ATTEMPTED");
});
it("keeps mismatched transaction/event/NFT state and reorgs unverified",async()=>{
  for(const mutation of ["calldata","removed","paid","nft","reorg"]){
    const f=await fixture("collect");
    if(mutation==="calldata")f.tx.input="0x1234";
    if(mutation==="removed")f.receipt.logs[0].removed=true;
    if(mutation==="paid")f.receipt.logs.pop();
    if(mutation==="nft"){const old=f.source.getPosition;f.source.getPosition=async(...a)=>({...await old(...a),tokensOwed0:1n});}
    if(mutation==="reorg")f.source.getBlockHash=async()=>hhash;
    const r=await f.reader.observe(f.query);expect(r.verified).toBe(false);expect(r.status).toBe(mutation==="reorg"?"reorged":"unverified");
  }
});
it("requires two confirmations and verifies canonical reverted receipts",async()=>{
  const f=await fixture("mint");f.source.getLatestBlock=async()=>({number:125n,timestamp:1790800004n,hash:rhash});
  expect(await f.reader.observe(f.query)).toMatchObject({status:"confirming",verified:false,confirmations:"1"});
  f.source.getLatestBlock=async()=>({number:126n,timestamp:1790800004n,hash:hhash});f.receipt.status="reverted";f.receipt.logs=[];
  expect(await f.reader.observe(f.query)).toMatchObject({status:"reverted",verified:true,amount0:"0",amount1:"0"});
});

it("verifies type-2 LP lifecycle and cap-bound receipt fees",async()=>{
  for(const kind of ["approve","reset","mint","increase","decrease","collect","burn"] as const){
    const f=await fixture(kind,true);
    expect(await f.reader.observe(f.query)).toMatchObject({status:"confirmed",verified:true});
    f.receipt.effectiveGasPrice=BigInt(f.study.transaction!.gasPrice);
    expect(await f.reader.observe(f.query)).toMatchObject({status:"unverified",diagnostic:"receipt-mismatch",verified:false});
  }
});

// The exact same LP economics must hold when MetaMask relays the reviewed inner call.
async function delegatedFixture(kind: "approve"|"mint"|"increase"|"decrease"|"collect"|"burn") {
  const {metamaskFixtureAccount}=await import("../../../packages/core/src/testnet-metamask.test-helper");
  const {wrappedReceiptFixture}=await import("./testnet-metamask-execution.test-helper");
  const {TESTNET_METAMASK:M}=await import("@vezta-dex/core");
  const f=await fixture(kind,false,metamaskFixtureAccount.address),t=f.study.transaction!;
  const w=await wrappedReceiptFixture({to:t.to as Hex,value:t.value,data:t.data as Hex},125n);
  w.tx.hash=hash;w.tx.blockHash=rhash;w.receipt.transactionHash=hash;w.receipt.blockHash=rhash;
  w.receipt.logs=w.receipt.logs.map(l=>({...l,blockHash:rhash,transactionHash:hash}));
  w.receipt.logs.push(...f.receipt.logs);
  const originalCode=f.source.getCode;
  f.source.getCode=(a,b)=>a.toLowerCase()===metamaskFixtureAccount.address.toLowerCase()||Object.values(M).some(v=>typeof v==="string"&&v.toLowerCase()===a.toLowerCase())?w.source.getCode(a,b):originalCode(a,b);
  f.source.getTransaction=async()=>w.tx;f.source.getReceipt=async()=>w.receipt;
  f.source.getBlockTransactions=async()=>[w.tx];f.source.getBlockBaseFee=async()=>5000000n;
  return { f, w };
}
it.each(["approve","mint","increase","decrease","collect","burn"] as const)("qualifies constrained delegated %s without substituting relayer identity for NFT owner",async kind=>{
  const { f, w } = await delegatedFixture(kind);
  expect(await f.reader.observe(f.query)).toMatchObject({status:"confirmed",verified:true,executionModel:"metamask-delegation",gasPayer:w.tx.from,l2GasCost:"1200000000000"});
});

it.each(["valid", "malformed"])("keeps a %s pending LP manager candidate unverified and unbound", async kind => {
  const { f, w } = await delegatedFixture("approve");
  f.source.getTransaction = async () => ({ ...w.tx, input: kind === "malformed" ? "0x1234" : w.tx.input, blockNumber: null, blockHash: null });
  f.source.getReceipt = async () => null;
  expect(await f.reader.observe(f.query)).toMatchObject({ status: "unverified", verified: false });
  expect(f.store.read(f.study.contextId!).originalHash).toBeNull();
});

it("rejects an old same-call LP approval without poisoning the original hash", async () => {
  const { f, w } = await delegatedFixture("approve");
  w.tx.type = "eip1559"; w.tx.authorizationList = [];
  const { TESTNET_METAMASK: M } = await import("@vezta-dex/core");
  const getCode = f.source.getCode;
  f.source.getCode = (address, block) => address.toLowerCase() === w.f.owner.toLowerCase()
    ? Promise.resolve(`0xef0100${M.delegate.slice(2)}` as Hex) : getCode(address, block);
  const getBlockHash = f.source.getBlockHash;
  f.source.getBlockHash = block => block === 122n ? Promise.resolve(rhash) : getBlockHash(block);
  w.tx.blockNumber = 122n; w.receipt.blockNumber = 122n;
  for (const log of w.receipt.logs) log.blockNumber = 122n;
  expect(await f.reader.observe(f.query)).toMatchObject({ status: "unverified", diagnostic: "receipt-mismatch" });
  expect(f.store.read(f.study.contextId!).originalHash).toBeNull();
  const correctHash = `0x${"77".repeat(32)}` as Hex;
  w.tx.hash = correctHash; w.receipt.transactionHash = correctHash;
  w.tx.blockNumber = 125n; w.receipt.blockNumber = 125n;
  for (const log of w.receipt.logs) { log.blockNumber = 125n; log.transactionHash = correctHash; }
  expect(await f.reader.observe({ ...f.query, hash: correctHash })).toMatchObject({ status: "confirmed", verified: true });
  expect(f.store.read(f.study.contextId!).originalHash).toBe(correctHash);
});
