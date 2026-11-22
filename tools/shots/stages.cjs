// 各ステージを開いて画面を撮る。 node tools/shots/stages.cjs <出力フォルダ>
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  // 全ステージを解放した状態にする
  await p.addInitScript(() => localStorage.setItem('yubi-ippon.v1', JSON.stringify({ settings: {}, best: { tower: { score: 1, rate: 0.5, chain: 1, damage: 1 }, shop: { score: 1, rate: 0.5, chain: 1, damage: 1 }, yard: { score: 1, rate: 0.5, chain: 1, damage: 1 } }, plays: 5 })));
  await p.goto('http://localhost:8123/');
  await p.waitForTimeout(1000);
  await p.click('#start');
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${out}/s0-select.png` });
  const n = await p.$$eval('.stage-card', (els) => els.length);
  for (let i = 0; i < n; i++) {
    if (i > 0) { await p.evaluate(() => document.getElementById('hud-stage').click()); await p.waitForTimeout(300); }
    await p.$$eval('.stage-card', (els, i) => els[i].click(), i);
    await p.waitForTimeout(1800);
    await p.screenshot({ path: `${out}/s${i + 1}-stage.png` });
  }
  console.log('cards', n, 'errors', errs);
  await b.close();
})();
