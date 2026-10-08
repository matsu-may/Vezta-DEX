import { getAddress, isAddress } from "viem";
import { z } from "zod";
import type { TestnetSubmissionStorage } from "../../swap/lib/testnet-wallet-storage";

export const TESTNET_ACTIVITY_KEY = "vezta-dex:testnet-activity:v1";
const uint = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).refine(v => BigInt(v) < 2n ** 256n);
const address = z.string().refine(v => isAddress(v)).transform(v => getAddress(v));
const entrySchema = z.object({ chainId: z.union([z.literal(84532), z.literal(1301)]), account: address, flow: z.enum(["swap", "lp"]),
  kind: z.enum(["swap", "approve", "reset", "mint", "increase", "decrease", "collect", "burn"]),
  hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).refine(v => BigInt(v) > 0n).transform(v => v.toLowerCase()),
  status: z.enum(["pending", "confirming", "confirmed", "reverted", "unverified", "reorged", "unknown", "unknown-original"]),
  observedAt: z.iso.datetime(), amountIn: uint.optional(), amountOut: uint.optional(),
  tokenIn: z.enum(["USDC", "WETH"]).optional(), tokenOut: z.enum(["USDC", "WETH"]).optional(),
  amount0: uint.optional(), amount1: uint.optional(), tokenId: uint.optional(),
  l2GasCost: uint.refine(v => BigInt(v) <= 4000000000000000000n).optional(), gasPayer: address.optional(),
}).strict().refine(e => e.flow === "swap" ? ["swap", "approve", "reset"].includes(e.kind) : e.kind !== "swap");
const envelope = z.object({ version: z.literal(1), entries: z.array(entrySchema).max(100) }).strict();
export type TestnetActivityEntry = z.infer<typeof entrySchema>;
const listeners = new Set<() => void>();
export function subscribeTestnetActivity(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
function read(storage: TestnetSubmissionStorage) {
  const raw = storage.getItem(TESTNET_ACTIVITY_KEY);
  if (raw === null) return [];
  if (raw.length > 150000) throw new Error("Activity too large");
  return envelope.parse(JSON.parse(raw)).entries;
}
export function readTestnetActivity(storage: TestnetSubmissionStorage, account: string) {
  try { const owner = getAddress(account); return { available: true, entries: read(storage).filter(e => e.account === owner) }; }
  catch { return { available: false, entries: [] as TestnetActivityEntry[] }; }
}
/** Optional local history cannot prevent transaction persistence/recovery. */
export function saveTestnetActivity(storage: TestnetSubmissionStorage, value: unknown): boolean {
  try {
    const entry = entrySchema.parse(value);
    const previous = read(storage).filter(e => !(e.chainId === entry.chainId && e.account === entry.account && e.flow === entry.flow && e.hash === entry.hash));
    storage.setItem(TESTNET_ACTIVITY_KEY, JSON.stringify({ version: 1, entries: [entry, ...previous].slice(0, 100) }));
    for (const fn of listeners) { try { fn(); } catch {} }
    return true;
  } catch { return false; }
}
