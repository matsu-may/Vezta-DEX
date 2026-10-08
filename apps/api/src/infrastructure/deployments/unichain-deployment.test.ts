import { expect, it } from "vitest";
import { keccak256, stringToHex } from "viem";
import { routerRebuildFixture, quoterRebuildFixture } from "../../tooling/compiler/testnet-router-rebuild.test-helper";
const address = "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166";
const words = ["1f98431c8ad98523631ae4a59f267346ea31f984", "4200000000000000000000000000000000000006",
  "5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f", "b7f724d6dddFd008eff5cc2834edde5f9ef0d075".toLowerCase()];
function fixture() {
  const f = routerRebuildFixture();
  const raw = { is_verified: true, compiler_version: "v0.7.6+commit.7338295f", name: "SwapRouter02", file_path: "contracts/SwapRouter02.sol" as const,
    compiler_settings: { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul", metadata: { bytecodeHash: "none" }, libraries: {} },
    source_code: f.value.stdJsonInput.sources["contracts/SwapRouter02.sol"].content,
    additional_sources: Object.entries(f.value.stdJsonInput.sources).filter(([p]) => p !== "contracts/SwapRouter02.sol").map(([file_path,s]) => ({ file_path, source_code:s.content })) };
  const runtime = `0x60${words.map(x=>x.padStart(64,"0")).join("")}01`;
  const snapshot = { chainId:1301,blockNumber:"64442961",blockHash:"0x"+"11".repeat(32),address,code:runtime };
  const output=structuredClone(f.output);
  const metadata=JSON.parse(output.contracts[raw.file_path].SwapRouter02.metadata);
  metadata.sources=Object.fromEntries(Object.entries(f.value.stdJsonInput.sources).map(([p,s])=>[p,{keccak256:keccak256(stringToHex(s.content))}]));
  output.contracts[raw.file_path].SwapRouter02.metadata=JSON.stringify(metadata);
  return { raw,snapshot,output };
}
async function functions() {
  const m=await import("./unichain-deployment").catch(()=>undefined);
  expect(m?.prepareUnichainDeployment).toBeTypeOf("function");
  expect(m?.verifyUnichainDeployment).toBeTypeOf("function");return m!;
}
it("binds a full independently compiled runtime to Unichain configuration without masking bytes",async()=>{
  const m=await functions();const f=fixture();const p=m.prepareUnichainDeployment("router",f.raw,f.snapshot);
  const r=m.verifyUnichainDeployment(p,f.output,"0.7.6+commit.7338295f.Emscripten.clang","b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2");
  expect(r.chainId).toBe(1301);expect(r.independentRuntimeMatch).toBe(true);expect(r.executionEnabled).toBe(false);
  expect(r.runtimeHash).toBe(keccak256(f.snapshot.code as `0x${string}`));
});
it("rejects wrong-chain/address, unverified sources and altered compilation settings",async()=>{
  const m=await functions();const f=fixture();
  for(const s of [{...f.snapshot,chainId:84532},{...f.snapshot,address:"0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"}])
    expect(()=>m.prepareUnichainDeployment("router",f.raw,s)).toThrow();
  for(const raw of [{...f.raw,is_verified:false},{...f.raw,compiler_version:"v0.8.26"},{...f.raw,name:"DifferentRouter"},
    {...f.raw,compiler_settings:{...f.raw.compiler_settings,optimizer:{enabled:true,runs:200}}}])
    expect(()=>m.prepareUnichainDeployment("router",raw,f.snapshot)).toThrow();
});
it("rejects runtime substitution, compiler substitution and source metadata mismatch",async()=>{
  const m=await functions();const f=fixture();const p=m.prepareUnichainDeployment("router",f.raw,f.snapshot);
  const version="0.7.6+commit.7338295f.Emscripten.clang", hash="b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2";
  expect(()=>m.verifyUnichainDeployment(p,f.output,version,"00".repeat(32))).toThrow();
  const bad=structuredClone(f.output);bad.contracts[f.raw.file_path].SwapRouter02.evm.deployedBytecode.object="61"+bad.contracts[f.raw.file_path].SwapRouter02.evm.deployedBytecode.object.slice(2);
  expect(()=>m.verifyUnichainDeployment(p,bad,version,hash)).toThrow();
  const badSource=structuredClone(f.output);const meta=JSON.parse(badSource.contracts[f.raw.file_path].SwapRouter02.metadata);
  meta.sources[f.raw.file_path].keccak256="0x"+"22".repeat(32);badSource.contracts[f.raw.file_path].SwapRouter02.metadata=JSON.stringify(meta);
  expect(()=>m.verifyUnichainDeployment(p,badSource,version,hash)).toThrow();
});
it("rejects duplicate or missing source paths before compiler work",async()=>{
  const m=await functions();const f=fixture();
  expect(()=>m.prepareUnichainDeployment("router",{...f.raw,additional_sources:[...f.raw.additional_sources,...f.raw.additional_sources]},f.snapshot)).toThrow();
  expect(()=>m.prepareUnichainDeployment("router",{...f.raw,source_code:undefined},f.snapshot)).toThrow();
});

it("qualifies QuoterV2 with its v3-periphery source paths, not SwapRouter package paths", async () => {
  const m = await functions(); const f = quoterRebuildFixture();
  const external = "@uniswap/v3-periphery/contracts/base/PeripheryImmutableState.sol";
  const local = "contracts/base/PeripheryImmutableState.sol";
  const sources: Record<string, { content: string }> = { ...f.value.stdJsonInput.sources };
  sources[local] = sources[external]; delete sources[external];
  const target = "contracts/lens/QuoterV2.sol";
  const raw = { is_verified: true, compiler_version: "v0.7.6+commit.7338295f", name: "QuoterV2", file_path: target,
    compiler_settings: { optimizer: { enabled: true, runs: 1000000 }, evmVersion: "istanbul", metadata: { bytecodeHash: "none" }, libraries: {} },
    source_code: sources[target].content,
    additional_sources: Object.entries(sources).filter(([p]) => p !== target).map(([file_path, v]) => ({ file_path, source_code: v.content })) };
  const output = structuredClone(f.output);
  const astSources: Record<string, unknown> = output.sources;
  astSources[local] = astSources[external]; delete astSources[external];
  const metadata = JSON.parse(output.contracts[target].QuoterV2.metadata);
  metadata.sources = Object.fromEntries(Object.entries(sources).map(([p, v]) => [p, { keccak256: keccak256(stringToHex(v.content)) }]));
  output.contracts[target].QuoterV2.metadata = JSON.stringify(metadata);
  const snapshot = { chainId: 1301, blockNumber: "64442961", blockHash: "0x" + "11".repeat(32),
    address: "0x6Dd37329A1A225a6Fca658265D460423DCafBF89", code: `0x60${words.slice(0,2).map(x=>x.padStart(64,"0")).join("")}01` };
  const p = m.prepareUnichainDeployment("quoter", raw, snapshot);
  expect(m.verifyUnichainDeployment(p, output, "0.7.6+commit.7338295f.Emscripten.clang", "b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2").independentRuntimeMatch).toBe(true);
});
