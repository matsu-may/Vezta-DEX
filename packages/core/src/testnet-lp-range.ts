import { testnetLpRangeSchema } from "./testnet-lp-wallet";
export interface TestnetLpRange { tickLower: number; tickUpper: number }
export const TESTNET_LP_FULL_RANGE: Readonly<TestnetLpRange> = Object.freeze({tickLower:-887220,tickUpper:887220});
/* BigInt port of @uniswap/v3-sdk 3.31.5 dist/esm/src/utils/tickMath.js,
 * getSqrtRatioAtTick only. Exact shifts and rounding match the pinned SDK.
 * https://github.com/Uniswap/sdks/tree/main/sdks/v3-sdk/src/utils/tickMath.ts
MIT License

Copyright (c) 2021 Uniswap Labs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const multipliers = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n
];
export function lpTickSqrtRatioX96(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < -887272 || tick > 887272) throw new Error("Invalid tick");
  const absolute = Math.abs(tick);
  let ratio = 1n << 128n;
  for (let bit = 0; bit < multipliers.length; bit++) {
    if ((absolute & (1 << bit)) !== 0) ratio = (ratio * multipliers[bit]) >> 128n;
  }
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio >> 32n) + (ratio % (1n << 32n) === 0n ? 0n : 1n);
}
const gcd = (a: bigint, b: bigint): bigint => b === 0n ? a : gcd(b, a % b);
// token0 USDC (6 decimals), token1 WETH (18): human USDC/WETH = Q192*10^12/sqrt^2.
export function lpUsdcPerWethAtTick(tick: number) {
  const sqrt = lpTickSqrtRatioX96(tick), numerator = (1n << 192n) * 10n ** 12n, denominator = sqrt * sqrt;
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
// Display 12 significant decimal digits, rounding down. This text is never used for calldata.
function displayRatio({numerator,denominator}: {numerator:bigint;denominator:bigint}): string {
  let decimals = 0;
  while (numerator * 10n ** BigInt(decimals) < denominator * 10n ** 11n) decimals++;
  const value = numerator * 10n ** BigInt(decimals) / denominator;
  const digits = value.toString().padStart(decimals + 1, "0");
  return decimals === 0 ? digits : `${digits.slice(0,-decimals)}.${digits.slice(-decimals)}`.replace(/0+$/, "").replace(/\.$/, "");
}
export function lpRangePrices(value: TestnetLpRange) {
  const range = testnetLpRangeSchema.parse({tickLower:value.tickLower,tickUpper:value.tickUpper});
  // Inverse quote: upper tick gives the lower USDC-per-WETH price.
  return { lower: displayRatio(lpUsdcPerWethAtTick(range.tickUpper)), upper: displayRatio(lpUsdcPerWethAtTick(range.tickLower)) };
}
function parsePrice(value: string) {
  if (!/^(?:0|[1-9][0-9]{0,53})(?:\.[0-9]{1,30})?$/.test(value)) throw new Error("Enter a positive decimal price");
  const [whole,fraction=""] = value.split(".");
  const numerator = BigInt(whole + fraction), denominator = 10n ** BigInt(fraction.length);
  if (numerator === 0n) throw new Error("Enter a positive decimal price");
  return {numerator,denominator};
}
export function lpRangeFromPrices(lower: string, upper: string): TestnetLpRange {
  const lo = parsePrice(lower), hi = parsePrice(upper);
  if (lo.numerator * hi.denominator >= hi.numerator * lo.denominator) throw new Error("Lower price must be below upper price");
  const compare = (tick: number, price: typeof lo) => {
    const at = lpUsdcPerWethAtTick(tick);
    const difference = at.numerator * price.denominator - price.numerator * at.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  };
  for (const price of [lo,hi]) {
    if (compare(-887220,price) < 0 || compare(887220,price) > 0) throw new Error("Price exceeds the usable pool range");
  }
  // First grid tick with price <= requested bound; binary search only exact integers.
  const firstAtOrBelow = (price: typeof lo) => {
    let left = -14787, right = 14787;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (compare(middle * 60,price) <= 0) right = middle; else left = middle + 1;
    }
    return left * 60;
  };
  const upperPriceTick = firstAtOrBelow(hi);
  // Outward snap: higher price rounds toward lower ticks, lower price toward higher ticks.
  const tickLower = compare(upperPriceTick,hi) === 0 ? upperPriceTick : upperPriceTick - 60;
  return testnetLpRangeSchema.parse({tickLower,tickUpper:firstAtOrBelow(lo)});
}
