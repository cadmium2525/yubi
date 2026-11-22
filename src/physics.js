/*
 * 指一本。 物理：剛体・衝突・破壊・連鎖判定・スコア
 * Matter.js（2D 剛体エンジン）を使う。ブラウザでも Node（テスト）でも動くよう、DOM には触れない。
 */

/** 材質。strength は「一回の衝突で壊れるエネルギー」の目安（0.5・換算質量・法線速度²）。 */
export const MATERIALS = {
  concrete: { density: 0.0016, friction: 0.85, restitution: 0.02, strength: 650, crush: 1.08, inertia: 0.6, sound: 'concrete', chips: ['#c9c1b4', '#a39b8f', '#7e776d'], dust: '#b8afa2' },
  ballast: { density: 0.006, friction: 0.9, restitution: 0.01, strength: 2000, crush: 9, sound: 'concrete', chips: ['#9c968c', '#77716a'], dust: '#a49c92' },
  office: { density: 0.0014, friction: 0.8, restitution: 0.02, strength: 900, crush: 0.95, inertia: 0.5, sound: 'glass', chips: ['#a9b9c4', '#cfe8f5', '#7d8a93', '#ffffff'], dust: '#b8c2c8' },
  pillar: { density: 0.0024, friction: 0.08, restitution: 0.02, strength: 300, crush: 0.55, sound: 'concrete', chips: ['#bdb6ab', '#8c857b'], dust: '#b0a89c' },
  wood: { density: 0.0009, friction: 0.8, restitution: 0.05, strength: 260, crush: 0.85, sound: 'wood', chips: ['#b48a5c', '#8a6440', '#d1a874'], dust: '#a88d6c' },
  glass: { density: 0.0012, friction: 0.5, restitution: 0.05, strength: 120, crush: 0.5, sound: 'glass', chips: ['#cfe8f5', '#9cc8e0', '#ffffff'], dust: '#d8eef8' },
  steel: { density: 0.03, friction: 0.35, restitution: 0.12, strength: Infinity, crush: 99, inertia: 0.25, sound: 'metal', chips: ['#666'], dust: '#999' },
  steelbox: { density: 0.0018, friction: 0.6, restitution: 0.06, strength: 900, crush: 1.12, sound: 'metal', chips: ['#8a949c', '#5e676e', '#b5bec4'], dust: '#9aa3a9' },
  container: { density: 0.0011, friction: 0.7, restitution: 0.04, strength: 700, crush: 1.12, sound: 'metal', chips: ['#b8493e', '#3f6f9e', '#777'], dust: '#a49c92' },
  vending: { density: 0.0016, friction: 0.7, restitution: 0.04, strength: 520, crush: 0.95, inertia: 0.25, sound: 'metal', chips: ['#ddd', '#d63b3b', '#2f7fd0', '#333'], dust: '#bbb' },
  car: { density: 0.0012, friction: 0.6, restitution: 0.08, strength: 380, crush: 1.05, sound: 'metal', chips: ['#ddd', '#4a7ab8', '#222', '#9cc8e0'], dust: '#aaa' },
  sign: { density: 0.0011, friction: 0.7, restitution: 0.04, strength: 520, crush: 1.12, sound: 'metal', chips: ['#fff', '#d22', '#222', '#f3c623'], dust: '#bbb' },
};

export const TUNING = {
  flickSpeed: 20, // 威力 1.0 のとき、質量 10 の物体に与える速度（px/step）。重い物ほど遅く、軽い物ほど速い
  massRef: 10,
  massExp: 0.35,
  followSpeed: 11, // 追撃で与える速度
  followRadius: 70,
  maxSpeed: 40,
  maxAngular: 0.5,
  minFragment: 13, // これより細い破片は剛体にせず粒子にする
  chainEnergy: 4, // 連鎖とみなす最小の衝突エネルギー
  chainBoost: 0.9, // 連鎖したときの押し出しの上乗せ（相対速度に対する倍率）
  chainBoostMax: 9,
  comboWindow: 2.4, // 秒：この間に次の連鎖がつながればコンボ継続
  fallY: 700,
};

const QUALITY_BUDGET = { high: 64, mid: 52, low: 40 };

// 乱数（再現可能）
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * ステージの物理世界を作る。
 * @param {object} M Matter（window.Matter または require したもの）
 * @param {object} stage ステージ定義
 * @param {object} opts { quality: 'high'|'mid'|'low', seed }
 */
export function createPhysics(M, stage, opts = {}) {
  const { Engine, Bodies, Body, Composite, Events, Sleeping, Query, Vertices, Bounds } = M;
  // Matter.js は積み上げの安定のため回転慣性を 4 倍にしている（Body._inertiaScale）。
  // 建物はそのまま、ドミノのように倒れてほしい物だけ材質の inertia で実際の値に近づける。
  Body._inertiaScale = 4;
  // ゆっくり傾き始めた物体（ドミノなど）が途中で眠らないよう、眠る条件を厳しくする
  Sleeping._motionSleepThreshold = 0.02;
  const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8, constraintIterations: 2 });
  engine.gravity.y = 1;
  const world = engine.world;
  const rand = rng(opts.seed ?? 7);
  let bodyBudget = QUALITY_BUDGET[opts.quality || 'high'] ?? 64;

  const entities = []; // 生きている剛体
  const byBody = new Map(); // body.id → entity
  const events = []; // 描画・音に渡す出来事
  let nextId = 1;
  let time = 0; // 秒（物理時間）
  let started = false; // 最初の解放が済んだか

  const stats = {
    chain: 0, combo: 0, maxCombo: 0, lastChainAt: -99,
    destroyPoints: 0, chainPoints: 0, bonusPoints: 0,
    destroyedWeight: 0, totalWeight: 0, damage: 0, totalDamage: 0,
    broken: 0, groups: new Set(), targetDown: false, usedFollow: false,
    flickPower: 0, flickGrade: '',
  };

  // ── 地面（静的） ──
  const g = stage.ground;
  const ground = Bodies.rectangle((g.x0 + g.x1) / 2, g.y + 60, g.x1 - g.x0, 120, { isStatic: true, friction: 0.9, label: 'ground' });
  Composite.add(world, ground);
  const statics = (stage.statics || []).map((d) => {
    const b = Bodies.rectangle(d.x, d.y, d.w, d.h, { isStatic: true, angle: d.angle || 0, friction: 0.6, label: d.id });
    Composite.add(world, b);
    return { def: d, body: b };
  });

  // ── 物体の生成 ──
  function matOpts(matName) {
    const m = MATERIALS[matName] || MATERIALS.concrete;
    return { density: m.density, friction: m.friction, frictionStatic: 1.2, restitution: m.restitution, frictionAir: 0.004, slop: 0.03 };
  }

  function makeEntity(def, body, extra = {}) {
    const ent = {
      uid: nextId++, id: def.id, def, body, name: def.name, kind: def.kind,
      mat: def.mat, matDef: MATERIALS[def.mat] || MATERIALS.concrete,
      w: def.w, h: def.h, r: def.r,
      hp: 1, value: def.value ?? 0, price: def.price ?? 0, group: def.group,
      style: def.style, target: !!def.target, tool: !!def.tool,
      activated: false, destroyed: 0, // 0：無事 / 0.7：倒れた・動いた / 1：壊れた
      isFrag: false, crop: null, // 破片のときの元テクスチャの切り出し { x, y, w, h }（元の物体のローカル座標）
      root: null, // 破片の元の entity
      init: { x: body.position.x, y: body.position.y, angle: body.angle },
      cracks: [], seed: Math.floor(rand() * 1e9),
      ...extra,
    };
    if (!ent.root) ent.root = ent;
    entities.push(ent);
    byBody.set(body.id, ent);
    return ent;
  }

  function build() {
    for (const def of stage.objects) {
      let body;
      if (def.kind === 'circle') {
        body = Bodies.circle(def.x, def.y, def.r, { ...matOpts(def.mat), frictionAir: 0.002, label: def.id });
      } else if (def.kind === 'compound') {
        const parts = def.parts.map((p) => Bodies.rectangle(p.x, p.y, p.w, p.h, { ...matOpts(p.mat), label: p.part }));
        body = Body.create({ parts, ...matOpts(def.mat), label: def.id });
      } else {
        body = Bodies.rectangle(def.x, def.y, def.w, def.h, { ...matOpts(def.mat), label: def.id, angle: def.angle || 0 });
      }
      const mInertia = MATERIALS[def.mat]?.inertia;
      if (mInertia) Body.setInertia(body, body.inertia * mInertia);
      Composite.add(world, body);
      const ent = makeEntity(def, body);
      if (def.kind === 'compound') {
        ent.parts = def.parts.map((p, i) => ({ ...p, body: body.parts[i + 1], lx: p.x - body.position.x, ly: p.y - body.position.y }));
      }
      if (!ent.tool) {
        stats.totalWeight += ent.value;
        stats.totalDamage += ent.price;
      }
    }
    // 置いた直後の小さな沈み込みを先に済ませてから、全体を眠らせる（解放するまで完全に静止）
    for (let i = 0; i < 90; i++) Engine.update(engine, 1000 / 60);
    for (const e of entities) {
      Body.setVelocity(e.body, { x: 0, y: 0 });
      Body.setAngularVelocity(e.body, 0);
      e.init = { x: e.body.position.x, y: e.body.position.y, angle: e.body.angle };
      Sleeping.set(e.body, true);
    }
  }
  build();

  // ── ユーティリティ ──
  const dynamicBodies = () => entities.map((e) => e.body);

  function wakeAround(bounds, pad = 80) {
    const b = { min: { x: bounds.min.x - pad, y: bounds.min.y - pad }, max: { x: bounds.max.x + pad, y: bounds.max.y + pad } };
    for (const e of entities) if (Bounds.overlaps(e.body.bounds, b)) Sleeping.set(e.body, false);
  }

  function capVelocity(body) {
    const v = body.velocity;
    const s = Math.hypot(v.x, v.y);
    if (s > TUNING.maxSpeed) Body.setVelocity(body, { x: (v.x / s) * TUNING.maxSpeed, y: (v.y / s) * TUNING.maxSpeed });
    if (Math.abs(body.angularVelocity) > TUNING.maxAngular) Body.setAngularVelocity(body, Math.sign(body.angularVelocity) * TUNING.maxAngular);
  }

  function applyImpulse(body, point, J) {
    const v = body.velocity;
    const m = body.mass;
    const rx = point.x - body.position.x, ry = point.y - body.position.y;
    Body.setVelocity(body, { x: v.x + J.x / m, y: v.y + J.y / m });
    const dw = (rx * J.y - ry * J.x) / body.inertia;
    Body.setAngularVelocity(body, body.angularVelocity + dw);
    capVelocity(body);
  }

  // 点の速度（並進＋回転）
  function pointVel(body, p) {
    const w = body.angularVelocity;
    return { x: body.velocity.x - w * (p.y - body.position.y), y: body.velocity.y + w * (p.x - body.position.x) };
  }

  // ── スコア・連鎖 ──
  function comboMult() { return 1 + Math.min(stats.combo, 60) * 0.08; }

  function activate(ent, cause, from) {
    if (ent.activated) return;
    ent.activated = true;
    if (ent.tool && cause !== 'flick' && cause !== 'follow') return;
    if (!ent.isFrag && ent.group && !stats.groups.has(ent.group) && started) {
      stats.groups.add(ent.group);
      if (stats.groups.size > 1) events.push({ type: 'group', group: ent.group, name: stage.groups?.[ent.group] || ent.group, x: ent.body.position.x, y: ent.body.position.y });
    }
    if (cause === 'chain') {
      if (time - stats.lastChainAt > TUNING.comboWindow) stats.combo = 0;
      stats.combo += 1;
      stats.chain += 1;
      stats.lastChainAt = time;
      stats.maxCombo = Math.max(stats.maxCombo, stats.combo);
      const pts = 40 * Math.min(stats.combo, 80);
      stats.chainPoints += pts;
      events.push({ type: 'chain', combo: stats.combo, chain: stats.chain, x: ent.body.position.x, y: ent.body.position.y, pts });
    }
  }

  function markDestroyed(ent, level) {
    const root = ent.root;
    if (root.tool) return;
    if (level <= root.destroyed) return;
    const add = level - root.destroyed;
    root.destroyed = level;
    stats.destroyedWeight += root.value * add;
    stats.damage += root.price * add;
    const pts = Math.round(root.value * add * 100 * comboMult());
    stats.destroyPoints += pts;
    events.push({ type: 'destroy', level, ent: root, pts, x: ent.body.position.x, y: ent.body.position.y });
    if (root.target && !stats.targetDown && (level >= 1 || Math.abs(wrapAngle(ent.body.angle - ent.init.angle)) > 0.9)) {
      stats.targetDown = true;
      events.push({ type: 'target', x: ent.body.position.x, y: ent.body.position.y, name: root.name });
    }
  }

  // ── 破壊（剛体を破片に割る） ──
  function rectPieces(w, h) {
    // 長い方向で 2〜4 個に割る。正方形に近ければ 2×2
    const cutsFor = (n) => {
      const c = [];
      for (let i = 1; i < n; i++) c.push((i + (rand() - 0.5) * 0.5) / n);
      return c;
    };
    if (w > h * 1.6 || h > w * 1.6) {
      const along = w > h;
      const L = along ? w : h, S = along ? h : w;
      const n = Math.max(2, Math.min(4, Math.round(L / S)));
      const ps = [0, ...cutsFor(n).map((c) => c * L), L];
      return ps.slice(0, -1).map((a, i) => (along ? { x: a, y: 0, w: ps[i + 1] - a, h } : { x: 0, y: a, w, h: ps[i + 1] - a }));
    }
    const cx = (0.35 + rand() * 0.3) * w, cy = (0.35 + rand() * 0.3) * h;
    return [
      { x: 0, y: 0, w: cx, h: cy }, { x: cx, y: 0, w: w - cx, h: cy },
      { x: 0, y: cy, w: cx, h: h - cy }, { x: cx, y: cy, w: w - cx, h: h - cy },
    ];
  }

  function removeEntity(ent) {
    Composite.remove(world, ent.body);
    byBody.delete(ent.body.id);
    const i = entities.indexOf(ent);
    if (i >= 0) entities.splice(i, 1);
  }

  const pendingBreaks = new Set();

  function fracture(ent, energy, dir) {
    if (!entities.includes(ent)) return;
    const body = ent.body;
    const v0 = { ...body.velocity }, w0 = body.angularVelocity;
    const c = body.position, ang = body.angle;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const toWorld = (lx, ly) => ({ x: c.x + lx * cos - ly * sin, y: c.y + lx * sin + ly * cos });
    removeEntity(ent);
    stats.broken += 1;
    markDestroyed(ent, 1);
    wakeAround(body.bounds, 120);

    // 破片の候補（ローカル座標の長方形）
    let pieces = [];
    if (ent.kind === 'compound') {
      for (const p of ent.parts) {
        // 部品はそのまま独立した剛体になる
        pieces.push({ x: p.lx - p.w / 2, y: p.ly - p.h / 2, w: p.w, h: p.h, mat: p.mat, part: p.part, local: true });
      }
    } else if (ent.kind === 'circle') {
      pieces = [];
    } else {
      const w = ent.w, h = ent.h;
      pieces = rectPieces(w, h).map((p) => ({ ...p, x: p.x - w / 2, y: p.y - h / 2, mat: ent.mat, local: true }));
    }

    const intensity = clamp(energy / (ent.matDef.strength || 500), 0.5, 4);
    const fragsAllowed = Math.max(0, bodyBudget - entities.length);
    let made = 0;
    const spawned = [];
    for (const p of pieces) {
      const small = Math.min(p.w, p.h) < TUNING.minFragment || p.w * p.h < 260;
      const center = toWorld(p.x + p.w / 2, p.y + p.h / 2);
      const pv = { x: v0.x - w0 * (center.y - c.y), y: v0.y + w0 * (center.x - c.x) };
      if (small || made >= fragsAllowed) {
        events.push({ type: 'debris', x: center.x, y: center.y, w: p.w, h: p.h, vx: pv.x, vy: pv.y, mat: p.mat, count: Math.ceil((p.w * p.h) / 220) });
        continue;
      }
      made++;
      const fb = Bodies.rectangle(center.x, center.y, p.w, p.h, { ...matOpts(p.mat), angle: ang, label: 'frag' });
      const spread = 1.2 * intensity;
      Body.setVelocity(fb, { x: pv.x + (rand() - 0.5) * spread + (dir?.x || 0) * intensity * 0.6, y: pv.y + (rand() - 0.5) * spread - rand() * intensity * 0.8 });
      Body.setAngularVelocity(fb, w0 + (rand() - 0.5) * 0.08 * intensity);
      Composite.add(world, fb);
      const crop = ent.crop
        ? { x: ent.crop.x + (p.x + ent.w / 2), y: ent.crop.y + (p.y + ent.h / 2), w: p.w, h: p.h, srcW: ent.crop.srcW, srcH: ent.crop.srcH }
        : { x: p.x + (ent.w ?? 0) / 2, y: p.y + (ent.h ?? 0) / 2, w: p.w, h: p.h, srcW: ent.w, srcH: ent.h };
      const def = { id: `${ent.id}~${made}`, name: ent.name, kind: 'box', w: p.w, h: p.h, mat: p.mat, group: ent.group, style: ent.style, value: 0, price: 0 };
      const fe = makeEntity(def, fb, {
        isFrag: true, root: ent.root, crop: p.part ? null : crop, part: p.part || ent.part || null,
        activated: true, hp: 0.6, compoundSrc: ent.kind === 'compound' ? ent : ent.compoundSrc || null,
      });
      if (ent.kind === 'compound') fe.style = { ...ent.style, part: p.part };
      spawned.push(fe);
    }
    events.push({ type: 'break', ent, x: c.x, y: c.y, w: ent.w || ent.r * 2 || 60, h: ent.h || ent.r * 2 || 60, energy, intensity, mat: ent.mat, matDef: ent.matDef, frags: spawned.length, isFrag: ent.isFrag });
  }

  function damage(ent, energy, dir, point) {
    if (ent.tool) return;
    const S = ent.matDef.strength;
    if (!isFinite(S)) return;
    const d = (energy - S * 0.12) / S;
    if (d <= 0) return;
    ent.hp -= d;
    if (point && d > 0.15 && ent.cracks.length < 6) {
      // ローカル座標でひびを記録（描画用）
      const b = ent.body, cos = Math.cos(-b.angle), sin = Math.sin(-b.angle);
      const lx = point.x - b.position.x, ly = point.y - b.position.y;
      ent.cracks.push({ x: lx * cos - ly * sin, y: lx * sin + ly * cos, s: Math.min(1, d), seed: Math.floor(rand() * 1e6) });
    }
    if (ent.hp <= 0) pendingBreaks.add({ ent, energy, dir });
  }

  // 連鎖ブースト：動いている物体が止まっている物体にぶつかったとき、押し出しを少し上乗せする。
  // 現実より「伝わりやすさ・気持ちよい連鎖」を優先するための味付け（一つの物体につき一回だけ）。
  function chainBoost(hitter, hit, dir, vHitter, vHit, p) {
    if (hit.isStatic) return;
    const s = (vHitter.x - vHit.x) * dir.x + (vHitter.y - vHit.y) * dir.y;
    if (s <= 0.5) return;
    const mh = hitter.mass, mt = hit.mass;
    const dv = Math.min(TUNING.chainBoostMax, TUNING.chainBoost * s * (mh / (mh + mt)));
    // 少し上向きに。接触点に加えて回転（転倒）も起こす
    applyImpulse(hit, p, { x: dir.x * dv * mt, y: (dir.y * dv - dv * 0.15) * mt });
  }

  // ── 衝突 ──
  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const A = pair.bodyA.parent, B = pair.bodyB.parent;
      const ea = byBody.get(A.id), eb = byBody.get(B.id);
      if (!ea && !eb) continue;
      const n = pair.collision.normal;
      const p = pair.collision.supports?.[0] || A.position;
      const va = A.isStatic ? { x: 0, y: 0 } : pointVel(A, p);
      const vb = B.isStatic ? { x: 0, y: 0 } : pointVel(B, p);
      const vn = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
      if (vn < 0.4) continue;
      const ma = A.isStatic ? Infinity : A.mass, mb = B.isStatic ? Infinity : B.mass;
      const mu = !isFinite(ma) ? mb : !isFinite(mb) ? ma : (ma * mb) / (ma + mb);
      const E = 0.5 * mu * vn * vn;
      if (!started) continue;
      // 連鎖：動いている物体が、まだ動いていない物体にぶつかった
      if (E > TUNING.chainEnergy) {
        if (ea && eb) {
          if (ea.activated && !eb.activated) { activate(eb, 'chain', ea); chainBoost(A, B, { x: -n.x, y: -n.y }, va, vb, p); }
          else if (eb.activated && !ea.activated) { activate(ea, 'chain', eb); chainBoost(B, A, n, vb, va, p); }
        }
      }
      const dir = { x: n.x, y: n.y };
      if (ea) damage(ea, E, { x: -dir.x, y: -dir.y }, p);
      if (eb) damage(eb, E, dir, p);
      if (E > 30) {
        const mat = (vb.x * vb.x + vb.y * vb.y > va.x * va.x + va.y * va.y ? eb : ea) || ea || eb;
        events.push({ type: 'impact', x: p.x, y: p.y, energy: E, mat: mat.mat, ground: !ea || !eb });
      }
    }
  });

  // ── 1 ステップ ──
  // 眠っている物体は Matter.js では「動かない壁」になる。起きている物体に触れている眠った物体を起こして、
  // 支えが抜けたのに浮いたまま・挟まったまま、にならないようにする。
  // 起きたばかり（0.5 秒以内）または動いている物体から、触れている物体へ順に伝わる。
  function propagateWake() {
    const src = [];
    for (const e of entities) {
      const b = e.body;
      if (b.isSleeping) { e.wasSleeping = true; continue; }
      if (e.wasSleeping !== false) { e.wokeAt = time; e.wasSleeping = false; }
      if (b.speed > 0.05 || b.angularSpeed > 0.002 || time - e.wokeAt < 0.5) src.push(b.bounds);
    }
    if (!src.length) return;
    const pad = 4;
    for (const e of entities) {
      const b = e.body;
      if (!b.isSleeping) continue;
      for (const m of src) {
        if (b.bounds.min.x - pad < m.max.x && b.bounds.max.x + pad > m.min.x && b.bounds.min.y - pad < m.max.y && b.bounds.max.y + pad > m.min.y) {
          Sleeping.set(b, false);
          break;
        }
      }
    }
  }

  function step(dtMs) {
    if (started) propagateWake();
    Engine.update(engine, dtMs);
    time += (dtMs * engine.timing.timeScale) / 1000;
    for (const pb of pendingBreaks) fracture(pb.ent, pb.energy, pb.dir);
    pendingBreaks.clear();
    for (let i = entities.length - 1; i >= 0; i--) {
      const ent = entities[i];
      const b = ent.body;
      if (b.isSleeping) continue;
      capVelocity(b);
      if (started && !ent.activated && (b.speed > 1.2 || b.angularSpeed > 0.03)) activate(ent, 'motion');
      // 倒れた・ずれた
      const root = ent.root;
      if (!ent.isFrag && root.destroyed < 0.7 && !root.tool) {
        const da = Math.abs(wrapAngle(b.angle - ent.init.angle));
        const dx = b.position.x - ent.init.x, dy = b.position.y - ent.init.y;
        const size = Math.max(ent.w || 0, ent.h || 0, (ent.r || 0) * 2, 40);
        if (da > 0.55 || Math.hypot(dx, dy) > size * 0.45 + 12) markDestroyed(ent, 0.7);
      }
      // 目標（看板）は大きく傾いたら「撃破」
      if (ent.root.target && !stats.targetDown && Math.abs(wrapAngle(b.angle - ent.init.angle)) > 0.9) markDestroyed(ent, Math.max(ent.root.destroyed, 0.7) + 0.0001);
      // 場外
      if (b.position.y > TUNING.fallY) {
        markDestroyed(ent, 1);
        events.push({ type: 'fall', x: b.position.x, y: b.position.y });
        removeEntity(ent);
        wakeAround(b.bounds, 40);
      }
    }
    if (stats.combo > 0 && time - stats.lastChainAt > TUNING.comboWindow) {
      stats.combo = 0;
      events.push({ type: 'comboEnd' });
    }
  }

  // ── 狙点：点の下にある物体を探す（少しずれていても吸着） ──
  function pick(point, radius = 0) {
    const bodies = dynamicBodies();
    const hit = Query.point(bodies, point);
    if (hit.length) {
      const ent = byBody.get(hit[0].id);
      return { ent, point: { ...point } };
    }
    if (radius <= 0) return null;
    // 近い物体の輪郭に吸着
    let best = null, bestD = radius;
    for (const ent of entities) {
      const parts = ent.body.parts.length > 1 ? ent.body.parts.slice(1) : [ent.body];
      for (const part of parts) {
        const vs = part.vertices;
        for (let i = 0; i < vs.length; i++) {
          const a = vs[i], b = vs[(i + 1) % vs.length];
          const abx = b.x - a.x, aby = b.y - a.y;
          const t = clamp(((point.x - a.x) * abx + (point.y - a.y) * aby) / (abx * abx + aby * aby || 1), 0, 1);
          const q = { x: a.x + abx * t, y: a.y + aby * t };
          const d = Math.hypot(point.x - q.x, point.y - q.y);
          if (d < bestD) {
            bestD = d;
            // 輪郭の少し内側を狙う
            const cx = part.position.x - q.x, cy = part.position.y - q.y, cl = Math.hypot(cx, cy) || 1;
            best = { ent, point: { x: q.x + (cx / cl) * 2, y: q.y + (cy / cl) * 2 } };
          }
        }
      }
    }
    return best;
  }

  /**
   * 狙点から、指が弾く向きを決める：狙った面に垂直に、外側から押し込む。
   * 角の近くを狙うと斜めになる。円は中心へ向かう。
   */
  function flickDir(ent, point) {
    const body = ent.body;
    if (ent.kind === 'circle') {
      const dx = body.position.x - point.x, dy = body.position.y - point.y, l = Math.hypot(dx, dy);
      if (l < ent.r * 0.3) return { x: 1, y: 0 };
      return { x: dx / l, y: dy / l };
    }
    // 狙った部品（看板は部品ごと）
    let c = body.position, hw = (ent.w || 40) / 2, hh = (ent.h || 40) / 2;
    if (ent.parts) {
      for (const p of ent.parts) {
        if (Vertices.contains(p.body.vertices, point)) { c = p.body.position; hw = p.w / 2; hh = p.h / 2; break; }
      }
    }
    const a = body.angle, cos = Math.cos(-a), sin = Math.sin(-a);
    const lx = (point.x - c.x) * cos - (point.y - c.y) * sin;
    const ly = (point.x - c.x) * sin + (point.y - c.y) * cos;
    // 各面までの距離（小さいほど、その面を押している）
    const faces = [
      { d: lx + hw, n: [1, 0] }, // 左の面 → 右へ
      { d: hw - lx, n: [-1, 0] }, // 右の面 → 左へ
      { d: ly + hh, n: [0, 1] }, // 上の面 → 下へ
      { d: hh - ly, n: [0, -1] }, // 下の面 → 上へ
    ].sort((p, q) => p.d - q.d);
    const m = Math.min(hw, hh);
    let nx = faces[0].n[0], ny = faces[0].n[1];
    // 真ん中付近：左から弾く
    if (faces[0].d > m * 0.8 && Math.abs(lx) < hw * 0.3) { nx = 1; ny = 0; }
    // 角の近く：二つの面の向きを混ぜる
    const second = faces.find((f) => f.n[0] !== faces[0].n[0] && f.n[1] !== faces[0].n[1] && f.n[0] !== -faces[0].n[0] && f.n[1] !== -faces[0].n[1]);
    if (second && second.d < Math.max(10, m * 0.45)) {
      const k = 1 - second.d / Math.max(10, m * 0.45);
      nx += second.n[0] * k * 0.8; ny += second.n[1] * k * 0.8;
    }
    const l = Math.hypot(nx, ny);
    nx /= l; ny /= l;
    const wcos = Math.cos(a), wsin = Math.sin(a);
    return { x: nx * wcos - ny * wsin, y: nx * wsin + ny * wcos };
  }

  /** 解放（デコピン） */
  function flick(point, dir, power) {
    const hit = pick(point, 26);
    started = true;
    // 指先の近くだけ起こす（残りは衝突が伝わったときに Matter が起こす）
    wakeAround({ min: { x: point.x - 60, y: point.y - 60 }, max: { x: point.x + 60, y: point.y + 60 } }, 0);
    stats.flickPower = power;
    if (!hit) {
      // 空振り：空気の衝撃波
      blast(point, 120, 120 * power, 'whiff');
      events.push({ type: 'whiff', x: point.x, y: point.y });
      return { hit: null };
    }
    const ent = hit.ent;
    const J = impulseFor(ent.body, TUNING.flickSpeed * power);
    activate(ent, 'flick');
    stats.groups.add(ent.group);
    applyImpulse(ent.body, hit.point, { x: dir.x * J, y: dir.y * J });
    // 標的自体へのダメージ：材質ごとの「圧砕」しきい値を超えると砕ける
    const crushAt = ent.matDef.crush ?? 1.1;
    const willBreak = !ent.tool && power >= crushAt;
    if (willBreak) pendingBreaks.add({ ent, energy: ent.matDef.strength * (1 + power), dir });
    else if (!ent.tool) ent.hp -= 0.5 * (power / crushAt) ** 2;
    events.push({ type: 'flick', x: hit.point.x, y: hit.point.y, ent, power, crush: willBreak });
    return { hit: ent, crush: willBreak };
  }

  /** 追撃：押した点のまわりを外側へ押し出す */
  function followUp(point) {
    stats.usedFollow = true;
    blast(point, TUNING.followRadius, TUNING.followSpeed, 'follow');
    events.push({ type: 'follow', x: point.x, y: point.y });
  }

  // 「速度」から撃力へ：重い物にも少しは効き、軽い物は飛びすぎないように
  function impulseFor(body, speed) {
    return body.mass * speed * Math.pow(TUNING.massRef / body.mass, TUNING.massExp);
  }

  function blast(point, radius, speed, cause, except) {
    for (const ent of entities.slice()) {
      if (ent === except) continue;
      const b = ent.body;
      const dx = b.position.x - point.x, dy = b.position.y - point.y;
      const reach = radius + Math.max(ent.w || 0, ent.h || 0, (ent.r || 0) * 2) * 0.5;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const f = (1 - d / reach) * impulseFor(b, speed);
      const nx = d > 0.01 ? dx / d : 1, ny = d > 0.01 ? dy / d : 0;
      Sleeping.set(b, false);
      applyImpulse(b, { x: b.position.x - nx * 4, y: b.position.y - ny * 4 }, { x: nx * f, y: ny * f - f * 0.15 });
      if (cause === 'follow') {
        if (!ent.activated) activate(ent, 'follow');
        damage(ent, f * f / (2 * b.mass) * 0.6, { x: nx, y: ny }, b.position);
      }
    }
  }

  /** 全体の運動の大きさ（収束判定用） */
  function motion() {
    let k = 0, n = 0;
    for (const e of entities) {
      if (e.body.isSleeping) continue;
      k = Math.max(k, e.body.speed + e.body.angularSpeed * 20);
      n++;
    }
    return { max: k, awake: n };
  }

  function rate() { return stats.totalWeight ? stats.destroyedWeight / stats.totalWeight : 0; }

  /** 結果のまとめ（目標達成ボーナスを含む） */
  function finalize() {
    const goals = [];
    const r = rate();
    if (stats.targetDown) goals.push({ id: 'target', label: '看板撃破', pts: 50000 });
    const allGroups = ['tower', 'office', 'sign'].every((gname) => stats.groups.has(gname));
    if (allGroups) goals.push({ id: 'reach', label: '三棟連鎖', pts: 30000 });
    if (!stats.usedFollow && r >= 0.85) goals.push({ id: 'oneshot', label: '一撃全壊', pts: 120000 });
    else if (r >= 0.85) goals.push({ id: 'zenkai', label: '全壊', pts: 40000 });
    if (stats.maxCombo >= 30) goals.push({ id: 'combo', label: '大連鎖', pts: 30000 });
    stats.bonusPoints = goals.reduce((s, x) => s + x.pts, 0);
    return { goals, score: score(), rate: r };
  }

  function score() { return stats.destroyPoints + stats.chainPoints + stats.bonusPoints; }

  return {
    M, engine, world, entities, events, stats, ground, statics, stage,
    get time() { return time; },
    get started() { return started; },
    setBudget(q) { bodyBudget = QUALITY_BUDGET[q] ?? bodyBudget; },
    step, pick, flickDir, flick, followUp, motion, rate, score, finalize,
  };
}
