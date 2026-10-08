# DEX Developer Scripts

| Folder | Purpose |
|---|---|
| `dev/` | Local launchers; prefer stable pnpm commands. |
| `browser/` | Playwright CLI snippets and browser/wallet checks. |
| `diagnostics/` | Read-only connectivity and endpoint diagnostics. |
| `smoke/` | API/on-chain probes and decoded approval/LP summaries. |
| `fork/` | Explicit local Anvil fork checks and fixture lifecycle utilities. |
| `evidence/` | Polygon router provenance and offline rebuild helpers. |

Node tests stay adjacent as `*.test.mjs` and run through `pnpm test`.
Backend TypeScript entrypoints live in `apps/api/src/cli/`; their existing
`pnpm testnet:*` commands are unchanged. See [source navigation](../docs/maintenance/source-layout.md).

Browser snippets are consumed by `playwright-cli run-code --filename=...`,
not executed directly with Node. Read each tool's gates before use; public
RPC/API probes and explicit local fork mutation are different operations.
