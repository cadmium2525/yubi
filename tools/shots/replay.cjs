// 狙いアシスト（弱点から少しずれた所を押す）→ 解放 → 結果 → リプレイ の確認
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:8123/');
  await p.waitForTimeout(900);
  await p.click('#start'); await p.waitForTimeout(300);
  await p.$$eval('.stage-card', (els) => els[0].click());
  await p.waitForTimeout(1200);
  const t = await p.evaluate(() => window.__yubi.screenOf('stiltR', -0.9, -0.2));
  await p.mouse.move(t.x - 30, t.y + 25); // わざと少し外す
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${out}/r1-magnet.png` });
  await p.mouse.down(); await p.waitForTimeout(1150); await p.mouse.up();
  await p.waitForFunction(() => window.__yubi.mode === 'result', null, { timeout: 30000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/r2-result.png` });
  const r1 = await p.evaluate(() => ({ chain: window.__yubi.stats.chain }));
  await p.click('#replay');
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/r3-replay.png` });
  await p.waitForFunction(() => window.__yubi.mode === 'result', null, { timeout: 40000 });
  const r2 = await p.evaluate(() => ({ chain: window.__yubi.stats.chain }));
  console.log('chain original', r1.chain, 'replay', r2.chain, 'errors', errs);
  await b.close();
})();
