/*
 * どのステージでも使える確認：静止テスト＋いろいろな狙い方の結果の分布。
 *   node tools/sim/stage-check.mjs <ステージID|daily:YYYY-MM-DD> [回数]
 *   node tools/sim/stage-check.mjs shop shot shop0 1.0 -0.9 -0.75 [part]   … 一発だけ
 */
import { createRequire } from 'node:module';
import { createPhysics, rng } from '../../src/physics.js';
import { STAGES, makeDailyStage } from '../../src/stage.js';
const require = createRequire(import.meta.url);
const M = require('../../vendor/matter-js/matter.min.js');
M.Common.warnOnce = () => {};
const [sid, a2, ...rest] = process.argv.slice(2);
const stage = sid.startsWith('daily:') ? makeDailyStage(sid.slice(6)) : STAGES.find((s) => s.id === sid);

function runShot(P, id, dx, dy, power, part) {
  const ent = P.entities.find((e) => e.id === id);
  let pt;
  if (part) {
    const pp = ent.body.parts.find((p) => p.label === part);
    pt = { x: pp.position.x + dx * (pp.bounds.max.x - pp.bounds.min.x) / 2, y: pp.position.y + dy * (pp.bounds.max.y - pp.bounds.min.y) / 2 };
  } else {
    const b = ent.body.bounds;
    pt = { x: (b.min.x + b.max.x) / 2 + dx * (b.max.x - b.min.x) / 2, y: (b.min.y + b.max.y) / 2 + dy * (b.max.y - b.min.y) / 2 };
  }
  const hit = P.pick(pt, 20);
  if (!hit) return null;
  const dir = P.flickDir(hit.ent, hit.point);
  P.flick(hit.point, dir, power);
  let quiet = 0;
  for (let f = 0; f < 60 * 12; f++) { P.step(1000 / 60); if (P.motion().max < 0.6) quiet++; else quiet = 0; if (quiet > 50 && f > 150) break; }
  const fin = P.finalize();
  return { dir, fin, s: P.stats };
}

// 静止テスト（眠らせずに 8 秒）
{
  const P = createPhysics(M, stage, { seed: 7 });
  for (const e of P.entities) M.Sleeping.set(e.body, false);
  P.engine.enableSleeping = false;
  for (let i = 0; i < 480; i++) P.step(1000 / 60);
  const drift = P.entities.filter((e) => Math.hypot(e.body.position.x - e.init.x, e.body.position.y - e.init.y) > 4 || Math.abs(e.body.angle - e.init.angle) > 0.05);
  console.log(`[${stage.name}] 静止テスト:`, drift.length ? drift.map((e) => e.id).join(' ') : 'OK');
}
if (a2 === 'shot') {
  const [id, pw, dx, dy, part] = rest;
  const P = createPhysics(M, stage, { seed: 7 });
  const r = runShot(P, id, Number(dx), Number(dy), Number(pw), part);
  console.log(`${id} p${pw} dir(${r.dir.x.toFixed(2)},${r.dir.y.toFixed(2)}) 破壊率 ${(r.fin.rate * 100).toFixed(1)}% 連鎖 ${r.s.chain} 目標 ${r.s.targetDown ? '○' : '×'} 達成 ${r.fin.goals.map((g) => g.label).join(',')} score ${r.fin.score.toLocaleString()}`);
} else {
  const N = Number(a2 || 80);
  const rr = rng(4321);
  const ids = stage.objects.map((o) => o.id);
  const res = [];
  for (let i = 0; i < N; i++) {
    const P = createPhysics(M, stage, { seed: 7 + i });
    const id = ids[Math.floor(rr() * ids.length)];
    const power = [0.3, 0.5, 0.7, 0.9, 1.0, 1.15][Math.floor(rr() * 6)];
    const r = runShot(P, id, rr() * 2 - 1, rr() * 2 - 1, power);
    if (r) res.push({ id, power, rate: r.fin.rate, target: r.s.targetDown, chain: r.s.chain, dir: r.dir });
  }
  res.sort((x, y) => y.rate - x.rate);
  for (const x of res.slice(0, 8)) console.log(`  ${x.id.padEnd(10)} p${x.power} dir(${x.dir.x.toFixed(1)},${x.dir.y.toFixed(1)}) ${(x.rate * 100).toFixed(1)}% 連鎖${x.chain} 目標${x.target ? '○' : '×'}`);
  const B = [0, 0.15, 0.3, 0.5, 0.7, 1.01];
  console.log('  分布:', B.slice(0, -1).map((b, i) => `${Math.round(b * 100)}-${Math.round(B[i + 1] * 100)}%:${res.filter((x) => x.rate >= b && x.rate < B[i + 1]).length}`).join(' '), ' 目標撃破', res.filter((x) => x.target).length + '/' + res.length);
}
