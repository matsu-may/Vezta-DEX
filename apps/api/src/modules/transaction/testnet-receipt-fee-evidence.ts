import { getAddress } from "viem";
export interface ReceiptFeeEvidenceSource {
  getChainId(): Promise<number>;
  getReceipt(hash: `0x${string}`): Promise<unknown>;
  getTransaction(hash: `0x${string}`): Promise<unknown>;
  getBlockHash(number: bigint): Promise<string>;
}
const bound = (condition: unknown) => { if (!condition) throw new Error("TESTNET_FEE_EVIDENCE_INVALID"); };
function record(value: unknown): Record<string, unknown> {
  bound(value !== null && typeof value === "object" && !Array.isArray(value));return value as Record<string,unknown>;
}
function hash(value: unknown): string {
  bound(typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value) && BigInt(value) > 0n);return value as string;
}
function quantity(value: unknown): bigint {
  bound(typeof value === "string" && /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/.test(value));return BigInt(value as string);
}
const same = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
/** Observed fields only: no execution, fee-model, finality or wallet-debit qualification. */
export async function collectReceiptFeeEvidence(source: ReceiptFeeEvidenceSource, input: { chainId:number; hash:string }) {
  bound(Number.isSafeInteger(input.chainId) && input.chainId > 0);const wanted = hash(input.hash) as `0x${string}`;
  bound(await source.getChainId() === input.chainId);
  const [rawReceipt, rawTransaction] = await Promise.all([source.getReceipt(wanted),source.getTransaction(wanted)]);
  const r = record(rawReceipt), t = record(rawTransaction);const number = quantity(r.blockNumber);bound(number > 0n);
  const blockHash = hash(r.blockHash);
  bound(same(hash(r.transactionHash),wanted) && same(hash(t.hash),wanted) && same(hash(t.blockHash),blockHash)
    && quantity(t.blockNumber) === number && quantity(t.chainId) === BigInt(input.chainId));
  bound(typeof r.from === "string" && typeof r.to === "string");
  const from = getAddress(r.from as string), to = getAddress(r.to as string);
  bound(same(t.from,from) && same(t.to,to) && ["0x0","0x2","0x4"].includes(r.type as string)
    && t.type === r.type && ["0x0","0x1"].includes(r.status as string));
  const used = quantity(r.gasUsed), price = quantity(r.effectiveGasPrice);bound(used > 0n && price > 0n);
  const l2 = used * price;bound(l2 < 2n ** 256n);
  const l1 = r.l1Fee == null ? null : quantity(r.l1Fee);
  const operator = r.operatorFee == null ? null : quantity(r.operatorFee);
  const sum = l1 === null || operator === null ? null : l2 + l1 + operator;
  bound(sum === null || sum < 2n ** 256n);
  bound(same(await source.getBlockHash(number),blockHash));
  return { status:"testnet-receipt-fee-evidence-read-only" as const, chainId:input.chainId, hash:wanted,
    blockNumber:number.toString(),blockHash,observedAt:new Date().toISOString(),transactionFrom:from,
    receiptOutcome:r.status === "0x1" ? "success" as const : "reverted" as const,
    l2GasCost:l2.toString(),l1Fee:l1?.toString() ?? null,operatorFee:operator?.toString() ?? null,
    observedComponentSum:sum?.toString() ?? null,
    missingComponents:[...(l1 === null ? ["l1Fee"] : []),...(operator === null ? ["operatorFee"] : [])],
    canonicalAtRead:true,feeModelVerified:false,actualTotalFeeQualified:false,executionEnabled:false };
}
