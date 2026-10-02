import { createRequire } from "node:module";
// SDK 3.31.5 advertises an import branch whose emitted JS is not Node ESM.
// Select its documented CommonJS export explicitly, keeping this server-only.
const require = createRequire(import.meta.url);
const v3 = require("@uniswap/v3-sdk") as typeof import("@uniswap/v3-sdk");
const core = require("@uniswap/sdk-core") as typeof import("@uniswap/sdk-core");
export const { Pool, Position, TickMath, NonfungiblePositionManager } = v3;
export const { Token, Percent, CurrencyAmount } = core;
export type Position = import("@uniswap/v3-sdk").Position;
