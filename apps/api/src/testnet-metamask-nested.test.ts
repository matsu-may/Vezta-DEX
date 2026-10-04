import { expect, it } from "vitest";
import { padHex, type Hex } from "viem";
import { verifyMetaMaskExecution } from "./testnet-metamask-execution";
import { nestedReceiptFixture } from "./testnet-metamask-nested.test-helper";

it.each([false, true])("verifies two-layer swap events and the parent delegation (reverse=%s)", async reverse => {
  const f = await nestedReceiptFixture(reverse);
  expect(await verifyMetaMaskExecution(f.source, f.tx, f.receipt, f.expected)).toMatchObject({ executionModel: "metamask-delegation", profile: { inner: { delegation: { delegator: f.f.owner } } } });
});

it.each(["missing-inner", "extra-event", "wrong-inner-redeemer", "changed-inner-data", "wrong-outer-redeemer", "wrong-counter", "native-runtime", "erc20-runtime", "nonce", "owner-block-tx"])("rejects nested proof mutation: %s", async mutation => {
  const f = await nestedReceiptFixture();
  if (mutation === "missing-inner") f.receipt.logs.splice(1, 1);
  if (mutation === "extra-event") f.receipt.logs.push(f.receipt.logs[1]);
  if (mutation === "wrong-inner-redeemer") f.receipt.logs[1].topics = [...f.receipt.logs[1].topics.slice(0, 2), padHex(f.tx.from, { size: 32 })];
  if (mutation === "changed-inner-data") f.receipt.logs[1].data = `${f.receipt.logs[1].data}00`;
  if (mutation === "wrong-outer-redeemer") f.receipt.logs[2].topics = [...f.receipt.logs[2].topics.slice(0, 2), padHex(f.f.owner, { size: 32 })];
  if (mutation === "wrong-counter") f.receipt.logs[0].data = `0x${"00".repeat(64)}`;
  if (mutation.endsWith("runtime")) {
    const get = f.source.getCode;
    const target = mutation === "native-runtime" ? "0xbd7b277507723490cd50b12eaafe87c616be6880" : "0xcdf6ab796408598cea671d79506d7d48e97a5437";
    f.source.getCode = async (a, b) => { const code = await get(a, b); return a.toLowerCase() === target ? `${code.slice(0, -2)}ff` as Hex : code; };
  }
  if (mutation === "nonce") f.source.getAccountNonce = async () => 8n;
  if (mutation === "owner-block-tx") f.source.getBlockTransactions = async () => [f.tx, { ...f.tx, from: f.f.owner, hash: padHex("0x99", { size: 32 }) }];
  await expect(verifyMetaMaskExecution(f.source, f.tx, f.receipt, f.expected)).rejects.toThrow();
});
