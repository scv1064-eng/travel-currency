import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const deployed=process.argv[2];
const server=deployed?null:spawn('python3',['-m','http.server','8080','--directory','dist'],{stdio:'ignore'});
const url=deployed||'http://127.0.0.1:8080/';
let browser;
try {
 if(server)await new Promise(r=>setTimeout(r,1000));
 browser=await chromium.launch();
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:deployed?'allow':'block'});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 if(!deployed){
  const codes=['USD','EUR','KRW','JPY','CNY','GBP','THB','VND','TWD','HKD','SGD','AUD','CAD','CHF','NZD','PHP','IDR','MYR','INR','AED','TRY','MXN','SEK','ZAR'];
  const rates=Object.fromEntries(codes.map(c=>[c,1]));Object.assign(rates,{USD:1,EUR:0.9,KRW:1400,JPY:150});
  await page.route('https://open.er-api.com/**',r=>r.fulfill({json:{result:'success',time_last_update_unix:Math.floor(Date.now()/1000),rates}}));
 }
 const response=await page.goto(url,{waitUntil:'networkidle'});assert.equal(response.status(),200);
 await page.waitForFunction(()=>document.getElementById('result').textContent!=='—',{},{timeout:20000});
 assert.equal(await page.locator('#from option').count(),24);
 if(!deployed){
  await page.fill('#amount','100');assert.equal(await page.locator('#result').textContent(),'140,000');
  await page.selectOption('#from','EUR');await page.fill('#amount','9');assert.equal(await page.locator('#result').textContent(),'14,000');
  await page.click('#swap');assert.equal(await page.locator('#from').inputValue(),'KRW');
  await page.fill('#amount','14000');assert.equal(await page.locator('#result').textContent(),'9');
  await page.selectOption('#from','JPY');await page.selectOption('#to','KRW');assert.equal(await page.locator('.destination').count(),0);
  await page.click('.reset');await page.getByRole('button',{name:'1',exact:true}).click();await page.getByRole('button',{name:'소수점',exact:true}).click();await page.getByRole('button',{name:'5',exact:true}).click();assert.equal(await page.locator('#amount').inputValue(),'1.5');
  await page.fill('#amount','1.2.3.4');assert.equal(await page.locator('#amount').inputValue(),'1.234');
  await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('#amount').inputValue(),'1.234');
  await page.unroute('https://open.er-api.com/**');await page.route('https://open.er-api.com/**',r=>r.abort());await page.click('#refresh');await page.waitForFunction(()=>document.getElementById('status').textContent.includes('저장 환율'));
 } else {
  const cached=await page.evaluate(()=>JSON.parse(localStorage.getItem('pw-rates')));assert(cached.rates.KRW>0&&cached.rates.EUR>0);
  await page.fill('#amount','10');const result=Number((await page.locator('#result').textContent()).replaceAll(',',''));assert.equal(result,Math.round(10*cached.rates.KRW/cached.rates.USD));
  console.log('LIVE FX timestamp:',new Date(cached.time_last_update_unix*1000).toISOString());
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload({waitUntil:'networkidle'});await context.setOffline(true);await page.reload({waitUntil:'load'});assert.notEqual(await page.locator('#result').textContent(),'—');assert.match(await page.locator('#status').textContent(),/저장 환율/);await context.setOffline(false);
 }
 await page.click('#install');await page.locator('#guide').waitFor({state:'visible'});await page.click('#done');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const [width,height] of [[320,568],[360,640],[390,844]]){await page.setViewportSize({width,height});const box=await page.locator('#keypad').boundingBox();assert(box.y+box.height<=height);assert.equal(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight),true);}
 await page.setViewportSize({width:1280,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log(deployed?'PASS: deployed HTTP, live FX, calculation, service worker offline reload, install guide, responsive layout':'PASS: 24 currencies, cross conversion, swap, fixed keypad, decimal sanitization, preferences, cached fallback, install guide, mobile/desktop widths');
} finally {await browser?.close();server?.kill();}
