import { createRequire } from "node:module";
import { inspectDeploymentEvidence, ROUTER_ADDRESS, SOURCE_FINGERPRINTS } from "./router-deployment.mjs";
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const { decodeAbiParameters, encodeAbiParameters, parseAbiParameters, keccak256, stringToHex, hashDomain } = require("viem");
export const COMPILER_VERSION = "0.8.26+commit.8a97fa7a";
const TARGET = "contracts/UniversalRouter.sol";
const EIP712 = "lib/v4-periphery/lib/v4-core/lib/openzeppelin-contracts/contracts/utils/cryptography/EIP712.sol";
const ctorAbi = parseAbiParameters("(address permit2,address weth9,address v2Factory,address v3Factory,bytes32 pairInitCodeHash,bytes32 poolInitCodeHash,address v4PoolManager,address v3NFTPositionManager,address v4PositionManager,address spokePool)");
const check = value => { if (!value) throw new Error("INVALID_REBUILD_EVIDENCE"); };
const sameKeys = (a, b) => JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
const isHex = value => typeof value === "string" && /^0x(?:[0-9a-fA-F]{2})+$/.test(value);
const word = value => "0x" + value.slice(2).toLowerCase().padStart(64, "0");
const shortString = value => "0x" + stringToHex(value).slice(2).padEnd(62, "0") + Buffer.byteLength(value).toString(16).padStart(2, "0");

/** Validate the saved source graph and change only output selection to request compiler AST. */
export function prepareRouterInput(evidence, pins = SOURCE_FINGERPRINTS) {
  const s = evidence.sourcify;
  const observed = inspectDeploymentEvidence(s, evidence.rpcSnapshot, pins);
  check(observed.runtimeMatchesRpc && observed.dispatcherMatchesPinnedHash && observed.v4InterfaceMatchesPinnedHash && observed.compilationTargetMatches);
  const metadata = typeof s.metadata === "string" ? JSON.parse(s.metadata) : s.metadata;
  const input = s.stdJsonInput;
  const settings = input?.settings;
  check(metadata.compiler?.version === COMPILER_VERSION && s.compilation?.compilerVersion === COMPILER_VERSION && input?.language === "Solidity");
  check(settings?.viaIR === true && settings.evmVersion === "cancun" && settings.optimizer?.enabled === true && settings.optimizer.runs === 3000);
  check(settings.metadata?.bytecodeHash === "none" && settings.metadata.appendCBOR === true && settings.metadata.useLiteralContent === false && Object.keys(settings.libraries ?? {}).length === 0);
  check(sameKeys(s.sources, input.sources) && sameKeys(s.sources, metadata.sources) && Object.hasOwn(s.sources, TARGET) && Object.keys(s.sources).length <= 200);
  let totalBytes = 0;
  for (const [path, source] of Object.entries(s.sources)) {
    check(typeof source.content === "string" && source.content === input.sources[path]?.content && !Object.hasOwn(input.sources[path], "urls"));
    totalBytes += Buffer.byteLength(source.content);
    check(totalBytes <= 4_000_000 && keccak256(stringToHex(source.content)) === metadata.sources[path]?.keccak256);
  }
  const result = structuredClone(input);
  result.settings.outputSelection = { "*": { "": ["ast"] }, [TARGET]: { UniversalRouter: ["metadata", "evm.bytecode", "evm.deployedBytecode"] } };
  return result;
}

function bindings(params) {
  const result = {};
  const add = (path, scope, names) => Object.entries(names).forEach(([name, value]) => { result[`${path}:${scope}:${name}`] = word(value); });
  add("contracts/modules/PaymentsImmutables.sol", "PaymentsImmutables", { PERMIT2: params.permit2, WETH9: params.weth9 });
  add("contracts/modules/uniswap/UniswapImmutables.sol", "UniswapImmutables", {
    UNISWAP_V2_FACTORY: params.v2Factory, UNISWAP_V3_FACTORY: params.v3Factory,
    UNISWAP_V2_PAIR_INIT_CODE_HASH: params.pairInitCodeHash, UNISWAP_V3_POOL_INIT_CODE_HASH: params.poolInitCodeHash,
  });
  add("contracts/modules/MigratorImmutables.sol", "MigratorImmutables", { V3_POSITION_MANAGER: params.v3NFTPositionManager, V4_POSITION_MANAGER: params.v4PositionManager });
  add("contracts/modules/ChainedActions.sol", "ChainedActions", { SPOKE_POOL: params.spokePool });
  add("lib/v4-periphery/src/base/ImmutableState.sol", "ImmutableState", { poolManager: params.v4PoolManager });
  add(EIP712, "EIP712", {
    _cachedChainId: "0x89", _cachedThis: ROUTER_ADDRESS,
    _cachedDomainSeparator: hashDomain({ domain: { name: "UniversalRouter", version: "2", chainId: 137, verifyingContract: ROUTER_ADDRESS }, types: { EIP712Domain: [{ name: "name", type: "string" }, { name: "version", type: "string" }, { name: "chainId", type: "uint256" }, { name: "verifyingContract", type: "address" }] } }),
    _hashedName: keccak256(stringToHex("UniversalRouter")), _hashedVersion: keccak256(stringToHex("2")),
    _name: shortString("UniversalRouter"), _version: shortString("2"),
  });
  return result;
}

/** Consume locally compiled output. Never use Sourcify's replacement values or skip executable bytes. */
export function verifyRouterRebuild(evidence, output, compilerVersion, pins = SOURCE_FINGERPRINTS) {
  const input = prepareRouterInput(evidence, pins);
  check(typeof compilerVersion === "string" && new RegExp(`^${COMPILER_VERSION.replace(/[.+]/g, "\\$&")}(?:\\.|$)`).test(compilerVersion));
  check(!output.errors?.some(error => error.severity === "error"));
  const contract = output.contracts?.[TARGET]?.UniversalRouter;
  check(contract && output.sources && sameKeys(output.sources, input.sources));
  const compiledMetadata = JSON.parse(contract.metadata);
  check(compiledMetadata.compiler?.version === COMPILER_VERSION && sameKeys(compiledMetadata.sources, input.sources));
  for (const [path, source] of Object.entries(input.sources)) check(compiledMetadata.sources[path]?.keccak256 === keccak256(stringToHex(source.content)));
  const evm = contract.evm;
  check(evm?.bytecode && evm.deployedBytecode && Object.keys(evm.bytecode.linkReferences ?? {}).length === 0 && Object.keys(evm.deployedBytecode.linkReferences ?? {}).length === 0);
  const original = `0x${evm.deployedBytecode.object}`;
  const creation = `0x${evm.bytecode.object}`;
  check(isHex(original) && isHex(creation));
  const args = evidence.sourcify.creationBytecode?.transformationValues?.constructorArguments;
  check(isHex(args) && args.length === 2 + 320 * 2);
  const [params] = decodeAbiParameters(ctorAbi, args);
  check(encodeAbiParameters(ctorAbi, [params]).toLowerCase() === args.toLowerCase());
  check(`${creation}${args.slice(2)}`.toLowerCase() === evidence.sourcify.creationBytecode.onchainBytecode.toLowerCase());
  const expected = bindings(params);
  const refs = evm.deployedBytecode.immutableReferences;
  check(refs && Object.keys(refs).length === Object.keys(expected).length);
  const values = {};
  const seenNames = new Set();
  for (const [path, source] of Object.entries(output.sources)) {
    check(source.ast && Array.isArray(source.ast.nodes));
    for (const scope of source.ast.nodes.filter(node => node.nodeType === "ContractDefinition")) {
      for (const node of scope.nodes ?? []) {
        if (node.nodeType !== "VariableDeclaration" || node.stateVariable !== true || node.mutability !== "immutable" || !Object.hasOwn(refs, String(node.id))) continue;
        const key = `${path}:${scope.name}:${node.name}`;
        check(Object.hasOwn(expected, key) && !Object.hasOwn(values, node.id) && !seenNames.has(key));
        values[node.id] = expected[key];
        seenNames.add(key);
      }
    }
  }
  check(sameKeys(refs, values) && seenNames.size === Object.keys(expected).length);
  let patched = original.toLowerCase();
  const ranges = [];
  for (const [id, references] of Object.entries(refs)) {
    check(Array.isArray(references) && references.length > 0 && references.length <= 64);
    for (const { start, length } of references) {
      check(Number.isSafeInteger(start) && start >= 0 && length === 32 && start + length <= (original.length - 2) / 2);
      check(ranges.every(range => start >= range.end || start + length <= range.start));
      check(original.slice(2 + start * 2, 2 + (start + length) * 2) === "00".repeat(32));
      ranges.push({ start, end: start + length });
      patched = patched.slice(0, 2 + start * 2) + values[id].slice(2) + patched.slice(2 + (start + length) * 2);
    }
  }
  check(patched === evidence.rpcSnapshot.bytecode.toLowerCase() && patched === evidence.sourcify.runtimeBytecode.onchainBytecode.toLowerCase());
  return {
    chainId: 137, router: ROUTER_ADDRESS, compilerVersion, sourceCount: Object.keys(input.sources).length,
    blockNumber: evidence.rpcSnapshot.blockNumber, runtimeHash: keccak256(patched),
    immutableVariableCount: Object.keys(values).length, immutableReferenceCount: ranges.length,
    constructor: params, independentRuntimeMatch: true, independentCreationMatch: true,
    polygonConfigurationVerified: false, deployedSourceVerified: false, calldataValidated: false,
  };
}
