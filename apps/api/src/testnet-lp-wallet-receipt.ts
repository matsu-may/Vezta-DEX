import { matchesTestnetFeeEnvelope, matchesTestnetReceiptGasPrice } from "./testnet-transaction-envelope";
import { verifyMetaMaskExecution } from "./testnet-metamask-execution";
import { verifyTestnetMetaMaskRuntime } from "./testnet-metamask-runtime";
import { decodeEventLog, erc20Abi, parseAbi, type Hex } from "viem";
import { createTestnetLpDomain, testnetChainConfig, testnetLpReceiptRequestSchema,
  TESTNET_METAMASK as M, classifyTestnetWalletCode, type TestnetChainId, type TestnetChainLpReceipt, type TestnetChainLpStudy } from "@vezta-dex/core";
import type { BaseSepoliaReceiptSource, TestnetObservedReceipt } from "./testnet-receipt";
import { TestnetLpError, lpAssert, lpSdkPosition, type BaseSepoliaLpSource } from "./testnet-lp-position";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
import type { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
const managerEvents=parseAbi([
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
const same=(a:string|null|undefined,b:string)=>typeof a==="string"&&a.toLowerCase()===b.toLowerCase();
const zero="0x0000000000000000000000000000000000000000";
const uint=(v:bigint)=>typeof v==="bigint"&&v>=0n&&v<2n**256n;
export interface BaseSepoliaLpReceiptSource extends BaseSepoliaReceiptSource,BaseSepoliaLpSource {
  getPositionOwnerOrNull(id:bigint,block:bigint):Promise<`0x${string}`|null>;
}
interface ParsedEvent { eventName:string; args:Record<string,string|bigint|number> }
function reviewEvents(study:TestnetChainLpStudy,r:TestnetObservedReceipt) {
  const config=testnetChainConfig(study.intent.chainId),C=config.candidate,P=config.policy;
  const manager:ParsedEvent[]=[],pool:ParsedEvent[]=[],transfers:{token:"USDC"|"WETH";from:string;to:string;value:bigint}[]=[],approvals:ParsedEvent[]=[];
  for(const l of r.logs) {
    lpAssert(!l.removed&&l.blockNumber===r.blockNumber&&same(l.blockHash,r.blockHash)&&same(l.transactionHash,r.transactionHash),"TESTNET_LP_EVENT_INVALID");
    if(same(l.address,C.v3PositionManager)||same(l.address,P.pool)) {
      const abi=same(l.address,C.v3PositionManager)?managerEvents:poolEvents;
      let e:ParsedEvent;
      try{e=decodeEventLog({abi,data:l.data,topics:l.topics as [Hex,...Hex[]],strict:true}) as ParsedEvent;}
      catch{throw new TestnetLpError("TESTNET_LP_EVENT_INVALID");}
      (same(l.address,C.v3PositionManager)?manager:pool).push(e);
    } else {
      const token=same(l.address,C.USDC.address)?"USDC":same(l.address,C.WETH.address)?"WETH":null;if(!token)continue;
      lpAssert(l.topics.length===3&&l.topics.slice(1).every(v=>/^0x0{24}[a-fA-F0-9]{40}$/.test(v))&&/^0x[a-fA-F0-9]{64}$/.test(l.data),"TESTNET_LP_EVENT_INVALID");
      const e=decodeEventLog({abi:erc20Abi,data:l.data,topics:l.topics as [Hex,...Hex[]],strict:true});
      if(e.eventName==="Transfer")transfers.push({token,...e.args});
      else if(e.eventName==="Approval")approvals.push({eventName:token,args:e.args});
      else throw new TestnetLpError("TESTNET_LP_EVENT_INVALID");
    }
  }
  const i=study.intent,p=study.plan,kind=study.actionKind;
  let tokenId="tokenId" in i?i.tokenId:null;
  const nftTransfers=manager.filter(e=>e.eventName==="Transfer");
  if(kind==="approve"||kind==="reset") {
    const token=study.approvalToken!;lpAssert(manager.length===0&&pool.length===0&&transfers.length===0&&approvals.length===1,"TESTNET_LP_EVENT_INVALID");
    const e=approvals[0];const cap=token==="USDC"?p.amount0Cap:p.amount1Cap;
    lpAssert(e.eventName===token&&same(e.args.owner as string,i.wallet)&&same(e.args.spender as string,C.v3PositionManager)
      &&e.args.value===BigInt(kind==="reset"?"0":cap),"TESTNET_LP_EVENT_INVALID");
    return {tokenId,amount0:0n,amount1:0n,liquidity:0n};
  }
  if(kind==="burn") {
    const cleared = manager.filter(e=>e.eventName==="Approval");
    lpAssert(manager.length===2&&cleared.length===1&&nftTransfers.length===1&&pool.length===0&&transfers.length===0&&approvals.length===0,"TESTNET_LP_EVENT_INVALID");
    lpAssert(cleared[0].args.tokenId===BigInt(tokenId!)&&same(cleared[0].args.owner as string,i.wallet)&&same(cleared[0].args.approved as string,zero),"TESTNET_LP_EVENT_INVALID");
    const e=nftTransfers[0].args;lpAssert(e.tokenId===BigInt(tokenId!)&&same(e.from as string,i.wallet)&&same(e.to as string,zero),"TESTNET_LP_EVENT_INVALID");
    return {tokenId,amount0:0n,amount1:0n,liquidity:0n};
  }
  const events=manager.filter(e=>e.eventName!=="Transfer");lpAssert(events.length===1,"TESTNET_LP_EVENT_INVALID");
  const event=events[0],a=event.args;
  if(kind==="mint") {
    lpAssert(typeof a.tokenId==="bigint"&&a.tokenId>0n&&nftTransfers.length===1,"TESTNET_LP_EVENT_INVALID");tokenId=a.tokenId.toString();
    const t=nftTransfers[0].args;lpAssert(t.tokenId===a.tokenId&&same(t.from as string,zero)&&same(t.to as string,i.wallet),"TESTNET_LP_EVENT_INVALID");
  } else lpAssert(nftTransfers.length===0&&a.tokenId===BigInt(tokenId!),"TESTNET_LP_EVENT_INVALID");
  lpAssert(event.eventName===(kind==="collect"?"Collect":kind==="decrease"?"DecreaseLiquidity":"IncreaseLiquidity")&&typeof a.amount0==="bigint"&&typeof a.amount1==="bigint","TESTNET_LP_EVENT_INVALID");
  const amount0=a.amount0 as bigint,amount1=a.amount1 as bigint,liquidity=kind==="collect"?0n:a.liquidity as bigint;
  lpAssert(uint(amount0)&&uint(amount1)&&uint(liquidity),"TESTNET_LP_EVENT_INVALID");
  // collect() with active liquidity can first emit a zero-amount pool Burn to checkpoint fees.
  const checkpoint=pool.filter(e=>e.eventName==="Burn"&&e.args.amount===0n&&e.args.amount0===0n&&e.args.amount1===0n);
  const expectedPool=pool.filter(e=>!checkpoint.includes(e));
  lpAssert(expectedPool.length===1&&(kind==="collect"?checkpoint.length<=1:checkpoint.length===0),"TESTNET_LP_EVENT_INVALID");
  for(const e of pool)lpAssert(same(e.args.owner as string,C.v3PositionManager)&&e.args.tickLower===p.tickLower&&e.args.tickUpper===p.tickUpper,"TESTNET_LP_EVENT_INVALID");
  const paid=expectedPool[0];lpAssert(paid.eventName===(kind==="collect"?"Collect":kind==="decrease"?"Burn":"Mint"),"TESTNET_LP_EVENT_INVALID");
  let actual0=amount0,actual1=amount1;
  if(kind==="collect") {
    actual0=paid.args.amount0 as bigint;actual1=paid.args.amount1 as bigint;
    lpAssert(same(a.recipient as string,i.wallet)&&same(paid.args.recipient as string,i.wallet)
      &&uint(actual0)&&uint(actual1)&&actual0<=amount0&&actual1<=amount1&&amount0>=BigInt(p.storedOwed0)&&amount1>=BigInt(p.storedOwed1),"TESTNET_LP_EVENT_INVALID");
  } else {
    lpAssert(paid.args.amount===liquidity&&paid.args.amount0===amount0&&paid.args.amount1===amount1&&liquidity>0n,"TESTNET_LP_EVENT_INVALID");
    lpAssert(amount0>=BigInt(p.amount0Minimum)&&amount1>=BigInt(p.amount1Minimum),"TESTNET_LP_EVENT_INVALID");
    if(kind==="decrease")lpAssert(liquidity===BigInt(p.liquidity),"TESTNET_LP_EVENT_INVALID");
    else lpAssert(same(paid.args.sender as string,C.v3PositionManager)&&amount0<=BigInt(p.amount0Desired)&&amount1<=BigInt(p.amount1Desired),"TESTNET_LP_EVENT_INVALID");
  }
  const expectedFrom=kind==="collect"?P.pool:i.wallet,expectedTo=kind==="collect"?i.wallet:P.pool;
  let usdc=0n,weth=0n;
  for(const t of transfers){lpAssert(kind!=="decrease"&&same(t.from,expectedFrom)&&same(t.to,expectedTo),"TESTNET_LP_EVENT_INVALID");if(t.token==="USDC")usdc+=t.value;else weth+=t.value;}
  lpAssert(usdc===(kind==="decrease"?0n:actual0)&&weth===(kind==="decrease"?0n:actual1),"TESTNET_LP_EVENT_INVALID");
  // USDC's transferFrom may emit the remaining allowance. Bind it to caps minus actual spend.
  for(const e of approvals)lpAssert((kind==="mint"||kind==="increase")&&same(e.args.owner as string,i.wallet)&&same(e.args.spender as string,C.v3PositionManager)
    &&e.args.value===BigInt(e.eventName==="USDC"?p.amount0Cap:p.amount1Cap)-(e.eventName==="USDC"?actual0:actual1),"TESTNET_LP_EVENT_INVALID");
  return {tokenId,amount0:actual0,amount1:actual1,liquidity};
}
export class TestnetLpWalletReceiptReader<I extends TestnetChainId = 84532> {
  private readonly domain;
  private readonly config;
  private busy=false;
  constructor(private readonly createSource:(signal:AbortSignal)=>BaseSepoliaLpReceiptSource,private readonly store:TestnetLpWalletStore<I>,private readonly now=Date.now,private readonly chainId:I=84532 as I){
    this.domain=createTestnetLpDomain(chainId);this.config=testnetChainConfig(chainId);
    lpAssert(store.chainId===chainId,"TESTNET_LP_CONTEXT_INVALID");
  }
  async observe(value:unknown):Promise<TestnetChainLpReceipt<I>> {
    let query:ReturnType<typeof testnetLpReceiptRequestSchema.parse>;try{query=testnetLpReceiptRequestSchema.parse(value);}catch{throw new TestnetLpError("TESTNET_LP_REQUEST_INVALID");}
    const c=this.store.read(query.contextId);lpAssert(c.originalHash===null||same(c.originalHash,query.hash),"TESTNET_LP_CONTEXT_HASH_CHANGED");
    lpAssert(!this.busy,"TESTNET_LP_BUSY");this.busy=true;const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{return await Promise.race([this.probe(this.createSource(controller.signal),c.study,query.hash as Hex,controller.signal),new Promise<never>((_,reject)=>{
      timer=setTimeout(()=>{controller.abort();reject(new TestnetLpError("TESTNET_LP_TIMEOUT"));},25000);
    })]);}catch(error){if(error instanceof TestnetLpError)throw error;throw new TestnetLpError("TESTNET_LP_RPC_UNAVAILABLE");}
    finally{clearTimeout(timer);controller.abort();this.busy=false;}
  }
  private async probe(s:BaseSepoliaLpReceiptSource,study:TestnetChainLpStudy<I>,hash:Hex,signal:AbortSignal):Promise<TestnetChainLpReceipt<I>>{
    const C=this.config.candidate,P=this.config.policy;
    lpAssert(await s.getChainId()===this.chainId,"TESTNET_LP_WRONG_CHAIN");const head=await s.getLatestBlock();
    const fresh=()=>{signal.throwIfAborted();this.store.read(study.contextId!);const age=this.now()-Number(head.timestamp)*1000;
      lpAssert(Number.isSafeInteger(age)&&age>=-10000&&age<120000&&head.number>0n&&/^0x[a-fA-F0-9]{64}$/.test(head.hash)&&BigInt(head.hash)>0n,"TESTNET_LP_STALE");};fresh();
    const base:TestnetChainLpReceipt<I>={contextId:study.contextId!,hash,intent:study.intent,actionKind:study.actionKind,approvalToken:study.approvalToken,chainId:this.chainId,
      source:this.config.source,observedAt:new Date(Number(head.timestamp)*1000).toISOString(),blockNumber:head.number.toString(),blockHash:head.hash,
      receiptBlockNumber:null,receiptBlockHash:null,status:"unknown",confirmations:"0",diagnostic:null,verified:false,tokenId:null,amount0:"0",amount1:"0",actualTotalFeeQualified:false,executionEnabled:false};
    const result=(status:TestnetChainLpReceipt<I>["status"],diagnostic:TestnetChainLpReceipt<I>["diagnostic"]=null)=>this.domain.parseTestnetLpReceipt({...base,status,diagnostic},this.now());
    const stable=async()=>{fresh();return same(await s.getBlockHash(head.number),head.hash);};
    const [tx,r]=await Promise.all([s.getTransaction(hash),s.getReceipt(hash)]);fresh();
    if(!tx)return await stable()?result(r?"unverified":"unknown",r?"transaction-unavailable":null):result("reorged");
    const expected=study.transaction!;
    let relay:{executionModel:"metamask-delegation";gasPayer:Hex}|undefined;
    if(same(tx.to,M.manager)&&same(tx.hash,hash)) {
      // Pending manager calldata does not yet prove canonical delegated execution.
      if(!r)return result("unverified");
      if(this.chainId!==84532 || expected.chainId!==84532)return result("unverified","unsupported-transaction-type");
      try{relay=await verifyMetaMaskExecution(s,tx,r,expected);}
      catch{return result("unverified","transaction-mismatch");}
      fresh();
    } else {
      if(tx.type!=="legacy"&&tx.type!=="eip1559")return result("unverified","unsupported-transaction-type");
      if(!same(tx.hash,hash)||tx.chainId!==this.chainId||!same(tx.from,expected.from)||!same(tx.to,expected.to)||!same(tx.input,expected.data)||tx.value!==0n
        ||!Number.isSafeInteger(tx.nonce)||String(tx.nonce)!==expected.nonce||tx.gas!==BigInt(expected.gas)||!matchesTestnetFeeEnvelope(tx,expected))return result("unverified","transaction-mismatch");
    }
    // A typo or unknown candidate cannot poison recovery. Bind only a verified original envelope.
    if(!await stable())return result("reorged");
    if(!r){this.store.bindHash(study.contextId!,hash);return result("pending");}
    const receiptBaseFee=!relay&&expected.feeModel==="eip1559"?await s.getBlockBaseFee?.(r.blockNumber):undefined;fresh();
    if(!same(r.transactionHash,hash)||!same(r.from,relay?tx.from:expected.from)||!same(r.to,relay?M.manager:expected.to)||tx.blockNumber!==r.blockNumber||!same(tx.blockHash,r.blockHash)
      ||r.blockNumber<=BigInt(study.blockNumber)||r.blockNumber>head.number||!/^0x[a-fA-F0-9]{64}$/.test(r.blockHash)||BigInt(r.blockHash)===0n
      ||!uint(r.gasUsed)||r.gasUsed===0n||(!relay&&(r.gasUsed>BigInt(expected.gas)||!matchesTestnetReceiptGasPrice(r.effectiveGasPrice,expected,receiptBaseFee)))||r.logs.length>128)return result("unverified","receipt-mismatch");
    if(!same(await s.getBlockHash(r.blockNumber),r.blockHash)||!await stable())return result("reorged");
    this.store.bindHash(study.contextId!,hash);
    base.receiptBlockNumber=r.blockNumber.toString();base.receiptBlockHash=r.blockHash;base.confirmations=(head.number-r.blockNumber+1n).toString();
    base.l2GasCost=(r.gasUsed*r.effectiveGasPrice).toString();
    if(relay){base.executionModel=relay.executionModel;base.gasPayer=relay.gasPayer;}
    if(BigInt(base.confirmations)<BigInt(this.config.inclusionConfirmations))return result("confirming");
    if(r.status==="reverted") {
      if(r.logs.length!==0)return result("unverified","receipt-mismatch");
      return this.domain.parseTestnetLpReceipt({...base,status:"reverted",verified:true,tokenId:"tokenId" in study.intent ? study.intent.tokenId : null},this.now());
    }
    if(r.status!=="success")return result("unverified","receipt-mismatch");
    let economics:ReturnType<typeof reviewEvents>;
    try{economics=reviewEvents(study,r);}catch{return result("unverified","event-mismatch");}
    try{
      const addresses=[P.router,C.v3QuoterV2,C.v3Factory,P.pool,C.v3PositionManager];
      const [codes,decimals,deps,poolAddress,spacing,walletCode]=await Promise.all([
        Promise.all(addresses.map(a=>s.getCode(a,r.blockNumber))),Promise.all([C.USDC.address,C.WETH.address].map(a=>s.getDecimals(a,r.blockNumber))),
        s.getDependencyConfiguration(r.blockNumber),s.getPool(3000,r.blockNumber),s.getTickSpacing(P.pool,r.blockNumber),s.getCode(study.intent.wallet,r.blockNumber),
      ]);fresh();verifyTestnetRuntimeCodes(this.chainId,addresses.map((address,index)=>({address,code:codes[index]})));
      const walletKind=classifyTestnetWalletCode(walletCode);
      if(walletKind==="metamask-delegated"){lpAssert(this.chainId===84532,"TESTNET_LP_EOA_REQUIRED");await verifyTestnetMetaMaskRuntime(s,r.blockNumber);}
      lpAssert(decimals[0]===6&&decimals[1]===18&&same(poolAddress,P.pool)&&spacing===60
        &&same(deps.manager.factory,C.v3Factory)&&same(deps.manager.weth,C.WETH.address),"TESTNET_LP_STATE_INVALID");
      const kind=study.actionKind,p=study.plan;
      if(kind==="approve"||kind==="reset") {
        const token=study.approvalToken!,cap=token==="USDC"?p.amount0Cap:p.amount1Cap;
        lpAssert(await s.getTokenAllowance(C[token].address,study.intent.wallet,C.v3PositionManager,r.blockNumber)===BigInt(kind==="reset"?"0":cap),"TESTNET_LP_STATE_INVALID");
      }
      if(economics.tokenId!==null) {
        const owner=await s.getPositionOwnerOrNull(BigInt(economics.tokenId),r.blockNumber);
        if(kind==="burn")lpAssert(owner===null,"TESTNET_LP_STATE_INVALID");
        else {
          lpAssert(owner!==null&&same(owner,study.intent.wallet),"TESTNET_LP_STATE_INVALID");
          const [nft,pool]=await Promise.all([s.getPosition(BigInt(economics.tokenId),r.blockNumber),s.getLpPoolState(r.blockNumber)]);lpSdkPosition(nft,pool,this.chainId);
          lpAssert(nft.tickLower===p.tickLower&&nft.tickUpper===p.tickUpper,"TESTNET_LP_STATE_INVALID");
          const before=BigInt(p.positionLiquidity);
          lpAssert(nft.liquidity===(kind==="mint"||kind==="increase"?before+economics.liquidity:kind==="decrease"?before-economics.liquidity:before),"TESTNET_LP_STATE_INVALID");
          if(kind==="decrease")lpAssert(nft.tokensOwed0>=BigInt(p.storedOwed0)+economics.amount0&&nft.tokensOwed1>=BigInt(p.storedOwed1)+economics.amount1,"TESTNET_LP_STATE_INVALID");
          if(kind==="collect")lpAssert(nft.tokensOwed0===0n&&nft.tokensOwed1===0n,"TESTNET_LP_STATE_INVALID");
        }
      }
    }catch{return result("unverified","state-mismatch");}
    if(!same(await s.getBlockHash(r.blockNumber),r.blockHash)||!await stable())return result("reorged");fresh();
    return this.domain.parseTestnetLpReceipt({...base,status:"confirmed",verified:true,tokenId:economics.tokenId,amount0:economics.amount0.toString(),amount1:economics.amount1.toString()},this.now());
  }
}
