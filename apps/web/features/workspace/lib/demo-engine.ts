import { minimumOutput, parseExactInput } from "@vezta-dex/core";

export type DemoDirection = "USDC_TO_WETH" | "WETH_TO_USDC";
export type DemoToken = "USDC" | "WETH";

export interface DemoBalances { USDC: bigint; WETH: bigint }
export interface DemoPosition {
  id: "DEMO-1";
  liquidity: bigint;
  principalUSDC: bigint;
  principalWETH: bigint;
  owedPrincipalUSDC: bigint;
  owedPrincipalWETH: bigint;
  owedFeeUSDC: bigint;
  owedFeeWETH: bigint;
  exampleFeeCredited: boolean;
}
export interface DemoReceipt {
  sequence: number;
  simulated: true;
  action: "swap" | "create" | "increase" | "decrease" | "example-fee" | "collect" | "close";
  principalUSDC: bigint;
  principalWETH: bigint;
  feeUSDC: bigint;
  feeWETH: bigint;
  swap?: { input: DemoToken; output: DemoToken; amountIn: bigint; amountOut: bigint; feeAmount: bigint };
}
export interface DemoState {
  revision: number;
  balances: DemoBalances;
  reserves: DemoBalances;
  position: DemoPosition | null;
  lastReceipt: DemoReceipt | null;
}
export interface DemoSwapPreview {
  revision: number;
  direction: DemoDirection;
  amountIn: bigint;
  amountOut: bigint;
  feeAmount: bigint;
  minimumAmountOut: bigint;
  slippageBps: number;
}

const CREATE_USDC = 100_000_000n;
const CREATE_WETH = 40_000_000_000_000_000n;
const INCREASE_USDC = 25_000_000n;
const INCREASE_WETH = 10_000_000_000_000_000n;
const EXAMPLE_FEE_USDC = 250_000n;
const EXAMPLE_FEE_WETH = 100_000_000_000_000n;
const ZERO_AMOUNTS = { principalUSDC: 0n, principalWETH: 0n, feeUSDC: 0n, feeWETH: 0n };

export class DemoInputError extends Error {
  constructor(message: string) { super(message); this.name = "DemoInputError"; }
}

export function initialDemoState(): DemoState {
  return { revision: 0,
    balances: { USDC: 1_000_000_000n, WETH: 1_000_000_000_000_000_000n },
    reserves: { USDC: 2_500_000_000_000n, WETH: 1_000_000_000_000_000_000_000n },
    position: null, lastReceipt: null };
}

function nextState(state: DemoState, changes: Partial<Pick<DemoState, "balances" | "reserves" | "position">>,
  action: DemoReceipt["action"], amounts: typeof ZERO_AMOUNTS = ZERO_AMOUNTS,
  swap?: DemoReceipt["swap"]): DemoState {
  return { ...state, ...changes, revision: state.revision + 1,
    lastReceipt: { sequence: state.revision + 1, simulated: true, action, ...amounts, ...(swap ? { swap } : {}) } };
}

function inputOutput(direction: DemoDirection): { input: DemoToken; output: DemoToken; decimals: number } {
  if (direction === "USDC_TO_WETH") return { input: "USDC", output: "WETH", decimals: 6 };
  if (direction === "WETH_TO_USDC") return { input: "WETH", output: "USDC", decimals: 18 };
  throw new DemoInputError("Choose a supported demo pair.");
}

function quoteRaw(state: DemoState, direction: DemoDirection, amountIn: bigint, slippageBps: number): DemoSwapPreview {
  const { input, output } = inputOutput(direction);
  if (amountIn <= 0n || amountIn > state.balances[input]) throw new DemoInputError("Insufficient demo balance.");
  const feeAmount = amountIn * 5n / 10_000n;
  const netIn = amountIn - feeAmount;
  const amountOut = state.reserves[output] * netIn / (state.reserves[input] + netIn);
  if (amountOut <= 0n || amountOut >= state.reserves[output]) throw new DemoInputError("Demo amount is outside the pool range.");
  let minimumAmountOut: bigint;
  try { minimumAmountOut = minimumOutput(amountOut, slippageBps); }
  catch { throw new DemoInputError("Choose demo slippage between 0.1% and 3%."); }
  return { revision: state.revision, direction, amountIn, amountOut, feeAmount, minimumAmountOut, slippageBps };
}

export function previewDemoSwap(state: DemoState, direction: DemoDirection, amount: string,
  slippageBps: number): DemoSwapPreview {
  const { decimals } = inputOutput(direction);
  if (amount.length > 32) throw new DemoInputError("Enter a smaller demo amount.");
  let amountIn: bigint;
  try { amountIn = parseExactInput(amount, decimals); }
  catch { throw new DemoInputError(`Enter a positive amount with at most ${decimals} decimal places.`); }
  return quoteRaw(state, direction, amountIn, slippageBps);
}

export function commitDemoSwap(state: DemoState, preview: DemoSwapPreview): DemoState {
  if (preview.revision !== state.revision) throw new DemoInputError("Demo preview changed. Review a fresh quote.");
  const expected = quoteRaw(state, preview.direction, preview.amountIn, preview.slippageBps);
  if (preview.amountOut !== expected.amountOut || preview.feeAmount !== expected.feeAmount
    || preview.minimumAmountOut !== expected.minimumAmountOut) throw new DemoInputError("Demo preview changed.");
  const { input, output } = inputOutput(preview.direction);
  return nextState(state, { balances: { ...state.balances,
    [input]: state.balances[input] - preview.amountIn,
    [output]: state.balances[output] + preview.amountOut },
    reserves: { ...state.reserves,
      [input]: state.reserves[input] + preview.amountIn,
      [output]: state.reserves[output] - preview.amountOut } }, "swap", ZERO_AMOUNTS,
  { input, output, amountIn: preview.amountIn, amountOut: preview.amountOut,
    feeAmount: preview.feeAmount });
}

export function createDemoPosition(state: DemoState): DemoState {
  if (state.position) throw new DemoInputError("Close the current demo position first.");
  if (state.balances.USDC < CREATE_USDC || state.balances.WETH < CREATE_WETH)
    throw new DemoInputError("Insufficient demo balance for a position.");
  const position: DemoPosition = { id: "DEMO-1", liquidity: 100n,
    principalUSDC: CREATE_USDC, principalWETH: CREATE_WETH,
    owedPrincipalUSDC: 0n, owedPrincipalWETH: 0n, owedFeeUSDC: 0n, owedFeeWETH: 0n,
    exampleFeeCredited: false };
  return nextState(state, { balances: { USDC: state.balances.USDC - CREATE_USDC,
    WETH: state.balances.WETH - CREATE_WETH }, position }, "create",
  { ...ZERO_AMOUNTS, principalUSDC: CREATE_USDC, principalWETH: CREATE_WETH });
}

export function increaseDemoPosition(state: DemoState): DemoState {
  const position = state.position;
  if (!position || position.liquidity <= 0n) throw new DemoInputError("No active demo position to increase.");
  if (state.balances.USDC < INCREASE_USDC || state.balances.WETH < INCREASE_WETH)
    throw new DemoInputError("Insufficient demo balance to increase liquidity.");
  return nextState(state, { balances: { USDC: state.balances.USDC - INCREASE_USDC,
    WETH: state.balances.WETH - INCREASE_WETH },
  position: { ...position, liquidity: position.liquidity + 25n,
    principalUSDC: position.principalUSDC + INCREASE_USDC,
    principalWETH: position.principalWETH + INCREASE_WETH } }, "increase",
  { ...ZERO_AMOUNTS, principalUSDC: INCREASE_USDC, principalWETH: INCREASE_WETH });
}

export function decreaseDemoPosition(state: DemoState, fraction: "half" | "all"): DemoState {
  const position = state.position;
  if (!position || position.liquidity <= 0n) throw new DemoInputError("No active demo liquidity to remove.");
  if (fraction !== "half" && fraction !== "all") throw new DemoInputError("Choose half or all demo liquidity.");
  const removed = fraction === "all" ? position.liquidity : position.liquidity / 2n;
  if (removed <= 0n) throw new DemoInputError("Too little demo liquidity to remove half.");
  const principalUSDC = fraction === "all" ? position.principalUSDC
    : position.principalUSDC * removed / position.liquidity;
  const principalWETH = fraction === "all" ? position.principalWETH
    : position.principalWETH * removed / position.liquidity;
  return nextState(state, { position: { ...position, liquidity: position.liquidity - removed,
    principalUSDC: position.principalUSDC - principalUSDC,
    principalWETH: position.principalWETH - principalWETH,
    owedPrincipalUSDC: position.owedPrincipalUSDC + principalUSDC,
    owedPrincipalWETH: position.owedPrincipalWETH + principalWETH } }, "decrease",
  { ...ZERO_AMOUNTS, principalUSDC, principalWETH });
}

export function creditDemoFees(state: DemoState): DemoState {
  const position = state.position;
  if (!position || position.liquidity <= 0n || position.exampleFeeCredited)
    throw new DemoInputError("The example fee is available once for an active demo position.");
  return nextState(state, { position: { ...position, exampleFeeCredited: true,
    owedFeeUSDC: position.owedFeeUSDC + EXAMPLE_FEE_USDC,
    owedFeeWETH: position.owedFeeWETH + EXAMPLE_FEE_WETH } }, "example-fee",
  { ...ZERO_AMOUNTS, feeUSDC: EXAMPLE_FEE_USDC, feeWETH: EXAMPLE_FEE_WETH });
}

export function collectDemoPosition(state: DemoState): DemoState {
  const position = state.position;
  if (!position) throw new DemoInputError("No demo position to collect.");
  const { owedPrincipalUSDC: principalUSDC, owedPrincipalWETH: principalWETH,
    owedFeeUSDC: feeUSDC, owedFeeWETH: feeWETH } = position;
  if (principalUSDC + principalWETH + feeUSDC + feeWETH <= 0n)
    throw new DemoInputError("Nothing is owed to this demo position.");
  return nextState(state, { balances: { USDC: state.balances.USDC + principalUSDC + feeUSDC,
    WETH: state.balances.WETH + principalWETH + feeWETH },
  position: { ...position, owedPrincipalUSDC: 0n, owedPrincipalWETH: 0n,
    owedFeeUSDC: 0n, owedFeeWETH: 0n } }, "collect",
  { principalUSDC, principalWETH, feeUSDC, feeWETH });
}

export function closeDemoPosition(state: DemoState): DemoState {
  const position = state.position;
  if (!position || position.liquidity !== 0n || position.principalUSDC !== 0n
    || position.principalWETH !== 0n || position.owedPrincipalUSDC !== 0n
    || position.owedPrincipalWETH !== 0n || position.owedFeeUSDC !== 0n
    || position.owedFeeWETH !== 0n) throw new DemoInputError("Remove and collect all demo liquidity before closing.");
  return nextState(state, { position: null }, "close");
}
