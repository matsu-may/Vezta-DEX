import { keccak256, type Hex } from "viem";
import { BASE_SEPOLIA_CANDIDATE as C, TESTNET_SWAP_POLICY as P, testnetDirectPool } from "@vezta-dex/core";

// Independently rebuilt full runtime (including immutables) at block 47551649.
// Provenance: docs/research/2026-10-02-testnet-pool-manager-rebuild.md and preceding role reports.
// Application requests compare fresh code; they never compile, load local evidence or accept caller-supplied pins.
const manifest = [
  { address: P.router, bytes: 24497, hash: "0x60e9352f5af4eee63b41456f85bf80c63044e98123ad599d41d87f2d068de0be" },
  { address: C.v3QuoterV2, bytes: 8273, hash: "0x156c129c09f1c7abd7be44016fc679cd622ca2018484cee6806c213c1f8236b3" },
  { address: C.v3Factory, bytes: 24535, hash: "0x02ee6e36873eea6fbb674a23d53b735646f12dc84efa08eac17872fe2fad9d06" },
  { address: P.pool, bytes: 22142, hash: "0xbbda0bdc9da3fd1f4832633a5ea75dc401ca24fdbca3d64a2511f27583ec7c4d" },
  { address: C.v3PositionManager, bytes: 24384, hash: "0x60f3e548ae28f43dfdedd281dc9233b7135dcae55050662c985583df84bc453d" },
] as const;
// Independently rebuilt at Unichain Sepolia block 64442961; see its qualification report.
const unichainManifest = [
  {"address": "0xd1AAE39293221B77B0C71fBD6dCb7Ea29Bb5B166", "bytes": 24497, "hash": "0xceed0c7f9c5b1c86d921ec39bded0c3572851c79b897e26a8c20253924eace4a"},
  {"address": "0x6Dd37329A1A225a6Fca658265D460423DCafBF89", "bytes": 8273, "hash": "0xd833dcf44a912014423afa2b637f23b5db5b7dc492494cbe3f46026a6d57b424"},
  {"address": "0x1F98431c8aD98523631AE4a59f267346ea31F984", "bytes": 24535, "hash": "0x4d7b8525cd5d14343fa67a732fba5b24cddba11620ca88392f4ec6c52f91fd69"},
  {"address": "0x8F463126bBEA80A10DF9Bf6FF5455B6B0292B34e", "bytes": 22142, "hash": "0xec1beb2b94bc86f304e78f73d50a5f72c19e5b85d84dba92ccc2f9f24928ab5f"},
  {"address": "0xB7F724d6dDDFd008eFf5cc2834edDE5F9eF0d075", "bytes": 24384, "hash": "0x2b99f74250bd7af732819905f69c8ecdfb9a230f7cbd82c531c67b7b683df818"},
] as const;
export class TestnetRuntimeError extends Error {
  readonly code = "TESTNET_RUNTIME_MISMATCH";
  constructor() { super("TESTNET_RUNTIME_MISMATCH"); }
}

// Additional pools: independently rebuilt at block 47698676, see direct-pool routing report.
const poolHashes: Record<number, string> = {
  100: "0x112c672e458b6aafcb5bae6782924bf6fa199e2938e71e64743cf067aa57f694",
  500: "0x9355520b8c27706336ff49823a7385426f38897fcdff443810ca2263974e11e0",
  3000: "0xbbda0bdc9da3fd1f4832633a5ea75dc401ca24fdbca3d64a2511f27583ec7c4d",
  10000: "0x1aba5f29bae71707e4895af7aef020b04761561282516f91c22bfafeb21734e4",
};
export function verifyTestnetRuntimeCodes(chainId: number, codes: unknown, feeTier: number = 3000): void {
  const fail = (): never => { throw new TestnetRuntimeError(); };
  if (![84532,1301].includes(chainId) || !Array.isArray(codes) || codes.length !== 5) return fail();
  if (chainId === 1301 && feeTier !== 3000) return fail();
  let selected;
  try { selected = testnetDirectPool(feeTier); } catch { return fail(); }
  const expected = chainId === 1301 ? unichainManifest : manifest.map(p => p.address === P.pool
    ? { address: selected.pool, bytes: 22142, hash: poolHashes[feeTier] } : p);
  const seen = new Set<string>();
  for (const row of codes) {
    if (!row || typeof row !== "object" || typeof row.address !== "string" || typeof row.code !== "string") return fail();
    const address = row.address.toLowerCase(); const pin = expected.find(p => p.address.toLowerCase() === address);
    if (!pin || seen.has(address) || row.code.length !== pin.bytes * 2 + 2
      || !/^0x(?:[a-fA-F0-9]{2})+$/.test(row.code) || keccak256(row.code as Hex) !== pin.hash) return fail();
    seen.add(address);
  }
}
