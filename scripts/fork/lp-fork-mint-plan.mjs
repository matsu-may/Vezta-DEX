// Local fork fixture only. The WETH cap here is not a user approval for a live wallet.
import { qualifiedMintInputs } from "../smoke/lp-calldata-review.mjs";
import { planLpExactApprovals } from "../smoke/lp-exact-approval-plan.mjs";

const USDC = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
const WETH = "0x7ceb23fd6bc0add59e62ac25578270cff1b9f619";
const LOCAL_WETH_CAP = "1000000000000000"; // 0.001 WETH, only on disposable Anvil.
const sameAddress = (a, b) => typeof a === "string" && a.toLowerCase() === b.toLowerCase();

export function planForkMint({ body, wallet, nowSeconds }) {
  if (!body || !sameAddress(body.token0?.tokenAddress, USDC) || body.token0?.amount !== "1000000"
    || !sameAddress(body.token1?.tokenAddress, WETH)
    || typeof body.token1?.amount !== "string" || !/^[1-9]\d{0,77}$/.test(body.token1.amount)
    || body.tickLower !== -887270 || body.tickUpper !== 887270
    || typeof body.create?.data !== "string") throw new Error("Invalid fork LP create response");
  const amounts = { USDC: body.token0.amount, WETH: body.token1.amount };
  const desired = qualifiedMintInputs(body.create.data, { wallet, amounts, nowSeconds });
  const approval = planLpExactApprovals({ wallet, transaction: body.create, amounts,
    maxWethDesired: LOCAL_WETH_CAP, allowances: { USDC: 0n, WETH: 0n }, nowSeconds });
  if (approval.kind !== "approve" || approval.transactions.length !== 2) throw new Error("Invalid fork approval plan");
  return { transaction: body.create, approvals: approval.transactions, desired };
}
