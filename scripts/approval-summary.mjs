const PERMIT2 = "0x000000000022D473030F116dDEE9F6B43aC78BA3".toLowerCase();
const MAX_UINT256 = (1n << 256n) - 1n;
const sameAddress = (left, right) => typeof left === "string" && left.toLowerCase() === right.toLowerCase();

function isZero(value) {
  try { return BigInt(value) === 0n; }
  catch { return false; }
}

export function summarizeApprovalTransaction(transaction, { wallet, token, amount }) {
  if (transaction == null) return { present: false };
  const result = {
    present: true,
    chainMatches: Number(transaction.chainId) === 137,
    fromMatchesWallet: sameAddress(transaction.from, wallet),
    targetMatchesToken: sameAddress(transaction.to, token),
    valueZero: isZero(transaction.value),
    isErc20Approve: false,
    spender: undefined,
    spenderMatchesPermit2: false,
    allowanceKind: "unknown",
  };
  const data = transaction.data;
  if (typeof data !== "string" || !/^0x095ea7b3[0-9a-fA-F]{128}$/i.test(data)) return result;
  const spenderWord = data.slice(10, 74);
  if (!/^0{24}$/i.test(spenderWord.slice(0, 24))) return result;
  const spender = `0x${spenderWord.slice(24).toLowerCase()}`;
  const approved = BigInt(`0x${data.slice(74)}`);
  return {
    ...result,
    isErc20Approve: true,
    spender,
    spenderMatchesPermit2: spender === PERMIT2,
    allowanceKind: approved === MAX_UINT256 ? "unlimited"
      : approved === 0n ? "zero"
      : approved === amount ? "exact"
      : approved > amount ? "greater-than-request" : "less-than-request",
  };
}
