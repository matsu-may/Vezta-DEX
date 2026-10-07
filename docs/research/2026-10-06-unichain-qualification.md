# Unichain Sepolia qualification checkpoint

## Scope and sources

Chain **1301** was selected for independent qualification under the owner's
continuation/autonomous-choice instructions. Configuration and an offline proof
are not public execution acceptance. The current application endpoints and UI
continue using the qualified Base adapter; Unichain execution is not activated.

Deployment identities were checked against the [official Uniswap mapping](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-unichain-deployments)
and [network information](https://developers.uniswap.org/docs/unichain/technical-information/network-information).
Verified factory sources came from Sourcify v2; router/quoter/pool/manager sources
came from the Unichain Sepolia Blockscout v2 smart-contract endpoint after
Sourcify returned 404 for those four roles. No API key was required.

## Independent full-runtime proof

Canonical snapshot: block **64442961**, hash
`0x4a31687a81a5c20192a3dafd018721830401dae78ee46d1b6fce0a5ef05baeab`.
The bounded read client checked chain, bytecode and dependency getters at that
block, then checked the block hash again. Compiler: fingerprinted
`0.7.6+commit.7338295f.Emscripten.clang`, SHA-256
`b94e69dfb056b3e26080f805ab43b668afbc0ac70bf124bfb7391ecfc0172ad2`.

| Role | Runtime bytes | Immutable variables / references |
|---|---:|---:|
| SwapRouter02 | 24497 | 4 / 23 |
| QuoterV2 | 8273 | 2 / 4 |
| Factory | 24535 | 1 / 1 |
| 0.3% pool | 22142 | 7 / 27 |
| NFT manager | 24384 | 5 / 17 |

All five full deployed runtimes matched independently compiled output with
AST-bound immutable names/types and explicit values. No masking or metadata
stripping. Router factory/WETH/position-manager and pool token/fee/spacing values
were independently read. Constructor creation bytecode was **not** independently
qualified; the proof does not claim it was. Quoter sources use the local
`contracts/base/PeripheryImmutableState.sol` path, unlike SwapRouter's package
path. A regression caught that difference before its successful rebuild.

The [proof manifest](2026-10-06-unichain-runtime-proof.json) records runtime,
compiler, raw source, input and output hashes. Public runtime fixtures are
committed for malformed-code tests; application code uses static hashes and
fresh RPC code, never a caller's proof or the fixture.

## Live read and fee evidence

Qualified 1 USDC quote: block **64444771**, output `116973791183800` wei WETH,
minimum `116388922227881`, impact **2 bps**. A reverse attempt returned
`TESTNET_CONFIGURATION_INVALID`; a targeted later diagnostic qualified
0.0001 WETH at block **64445041**, output `849513` USDC units, minimum `845265`.
The pool still had positive active liquidity. These are two historical samples,
not a guarantee of provider stability or current market depth.

At canonical block **64443582**, the fee oracle reported Fjord, Isthmus and Jovian
active; reference calls returned a positive L1 upper bound and zero operator fee
for 100000 gas. This does not prove a charged transaction total or a relayed
wallet debit. Source fee estimates serialize the selected chain's actual
reviewed destination; absent actual receipt components remain unknown.

## Wallet compatibility decision

Read-only canonical block **64445348** found **no code** at the Base-qualified
DelegationManager `0xdb9b1e94b5b69df7e401ddbede43491141047db3` on Unichain.
Delegate `0x63c0c19a282a1b52b07dd5a65b58948a07dae32b` exists, but its full runtime
hash differs from the Base proof. This establishes that the current Base
verification stack cannot be inherited; it does not establish that every
MetaMask implementation on Unichain is unavailable.

Internal Unichain services currently reject delegated execution. Owner choice:
finish Unichain EOA support first while retaining Base EOA/delegated support,
or qualify a chain-specific MetaMask implementation/signature/receipt stack
before the two-chain public handoff. No custom delegation contract deployment
or wallet/funds operation is authorized by this read-only checkpoint.

## Reproduction and remaining activation gates

Keep public raw files and `unichain-snapshot.json` under ignored
`.local-evidence/unichain-qualification/`; filenames are
`unichain-factory.raw.json` and `unichain-{router,quoter,pool,manager}.blockscout.json`.
Raw explorer sources contain code/settings; never replace them with an npm
artifact merely because its contract name matches.

```bash
# Existing pinned local compiler is required; no application dependency upgrade.
pnpm testnet:unichain-rebuild --role router # repeat deliberately for another role
DEX_SMOKE_WALLET=0xYOUR_EOA pnpm testnet:unichain-quote
```

Offline rebuilds use bounded local files and compiler subprocesses; they do not
fetch dependencies or enable execution. Quote commands read only, require fresh
chain/block/runtime/configuration/impact checks and cannot send transactions.
HTTP/browser chain selection, chain-qualified swap action services, original-chain
recovery/global submission lock, independent new-chain fork/browser evidence and
faucet-funded owner acceptance remain required. Two canonical L2 confirmations
will need an explicit inclusion policy; they must not be described as L1 finality.

## Executable EOA follow-up — 2026-10-07

The owner accepted EOA-first scope. HTTP/UI, swap/LP adapter, original-chain
recovery and new-chain fork/browser qualification are now implemented; see
[session evidence](2026-10-06-unichain-eoa-session.md). Public Unichain owner
acceptance remains open; the paragraph above describes the historical checkpoint.
