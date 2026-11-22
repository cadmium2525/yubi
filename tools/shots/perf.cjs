// 崩壊中のフレーム時間を測る（目安。ヘッドレスはソフトウェア描画なので実機より遅い）
const { chromium } = require('playwright');
(async () => {
  const W = Number(process.argv[2] || 1280), H = Number(process.argv[3] || 720);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.argv[4] || 1) });
  const p = await ctx.newPage();
  await p.goto('http://localhost:8123/');
  await p.waitForTimeout(1200);
  await p.click('#start');
  await p.waitForTimeout(500);
  const t = await p.evaluate(() => window.__yubi.screenOf('room4', -0.9, 0));
  await p.mouse.move(t.x, t.y); await p.mouse.down(); await p.waitForTimeout(1150); await p.mouse.up();
  const r = await p.evaluate(() => new Promise((res) => {
    const ts = []; let last = performance.now();
    function f(now) { ts.push(now - last); last = now; if (ts.length < 240) requestAnimationFrame(f); else res(ts); }
    requestAnimationFrame(f);
  }));
  r.sort((a, b) => a - b);
  console.log(`frames=${r.length} median=${r[r.length >> 1].toFixed(1)}ms p90=${r[Math.floor(r.length * 0.9)].toFixed(1)}ms max=${r[r.length - 1].toFixed(1)}ms`);
  console.log(JSON.stringify(await p.evaluate(() => ({ chain: window.__yubi.stats.chain, mode: window.__yubi.mode }))));
  await b.close();
})();
