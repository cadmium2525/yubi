// ブラウザで画面を撮る（確認用）。 node tools/shots/shoot.cjs <出力フォルダ> [幅] [高さ] [mobile]
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.';
  const W = Number(process.argv[3] || 1280), H = Number(process.argv[4] || 720);
  const mobile = process.argv[5] === 'mobile';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto('http://localhost:8123/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/01-title.png` });
  await page.click('#start');
  await page.waitForTimeout(800);
  // 右の柱を狙う
  const target = await page.evaluate(() => window.__yubi?.screenOf('stiltR', -0.9, -0.2));
  console.log('target', JSON.stringify(target));
  if (target) {
    await page.mouse.move(target.x, target.y);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/02-aim.png` });
    await page.mouse.down();
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/03-charge.png` });
    await page.waitForTimeout(420);
    await page.screenshot({ path: `${out}/04-crit.png` });
    await page.mouse.up();
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${out}/05-release.png` });
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${out}/06-collapse.png` });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${out}/07-collapse2.png` });
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `${out}/08-result.png` });
  }
  console.log(logs.join('\n'));
  await browser.close();
})();
