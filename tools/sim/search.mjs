/*
 * いろいろな狙点・威力で撃って、結果の分布を調べる（バランス調整用）。
 *   node tools/sim/search.mjs [回数]
 */
import { createRequire } from 'node:module';
import { createPhysics, rng } from '../../src/physics.js';
import { STAGE_TOWER } from '../../src/stage.js';
const require = createRequire(import.meta.url);
const M = require('../../vendor/matter-js/matter.min.js');
M.Common.warnOnce = () => {};
const N = Number(process.argv[2] || 120);
const r = rng(12345);
const ids = STAGE_TOWER.objects.map((o) => o.id);
const res = [];
for (let i = 0; i < N; i++) {
  const P = createPhysics(M, STAGE_TOWER, { seed: 7 + i });
  const id = ids[Math.floor(r() * ids.length)];
  const ent = P.entities.find((e) => e.id === id);
  const b = ent.body.bounds;
  const pt = { x: b.min.x + r() * (b.max.x - b.min.x), y: b.min.y + r() * (b.max.y - b.min.y) };
  const hit = P.pick(pt, 20);
  if (!hit) continue;
  const power = [0.3, 0.5, 0.7, 0.9, 1.0, 1.15][Math.floor(r() * 6)];
  const dir = P.flickDir(hit.ent, hit.point);
  P.flick(hit.point, dir, power);
  let quiet = 0;
  for (let f = 0; f < 60 * 12; f++) { P.step(1000 / 60); if (P.motion().max < 0.6) quiet++; else quiet = 0; if (quiet > 50 && f > 150) break; }
  const fin = P.finalize();
  res.push({ id, power, dir: `${dir.x.toFixed(1)},${dir.y.toFixed(1)}`, rate: fin.rate, score: fin.score, chain: P.stats.chain, target: P.stats.targetDown });
}
res.sort((a, b) => b.rate - a.rate);
console.log('上位:');
for (const x of res.slice(0, 15)) console.log(`  ${x.id.padEnd(10)} p${x.power} dir(${x.dir}) 破壊率 ${(x.rate * 100).toFixed(1)}% 連鎖 ${x.chain} 看板 ${x.target ? '○' : '×'} score ${x.score.toLocaleString()}`);
const buckets = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1.01];
console.log('分布:', buckets.slice(0, -1).map((b0, i) => `${Math.round(b0 * 100)}-${Math.round(buckets[i + 1] * 100)}%: ${res.filter((x) => x.rate >= b0 && x.rate < buckets[i + 1]).length}`).join(' / '));
console.log('看板撃破率:', (res.filter((x) => x.target).length / res.length * 100).toFixed(0) + '%');
