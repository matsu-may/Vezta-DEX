async page => {
  const fixtures = {"compared":{"now":1790800002000,"intent":{"chainId":84532,"wallet":"0xb4f286aeb57ab61af848f7c1619ff98144aed44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"routing":"best-direct"},"quote":{"quote":{"chainId":84532,"wallet":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"routing":"best-direct","protocol":"v3","pool":"0x57183717A087d2fe3Ad890873877244c3B96156c","feeTier":100,"amountOut":"399760020000000","minimumAmountOut":"397761219900000","blockNumber":"123","blockHash":"0xabababababababababababababababababababababababababababababababab","quoteTtlSeconds":120,"observedAt":"2026-09-30T20:26:40.000Z","source":"base-sepolia-rpc"},"priceImpactBps":5,"comparison":{"attemptedPoolCount":4,"qualifiedPoolCount":4,"candidates":[{"feeTier":100,"status":"qualified","amountOut":"399760020000000","priceImpactBps":5},{"feeTier":500,"status":"qualified","amountOut":"399600100000000","priceImpactBps":5},{"feeTier":3000,"status":"qualified","amountOut":"398600600000000","priceImpactBps":5},{"feeTier":10000,"status":"qualified","amountOut":"395802000000000","priceImpactBps":5}]},"qualification":{"configurationVerified":true,"runtimeVerified":true,"executionEnabled":true},"quoteId":"95022da81cc73dfc1192f9f9e94e0e19fdbbd2abd66a009b"},"checked":{"study":{"status":"unsigned-prepared","reason":null,"chainId":84532,"quoteId":"95022da81cc73dfc1192f9f9e94e0e19fdbbd2abd66a009b","intent":{"chainId":84532,"wallet":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"routing":"best-direct"},"approvalKind":"ready","blockNumber":"123","blockHash":"0xabababababababababababababababababababababababababababababababab","observedAt":"2026-09-30T20:26:40.000Z","expiresAt":"2026-09-30T20:28:40.000Z","source":"base-sepolia-rpc","minimumAmountOut":"397761219900000","priceImpactBps":5,"accountNonce":"7","inputBalance":"1000000000000000000","nativeBalance":"1000000000000000000","currentAllowance":"1000000","funding":{"inputBalanceSufficient":true,"nativeEthPositive":true,"l2BudgetCovered":true,"totalBudgetCovered":true},"simulation":{"status":"success","amountOut":"399760020000000"},"gas":{"estimatedGas":"150001","gasLimit":"180002","gasPrice":"20000000","l2FeeCeiling":"3600040000000","l1FeeUpperBound":"3000000000","operatorFeeUpperBound":"0","totalFeeBudget":"3606040000000","totalFeeQualified":true,"fork":"jovian"},"transaction":{"chainId":84532,"from":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","to":"0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4","value":"0","data":"0x5ae401dc000000000000000000000000000000000000000000000000000000006abd70f800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e404e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e00000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000064000000000000000000000000b4f286aeb57ab61af848f7c1619ff98144aed44e00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000169c30037b260000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","nonce":"7","gas":"180002","gasPrice":"20000000"},"runtimeVerified":true,"executionEnabled":true},"action":{"contextId":"50972cc4903594eca7fc60dcf52005e2459b673bb6196958","kind":"swap","chainId":84532,"transaction":{"chainId":84532,"from":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","to":"0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4","value":"0","data":"0x5ae401dc000000000000000000000000000000000000000000000000000000006abd70f800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e404e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e00000000000000000000000042000000000000000000000000000000000000060000000000000000000000000000000000000000000000000000000000000064000000000000000000000000b4f286aeb57ab61af848f7c1619ff98144aed44e00000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000169c30037b260000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","nonce":"7","gas":"180002","gasPrice":"20000000"},"quoteExpiresAt":"2026-09-30T20:28:40.000Z","trackingExpiresAt":"2026-10-01T20:26:42.000Z","executionEnabled":true}}},"selected":{"now":1790800002000,"intent":{"chainId":84532,"wallet":"0xb4f286aeb57ab61af848f7c1619ff98144aed44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"poolFeeTier":500},"quote":{"quote":{"chainId":84532,"wallet":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"poolFeeTier":500,"protocol":"v3","pool":"0x94bfc0574FF48E92cE43d495376C477B1d0EEeC0","feeTier":500,"amountOut":"399600100000000","minimumAmountOut":"397602099500000","blockNumber":"123","blockHash":"0xabababababababababababababababababababababababababababababababab","quoteTtlSeconds":120,"observedAt":"2026-09-30T20:26:40.000Z","source":"base-sepolia-rpc"},"priceImpactBps":5,"qualification":{"configurationVerified":true,"runtimeVerified":true,"executionEnabled":true},"quoteId":"0d0b9674b07c4447669180f312a88ed4dec4eb3d56f9b01e"},"checked":{"study":{"status":"unsigned-prepared","reason":null,"chainId":84532,"quoteId":"0d0b9674b07c4447669180f312a88ed4dec4eb3d56f9b01e","intent":{"chainId":84532,"wallet":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","tokenIn":"0x036CbD53842c5426634e7929541eC2318f3dCF7e","tokenOut":"0x4200000000000000000000000000000000000006","amountIn":"1000000","slippageBps":50,"poolFeeTier":500},"approvalKind":"ready","blockNumber":"123","blockHash":"0xabababababababababababababababababababababababababababababababab","observedAt":"2026-09-30T20:26:40.000Z","expiresAt":"2026-09-30T20:28:40.000Z","source":"base-sepolia-rpc","minimumAmountOut":"397602099500000","priceImpactBps":5,"accountNonce":"7","inputBalance":"1000000000000000000","nativeBalance":"1000000000000000000","currentAllowance":"1000000","funding":{"inputBalanceSufficient":true,"nativeEthPositive":true,"l2BudgetCovered":true,"totalBudgetCovered":true},"simulation":{"status":"success","amountOut":"399600100000000"},"gas":{"estimatedGas":"150001","gasLimit":"180002","gasPrice":"20000000","l2FeeCeiling":"3600040000000","l1FeeUpperBound":"3000000000","operatorFeeUpperBound":"0","totalFeeBudget":"3606040000000","totalFeeQualified":true,"fork":"jovian"},"transaction":{"chainId":84532,"from":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","to":"0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4","value":"0","data":"0x5ae401dc000000000000000000000000000000000000000000000000000000006abd70f800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e404e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e000000000000000000000000420000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000001f4000000000000000000000000b4f286aeb57ab61af848f7c1619ff98144aed44e00000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000001699df3e713e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","nonce":"7","gas":"180002","gasPrice":"20000000"},"runtimeVerified":true,"executionEnabled":true},"action":{"contextId":"e9539f747f3ecda1b660873158e2ada930415cc8407d5df5","kind":"swap","chainId":84532,"transaction":{"chainId":84532,"from":"0xb4F286AEB57Ab61af848F7c1619Ff98144aED44e","to":"0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4","value":"0","data":"0x5ae401dc000000000000000000000000000000000000000000000000000000006abd70f800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000e404e45aaf000000000000000000000000036cbd53842c5426634e7929541ec2318f3dcf7e000000000000000000000000420000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000001f4000000000000000000000000b4f286aeb57ab61af848f7c1619ff98144aed44e00000000000000000000000000000000000000000000000000000000000f42400000000000000000000000000000000000000000000000000001699df3e713e0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000","nonce":"7","gas":"180002","gasPrice":"20000000"},"quoteExpiresAt":"2026-09-30T20:28:40.000Z","trackingExpiresAt":"2026-10-01T20:26:42.000Z","executionEnabled":true}}}};
  // MOCK ONLY: disposable account, in-memory API fixtures, no RPC or real signing.
  const checks = []; const requests = []; let selected = fixtures.compared;
  const hash = '0x' + '11'.repeat(32);
  const check = (value, name) => { if (!value) throw new Error(name); checks.push(name); };
  page.setDefaultTimeout(15000);
  await page.context().addInitScript(f => {
    window.__routingMock = { now: f.now, methods: [], transactions: [] };
    Date.now = () => window.__routingMock.now;
    window.ethereum = { isMetaMask: true, on() {}, removeListener() {}, async request({method,params}) {
      window.__routingMock.methods.push(method);
      if(method==='eth_chainId') return '0x14a34';
      if(method==='eth_getCode') return '0x';
      if(method==='eth_accounts'||method==='eth_requestAccounts') return [f.intent.wallet];
      if(method==='eth_sendTransaction') { window.__routingMock.transactions.push(params[0]); return '0x'+'11'.repeat(32); }
      throw new Error('Unexpected mock wallet method');
    } };
  }, selected);
  await page.route('**/demo/1*',async route => {
    const response=await route.fetch(); const html=await response.text();
    await route.fulfill({response,body:html.replaceAll('\\"executionEnabled\\":false','\\"executionEnabled\\":true').replaceAll('Read-only preview · wallet submission is disabled','Test tokens only · every transaction is signed in your wallet')});
  });
  await page.route('**/api/**',async route => {
    const action=route.request().url().split('/api/testnet-wallet/')[1]; const body=route.request().postDataJSON();
    requests.push({action,body}); let response;
    if(action==='quote') response=selected.quote;
    else if(action==='recheck') response=selected.checked;
    else if(action==='receipt') response={observation:{contextId:selected.checked.action.contextId,hash,kind:'swap',chainId:84532,source:'base-sepolia-rpc',observedAt:new Date(selected.now).toISOString(),executionEnabled:false,status:'confirmed',confirmations:'2',blockNumber:'124',blockHash:'0x'+'cd'.repeat(32),execution:{status:'verified',amountIn:selected.intent.amountIn,amountOut:selected.quote.quote.amountOut,l2GasCost:'1000000000000',actualTotalFeeQualified:false,balances:{USDC:'1000000',WETH:selected.quote.quote.amountOut,ETH:'1000000000000000'},tokenAllowance:'0',allowanceMatchesExpected:true,stateBlockNumber:'125',stateBlockHash:'0x'+'ef'.repeat(32)}}};
    else throw new Error('Unexpected API request');
    await route.fulfill({status:200,json:response});
  });
  const origin='http://127.0.0.1:3020';
  async function connect() {
    await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
    await page.getByRole('button',{name:/MetaMask/}).click();
    await page.getByRole('button',{name:/^Wallet 0x/}).waitFor();
  }
  await page.setViewportSize({width:1440,height:1080});
  await page.goto(origin+'/demo/1');
  await page.evaluate(()=>localStorage.clear()); await page.reload();
  await page.getByRole('button',{name:'Connect wallet',exact:true}).waitFor();
  check((await page.evaluate(()=>window.__routingMock.methods)).length===0,'Routing view never prompts on load');
  await connect();
  await page.getByText(/Swap settings ·/).click();
  await page.getByLabel('Routing preference',{exact:true}).selectOption('best-direct');
  await page.getByRole('button',{name:'Get wallet quote',exact:true}).click();
  await page.getByText('Minimum received',{exact:true}).waitFor();
  check(requests.at(-1).body.routing==='best-direct','Comparison preference reaches quote API');
  await page.getByText('Selected route · 4/4 pools qualified',{exact:true}).click();
  check(await page.getByText('Uniswap v3 · Base Sepolia · 0.01% fee',{exact:true}).isVisible(),'Winning fee displayed with chain');
  check(await page.getByRole('link',{name:selected.quote.quote.pool,exact:true}).isVisible(),'Winning pool address displayed');
  await page.getByRole('button',{name:'Review swap',exact:true}).click();
  await page.getByText('Complete snapshot fee budget',{exact:true}).waitFor();
  check(requests.at(-1).body.intent.routing==='best-direct','Review retains comparison intent');
  check(!(await page.evaluate(()=>window.__routingMock.methods)).includes('eth_sendTransaction'),'Review never broadcasts');
  await page.screenshot({path:'.playwright-cli/direct-pool-routing-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Submit reviewed testnet transaction',exact:true}).click();
  await page.getByRole('button',{name:'Check original transaction',exact:true}).waitFor();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('vezta-dex:base-sepolia-submission:v1')));
  check(saved.quote.feeTier===100 && saved.intent.routing==='best-direct' && saved.hash===hash,'Recovery retains winning pool fee and original hash');
  check(await page.evaluate(data=>window.__routingMock.transactions[0].data===data,selected.checked.action.transaction.data),'Only reviewed winning calldata sent');
  await page.reload();
  await page.getByRole('button',{name:'Check original transaction',exact:true}).waitFor();
  check((await page.evaluate(()=>window.__routingMock.transactions)).length===0,'Reload never submits again');
  await page.getByRole('button',{name:'Check original transaction',exact:true}).click();
  await page.getByRole('button',{name:'Acknowledge verified result',exact:true}).waitFor();
  check(true,'Compared route original receipt verified after reload');
  await page.getByRole('button',{name:'Acknowledge verified result',exact:true}).click();
  await page.waitForFunction(()=>localStorage.getItem('vezta-dex:base-sepolia-submission:v1')===null);
  selected=fixtures.selected;
  await page.goto(origin+'/demo/1?fee=500&pool='+selected.quote.quote.pool);
  await connect();
  await page.getByText(/Swap settings ·/).click();
  check(await page.getByLabel('Routing preference',{exact:true}).inputValue()==='500','Curated pool URL selects explicit 0.05% pool');
  await page.getByRole('button',{name:'Get wallet quote',exact:true}).click();
  await page.getByText('Minimum received',{exact:true}).waitFor();
  check(requests.at(-1).body.poolFeeTier===500 && !requests.at(-1).body.routing,'Explicit pool intent has no comparison mode');
  await page.getByLabel('Routing preference',{exact:true}).selectOption('legacy');
  check(await page.getByText('Minimum received',{exact:true}).count()===0,'Changing routing preference invalidates output');
  await page.goto(origin+'/demo/1?fee=500&fee=3000&pool='+selected.quote.quote.pool);
  await page.getByText('The pool URL is invalid. Choose a curated routing preference in Swap settings.',{exact:true}).waitFor();
  await connect();
  check(await page.getByRole('button',{name:'Get wallet quote',exact:true}).isDisabled(),'Duplicate pool URL blocks quote without silent fallback');
  return {mockOnly:true,checks,apiCalls:requests.length};
}
