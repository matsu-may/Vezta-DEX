import { describe, expect, it } from "vitest";
import { loadPinnedTestnetArtifacts } from "./testnet-artifacts";
import { poolManagerRebuildFixture } from "../../tooling/compiler/testnet-router-rebuild.test-helper";
import { verifyTestnetPoolTemplate, TESTNET_ROUTER_COMPILER_VERSION } from "../../tooling/compiler/testnet-router-rebuild";

const pool = "0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0";
function fixture() {
  const f = poolManagerRebuildFixture("pool");
  // Independently specified v3 constructor values, not verifier-generated expected bytes.
  const words = [pool.slice(2).toLowerCase(), f.bindings[1][4], f.bindings[2][4], f.bindings[3][4],
    "1f4", "a", (((1n << 128n) - 1n) / 177455n).toString(16)];
  return { ...f, code: `0x60${words.map(w => w.padStart(64, "0")).join("")}01` };
}
describe("curated pool template independently bound per deployment", () => {
  it("verifies the accepted template first and every alternate immutable without masking", () => {
    const f = fixture();
    expect(verifyTestnetPoolTemplate(f.value, f.snapshot, f.output, TESTNET_ROUTER_COMPILER_VERSION,
      loadPinnedTestnetArtifacts(), pool, f.code)).toMatchObject({ independentRuntimeMatch: true,
      configuration: { pool, fee: 500, tickSpacing: 10 } });
  });
  it("rejects altered executable bytes, original pool bytes, unsupported address and false template", () => {
    const f = fixture(); const run = (address: string, code: string, output = f.output) =>
      verifyTestnetPoolTemplate(f.value, f.snapshot, output, TESTNET_ROUTER_COMPILER_VERSION,
        loadPinnedTestnetArtifacts(), address, code);
    expect(() => run(pool, f.code.replace(/^0x60/, "0x61"))).toThrow();
    expect(() => run(pool, f.value.runtimeBytecode.onchainBytecode)).toThrow();
    expect(() => run("0x0000000000000000000000000000000000000001", f.code)).toThrow();
    const bad = structuredClone(f.output);
    bad.contracts["contracts/UniswapV3Pool.sol"].UniswapV3Pool.evm.deployedBytecode.immutableReferences["1"][0].length = 31;
    expect(() => run(pool, f.code, bad)).toThrow();
  });
});
