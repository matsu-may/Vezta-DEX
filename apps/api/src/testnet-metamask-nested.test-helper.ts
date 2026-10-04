import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { encodeAbiParameters, encodeEventTopics, hashStruct, parseAbi, type Hex } from "viem";
import { nestedSwapFixture, metamaskFixtureTypes } from "../../../packages/core/src/testnet-metamask.test-helper";
import { wrappedReceiptFixture } from "./testnet-metamask-execution.test-helper";

export async function nestedReceiptFixture(reverse = false, expectedInput?: { to: Hex; value: string; data: Hex }) {
  const f = await nestedSwapFixture(reverse, expectedInput); const w = await wrappedReceiptFixture();
  w.tx.input = f.input; w.tx.type = "eip1559"; w.tx.authorizationList = [];
  const manager = "0xdb9b1e94b5b69df7e401ddbede43491141047db3";
  const abi = parseAbi([
    "struct Caveat { address enforcer; bytes terms; bytes args; }",
    "struct Delegation { address delegate; address delegator; bytes32 authority; Caveat[] caveats; uint256 salt; bytes signature; }",
    "event RedeemedDelegation(address indexed rootDelegator,address indexed redeemer,Delegation delegation)",
    "event IncreasedCount(address indexed sender,address indexed redeemer,bytes32 indexed delegationHash,uint256 limit,uint256 callCount)",
  ]);
  const event = abi.find(a => a.type === "event" && a.name === "RedeemedDelegation")!;
  const redeemed = (d: typeof f.inner, redeemer: Hex) => ({ address: manager,
    topics: encodeEventTopics({ abi, eventName: "RedeemedDelegation", args: { rootDelegator: f.owner, redeemer } }) as Hex[],
    data: encodeAbiParameters(event.inputs.filter(a => !("indexed" in a && a.indexed)), [d]),
  });
  const counter = { address: "0x04658B29F6b82ed55274221a06Fc97D318E25416",
    topics: encodeEventTopics({ abi, eventName: "IncreasedCount", args: { sender: manager, redeemer: w.tx.from,
      delegationHash: hashStruct({ types: metamaskFixtureTypes, primaryType: "Delegation", data: f.delegation }) } }) as Hex[],
    data: encodeAbiParameters([{ type: "uint256" }, { type: "uint256" }], [1n, 1n]),
  };
  w.receipt.logs = [counter, redeemed(f.inner, f.owner), redeemed(f.delegation, w.tx.from)]
    .map(l => ({ ...l, blockNumber: w.receipt.blockNumber, blockHash: w.receipt.blockHash, transactionHash: w.tx.hash }));
  const rows = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/metamask-v1.3-balance-runtime.json.gz", import.meta.url))).toString()) as { address: Hex; code: Hex }[];
  const get = w.source.getCode;
  w.source.getCode = (address, block) => {
    if (address.toLowerCase() === f.owner.toLowerCase()) return Promise.resolve("0xef010063c0c19a282a1b52b07dd5a65b58948a07dae32b");
    const row = rows.find(r => r.address.toLowerCase() === address.toLowerCase());
    return row ? Promise.resolve(row.code) : get(address, block);
  };
  return { ...w, f, expected: { ...f.expected, from: f.owner, nonce: "7" } };
}
