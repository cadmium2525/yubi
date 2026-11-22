/*
 * シナリオの経過をコマ撮りの画像（SVG→PNG）にする。調整用。
 *   node tools/sim/snap.mjs out.png <id> <power> [dx] [dy] [part]
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createPhysics } from '../../src/physics.js';
import { STAGE_TOWER } from '../../src/stage.js';
const require = createRequire(import.meta.url);
const M = require('../../vendor/matter-js/matter.min.js');
M.Common.warnOnce = () => {};

const [out, id, pw, dx = '-0.9', dy = '0', part] = process.argv.slice(2);
const P = createPhysics(M, STAGE_TOWER, { seed: 7 });
const times = (process.env.T || '0,0.4,0.8,1.2,1.8,2.6,3.6,6').split(',').map(Number);
const panels = [];
function snap(t) {
  const polys = [];
  for (const st of P.statics) polys.push({ c: '#555', v: st.body.vertices.map((v) => [v.x, v.y]) });
  for (const e of P.entities) {
    const parts = e.body.parts.length > 1 ? e.body.parts.slice(1) : [e.body];
    const col = e.isFrag ? '#e0a040' : e.root.destroyed >= 1 ? '#d33' : e.root.destroyed > 0 ? '#e88' : e.activated ? '#58a' : '#999';
    for (const p of parts) polys.push({ c: col, v: p.vertices.map((v) => [v.x, v.y]) });
  }
  panels.push({ t, label: `t=${t.toFixed(1)}s rate=${(P.rate() * 100).toFixed(0)}% chain=${P.stats.chain}`, polys });
}
for (let i = 0; i < 30; i++) P.step(1000 / 60);
const ent = P.entities.find((e) => e.id === id);
let pt;
if (part) {
  const pp = ent.body.parts.find((p) => p.label === part);
  pt = { x: pp.position.x + Number(dx) * (pp.bounds.max.x - pp.bounds.min.x) / 2, y: pp.position.y + Number(dy) * (pp.bounds.max.y - pp.bounds.min.y) / 2 };
} else {
  const w = ent.w ?? ent.r * 2, h = ent.h ?? ent.r * 2;
  pt = { x: ent.body.position.x + Number(dx) * w / 2, y: ent.body.position.y + Number(dy) * h / 2 };
}
const hit = P.pick(pt, 26);
const dir = P.flickDir(hit.ent, hit.point);
const fol = process.env.F ? process.env.F.split(',').map(Number) : null; // 追撃 t,x,y
P.flick(hit.point, dir, Number(pw));
let ti = 0;
for (let f = 0; f <= Math.round(times[times.length - 1] * 60); f++) {
  const t = f / 60;
  if (fol && f === Math.round(fol[0] * 60)) P.followUp({ x: fol[1], y: fol[2] });
  if (ti < times.length && t >= times[ti] - 1e-9) { snap(t); ti++; }
  P.step(1000 / 60);
}
const json = out.replace(/\.png$/, '.json');
writeFileSync(json, JSON.stringify(panels));
execFileSync('python3', [new URL('./draw.py', import.meta.url).pathname, json, out]);
const fin = P.finalize();
console.log(`dir=(${dir.x.toFixed(2)},${dir.y.toFixed(2)}) rate=${(fin.rate * 100).toFixed(1)}% chain=${P.stats.chain} target=${P.stats.targetDown} score=${fin.score}`);
