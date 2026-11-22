/*
 * ステージの物理を Node で回して、安定性と攻略ルートの結果を確かめる。
 *   node tools/sim/sim.mjs            … 全シナリオ
 *   node tools/sim/sim.mjs stiltR 1.0 … 指定した物体を指定の威力で
 */
import { createRequire } from 'node:module';
import { createPhysics } from '../../src/physics.js';
import { STAGE_TOWER } from '../../src/stage.js';
const require = createRequire(import.meta.url);
const M = require('../../vendor/matter-js/matter.min.js');
M.Common.warnOnce = () => {};

function run(name, aim, power, { seconds = 12, follow = null, quiet = false } = {}) {
  const P = createPhysics(M, STAGE_TOWER, { seed: 7 });
  const dt = 1000 / 60;
  // 解放前の静止確認（1 秒）
  for (let i = 0; i < 60; i++) P.step(dt);
  let res = null;
  if (aim) {
    const ent = P.entities.find((e) => e.id === aim.id);
    let pt;
    if (aim.part) {
      const part = ent.body.parts.find((p) => p.label === aim.part);
      pt = { x: part.position.x + aim.dx * (part.bounds.max.x - part.bounds.min.x) / 2, y: part.position.y + aim.dy * (part.bounds.max.y - part.bounds.min.y) / 2 };
    } else {
      const w = ent.w ?? ent.r * 2, h = ent.h ?? ent.r * 2;
      pt = { x: ent.body.position.x + aim.dx * w / 2, y: ent.body.position.y + aim.dy * h / 2 };
    }
    const hit = P.pick(pt, 26);
    const dir = P.flickDir(hit.ent, hit.point);
    res = P.flick(hit.point, dir, power);
  }
  let settledAt = null, quietFrames = 0;
  const t0 = Date.now();
  let maxEnt = 0;
  for (let i = 0; i < seconds * 60; i++) {
    if (follow && Math.abs(i / 60 - follow.t) < 1e-6) P.followUp(follow.p);
    P.step(dt);
    maxEnt = Math.max(maxEnt, P.entities.length);
    const m = P.motion();
    if (m.max < 0.25) quietFrames++; else quietFrames = 0;
    if (quietFrames > 45 && settledAt == null && P.started) { settledAt = i / 60; break; }
  }
  const fin = P.finalize();
  const s = P.stats;
  const moved = P.entities.filter((e) => !e.isFrag && e.root.destroyed > 0).map((e) => e.id);
  if (process.env.V) {
    const all = [...new Set(P.entities.map((e) => e.root))];
    const st = STAGE_TOWER.objects.map((d) => { const e = P.entities.find((x) => x.id === d.id); const r = e?.root || null; return `${d.id}:${e ? (e.root.destroyed ? (e.root.destroyed === 1 ? 'B' : 'm') : '.') : 'X'}`; });
    console.log('   ', st.join(' '));
  }
  if (!quiet) console.log(`${name.padEnd(22)} 破壊率 ${(fin.rate * 100).toFixed(1).padStart(5)}%  連鎖 ${String(s.chain).padStart(3)} 最大コンボ ${String(s.maxCombo).padStart(3)}  破壊 ${String(s.broken).padStart(2)}  看板 ${s.targetDown ? '○' : '×'}  score ${fin.score.toLocaleString().padStart(9)}  群 ${[...s.groups].join(',')}  収束 ${settledAt ?? '-'}s  最大剛体 ${maxEnt}  ${Date.now() - t0}ms ${res?.crush ? '圧砕' : ''}`);
  return { P, fin };
}

const args = process.argv.slice(2);
if (args.length) {
  const [id, pw, dx = '-0.9', dy = '0', part] = args;
  run(`${id} p${pw}`, { id, dx: Number(dx), dy: Number(dy), part }, Number(pw));
} else {
  // 静止テスト：解放しないで 10 秒（スリープを切っても崩れないか）
  {
    const P = createPhysics(M, STAGE_TOWER, { seed: 7 });
    for (const e of P.entities) M.Sleeping.set(e.body, false);
    P.engine.enableSleeping = false;
    for (let i = 0; i < 600; i++) P.step(1000 / 60);
    const drift = P.entities.map((e) => ({ id: e.id, d: Math.hypot(e.body.position.x - e.init.x, e.body.position.y - e.init.y), a: e.body.angle })).filter((x) => x.d > 1.5 || Math.abs(x.a) > 0.02);
    console.log('静止テスト（スリープなし10秒）: ', drift.length ? drift.map((x) => `${x.id} d=${x.d.toFixed(1)} a=${x.a.toFixed(2)}`).join(' / ') : 'OK 全物体が静止');
  }
  for (const p of [0.2, 0.35, 0.55, 0.75, 1.0, 1.15]) run(`鉄球 p${p}`, { id: 'ball', dx: -0.9, dy: 0 }, p);
  for (const p of [0.4, 0.7, 1.0, 1.15]) run(`右柱(左から) p${p}`, { id: 'stiltR', dx: -0.9, dy: 0.3 }, p);
  for (const p of [0.4, 0.7, 1.0, 1.15]) run(`左柱(左から) p${p}`, { id: 'stiltL', dx: -0.9, dy: 0.3 }, p);
  for (const p of [0.7, 1.0, 1.15]) run(`看板(左から) p${p}`, { id: 'sign', part: 'board', dx: -0.85, dy: -0.2 }, p);
  for (const p of [0.7, 1.0, 1.15]) run(`屋上小屋(左) p${p}`, { id: 'room4', dx: -0.9, dy: 0 }, p);
  for (const p of [0.5, 0.8, 1.15]) run(`オフィス(左上) p${p}`, { id: 'office', dx: -0.9, dy: -0.6 }, p);
  for (const p of [0.3, 0.7]) run(`自販機0(左) p${p}`, { id: 'vend0', dx: -0.9, dy: -0.6 }, p);
}
