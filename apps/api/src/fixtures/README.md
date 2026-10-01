# Public runtime fixture

`base-sepolia-runtime.json.gz` contains only chain ID, historical block number and five public role/address/bytecode rows from the owner's snapshot at Base Sepolia block 47551649. Each runtime was independently reproduced with the fingerprint-checked compiler; see `docs/research/2026-10-02-testnet-pool-manager-rebuild.md` and preceding role reports at the repository root.

The gzip file is 46,476 bytes (208,143 bytes decoded), SHA256 `7db5a686fe5656137a10afe156018c6b94acbba5d3dc3ffd410fcec37bd3d94d`. It is test data; application modules must not import it. Mock RPC sources use this captured code with synthetic block/state/quote values to exercise the real runtime guard. Those tests do not prove a live quote or execution.

Changing this fixture requires independently validated replacement runtimes and a matching reviewed manifest/provenance update. Do not replace pins with arbitrary values just to make a test pass. No RPC URL, key, source response, signature or wallet balance is included.
