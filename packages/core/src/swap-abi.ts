import { parseAbi, parseAbiParameters } from "viem";

// Router 802fe4c18f47300e0f183e2a42e9146ec2ea9fc3;
// actual v4-periphery gitlink 545a5d2a87228167edde48f3b9eda122d1e3c4d6 (not foundry.lock).
export const executeAbi = parseAbi(["function execute(bytes commands, bytes[] inputs, uint256 deadline) payable"]);
export const v2InputAbi = parseAbiParameters("address recipient,uint256 amountIn,uint256 amountOutMin,address[] path,bool payerIsUser,uint256[] minHopPriceX36");
export const v3InputAbi = parseAbiParameters("address recipient,uint256 amountIn,uint256 amountOutMin,bytes path,bool payerIsUser,uint256[] minHopPriceX36");
export const v4ActionsAbi = parseAbiParameters("bytes actions,bytes[] params");
export const v4SingleAbi = parseAbiParameters("((address currency0,address currency1,uint24 fee,int24 tickSpacing,address hooks) poolKey,bool zeroForOne,uint128 amountIn,uint128 amountOutMinimum,uint256 minHopPriceX36,bytes hookData)");
export const v4MultiAbi = parseAbiParameters("(address currencyIn,(address intermediateCurrency,uint24 fee,int24 tickSpacing,address hooks,bytes hookData)[] path,uint256[] minHopPriceX36,uint128 amountIn,uint128 amountOutMinimum)");
export const settleAbi = parseAbiParameters("address currency,uint256 amount,bool payerIsUser");
export const takeAbi = parseAbiParameters("address currency,address recipient,uint256 amount");
export const currencyAmountAbi = parseAbiParameters("address currency,uint256 amount");
export const sweepAbi = parseAbiParameters("address token,address recipient,uint256 amountMin");
export const permitAbi = parseAbiParameters("((address token,uint160 amount,uint48 expiration,uint48 nonce) details,address spender,uint256 sigDeadline),bytes signature");
