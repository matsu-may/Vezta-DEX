import { Pool, Position, TickMath, Token } from "./uniswap-lp-sdk";
import { createTestnetLpPositionDomain, testnetChainConfig, type TestnetChainId, type TestnetChainLpRequest, type Address } from "@vezta-dex/core";
import type { BaseSepoliaSwapSource } from "../swap/testnet-swap-quote";
import { verifyTestnetRuntimeCodes } from "../../infrastructure/deployments/testnet-runtime";
export interface LpNftState {
  token0: Address; token1: Address; fee: number; tickLower: number; tickUpper: number; liquidity: bigint;
  feeGrowthInside0LastX128: bigint; feeGrowthInside1LastX128: bigint; tokensOwed0: bigint; tokensOwed1: bigint;
}
export interface LpFeeOutside { feeGrowthOutside0X128: bigint; feeGrowthOutside1X128: bigint }
export interface LpPoolState { token0: Address; token1: Address; factory: Address; fee: number;
  liquidity: bigint; tick: number; sqrtPriceX96: bigint; feeGrowthGlobal0X128: bigint; feeGrowthGlobal1X128: bigint }
export interface BaseSepoliaLpSource extends Pick<BaseSepoliaSwapSource,
  "getChainId" | "getLatestBlock" | "getBlockHash" | "getCode" | "getDecimals" | "getPool" | "getTickSpacing" | "getDependencyConfiguration"> {
  getLpBlock(number: bigint): Promise<{ number: bigint; timestamp: bigint; hash: string }>;
  getLpPoolState(block: bigint): Promise<LpPoolState>;
  getPositionCount(owner: Address, block: bigint): Promise<bigint>;
  getPositionId(owner: Address, index: bigint, block: bigint): Promise<bigint>;
  getPositionOwner(id: bigint, block: bigint): Promise<Address>;
  getPosition(id: bigint, block: bigint): Promise<LpNftState>;
  getFeeGrowthOutside(tick: number, block: bigint): Promise<LpFeeOutside>;
}
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const uint = (n: bigint, bits = 256) => typeof n === "bigint" && n >= 0n && n < 2n ** BigInt(bits);
const mod = (n: bigint) => BigInt.asUintN(256, n);
export class TestnetLpError extends Error { constructor(readonly code: string) { super(code); } }
export function lpAssert(ok: unknown, code = "TESTNET_LP_STATE_INVALID"): asserts ok { if (!ok) throw new TestnetLpError(code); }
export function lpSdkPool(s: LpPoolState, chainId: TestnetChainId = 84532) {
  const C = testnetChainConfig(chainId).candidate;
  lpAssert(same(s.token0, C.USDC.address) && same(s.token1, C.WETH.address) && same(s.factory, C.v3Factory)
    && s.fee === 3000 && uint(s.liquidity, 128) && Number.isInteger(s.tick) && s.tick >= -887272 && s.tick < 887272
    && s.sqrtPriceX96 >= BigInt(TickMath.getSqrtRatioAtTick(s.tick).toString())
    && s.sqrtPriceX96 <= BigInt(TickMath.getSqrtRatioAtTick(s.tick + 1).toString())
    && s.sqrtPriceX96 > BigInt(TickMath.MIN_SQRT_RATIO.toString()) && s.sqrtPriceX96 < BigInt(TickMath.MAX_SQRT_RATIO.toString()));
  return new Pool(new Token(chainId, C.USDC.address, 6, "USDC"), new Token(chainId, C.WETH.address, 18, "WETH"),
    3000, s.sqrtPriceX96.toString(), s.liquidity.toString(), s.tick);
}
export function lpSdkPosition(p: LpNftState, s: LpPoolState, chainId: TestnetChainId = 84532) {
  const C = testnetChainConfig(chainId).candidate;
  lpAssert(same(p.token0, C.USDC.address) && same(p.token1, C.WETH.address) && p.fee === 3000
    && Number.isInteger(p.tickLower) && Number.isInteger(p.tickUpper) && p.tickLower >= -887220 && p.tickUpper <= 887220
    && p.tickLower < p.tickUpper && p.tickLower % 60 === 0 && p.tickUpper % 60 === 0 && uint(p.liquidity, 128)
    && uint(p.tokensOwed0, 128) && uint(p.tokensOwed1, 128)
    && uint(p.feeGrowthInside0LastX128) && uint(p.feeGrowthInside1LastX128));
  return new Position({ pool: lpSdkPool(s,chainId), liquidity: p.liquidity.toString(), tickLower: p.tickLower, tickUpper: p.tickUpper });
}
export function calculateLpAmounts(p: LpNftState, s: LpPoolState, lower: LpFeeOutside, upper: LpFeeOutside, chainId: TestnetChainId = 84532) {
  const pos = lpSdkPosition(p, s,chainId);
  lpAssert([s.feeGrowthGlobal0X128, s.feeGrowthGlobal1X128, ...Object.values(lower), ...Object.values(upper)].every(v => uint(v)));
  const fees = (global: bigint, lo: bigint, hi: bigint, last: bigint) => {
    const below = s.tick >= p.tickLower ? lo : mod(global - lo);
    const above = s.tick < p.tickUpper ? hi : mod(global - hi);
    return mod(mod(global - below - above) - last) * p.liquidity / (2n ** 128n);
  };
  const fee0 = fees(s.feeGrowthGlobal0X128, lower.feeGrowthOutside0X128, upper.feeGrowthOutside0X128, p.feeGrowthInside0LastX128);
  const fee1 = fees(s.feeGrowthGlobal1X128, lower.feeGrowthOutside1X128, upper.feeGrowthOutside1X128, p.feeGrowthInside1LastX128);
  lpAssert(uint(fee0 + p.tokensOwed0, 128) && uint(fee1 + p.tokensOwed1, 128));
  return { currentAmounts: { USDC: pos.amount0.quotient.toString(), WETH: pos.amount1.quotient.toString() },
    newFeesSinceCheckpoint: { USDC: fee0.toString(), WETH: fee1.toString() },
    storedOwed: { USDC: p.tokensOwed0.toString(), WETH: p.tokensOwed1.toString() },
    collectable: { USDC: (fee0 + p.tokensOwed0).toString(), WETH: (fee1 + p.tokensOwed1).toString() } };
}
export class TestnetLpPositionReader<I extends TestnetChainId = 84532> {
  private readonly config;
  private readonly domain;
  private busy = false;
  constructor(private readonly createSource: (signal: AbortSignal) => BaseSepoliaLpSource, private readonly now = Date.now, readonly chainId: I = 84532 as I) {
    this.config = testnetChainConfig(chainId); this.domain = createTestnetLpPositionDomain(chainId);
  }
  async read(value: unknown) {
    let i: TestnetChainLpRequest<I>;
    try { i = this.domain.testnetLpRequestSchema.parse(value); } catch { throw new TestnetLpError("TESTNET_LP_REQUEST_INVALID"); }
    lpAssert(!this.busy, "TESTNET_LP_BUSY"); this.busy = true;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([this.probe(this.createSource(controller.signal), i, controller.signal), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new TestnetLpError("TESTNET_LP_TIMEOUT")); }, 25000);
      })]);
    } catch (error) { if (error instanceof TestnetLpError) throw error; throw new TestnetLpError("TESTNET_LP_RPC_UNAVAILABLE"); }
    finally { clearTimeout(timer); controller.abort(); this.busy = false; }
  }
  private async probe(s: BaseSepoliaLpSource, i: TestnetChainLpRequest<I>, signal: AbortSignal) {
    const {candidate: C, policy: P} = this.config;
    lpAssert(await s.getChainId() === this.chainId, "TESTNET_LP_WRONG_CHAIN");
    const block = i.snapshot ? await s.getLpBlock(BigInt(i.snapshot.number)) : await s.getLatestBlock();
    const fresh = () => {
      signal.throwIfAborted(); const age = this.now() - Number(block.timestamp) * 1000;
      lpAssert(uint(block.number) && block.number > 0n && /^0x[0-9a-fA-F]{64}$/.test(block.hash) && BigInt(block.hash) > 0n
        && Number.isSafeInteger(age) && age >= -10000 && age < 120000, "TESTNET_LP_STALE");
    }; fresh();
    const snapshot = { number: block.number.toString(), hash: block.hash, observedAt: new Date(Number(block.timestamp) * 1000).toISOString() };
    if (i.snapshot) lpAssert(same(i.snapshot.hash, snapshot.hash) && i.snapshot.observedAt === snapshot.observedAt, "TESTNET_LP_BLOCK_CHANGED");
    const addresses = [P.router, C.v3QuoterV2, C.v3Factory, P.pool, C.v3PositionManager];
    const [codes, decimals, pool, state, spacing, deps, count] = await Promise.all([
      Promise.all(addresses.map(a => s.getCode(a, block.number))),
      Promise.all([s.getDecimals(C.USDC.address, block.number), s.getDecimals(C.WETH.address, block.number)]),
      s.getPool(3000, block.number), s.getLpPoolState(block.number), s.getTickSpacing(P.pool, block.number),
      s.getDependencyConfiguration(block.number), s.getPositionCount(i.owner, block.number),
    ]); fresh();
    try { verifyTestnetRuntimeCodes(this.chainId, addresses.map((address, index) => ({ address, code: codes[index] }))); }
    catch { throw new TestnetLpError("TESTNET_LP_RUNTIME_MISMATCH"); }
    lpAssert(decimals[0] === 6 && decimals[1] === 18 && same(pool, P.pool) && spacing === 60
      && same(deps.manager.factory, C.v3Factory) && same(deps.manager.weth, C.WETH.address), "TESTNET_LP_CONFIGURATION_INVALID");
    lpSdkPool(state, this.chainId); lpAssert(uint(count) && count <= 1000000n && BigInt(i.cursor) <= count);
    const end = BigInt(i.cursor) + BigInt(i.limit) < count ? BigInt(i.cursor) + BigInt(i.limit) : count;
    const positions = []; const ids = new Set<string>();
    for (let n = BigInt(i.cursor); n < end; n++) {
      const id = await s.getPositionId(i.owner, n, block.number);
      lpAssert(uint(id) && id > 0n && !ids.has(id.toString())); ids.add(id.toString());
      const [owner, p] = await Promise.all([s.getPositionOwner(id, block.number), s.getPosition(id, block.number)]);
      lpAssert(same(owner, i.owner), "TESTNET_LP_OWNER_CHANGED");
      if (!same(p.token0, C.USDC.address) || !same(p.token1, C.WETH.address) || p.fee !== 3000) continue;
      lpSdkPosition(p, state, this.chainId);
      const [lower, upper] = await Promise.all([s.getFeeGrowthOutside(p.tickLower, block.number), s.getFeeGrowthOutside(p.tickUpper, block.number)]);
      const inRange = state.tick >= p.tickLower && state.tick < p.tickUpper;
      positions.push({ tokenId: id.toString(), tickLower: p.tickLower, tickUpper: p.tickUpper, liquidity: p.liquidity.toString(),
        inRange, state: p.liquidity === 0n ? "empty" : inRange ? "active" : "out-of-range", ...calculateLpAmounts(p, state, lower, upper, this.chainId) }); fresh();
    }
    lpAssert(same(await s.getBlockHash(block.number), block.hash), "TESTNET_LP_BLOCK_CHANGED"); fresh();
    return this.domain.parseTestnetLpPage({ chainId: this.chainId, manager: C.v3PositionManager, pool: P.pool, owner: i.owner, snapshot,
      cursor: i.cursor, scanned: Number(end - BigInt(i.cursor)), totalOwned: count.toString(), nextCursor: end < count ? end.toString() : null,
      incomplete: end < count, poolTick: state.tick, sqrtPriceX96: state.sqrtPriceX96.toString(), positions,
      source: this.config.source, runtimeVerified: true, executionEnabled: false }, this.now());
  }
}
