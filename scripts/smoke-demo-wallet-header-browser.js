// Mock-only chooser checks. This script makes no RPC requests, signatures or broadcasts.
async page => {
  page.setDefaultTimeout(10000);
  const origin = 'http://127.0.0.1:3020'; const checks = [];
  const check = (valid, name) => { if (!valid) throw new Error(name); checks.push(name); };
  await page.context().addInitScript(() => {
    if (location.search.includes('no-wallet')) return;
    const listeners = new Map(); const mock = { methods: [], account: '0x1111111111111111111111111111111111111111' };
    window.__headerMock = mock;
    window.ethereum = { isMetaMask: true, async request({ method }) { mock.methods.push(method); if (method === 'eth_chainId') return '0x14a34'; if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [mock.account]; throw Error('Unexpected wallet method'); },
      on(event, listener) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(listener); },
      removeListener(event, listener) { listeners.get(event)?.delete(listener); } };
    mock.change = () => { for (const listener of listeners.get('accountsChanged') || []) listener(['0x2222222222222222222222222222222222222222']); };
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: 'Mock-only unavailable read' } }));
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(origin + '/demo/3');
  const trigger = page.getByRole('button', { name: 'Connect wallet', exact: true });
  await trigger.click(); const chooser = page.getByRole('dialog', { name: 'Connect wallet', exact: true }); await chooser.waitFor();
  check((await page.evaluate(() => window.__headerMock.methods)).length === 0, 'Discovery chooser opens without wallet requests');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); check(await chooser.evaluate(el => el.contains(document.activeElement)), 'Tab focus stays inside chooser ' + i); }
  await page.keyboard.press('Escape');
  check(await trigger.evaluate(el => el === document.activeElement), 'Escape restores header focus');
  await trigger.click(); await page.getByRole('button', { name: /MetaMask/ }).click();
  await page.getByRole('button', { name: 'Wallet 0x1111…1111', exact: true }).click();
  await page.getByRole('dialog', { name: 'Your wallet' }).getByText('0x1111111111111111111111111111111111111111', { exact: true }).waitFor();
  check(true, 'Connected header opens the full address');
  await page.getByRole('button', { name: 'Close wallet dialog' }).click();
  await page.evaluate(() => window.__headerMock.change()); await trigger.waitFor();
  check(true, 'Account change clears discovery connection');
  for (const route of ['/demo/1?no-wallet', '/demo/2?no-wallet']) {
    await page.goto(origin + route); await page.getByText(/Install MetaMask/).waitFor();
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).click();
    await page.getByRole('button', { name: /MetaMask/ }).click();
    await page.getByRole('dialog').getByText(/Install MetaMask/).waitFor();
    check(true, 'Missing MetaMask keeps chooser available: ' + route);
    await page.keyboard.press('Escape');
  }
  check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'Header fits 1280px desktop');
  await page.screenshot({ path: '.playwright-cli/demo-wallet-header-1280.png' });
  return { mockOnly: true, checks };
}
