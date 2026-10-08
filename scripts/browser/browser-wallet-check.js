// Run with playwright-cli run-code --filename=scripts/browser-wallet-check.js.
// Uses only a mock wallet and intercepted quote responses; never signs or sends.
async page => {
  const checks = [];
  let quoteRequests = 0;
  await page.context().addInitScript(() => {
    const listeners = new Map();
    const state = {
      account: "0x1111111111111111111111111111111111111111",
      chain: "0x89",
      deferChain: false,
      delayedGrant: false,
      deferAccounts: false,
      resolveAccounts: null,
      resolveChain: null,
      methods: [],
      emit(event) { for (const listener of listeners.get(event) || []) listener(event === "accountsChanged" ? [state.account] : undefined); },
    };
    window.__walletCheck = state;
    window.ethereum = {
      async request({ method }) {
        state.methods.push(method);
        if (method === "eth_requestAccounts") {
          if (!state.delayedGrant) state.emit("accountsChanged");
          if (state.deferAccounts) return new Promise(resolve => { state.resolveAccounts = resolve; });
          return [state.account];
        }
        if (method === "eth_accounts") { if (state.delayedGrant) { state.delayedGrant = false; state.emit("accountsChanged"); } return [state.account]; }
        if (method === "eth_chainId") {
          if (state.deferChain) return new Promise(resolve => { state.resolveChain = resolve; });
          return state.chain;
        }
        throw new Error("Signing and submission are forbidden in this browser check");
      },
      on(event, listener) { listeners.set(event, [...(listeners.get(event) || []), listener]); },
      removeListener(event, listener) { listeners.set(event, (listeners.get(event) || []).filter(item => item !== listener)); },
    };
  });
  await page.route("**/api/trading-quote", async route => {
    quoteRequests++;
    const intent = route.request().postDataJSON();
    await route.fulfill({ json: { quoteId: "a".repeat(48), quote: {
      ...intent, amountOut: "100000000000000000", minimumAmountOut: "99500000000000000",
      routing: "CLASSIC", routerVersion: "2.1.2", requestId: "browser-mock",
      quotedAt: new Date().toISOString(), source: "uniswap-trading-api",
    } } });
  });
  await page.reload();
  const connect = () => page.getByRole("button", { name: "Connect wallet for route" });
  const getQuote = () => page.getByRole("button", { name: "Get best-route quote" });
  await connect().click();
  await getQuote().waitFor();
  checks.push("initial account-access event connects without a second click");
  await getQuote().click();
  await page.getByText("0.1 WETH", { exact: true }).waitFor();
  await page.getByRole("textbox", { name: "Amount", exact: true }).fill("200");
  await page.getByText("0.1 WETH", { exact: true }).waitFor({ state: "hidden" });
  checks.push("input change clears the displayed quote");
  await getQuote().click();
  await page.getByText("0.1 WETH", { exact: true }).waitFor();
  await page.evaluate(() => { window.__walletCheck.account = "0x2222222222222222222222222222222222222222"; window.__walletCheck.emit("accountsChanged"); });
  await connect().waitFor();
  await page.getByText("0.1 WETH", { exact: true }).waitFor({ state: "hidden" });
  checks.push("account event clears connection and quote");
  await connect().click();
  await getQuote().waitFor();
  const before = quoteRequests;
  await page.evaluate(() => { window.__walletCheck.account = "0x3333333333333333333333333333333333333333"; });
  await getQuote().click();
  await connect().waitFor();
  if (quoteRequests !== before) throw new Error("Silent account change contacted quote API");
  checks.push("silent account change is caught before fetching a quote");
  await page.evaluate(() => { window.__walletCheck.chain = "0x89junk"; });
  await connect().click();
  await page.getByText("Switch your wallet to Polygon, then connect again.", { exact: true }).waitFor();
  if (await getQuote().count()) throw new Error("Malformed chain was accepted");
  checks.push("malformed Polygon-prefix chain is rejected");
  await page.evaluate(() => { window.__walletCheck.chain = "0x89"; window.__walletCheck.deferChain = true; });
  await connect().click();
  await page.waitForFunction(() => typeof window.__walletCheck.resolveChain === "function");
  await page.evaluate(() => { window.__walletCheck.emit("chainChanged"); window.__walletCheck.resolveChain("0x89"); window.__walletCheck.deferChain = false; });
  await connect().waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Connect wallet for route")?.disabled);
  if (await getQuote().count()) throw new Error("Stale chain snapshot restored connection");
  checks.push("chain event during connection checks prevents stale reconnection");
  await page.evaluate(() => { window.__walletCheck.delayedGrant = true; });
  await connect().click();
  await getQuote().waitFor();
  checks.push("delayed matching permission-grant event connects without a second click");
  await page.evaluate(() => { window.__walletCheck.emit("chainChanged"); window.__walletCheck.deferAccounts = true; });
  await connect().click();
  await page.waitForFunction(() => typeof window.__walletCheck.resolveAccounts === "function");
  await page.evaluate(() => {
    const state = window.__walletCheck;
    const originalAccount = state.account;
    state.account = "0x4444444444444444444444444444444444444444";
    state.emit("accountsChanged");
    state.account = originalAccount;
    state.emit("accountsChanged");
    state.deferAccounts = false;
    state.resolveAccounts([originalAccount]);
  });
  await connect().waitFor();
  await page.waitForFunction(() => !Array.from(document.querySelectorAll("button")).find(button => button.textContent === "Connect wallet for route")?.disabled);
  if (await getQuote().count()) throw new Error("Interrupted permission prompt restored connection");
  checks.push("account change away and back during permission prompt remains disconnected");
  const methods = await page.evaluate(() => [...new Set(window.__walletCheck.methods)]);
  if (methods.some(method => /sign|send/i.test(method))) throw new Error("Unexpected signing method");
  await page.screenshot({ path: ".playwright-cli/wallet-connection.png", fullPage: true });
  return { checks, quoteRequests, walletMethods: methods, noSigningOrSubmission: true, data: "mock wallet and mock quote response" };
}
