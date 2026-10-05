# Direct-pool routing: independent evidence

Date: 2026-10-05. Standalone desktop Base Sepolia, chain 84532.
Owner checkout remains unchanged; implementation is on
`codex/testnet-product-completion`. No remote push, deployment, public signature
or owner funds were used. Historical public acceptance remains accepted; the
new routing behavior requires a separate owner delta check.

## Implemented boundary

- Absent routing fields retain the original 0.3% pool. Explicit comparison selects
  the greatest integer output among four curated, independently runtime-qualified
  direct USDC/WETH pools at one canonical block; it does not compare arbitrary
  routes, multihop paths or gas-adjusted total value.
- Candidates must pass factory, token, fee, spacing, initialized/liquidity,
  exact runtime and <=100 bps price-impact checks. Partial comparison is visible;
  failed pools cannot win. Ties choose the lower fee tier.
- The stored winning pool/fee and preference bind quote IDs, approval, simulation,
  calldata, delegation, receipt and recovery. Refreshing is required to choose
  another route. Existing contexts are not migrated or rerouted.
- Explore links can explicitly select a qualified curated swap pool. Partial,
  duplicated or substituted fee/address URL parameters cannot silently fall back.
  LP creation/management remains the accepted 0.3% pool, spacing 60.

## Runtime provenance

Accepted pool source/input SHA-256:
`536392ce7bca7c2cef0d3ff01cfe5d7d1d773771e94fc0433ce3d583bcc1799f`.
Compiler: `0.7.6+commit.7338295f.Emscripten.clang`; compiler SHA-256:
`b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2`.
Compiled output SHA-256:
`b42aad261a151ecbb2ad032deb2264d67ee852e938f3634a5f2cacb3398d6954`.

The accepted original deployment was independently rebuilt first. The same
compiler result then bound all seven immutable variables/27 references for each
curated pool, including self-address, fee, tick spacing and derived maximum
liquidity per tick. Each entire patched 22,142-byte runtime matched on-chain
bytes; nothing was masked. Snapshot block **47698676**, hash
`0x54047d20ffb10e9bda44b227101b652161c835d860ab562049ae190cee8f7875`,
observed `2026-10-05T02:00:40Z`.

| Fee | Pool | Runtime keccak256 |
|---|---|---|
| 0.01% | `0x57183717A087d2fe3Ad890873877244c3B96156c` | `0x112c672e458b6aafcb5bae6782924bf6fa199e2938e71e64743cf067aa57f694` |
| 0.05% | `0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0` | `0x9355520b8c27706336ff49823a7385426f38897fcdff443810ca2263974e11e0` |
| 0.3% | `0x46880b404CD35c165EDdefF7421019F8dD25F4Ad` | `0xbbda0bdc9da3fd1f4832633a5ea75dc401ca24fdbca3d64a2511f27583ec7c4d` |
| 1% | `0x4664755562152EDDa3a3073850FB62835451926a` | `0x1aba5f29bae71707e4895af7aef020b04761561282516f91c22bfafeb21734e4` |

The committed gzip fixture contains public bytecode/provenance only. Private
source inputs, compiler tools and RPC credentials remain ignored. The bounded
read-only `pnpm testnet:routing-evidence --save` command regenerates local
snapshot evidence; it never edits application pins or enables execution itself.

## Measured behavior

One live read-only comparison in each direction passed. At block 47699040,
0.1 test USDC selected the 1% pool with two of four candidates qualified;
output 631840298665669 WETH base units. At block 47699050, 0.0001 WETH selected
the 0.3% pool with four qualified candidates; output 16406 USDC base units.
These are historical samples, not future quotes or market-value evidence.

One guarded owned-Anvil fork at block **47699076** exercised selected **0.05%**
execution: allowance reset, exact approval, 0.01 USDC -> 62683941484680 WETH base
units, and 0.0001 WETH -> 15926 USDC base units. Runtime, simulation, receipts,
context binding, tracking and residual allowances passed. Fixture funding was
local only; the snapshot was reverted and owned Anvil stopped. Complete charged
L1/operator fees remain unqualified (`actualTotalFeeQualified:false`).

## Review and limits

Fresh review found one important omission: the signed nested MetaMask decoder
still hardcoded fee 3000. New tests first rejected alternative fees, then passed
after allowing only the curated fees while retaining exact signed-calldata and
all existing balance/delegation checks. Both directions and substituted-fee
rejection are covered. The reviewer reported no other important findings; no
AI review is treated as an audit or public wallet acceptance.

Full checkpoint: **149 Vitest files, 1090 passed/one skipped; 85 Node tests**.
Typecheck, lint and final production build passed; existing React autodetection
warning only. Desktop browser mocks passed 14 routing and 37 legacy swap checks;
all API/wallet calls were intercepted, with no public broadcast. Screenshots were
visually inspected. Owner handoff is recorded in the progress ledger.
Public MetaMask receipts on the new selectable pools are still owner checks.
