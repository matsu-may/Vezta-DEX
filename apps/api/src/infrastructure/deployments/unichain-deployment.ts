import { createHash } from "node:crypto";
import { keccak256, stringToHex } from "viem";
import { assertTestnetRouterCompiler, verifyCompiledRuntime, type TestnetSwapDependencyRole } from "../../tooling/compiler/testnet-router-rebuild";

// Official Uniswap v3 Unichain Sepolia mapping; RPC getters and constructor
// evidence recorded in the chain-specific qualification report. No execution gate.
export const UNICHAIN_DEPLOYMENTS = Object.freeze({
  chainId:1301, router:"0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166",
  quoter:"0x6Dd37329A1A225a6Fca658265D460423DCafBF89", factory:"0x1F98431c8aD98523631AE4a59f267346ea31F984",
  pool:"0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e", manager:"0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075",
  usdc:"0x31d0220469e10c4E71834a79b1f276d740d3768F", weth:"0x4200000000000000000000000000000000000006",
  factoryV2:"0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f", descriptor:"0xA1fd590f980b12039F3EbDfbC960b8AB82C820dd",
} as const);
const C=UNICHAIN_DEPLOYMENTS;
const roleInfo = {
  router:{target:"contracts/SwapRouter02.sol",name:"SwapRouter02",runs:1000000},
  quoter:{target:"contracts/lens/QuoterV2.sol",name:"QuoterV2",runs:1000000},
  factory:{target:"contracts/UniswapV3Factory.sol",name:"UniswapV3Factory",runs:800},
  pool:{target:"contracts/UniswapV3Pool.sol",name:"UniswapV3Pool",runs:800},
  manager:{target:"contracts/NonfungiblePositionManager.sol",name:"NonfungiblePositionManager",runs:2000},
} as const;
const check=(v:unknown):void=>{if(!v)throw new Error("UNICHAIN_DEPLOYMENT_INVALID");};
function object(v:unknown):Record<string,unknown>{check(v!==null&&typeof v==="object"&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype);return v as Record<string,unknown>;}
const same=(a:unknown,b:string)=>typeof a==="string"&&a.toLowerCase()===b.toLowerCase();
function sourcePath(v:unknown):string{check(typeof v==="string"&&v.length>0&&v.length<=512&&!v.includes("\0")&&!["__proto__","constructor","prototype"].includes(v));return v as string;}
function bindings(role:TestnetSwapDependencyRole):Record<string,{type:string;word:string}>{
  const addr=(v:string)=>({type:"address",word:v.slice(2).toLowerCase().padStart(64,"0")});
  const numeric=(type:string,v:bigint)=>({type,word:v.toString(16).padStart(64,"0")});
  if(role==="factory")return {"contracts/NoDelegateCall.sol:NoDelegateCall:original":addr(C.factory)};
  if(role==="pool"){
    const p="contracts/UniswapV3Pool.sol:UniswapV3Pool";
    return {"contracts/NoDelegateCall.sol:NoDelegateCall:original":addr(C.pool),[`${p}:factory`]:addr(C.factory),
      [`${p}:token0`]:addr(C.usdc),[`${p}:token1`]:addr(C.weth),[`${p}:fee`]:numeric("uint24",3000n),
      [`${p}:tickSpacing`]:numeric("int24",60n),[`${p}:maxLiquidityPerTick`]:numeric("uint128",((1n<<128n)-1n)/BigInt(2*Math.trunc(887272/60)+1))};
  }
  if(role==="manager")return {
    "contracts/NonfungiblePositionManager.sol:NonfungiblePositionManager:_tokenDescriptor":addr(C.descriptor),
    "contracts/base/ERC721Permit.sol:ERC721Permit:nameHash":{type:"bytes32",word:keccak256(stringToHex("Uniswap V3 Positions NFT-V1")).slice(2)},
    "contracts/base/ERC721Permit.sol:ERC721Permit:versionHash":{type:"bytes32",word:keccak256(stringToHex("1")).slice(2)},
    "contracts/base/PeripheryImmutableState.sol:PeripheryImmutableState:factory":addr(C.factory),
    "contracts/base/PeripheryImmutableState.sol:PeripheryImmutableState:WETH9":addr(C.weth)};
  const p=role==="quoter" ? "contracts/base/PeripheryImmutableState.sol:PeripheryImmutableState" : "@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol:PeripheryImmutableState";
  return {[`${p}:factory`]:addr(C.factory),[`${p}:WETH9`]:addr(C.weth),...(role==="router"?{
    "contracts/base/ImmutableState.sol:ImmutableState:factoryV2":addr(C.factoryV2),
    "contracts/base/ImmutableState.sol:ImmutableState:positionManager":addr(C.manager)}:{})};
}
export function prepareUnichainDeployment(role:TestnetSwapDependencyRole,raw:unknown,snapshot:unknown){
  check(Object.hasOwn(roleInfo,role));const info=roleInfo[role],s=object(snapshot),r=object(raw);
  check(s.chainId===1301&&same(s.address,C[role])&&typeof s.blockNumber==="string"&&/^[1-9][0-9]{0,77}$/.test(s.blockNumber)
    &&BigInt(s.blockNumber)<2n**256n&&typeof s.blockHash==="string"&&/^0x[0-9a-fA-F]{64}$/.test(s.blockHash)&&BigInt(s.blockHash)>0n
    &&typeof s.code==="string"&&/^0x(?:[0-9a-fA-F]{2})+$/.test(s.code)&&s.code.length<=131074);
  const sources:Record<string,{content:string}>={};let bytes=0;
  const add=(path:unknown,content:unknown)=>{const p=sourcePath(path);check(typeof content==="string"&&!Object.hasOwn(sources,p));
    bytes+=Buffer.byteLength(content as string);check(bytes<=4000000);sources[p]={content:content as string};};
  let settings:Record<string,unknown>;
  if(role==="factory"&&r.stdJsonInput){
    check([1301,"1301"].includes(r.chainId as number|string)&&same(r.address,C.factory)&&["match","exact_match"].includes(r.runtimeMatch as string));
    const metadata=object(r.metadata);check(object(metadata.compiler).version==="0.7.6+commit.7338295f");
    check(JSON.stringify(object(object(metadata.settings).compilationTarget))===JSON.stringify({[info.target]:info.name}));
    const input=object(r.stdJsonInput),all=object(input.sources),hashes=object(metadata.sources);settings=object(input.settings);
    for(const [p,h] of Object.entries(hashes)){const content=object(all[p]).content;add(p,content);check(object(h).keccak256===keccak256(stringToHex(content as string)));}
  }else{
    check(r.is_verified===true&&r.compiler_version==="v0.7.6+commit.7338295f"&&r.name===info.name&&r.file_path===info.target);
    settings=object(r.compiler_settings);add(r.file_path,r.source_code);
    check(Array.isArray(r.additional_sources)&&r.additional_sources.length<=400);
    for(const row of r.additional_sources as unknown[]){const f=object(row);add(f.file_path,f.source_code);}
  }
  check(Object.hasOwn(sources,info.target)&&Object.keys(sources).length<=400);
  const optimizer=object(settings.optimizer),metadata=object(settings.metadata),libraries=object(settings.libraries??{});
  check(optimizer.enabled===true&&optimizer.runs===info.runs&&metadata.bytecodeHash==="none"&&Object.keys(libraries).length===0
    &&(settings.evmVersion===undefined||settings.evmVersion==="istanbul")
    &&(settings.remappings===undefined||(Array.isArray(settings.remappings)&&settings.remappings.length===0))
    &&Object.keys(settings).every(k=>["optimizer","metadata","libraries","evmVersion","remappings","outputSelection"].includes(k)));
  const input={language:"Solidity",sources,settings:{optimizer:{enabled:true,runs:info.runs},evmVersion:"istanbul",metadata:{bytecodeHash:"none"},libraries:{},remappings:[],
    outputSelection:{"*":{"": ["ast"]},[info.target]:{[info.name]:["metadata","evm.bytecode","evm.deployedBytecode"]}}}};
  const summary={chainId:1301,role,address:C[role],compilerVersion:"0.7.6+commit.7338295f",blockNumber:s.blockNumber,blockHash:s.blockHash,
    sourceCount:Object.keys(sources).length,inputSha256:createHash("sha256").update(JSON.stringify(input)).digest("hex")};
  return {role,input,summary,onchainCode:s.code as string};
}
export function verifyUnichainDeployment(prepared:ReturnType<typeof prepareUnichainDeployment>,output:unknown,version:unknown,compilerHash:unknown){
  assertTestnetRouterCompiler(version,compilerHash);
  const info=roleInfo[prepared.role],out=object(output);
  const contract=object(object(object(out.contracts)[info.target])[info.name]);const metadata=object(JSON.parse(contract.metadata as string));
  const hashes=object(metadata.sources);check(Object.hasOwn(hashes,info.target)&&Object.keys(hashes).length>0);
  const expectedHashes:Record<string,{keccak256:string}>={};
  for(const p of Object.keys(hashes)){check(Object.hasOwn(prepared.input.sources,p));expectedHashes[p]={keccak256:keccak256(stringToHex(prepared.input.sources[p].content))};}
  return verifyCompiledRuntime(prepared.role,{target:info.target,name:info.name,optimizerRuns:info.runs,immutables:bindings(prepared.role),
    configuration:{chainId:1301,address:C[prepared.role],factoryV3:C.factory,weth:C.weth}},
    {...prepared,payload:{metadata:{sources:expectedHashes}}},output,version,prepared.onchainCode);
}
