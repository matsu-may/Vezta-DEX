import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, erc20Abi, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, inspectTestnetLpTransaction,
  parseTestnetLpStudy, testnetLpStudyRequestSchema, testnetLpRecheckRequestSchema,
  type TestnetLpIntent, type TestnetLpPlan, type TestnetLpStudy, type TestnetLpTransaction } from "@vezta-dex/core";
import { TestnetLpError, lpAssert, lpSdkPool, lpSdkPosition, type BaseSepoliaLpSource, type LpNftState } from "./testnet-lp-position";
import type { BaseSepoliaPreparationSource } from "./testnet-swap-preparation";
import { planTestnetLp } from "./testnet-lp-plan";
import { verifyTestnetRuntimeCodes } from "./testnet-runtime";
import { completeTestnetFeeBudget, planTestnetSourceGas, testnetGasFeeFields, TestnetFeeError } from "./testnet-fees";
import { TestnetLpWalletStore } from "./testnet-lp-wallet-store";
export interface BaseSepoliaLpWalletSource extends BaseSepoliaLpSource, BaseSepoliaPreparationSource {
  simulateTestnetLp(transaction: TestnetLpTransaction, block: bigint): Promise<Hex>;
}
const same = (a:string,b:string) => a.toLowerCase() === b.toLowerCase();
const uint = (v:bigint) => typeof v === "bigint" && v >= 0n && v < 2n**256n;
export const lpStateFingerprint = (v: { pool: {token0:string;token1:string;factory:string;fee:number}; position?: LpNftState; allowances:unknown; nonce:bigint }) => JSON.stringify({pool:{token0:v.pool.token0.toLowerCase(),token1:v.pool.token1.toLowerCase(),factory:v.pool.factory.toLowerCase(),fee:v.pool.fee},position:v.position,allowances:v.allowances,nonce:v.nonce},(_key,value:unknown) => typeof value === "bigint" ? value.toString() : value);
export function inspectLpSimulation(study: TestnetLpStudy,data: Hex): void {
  const p=study.plan,kind=study.actionKind;
  if (kind === "approve" || kind === "reset") {
    lpAssert(data === encodeAbiParameters([{type:"bool"}],[true]),"TESTNET_LP_SIMULATION_FAILED"); return;
  }
  if (kind === "burn") { lpAssert(data === "0x","TESTNET_LP_SIMULATION_FAILED"); return; }
  const params = kind === "mint" ? [{type:"uint256"},{type:"uint128"},{type:"uint256"},{type:"uint256"}] as const
    : kind === "increase" ? [{type:"uint128"},{type:"uint256"},{type:"uint256"}] as const : [{type:"uint256"},{type:"uint256"}] as const;
  const values = decodeAbiParameters(params,data);
  lpAssert(encodeAbiParameters(params,values).toLowerCase() === data.toLowerCase(),"TESTNET_LP_SIMULATION_FAILED");
  const a0=values.at(-2)!,a1=values.at(-1)!;
  if (kind === "mint" || kind === "increase") lpAssert(values[kind === "mint" ? 1 : 0] > 0n
    && (kind !== "mint" || values[0] > 0n) && a0 <= BigInt(p.amount0Desired) && a1 <= BigInt(p.amount1Desired),"TESTNET_LP_SIMULATION_FAILED");
  if (kind !== "collect") lpAssert(a0 >= BigInt(p.amount0Minimum) && a1 >= BigInt(p.amount1Minimum),"TESTNET_LP_SIMULATION_FAILED");
}
export class TestnetLpWallet {
  private busy=false;
  constructor(private readonly createSource:(signal:AbortSignal)=>BaseSepoliaLpWalletSource,
    readonly store=new TestnetLpWalletStore(),private readonly now=Date.now) {}
  private async run<T>(fn:(s:BaseSepoliaLpWalletSource,signal:AbortSignal)=>Promise<T>): Promise<T> {
    lpAssert(!this.busy,"TESTNET_LP_BUSY"); this.busy=true; const controller=new AbortController(); let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await Promise.race([fn(this.createSource(controller.signal),controller.signal),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{controller.abort();reject(new TestnetLpError("TESTNET_LP_TIMEOUT"));},25000);
      })]);
    } catch(error) {
      if(error instanceof TestnetLpError) throw error;
      if(error instanceof TestnetFeeError) throw new TestnetLpError(error.code);
      throw new TestnetLpError("TESTNET_LP_RPC_UNAVAILABLE");
    } finally { clearTimeout(timer);controller.abort();this.busy=false; }
  }
  private async snapshot(s:BaseSepoliaLpWalletSource,i:TestnetLpIntent,signal:AbortSignal) {
    lpAssert(await s.getChainId()===84532,"TESTNET_LP_WRONG_CHAIN"); const b=await s.getLatestBlock();
    const fresh=()=>{ const age=this.now()-Number(b.timestamp)*1000; signal.throwIfAborted(); lpAssert(b.number>0n
      && /^0x[0-9a-fA-F]{64}$/.test(b.hash) && BigInt(b.hash)>0n && Number.isSafeInteger(age) && age >= -10000 && age <120000,"TESTNET_LP_STALE"); }; fresh();
    const addresses=[P.router,C.v3QuoterV2,C.v3Factory,P.pool,C.v3PositionManager];
    const [codes,tokenCodes,walletCode,decimals,poolAddress,spacing,deps,pool,balances,allowances,nonce,pending]=await Promise.all([
      Promise.all(addresses.map(a=>s.getCode(a,b.number))),Promise.all([C.USDC.address,C.WETH.address].map(a=>s.getCode(a,b.number))),s.getCode(i.wallet,b.number),
      Promise.all([C.USDC.address,C.WETH.address].map(a=>s.getDecimals(a,b.number))),s.getPool(3000,b.number),s.getTickSpacing(P.pool,b.number),s.getDependencyConfiguration(b.number),s.getLpPoolState(b.number),
      Promise.all([s.getTokenBalance(C.USDC.address,i.wallet,b.number),s.getTokenBalance(C.WETH.address,i.wallet,b.number),s.getNativeBalance(i.wallet,b.number)]),
      Promise.all([C.USDC.address,C.WETH.address].map(a=>s.getTokenAllowance(a,i.wallet,C.v3PositionManager,b.number))),s.getAccountNonce(i.wallet,b.number),s.getPendingNonce(i.wallet),
    ]);fresh();
    lpAssert(walletCode==="0x","TESTNET_LP_EOA_REQUIRED");
    try { verifyTestnetRuntimeCodes(84532,addresses.map((address,index)=>({address,code:codes[index]}))); }
    catch { throw new TestnetLpError("TESTNET_LP_RUNTIME_MISMATCH"); }
    lpAssert(tokenCodes.every(code=>/^0x(?:[a-fA-F0-9]{2})+$/.test(code)) && decimals[0]===6 && decimals[1]===18
      && same(poolAddress,P.pool) && spacing===60 && same(deps.router.factory,C.v3Factory) && same(deps.router.weth,C.WETH.address)
      && same(deps.router.positionManager,C.v3PositionManager) && same(deps.quoter.factory,C.v3Factory) && same(deps.quoter.weth,C.WETH.address)
      && same(deps.manager.factory,C.v3Factory) && same(deps.manager.weth,C.WETH.address),"TESTNET_LP_CONFIGURATION_INVALID");
    lpSdkPool(pool);lpAssert([...balances,...allowances,nonce,pending].every(uint) && nonce <= BigInt(Number.MAX_SAFE_INTEGER),"TESTNET_LP_STATE_INVALID");
    lpAssert(nonce===pending,"TESTNET_LP_NONCE_CHANGED");
    let position:LpNftState|undefined;
    if(i.kind!=="mint") { const [owner,nft]=await Promise.all([s.getPositionOwner(BigInt(i.tokenId),b.number),s.getPosition(BigInt(i.tokenId),b.number)]);
      lpAssert(same(owner,i.wallet),"TESTNET_LP_OWNER_CHANGED");lpSdkPosition(nft,pool);position=nft; }
    const stable=async()=>{ const [blockHash,endNonce]=await Promise.all([s.getBlockHash(b.number),s.getPendingNonce(i.wallet)]);fresh();
      lpAssert(same(blockHash,b.hash),"TESTNET_LP_BLOCK_CHANGED");lpAssert(endNonce===nonce,"TESTNET_LP_NONCE_CHANGED"); };
    await stable();
    return {b,pool,position,nonce,balances:{USDC:balances[0].toString(),WETH:balances[1].toString(),ETH:balances[2].toString()},
      allowances:{USDC:allowances[0].toString(),WETH:allowances[1].toString()},fresh,stable};
  }
  async study(value:unknown):Promise<TestnetLpStudy> {
    let i:TestnetLpIntent;try{i=testnetLpStudyRequestSchema.parse(value).intent;}catch{throw new TestnetLpError("TESTNET_LP_REQUEST_INVALID");}
    return this.run(async(s,signal)=>{
      const snapshot=await this.snapshot(s,i,signal);const {b,pool,position,nonce,balances,allowances}=snapshot;
      const deadline=(b.timestamp+120n).toString();
      const liquidity=i.kind==="decrease" ? (position!.liquidity*BigInt(i.percentage)/100n).toString():"0";
      const plan:TestnetLpPlan={amount0Cap:"amount0Cap" in i ? i.amount0Cap:"0",amount1Cap:"amount1Cap" in i ? i.amount1Cap:"0",
        amount0Desired:"0",amount1Desired:"0",amount0Minimum:"0",amount1Minimum:"0",liquidity:"0",positionLiquidity:position?.liquidity.toString()??"0",
        storedOwed0:position?.tokensOwed0.toString()??"0",storedOwed1:position?.tokensOwed1.toString()??"0",
        tickLower:position?.tickLower??-887220,tickUpper:position?.tickUpper??887220,deadline:(i.kind==="collect"||i.kind==="burn")?null:deadline};
      let reason:string|null=null;
      if(i.kind==="burn" && (position!.liquidity!==0n||position!.tokensOwed0!==0n||position!.tokensOwed1!==0n)) reason="TESTNET_LP_BURN_BLOCKED";
      if(i.kind==="decrease" && liquidity==="0") reason="TESTNET_LP_LIQUIDITY_LOW";
      if((i.kind==="mint"||i.kind==="increase") && i.amount0Cap==="0" && i.amount1Cap==="0") reason="TESTNET_LP_LIQUIDITY_LOW";
      const base:TestnetLpStudy={contextId:null,intent:i,status:"blocked",reason:reason??"TESTNET_LP_BLOCKED",actionKind:i.kind,approvalToken:null,plan,
        transaction:null,gas:null,balances,allowances,blockNumber:b.number.toString(),blockHash:b.hash,
        observedAt:new Date(Number(b.timestamp)*1000).toISOString(),expiresAt:new Date(Number(b.timestamp+120n)*1000).toISOString(),source:"base-sepolia-rpc",runtimeVerified:true,executionEnabled:false};
      if(reason) return parseTestnetLpStudy(base,this.now());
      const internal={kind:i.kind,wallet:i.wallet,...(i.kind==="mint"?{amount0Cap:i.amount0Cap,amount1Cap:i.amount1Cap,tickLower:-887220,tickUpper:887220,deadline}
        :i.kind==="increase"?{tokenId:i.tokenId,amount0Cap:i.amount0Cap,amount1Cap:i.amount1Cap,deadline}
        :i.kind==="decrease"?{tokenId:i.tokenId,liquidity,deadline}:{tokenId:i.tokenId})};
      const planned=planTestnetLp(internal,{pool,position,actualOwner:i.wallet},Number(b.timestamp),120);
      Object.assign(plan,{amount0Desired:planned.amount0Desired??"0",amount1Desired:planned.amount1Desired??"0",amount0Minimum:planned.amount0Minimum??"0",amount1Minimum:planned.amount1Minimum??"0",liquidity:planned.liquidity??"0"});
      let tx=planned.transaction;
      if(i.kind==="mint"||i.kind==="increase") {
        for(const token of ["USDC","WETH"] as const) {
          const cap=token==="USDC"?i.amount0Cap:i.amount1Cap;if(allowances[token]===cap)continue;
          const reset=allowances[token]!=="0";base.actionKind=reset?"reset":"approve";base.approvalToken=token;
          tx={chainId:84532,from:i.wallet,to:C[token].address,value:"0",data:encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[C.v3PositionManager,reset?0n:BigInt(cap)]})};break;
        }
        if(BigInt(balances.USDC)<BigInt(plan.amount0Desired)||BigInt(balances.WETH)<BigInt(plan.amount1Desired))reason="TESTNET_LP_TOKEN_BALANCE_LOW";
      }
      if(reason)return parseTestnetLpStudy({...base,reason},this.now());
      const estimate=await s.estimateTestnetSwapGas(tx,b.number);snapshot.fresh();
      const gasPlan=await planTestnetSourceGas(s,b.number,estimate,base.approvalToken?"approval":"lp");
      const fees=await s.getAdditionalFees({...tx,...testnetGasFeeFields(gasPlan)},nonce,gasPlan.gasLimit,gasPlan.gasPrice,b.number);snapshot.fresh();
      const gas=completeTestnetFeeBudget(gasPlan,fees);
      if(BigInt(balances.ETH)<BigInt(gas.totalFeeBudget))return parseTestnetLpStudy({...base,gas,reason:"TESTNET_LP_TOTAL_BUDGET_LOW"},this.now());
      const study={...base,status:"prepared" as const,reason:null,contextId:"00".repeat(24),gas,transaction:{...tx,nonce:nonce.toString(),gas:gas.gasLimit,...testnetGasFeeFields(gasPlan)}};
      inspectTestnetLpTransaction(study,this.now());inspectLpSimulation(study,await s.simulateTestnetLp(study.transaction,b.number));
      await snapshot.stable();
      return this.store.issue(study,lpStateFingerprint({pool,position,allowances,nonce}));
    });
  }
  async recheck(value:unknown):Promise<TestnetLpStudy> {
    let id:string;try{id=testnetLpRecheckRequestSchema.parse(value).contextId;}catch{throw new TestnetLpError("TESTNET_LP_REQUEST_INVALID");}
    const context=this.store.read(id);lpAssert(context.originalHash===null,"TESTNET_LP_CONTEXT_ATTEMPTED");
    try{inspectTestnetLpTransaction(context.study,this.now());}catch{throw new TestnetLpError("TESTNET_LP_EXPIRED");}
    return this.run(async(s,signal)=>{
      const original=context.study;const snapshot=await this.snapshot(s,original.intent,signal),{b,pool,position,balances,allowances,nonce}=snapshot;
      lpAssert(b.number>=BigInt(original.blockNumber) && same(await s.getBlockHash(BigInt(original.blockNumber)),original.blockHash),"TESTNET_LP_BLOCK_CHANGED");
      lpAssert(lpStateFingerprint({pool,position,allowances,nonce})===context.state,"TESTNET_LP_STATE_CHANGED");
      const tx=original.transaction!;
      const [estimate,price]=await Promise.all([s.estimateTestnetSwapGas({ ...tx,data:tx.data as Hex },b.number),tx.feeModel==="eip1559"?s.getBlockBaseFee?.(b.number):s.getGasPrice()]);
      lpAssert(typeof estimate === "bigint" && estimate >= 21000n && estimate <= BigInt(tx.gas) && typeof price === "bigint" && price >= 0n && (tx.feeModel==="eip1559"?price+BigInt(tx.maxPriorityFeePerGas!)<=BigInt(tx.maxFeePerGas!):price>0n && price<=BigInt(tx.gasPrice)),"TESTNET_LP_FEES_CHANGED");
      lpAssert(BigInt(balances.ETH) >= BigInt(original.gas!.totalFeeBudget) && BigInt(balances.USDC) >= BigInt(original.plan.amount0Desired) && BigInt(balances.WETH) >= BigInt(original.plan.amount1Desired),"TESTNET_LP_FUNDING_CHANGED");
      const fees=await s.getAdditionalFees({...tx,data:tx.data as Hex},nonce,BigInt(tx.gas),BigInt(tx.gasPrice),b.number);
      completeTestnetFeeBudget({estimatedGas:BigInt(original.gas!.estimatedGas),gasLimit:BigInt(tx.gas),gasPrice:BigInt(tx.gasPrice),...(tx.feeModel==="eip1559"?{feeModel:tx.feeModel,maxFeePerGas:BigInt(tx.maxFeePerGas!),maxPriorityFeePerGas:BigInt(tx.maxPriorityFeePerGas!)}:{})},fees);
      lpAssert(fees.l1FeeUpperBound + fees.operatorFeeUpperBound <= BigInt(original.gas!.totalFeeBudget) - BigInt(original.gas!.l2FeeCeiling),"TESTNET_LP_FEES_CHANGED");
      inspectLpSimulation(original,await s.simulateTestnetLp(tx,b.number));await snapshot.stable();
      lpAssert(this.store.read(id).originalHash===null,"TESTNET_LP_CONTEXT_ATTEMPTED");
      inspectTestnetLpTransaction(original,this.now());return structuredClone(original);
    });
  }
}
