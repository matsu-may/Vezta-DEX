async page => {
  // MOCK ONLY: new in-memory browser session, deterministic public test account.
  // Every rehearsal API request is intercepted; no RPC, real signature or broadcast is used.
  const fixture = {"account":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","now":1790640000000,"intent":{"chainId":137,"swapper":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","tokenIn":"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359","tokenOut":"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619","amountIn":"1000000","slippageBps":50},"quote":{"chainId":137,"swapper":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","tokenIn":"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359","tokenOut":"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619","amountIn":"1000000","slippageBps":50,"amountOut":"1000","minimumAmountOut":"995","routing":"CLASSIC","routerVersion":"2.1.2","requestId":"fixture","quotedAt":"2026-09-29T00:00:00.000Z","source":"uniswap-trading-api"},"state":{"chainId":137,"account":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","accountKind":"eoa","accountNonce":"7","blockNumber":"122","observedAt":"2026-09-29T00:00:00.000Z","balances":{"USDC":"2000000","WETH":"0","POL":"1000000000000000000"},"tokenAllowance":"1000000","permitAllowance":{"amount":"0","expiration":"0","nonce":"7"},"approvalGas":null},"permit":{"chainId":137,"quoteId":"abababababababababababababababababababababababab","quoteExpiresAt":"2026-09-29T00:00:30.000Z","blockNumber":"123","observedAt":"2026-09-29T00:00:00.000Z","permit":{"kind":"sign","data":{"domain":{"name":"Permit2","chainId":137,"verifyingContract":"0x000000000022D473030F116dDEE9F6B43aC78BA3"},"types":{"PermitSingle":[{"name":"details","type":"PermitDetails"},{"name":"spender","type":"address"},{"name":"sigDeadline","type":"uint256"}],"PermitDetails":[{"name":"token","type":"address"},{"name":"amount","type":"uint160"},{"name":"expiration","type":"uint48"},{"name":"nonce","type":"uint48"}]},"values":{"details":{"token":"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359","amount":"1000000","expiration":1793232000,"nonce":7},"spender":"0xDc264714F68d84CF29BC605589405E78bDBE7C9f","sigDeadline":1790641800}},"allowanceExpiresAt":"2026-10-29T00:00:00.000Z","signatureDeadline":"2026-09-29T00:30:00.000Z"}},"preparation":{"chainId":137,"quoteId":"abababababababababababababababababababababababab","intent":{"chainId":137,"swapper":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","tokenIn":"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359","tokenOut":"0x7ceb23fd6bc0add59e62ac25578270cff1b9f619","amountIn":"1000000","slippageBps":50},"quoteExpiresAt":"2026-09-29T00:00:30.000Z","deadline":"1790640030","transaction":{"chainId":137,"from":"0x1a642f0E3c3aF545E7AcBD38b07251B3990914F1","to":"0xDc264714F68d84CF29BC605589405E78bDBE7C9f","data":"0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a0000000000000000000000000000000000000000000000000000000006abaff9e00000000000000000000000000000000000000000000000000000000000000020a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000001c000000000000000000000000000000000000000000000000000000000000001600000000000000000000000003c499c542cef5e3811e1192ce70d8cc03d5c335900000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000006ae28c800000000000000000000000000000000000000000000000000000000000000007000000000000000000000000dc264714f68d84cf29bc605589405e78bdbe7c9f000000000000000000000000000000000000000000000000000000006abb068800000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000004112ed8b7ed81c8bfff25ee8778fd54c0a5aeddbbd01f99ca5bb3daca9e8476f0d3889017e64b110ed3c68e7cd4e9486492a9d7ee662f4de27d5741e1c9594c3bc1b0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001400000000000000000000000001a642f0e3c3af545e7acbd38b07251b3990914f100000000000000000000000000000000000000000000000000000000000f424000000000000000000000000000000000000000000000000000000000000003e300000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000120000000000000000000000000000000000000000000000000000000000000002b3c499c542cEF5E3811e1192ce70d8cC03d5c33590001f47ceb23fd6bc0add59e62ac25578270cff1b9f6190000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","value":"0","gas":"120000","gasPrice":"36000000000"},"simulation":{"status":"success","source":"polygon-rpc","blockNumber":"123","observedAt":"2026-09-29T00:00:00.000Z"}},"signature":"0x12ed8b7ed81c8bfff25ee8778fd54c0a5aeddbbd01f99ca5bb3daca9e8476f0d3889017e64b110ed3c68e7cd4e9486492a9d7ee662f4de27d5741e1c9594c3bc1b","hash":"0x1111111111111111111111111111111111111111111111111111111111111111","blockHash":"0x2222222222222222222222222222222222222222222222222222222222222222"};
  const checks = [];
  const apiCalls = [];
  let failSimulation = false;
  await page.context().addInitScript(f => {
    const listeners = new Map();
    const mock = { account: f.account, chain: "0x89", now: f.now, methods: [], rejectSign: false, rejectSend: false, deferSend: false };
    Date.now = () => mock.now;
    window.__dexRehearsalMock = mock;
    window.ethereum = {
      async request({ method }) {
        mock.methods.push(method);
        if (method === "eth_chainId") return mock.chain;
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [mock.account];
        if (method === "eth_signTypedData_v4") { if (mock.rejectSign) throw { code: 4001 }; return f.signature; }
        if (method === "eth_sendTransaction") { if (mock.rejectSend) throw { code: 4001 }; if (mock.deferSend) return new Promise(() => {}); return f.hash; }
        throw new Error("Unsupported mock wallet method");
      },
      on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
      removeListener(event, fn) { listeners.get(event)?.delete(fn); },
    };
    mock.emit = (event, value) => { for (const fn of listeners.get(event) || []) fn(value); };
  }, fixture);
  await page.route("**/api/rehearsal/**", async route => {
    const action = route.request().url().split("/api/rehearsal/")[1]?.split(/[?#]/)[0];
    apiCalls.push(action);
    let response;
    if (action === "quote") response = { quote: fixture.quote, quoteId: fixture.preparation.quoteId };
    else if (action === "state") response = { state: fixture.state };
    else if (action === "approval") response = { approval: { chainId: 137, blockNumber: "123", observedAt: new Date(fixture.now).toISOString(), currentAllowance: "1000000", plan: { kind: "ready" } } };
    else if (action === "permit") response = { permitPlan: fixture.permit };
    else if (action === "prepare" || action === "recheck") {
      if (failSimulation) return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Mock simulation failure" }) });
      response = { preparation: fixture.preparation };
    } else if (action === "receipt") response = {
      observation: { chainId: 137, hash: fixture.hash, source: "polygon-rpc", observedAt: new Date(fixture.now).toISOString(), status: "confirmed", receipt: { from: fixture.account, to: fixture.preparation.transaction.to, blockNumber: "123", blockHash: fixture.blockHash, confirmations: "2", outcome: "success", gasUsed: "100000", effectiveGasPrice: "30000000000" } },
      execution: { status: "verified", nonce: "7", amountIn: "1000000", amountOut: "1000", gasCost: "3000000000000000", balances: { USDC: "1000000", WETH: "1000", POL: "999000000000000000" }, tokenAllowance: "0", permitAllowance: { amount: "0", expiration: "0", nonce: "8" } },
    };
    else throw new Error("Unexpected mock API action");
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(response) });
  });
  const check = (condition, name) => { if (!condition) throw new Error(name); checks.push(name); };
  async function fresh() {
    await page.goto("http://127.0.0.1:3020/rehearsal");
    await page.getByRole("heading", { name: "Review a small wallet swap" }).waitFor();
    await page.evaluate(() => localStorage.removeItem("vezta-dex:local-submission:v1"));
    await page.reload();
    await page.getByRole("button", { name: "Connect Polygon wallet" }).waitFor();
  }
  async function quoted() {
    await page.getByRole("button", { name: "Connect Polygon wallet" }).click();
    await page.getByRole("button", { name: "Get rehearsal quote" }).click();
    await page.getByText("Minimum received", { exact: true }).waitFor();
  }
  async function signed() {
    await page.getByRole("button", { name: "Review Permit2", exact: true }).click();
    await page.getByRole("button", { name: "Sign reviewed Permit2" }).click();
    await page.getByRole("button", { name: "Prepare and simulate swap" }).waitFor();
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await fresh();
  check((await page.evaluate(() => window.__dexRehearsalMock.methods)).length === 0, "No wallet prompt on page load");
  await quoted(); await signed();
  await page.getByRole("button", { name: "Prepare and simulate swap" }).click();
  await page.getByText("Estimated gas limit", { exact: true }).waitFor();
  check(!(await page.evaluate(() => window.__dexRehearsalMock.methods)).includes("eth_sendTransaction"), "No broadcast before explicit reviewed submit");
  await page.screenshot({ path: ".playwright-cli/rehearsal-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Submit reviewed swap" }).click();
  await page.getByRole("link", { name: "View original Polygon transaction" }).waitFor();
  await page.getByRole("button", { name: "Check original transaction" }).click();
  await page.getByText("Verified executed output", { exact: true }).waitFor();
  check(true, "Explicit mocked swap lifecycle reaches verified output");
  await fresh(); await quoted();
  await page.getByRole("button", { name: "Review Permit2", exact: true }).click();
  await page.evaluate(() => { window.__dexRehearsalMock.rejectSign = true; });
  await page.getByRole("button", { name: "Sign reviewed Permit2" }).click();
  await page.getByRole("heading", { name: "Action needs review", exact: true }).waitFor();
  check(!(await page.evaluate(() => window.__dexRehearsalMock.methods)).includes("eth_sendTransaction"), "Rejected signature cannot broadcast");
  await fresh(); await quoted(); await signed(); failSimulation = true;
  await page.getByRole("button", { name: "Prepare and simulate swap" }).click();
  await page.getByRole("heading", { name: "Action needs review", exact: true }).waitFor();
  check(!(await page.evaluate(() => window.__dexRehearsalMock.methods)).includes("eth_sendTransaction"), "Failed simulation cannot broadcast");
  failSimulation = false;
  await fresh(); await quoted(); await signed();
  await page.getByRole("button", { name: "Prepare and simulate swap" }).click();
  await page.getByRole("button", { name: "Submit reviewed swap" }).waitFor();
  await page.evaluate(() => { window.__dexRehearsalMock.deferSend = true; });
  await page.getByRole("button", { name: "Submit reviewed swap" }).click();
  await page.waitForFunction(() => localStorage.getItem("vezta-dex:local-submission:v1") !== null);
  await page.reload();
  await page.getByRole("heading", { name: "Submission outcome uncertain", exact: true }).waitFor();
  check((await page.evaluate(() => window.__dexRehearsalMock.methods)).length === 0, "Reload never reopens broadcast");
  await page.getByLabel("Original transaction hash", { exact: true }).fill(fixture.hash);
  await page.getByRole("button", { name: "Recover original hash" }).click();
  await page.getByRole("button", { name: "Check original transaction" }).click();
  await page.getByText("Verified executed output", { exact: true }).waitFor();
  check(true, "Uncertain reload recovers the original mocked hash");
  await fresh(); await quoted();
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "Mobile has no horizontal overflow");
  await page.screenshot({ path: ".playwright-cli/rehearsal-mobile.png", fullPage: true });
  await page.evaluate(() => {
    window.__dexRehearsalMock.account = "0x1111111111111111111111111111111111111111";
    window.__dexRehearsalMock.emit("accountsChanged", [window.__dexRehearsalMock.account]);
  });
  await page.getByRole("heading", { name: "Wallet or input changed", exact: true }).waitFor();
  check(await page.getByText("Minimum received", { exact: true }).count() === 0, "Account change invalidates quote");
  console.log(JSON.stringify({ mockOnly: true, checks, apiCalls: apiCalls.length }));
}
