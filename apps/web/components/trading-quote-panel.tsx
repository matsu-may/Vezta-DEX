"use client";

import { useEffect, useRef, useState } from "react";
import { formatUnits } from "viem";
import {
  POLYGON_CHAIN_ID,
  TOKENS,
  parseExactInput,
  validateTradingQuoteSummary,
  type Address,
  type TradingQuoteSummary,
} from "@vezta-dex/core";

interface WalletProvider {
  request(args: { method: string }): Promise<unknown>;
  on?(event: string, listener: (...args: unknown[]) => void): void;
  removeListener?(event: string, listener: (...args: unknown[]) => void): void;
}

function provider(): WalletProvider | undefined {
  return (window as Window & { ethereum?: WalletProvider }).ethereum;
}

function walletAccount(accounts: unknown): Address {
  const first = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof first !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(first)) throw new Error("Wallet did not return a valid account.");
  return first as Address;
}

function isPolygonChain(chain: unknown): boolean {
  return typeof chain === "string" && /^0x[0-9a-f]+$/i.test(chain) && BigInt(chain) === BigInt(POLYGON_CHAIN_ID);
}

export function TradingQuotePanel({ direction, amount, slippageBps }: {
  direction: "USDC" | "WETH";
  amount: string;
  slippageBps: number;
}) {
  const [account, setAccount] = useState<Address | null>(null);
  const inputKey = `${direction}:${amount}:${slippageBps}`;
  const [quoteState, setQuoteState] = useState<{
    inputKey: string;
    requestId: number;
    quote: TradingQuoteSummary | null;
    error: string;
    loading: boolean;
  } | null>(null);
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const requestId = useRef(0);
  const connectionId = useRef(0);
  const walletVersion = useRef(0);
  const permissionPrompt = useRef<{ connectionId: number; account: Address | null; invalidated: boolean } | null>(null);
  const connectionSnapshot = useRef<{ account: Address; connectionId: number; version: number } | null>(null);
  const [previousInputKey, setPreviousInputKey] = useState(inputKey);
  if (previousInputKey !== inputKey) {
    setPreviousInputKey(inputKey);
    setQuoteState(null);
  }
  const activeQuoteState = quoteState?.inputKey === inputKey ? quoteState : null;
  const quote = activeQuoteState?.quote ?? null;
  const error = walletError || activeQuoteState?.error || "";
  const loading = activeQuoteState?.loading ?? false;

  useEffect(() => {
    requestId.current += 1;
  }, [direction, amount, slippageBps]);

  useEffect(() => {
    const wallet = provider();
    const reset = () => {
      if (permissionPrompt.current) permissionPrompt.current.invalidated = true;
      connectionSnapshot.current = null;
      walletVersion.current += 1;
      requestId.current += 1;
      setAccount(null);
      setQuoteState(null);
      setWalletError("Wallet account or chain changed. Connect again to request a new quote.");
    };
    const accountsChanged = (accounts: unknown) => {
      const snapshot = connectionSnapshot.current;
      try {
        const nextAccount = walletAccount(accounts);
        const prompt = permissionPrompt.current;
        if (prompt?.connectionId === connectionId.current && !prompt.invalidated) {
          // One consistent account event can be the initial permission grant.
          // Switching away and back must not revive the pending prompt.
          if (!prompt.account || prompt.account.toLowerCase() === nextAccount.toLowerCase()) {
            prompt.account = nextAccount;
            return;
          }
        }
        // A permission grant may emit this event before or after its promise.
        // Only the matching account in the same uninterrupted connection is a no-op.
        if (snapshot && snapshot.connectionId === connectionId.current && snapshot.version === walletVersion.current
          && nextAccount.toLowerCase() === snapshot.account.toLowerCase()) return;
      } catch { /* Missing or malformed accounts invalidate the snapshot. */ }
      reset();
    };
    wallet?.on?.("accountsChanged", accountsChanged);
    wallet?.on?.("chainChanged", reset);
    wallet?.on?.("disconnect", reset);
    return () => {
      connectionId.current += 1;
      permissionPrompt.current = null;
      connectionSnapshot.current = null;
      walletVersion.current += 1;
      requestId.current += 1;
      wallet?.removeListener?.("accountsChanged", accountsChanged);
      wallet?.removeListener?.("chainChanged", reset);
      wallet?.removeListener?.("disconnect", reset);
    };
  }, []);

  useEffect(() => {
    if (!quote) return;
    const timeLeft = Math.max(0, Date.parse(quote.quotedAt) + 30_000 - Date.now());
    const timer = setTimeout(() => {
      requestId.current += 1;
      setQuoteState({ inputKey, requestId: requestId.current, quote: null, error: "Routed quote expired. Request a fresh quote.", loading: false });
    }, timeLeft);
    return () => clearTimeout(timer);
  }, [quote, inputKey]);

  async function connect() {
    const wallet = provider();
    if (!wallet) {
      setWalletError("No browser wallet detected. Install or open an EVM wallet to request a routed quote.");
      return;
    }
    setConnecting(true);
    setWalletError("");
    const currentConnection = ++connectionId.current;
    permissionPrompt.current = { connectionId: currentConnection, account: null, invalidated: false };
    connectionSnapshot.current = null;
    let snapshotVersion: number | undefined;
    try {
      const accounts = await wallet.request({ method: "eth_requestAccounts" });
      if (connectionId.current !== currentConnection) return;
      const requestedAccount = walletAccount(accounts);
      const prompt = permissionPrompt.current;
      if (!prompt || prompt.invalidated || (prompt.account && prompt.account.toLowerCase() !== requestedAccount.toLowerCase())) {
        throw new Error("Wallet account or chain changed. Connect again to request a new quote.");
      }
      permissionPrompt.current = null;
      // Granting account access can itself emit accountsChanged; verify the
      // current snapshot after that prompt before accepting the connection.
      snapshotVersion = walletVersion.current;
      connectionSnapshot.current = { account: requestedAccount, connectionId: currentConnection, version: snapshotVersion };
      const currentAccounts = await wallet.request({ method: "eth_accounts" });
      const chain = await wallet.request({ method: "eth_chainId" });
      if (connectionId.current !== currentConnection || walletVersion.current !== snapshotVersion) return;
      const currentAccount = walletAccount(currentAccounts);
      if (requestedAccount.toLowerCase() !== currentAccount.toLowerCase()) {
        throw new Error("Wallet account changed. Connect again to request a new quote.");
      }
      if (!isPolygonChain(chain)) {
        throw new Error("Switch your wallet to Polygon, then connect again.");
      }
      requestId.current += 1;
      setAccount(currentAccount);
      setWalletError("");
      setQuoteState(null);
    } catch (cause) {
      if (connectionId.current === currentConnection && (snapshotVersion === undefined || walletVersion.current === snapshotVersion)) {
        connectionSnapshot.current = null;
        setAccount(null);
        setWalletError(cause instanceof Error ? cause.message : "Wallet connection was rejected.");
      }
    } finally {
      if (connectionId.current === currentConnection) {
        permissionPrompt.current = null;
        setConnecting(false);
      }
    }
  }

  async function getRoutedQuote() {
    if (!account) return;
    requestId.current += 1;
    const currentRequest = requestId.current;
    setWalletError("");
    setQuoteState({ inputKey, requestId: currentRequest, quote: null, error: "", loading: false });
    const inputToken = TOKENS[direction];
    const outputToken = direction === "USDC" ? TOKENS.WETH : TOKENS.USDC;
    let amountIn: bigint;
    try {
      amountIn = parseExactInput(amount, inputToken.decimals);
    } catch {
      setQuoteState({ inputKey, requestId: currentRequest, quote: null, error: `Enter a positive ${inputToken.symbol} amount with at most ${inputToken.decimals} decimal places.`, loading: false });
      return;
    }
    const intent = {
      chainId: POLYGON_CHAIN_ID,
      swapper: account,
      tokenIn: inputToken.address,
      tokenOut: outputToken.address,
      amountIn: amountIn.toString(),
      slippageBps,
    };
    setQuoteState({ inputKey, requestId: currentRequest, quote: null, error: "", loading: true });
    const wallet = provider();
    const snapshotVersion = walletVersion.current;
    try {
      if (!wallet) throw new Error("Wallet is unavailable");
      const currentAccounts = await wallet.request({ method: "eth_accounts" });
      const chain = await wallet.request({ method: "eth_chainId" });
      if (requestId.current !== currentRequest || walletVersion.current !== snapshotVersion) return;
      if (walletAccount(currentAccounts).toLowerCase() !== account.toLowerCase() || !isPolygonChain(chain)) {
        connectionSnapshot.current = null;
        setAccount(null);
        setQuoteState(null);
        setWalletError("Wallet account or chain changed. Connect again to request a new quote.");
        return;
      }
    } catch {
      if (requestId.current === currentRequest) {
        connectionSnapshot.current = null;
        setAccount(null);
        setQuoteState(null);
        setWalletError("Unable to verify wallet account and chain. Connect again.");
      }
      return;
    }
    try {
      const response = await fetch("/api/trading-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent),
        cache: "no-store",
      });
      if (!response.ok) throw new Error(response.status === 400 ? "Unsupported token or amount for this route." : "Best-route quote is unavailable. Check API access and try again.");
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("quote" in body)) throw new Error("Invalid routed quote response.");
      const result = body.quote as TradingQuoteSummary;
      validateTradingQuoteSummary(result, intent, Date.now());
      if (requestId.current === currentRequest) setQuoteState({ inputKey, requestId: currentRequest, quote: result, error: "", loading: false });
    } catch (cause) {
      if (requestId.current === currentRequest) setQuoteState({ inputKey, requestId: currentRequest, quote: null, error: cause instanceof Error ? cause.message : "Best-route quote is unavailable.", loading: false });
    }
  }

  const outputToken = direction === "USDC" ? TOKENS.WETH : TOKENS.USDC;
  return (
    <section className="section-card trading-card" aria-live="polite" aria-label="Uniswap best-route quote">
      <div className="section-heading"><div><div className="eyebrow">UNISWAP TRADING API</div><h2>Best-route quote</h2></div><span className="badge badge-fresh">Read only</span></div>
      <p className="section-note">Connect a Polygon wallet to request a quote for the amount and slippage at left. No transaction is submitted.</p>
      {account ? <p className="section-note mono">Connected: {account.slice(0, 6)}…{account.slice(-4)}</p> :
        <button className="button button-primary swap-submit" type="button" onClick={connect} disabled={connecting}>{connecting ? "Connecting…" : "Connect wallet for route"}</button>}
      {account && <button className="button button-primary swap-submit" type="button" onClick={getRoutedQuote} disabled={loading}>{loading ? "Finding route…" : "Get best-route quote"}</button>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {quote ? <div className="quote-details routed-details">
        <div><span>Estimated received</span><strong>{formatUnits(BigInt(quote.amountOut), outputToken.decimals)} {outputToken.symbol}</strong></div>
        <div><span>Minimum received</span><strong>{formatUnits(BigInt(quote.minimumAmountOut), outputToken.decimals)} {outputToken.symbol}</strong></div>
        <div><span>Route</span><strong>Uniswap AMM · Polygon · best price</strong></div>
        <div><span>Observed</span><strong>{quote.quotedAt}</strong></div>
        <p className="data-caveat">The Trading API may use v2, v3, v4 or several pools. This quote is bound to the connected wallet and expires after 30 seconds. Approval and swap are not enabled.</p>
      </div> : <p className="section-note routed-placeholder">The routed quote appears here after wallet connection.</p>}
    </section>
  );
}
