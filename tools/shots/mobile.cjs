// スマホの画面で確認（タッチの長押しを CDP で送る）。 node tools/shots/mobile.cjs <出力フォルダ> <幅> <高さ>
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  const W = Number(process.argv[3] || 844), H = Number(process.argv[4] || 390);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) logs.push(`[console] ${m.text()}`); });
  await page.goto('http://localhost:8123/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/m1-title.png` });
  await page.tap('#start');
  await page.waitForTimeout(900);
  const cdp = await ctx.newCDPSession(page);
  const t = await page.evaluate(() => window.__yubi.screenOf('ball', -0.8, 0));
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await touch('touchStart', t.x, t.y);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${out}/m2-charge.png` });
  await page.waitForTimeout(150);
  await touch('touchEnd', t.x, t.y);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: `${out}/m3-collapse.png` });
  // 追撃
  const o = await page.evaluate(() => window.__yubi.screenOf('stiltL', -1, -0.5));
  await touch('touchStart', o.x, o.y); await touch('touchEnd', o.x, o.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${out}/m4-follow.png` });
  await page.waitForFunction(() => window.__yubi.mode === 'result', null, { timeout: 30000 }).catch(() => logs.push('result timeout'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/m5-result.png` });
  console.log(JSON.stringify(await page.evaluate(() => ({ mode: window.__yubi.mode, chain: window.__yubi.stats.chain, used: window.__yubi.stats.usedFollow }))));
  console.log(logs.join('\n'));
  await browser.close();
})();
