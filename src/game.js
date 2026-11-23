/*
 * 指一本。 ゲーム本体：状態の管理・操作・カメラ・スコア表示
 *
 * 流れ：タイトル → 狙点（狙う） → 蓄圧（長押し） → 解放（離す） → 崩壊・追撃 → 結果 → 再挑戦
 */
import { createPhysics, rng } from './physics.js';
import { STAGES, makeDailyStage } from './stage.js';
import { Renderer } from './render.js';
import { Finger } from './finger.js';
import { InkLayer, makeInk, INK_FONT } from './ink.js';
import { Sound } from './audio.js';
import { store } from './storage.js';
import { MATERIALS as MATS, ZENKAI } from './physics.js';

const M = window.Matter;
const $ = (id) => document.getElementById(id);

// ── 調整値 ──
const HOLD_DELAY = 0.12; // これより短い押下は「狙点だけ」（タップ）
const CHARGE_TIME = 0.95; // 蓄圧が満ちるまで（秒）
const CRIT_WINDOW = 0.35; // 満ちてから「会心」で離せる時間
const OVER_TIME = 2.2; // 過蓄圧が最大になるまで
const CRIT_POWER = 1.15;
const STEP_MS = 1000 / 60;

const canvas = $('game');
const R = new Renderer(canvas);
const finger = new Finger();
const ink = new InkLayer();
const snd = new Sound();
let stage = STAGES[0];
R.setStage(stage);

// 今日の日付（日替わりステージ用）
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
let dailyStage = makeDailyStage(todayStr());

// ★の数：破壊率 30% / 50% / 全壊
function starsOf(rate, st = stage) {
  return rate >= (st.zenkai ?? ZENKAI) ? 3 : rate >= 0.4 ? 2 : rate >= 0.2 ? 1 : 0;
}
function starText(n) { return '★'.repeat(n) + '☆'.repeat(3 - n); }
function isUnlocked(i) {
  if (i === 0) return true;
  const b = store.best(STAGES[i - 1].id);
  return !!b && b.rate >= 0.2;
}

const S = store.settings;
snd.bgmVol = S.bgm; snd.sfxVol = S.sfx; snd.muted = !!S.muted;

let quality = S.quality === 'low' ? 'low' : 'high';
let P = null; // 物理
let mode = 'title';
let modeT = 0;
let W = 0, H = 0, DPR = 1;
let overview = { x: 700, y: -200, zoom: 0.6 };
const cam = { x: 700, y: -200, zoom: 0.6, sx: 0, sy: 0 };
let camGoal = { ...overview };
let tilt = 0.75, tiltGoal = 0.75;
let dark = 0, darkGoal = 0;
let flash = 0, flashColor = '255,255,255';
let shake = 0;
let timeScale = 1, slowT = 0, slowBase = 0.28, slowHold = 0.35;
let acc = 0;
let fast = false;
let popups = [];
let speedLines = 0;

const pointer = { x: 0, y: 0, down: false, id: null, type: 'mouse', downAt: 0, lastX: 0, lastY: 0, hover: false };
const aim = { sx: 0, sy: 0, world: null, hit: null, dir: { x: 1, y: 0 }, locked: false };
const charge = { hold: 0, c: 0, over: 0, crit: false, jx: 0, jy: 0, loop: null, inkShown: false, critPlayed: false };
let shot = null; // 解放の情報
let followUsed = false;
let settleQuiet = 0;
let shownCombo = 0, scoreShown = 0;
let lastInkAt = -9;
let lastMilestone = 0;
let resultData = null;
let frameTimes = [];
let playStartAt = 0;
let lastActionAt = 0;
let pendingPts = 0;
let stepN = 0; // このラウンドで進めた物理のステップ数（リプレイ用）
let roundSeed = 7;
let record = null; // { seed, flickStep, pt, dir, power, grade, followStep, followPt, endStep }
let replaying = false; // 最後に「壊れた・連鎖した」時刻（崩壊の終わりを判定する）

/* ───────────────────────── 画面サイズ・カメラ ───────────────────────── */

function resize() {
  W = window.innerWidth; H = window.innerHeight;
  const maxDpr = quality === 'low' ? 1 : 2;
  DPR = Math.min(maxDpr, window.devicePixelRatio || 1);
  R.resize(W, H, DPR);
  computeOverview();
  if (mode === 'title' || mode === 'aim' || mode === 'result') { Object.assign(cam, camGoal); }
  $('rotate').classList.toggle('hidden', !(H > W * 1.15) || mode === 'title');
  drawLogo();
}

function computeOverview() {
  const b = stage.bounds;
  const mt = H < 460 ? 48 : 64, mb = H < 460 ? 54 : 84, ml = 16, mr = 16;
  const ww = b.x1 - b.x0 + 140, wh = b.y1 - b.y0 + 110;
  const zoom = Math.min((W - ml - mr) / ww, (H - mt - mb) / wh);
  // 余白の中央に収める
  const cxw = (b.x0 + b.x1) / 2 + 50, cyw = (b.y0 + b.y1) / 2 - 40;
  const offY = (mt - mb) / 2 / zoom;
  overview = { x: cxw, y: cyw - offY, zoom };
  if (!['charge', 'press', 'fire', 'hitstop'].includes(mode)) camGoal = { ...overview };
}

/* ───────────────────────── 開始・やり直し ───────────────────────── */

function newRound() {
  roundSeed = 7 + store.plays;
  P = createPhysics(M, stage, { quality: quality === 'low' ? 'low' : 'high', seed: roundSeed });
  stepN = 0;
  record = null;
  replaying = false;
  $('replay-badge').classList.add('hidden');
  $('stage-name').textContent = stage.name;
  R.particles.list = [];
  R.particles.setMax(quality === 'low' ? 220 : 520);
  popups = [];
  shot = null;
  followUsed = false;
  settleQuiet = 0;
  shownCombo = 0; scoreShown = 0;
  lastMilestone = 0;
  fast = false;
  aim.hit = null; aim.locked = false;
  charge.hold = 0; charge.c = 0; charge.over = 0;
  timeScale = 1;
  $('follow').classList.add('hidden');
  $('follow').classList.remove('used');
  $('skip').classList.add('hidden');
  updateHud(true);
  const best = store.best(stage.id);
  $('best-score').textContent = best ? best.score.toLocaleString('ja-JP') : '—';
}

// タイトル → ステージ選択
function openStages() {
  snd.unlock();
  snd.play('ui');
  snd.bgm('bgm_main');
  if (mode === 'press' || mode === 'charge') cancelCharge();
  dailyStage = makeDailyStage(todayStr());
  buildStageList();
  renderAchievements();
  $('title').classList.add('hidden');
  $('result').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('stages').classList.remove('hidden');
  setMode('select');
  setTimeout(() => $('stages').querySelector('button:not([disabled])')?.focus({ preventScroll: true }), 30);
}

function buildStageList() {
  const box = $('stage-list');
  box.innerHTML = '';
  const all = [...STAGES.map((st, i) => ({ st, i })), { st: dailyStage, i: -1 }];
  for (const { st, i } of all) {
    const ok = i < 0 || isUnlocked(i);
    const b = store.best(st.id);
    const stars = b ? starsOf(b.rate, st) : 0;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'stage-card' + (st.daily ? ' daily' : '') + (ok ? '' : ' locked');
    el.disabled = !ok;
    el.innerHTML = `<span class="label">${st.label}</span><b class="ink">${st.name}</b>`
      + `<span class="stars">${starText(stars)}</span>`
      + `<span class="intro">${ok ? st.intro : '前のステージで ★1（破壊率 20%）を取ると解放'}</span>`
      + `<span class="best">${b ? `BEST ${b.score.toLocaleString('ja-JP')}／${(b.rate * 100).toFixed(1)}%` : '未挑戦'}</span>`;
    el.addEventListener('click', () => startStage(st));
    box.appendChild(el);
  }
}

function startStage(st) {
  stage = st;
  R.setStage(stage);
  $('stages').classList.add('hidden');
  startGame();
}

function startGame() {
  snd.unlock();
  snd.bgm('bgm_main');
  snd.play('ui');
  $('title').classList.add('hidden');
  $('hud').classList.remove('hidden');
  newRound();
  setMode('aim');
  computeOverview();
  camGoal = { ...overview };
  $('rotate').classList.toggle('hidden', !(H > W * 1.15));
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  showHint(stage.intro || (coarse ? '崩したい所を長押し！ 離すと解放！' : '崩したい所にカーソルを合わせて、長押し！'), 4);
  showInk(`${stage.label}　${stage.name}`, { x: 0.5, y: 0.3, size: 0.1, dur: 1.6, opts: { slash: true } }, true);
}

function retry() {
  if (mode === 'title' || mode === 'select') return;
  if (replaying) endReplay(true);
  snd.play('ui');
  $('result').classList.add('hidden');
  $('hud').classList.remove('hidden');
  newRound();
  setMode('aim');
  camGoal = { ...overview };
  tiltGoal = 0.75;
  snd.bgm('bgm_main');
}

function setMode(m) {
  mode = m; modeT = 0;
  // 照準を自前で描くので、狙っている間はマウスカーソルを隠す
  canvas.style.cursor = m === 'aim' || m === 'press' || m === 'charge' ? 'none' : m === 'collapse' || m === 'settle' ? 'crosshair' : 'default';
}

/* ───────────────────────── 狙点 ───────────────────────── */

function updateAim() {
  if (!P) return;
  const w = R.toWorld(cam, aim.sx, aim.sy);
  aim.world = w;
  const touch = pointer.type !== 'mouse';
  // 狙いアシスト①：弱点の近くなら吸い付く
  const assist = S.assist !== false;
  if (assist && mode !== 'charge') {
    const mag = (touch ? 64 : 44);
    let best = null, bd = mag;
    for (const hp of hintPoints()) {
      const sp = R.toScreen(cam, hp.x, hp.y);
      const d = Math.hypot(sp.x - aim.sx, sp.y - aim.sy);
      if (d < bd) { bd = d; best = hp; }
    }
    if (best) {
      const h2 = P.pick({ x: best.x, y: best.y }, 6);
      if (h2) { if (aim.magnet?.label !== best.label) snd.play('tick', { vol: 0.35, gap: 0.1 }); aim.hit = h2; aim.dir = P.flickDir(h2.ent, h2.point); aim.magnet = best; return; }
    }
  }
  aim.magnet = null;
  // 狙いアシスト②：物体の外を狙っても、近くの物体の輪郭に吸着（広め）
  const hit = P.pick(w, (assist ? (touch ? 48 : 30) : (touch ? 26 : 14)) / Math.max(0.3, cam.zoom));
  if (hit) {
    aim.hit = hit;
    aim.dir = P.flickDir(hit.ent, hit.point);
  } else {
    aim.hit = null;
    aim.dir = { x: 1, y: 0 };
  }
}

function aimPoint() {
  if (aim.hit) return aim.hit.point;
  return aim.world;
}

/* ───────────────────────── 入力 ───────────────────────── */

function onDown(e) {
  if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
  pointer.type = e.pointerType || 'mouse';
  pointer.x = e.clientX; pointer.y = e.clientY;
  snd.unlock();
  if (mode === 'aim') {
    if (pointer.down) return;
    canvas.setPointerCapture?.(e.pointerId);
    pointer.down = true; pointer.id = e.pointerId;
    pointer.downAt = performance.now() / 1000;
    pointer.lastX = e.clientX; pointer.lastY = e.clientY;
    aim.sx = e.clientX; aim.sy = e.clientY;
    updateAim();
    aim.locked = true;
    setMode('press');
    charge.hold = 0; charge.c = 0; charge.over = 0; charge.crit = false; charge.inkShown = false; charge.critPlayed = false;
    showInk('狙点！', { x: inkX(), y: 0.2, size: 0.16, dur: 0.5 });
    snd.play('aim', { vol: 0.8 });
    darkGoal = 0.35;
    e.preventDefault();
  } else if (mode === 'collapse' || mode === 'settle') {
    doFollow(e.clientX, e.clientY);
    e.preventDefault();
  }
}

function onMove(e) {
  pointer.type = e.pointerType || pointer.type;
  if (pointer.down && e.pointerId === pointer.id) {
    // 押したまま動かすと、照準を少しずつ微調整（指で照準が隠れないように）
    const k = pointer.type === 'mouse' ? 0.45 : 0.28;
    aim.sx = Math.max(0, Math.min(W, aim.sx + (e.clientX - pointer.lastX) * k));
    aim.sy = Math.max(0, Math.min(H, aim.sy + (e.clientY - pointer.lastY) * k));
    pointer.lastX = e.clientX; pointer.lastY = e.clientY;
    updateAim();
  } else if (!pointer.down && pointer.type === 'mouse' && mode === 'select') {
    // 何もしない
  } else if (!pointer.down && pointer.type === 'mouse') {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.hover = true;
    if (mode === 'aim') { aim.sx = e.clientX; aim.sy = e.clientY; updateAim(); }
  }
}

function onUp(e) {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  pointer.down = false;
  if (mode === 'press') {
    // タップ：狙点だけ決めて待つ
    setMode('aim');
    darkGoal = 0;
    showHint('長押しで蓄圧！ 離すと解放！', 2.2);
  } else if (mode === 'charge') {
    release();
  }
}

function onCancel(e) {
  if (!pointer.down || e.pointerId !== pointer.id) return;
  pointer.down = false;
  if (mode === 'press' || mode === 'charge') cancelCharge();
}

function cancelCharge() {
  charge.loop?.stop(); charge.loop = null;
  snd.duck(0, 0);
  setMode('aim');
  darkGoal = 0;
  camGoal = { ...overview };
}

// キーボード：スペース長押しでも蓄圧できる（PC）
let keyHeld = false;
function onKeyDown(e) {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'Enter') {
    if (mode === 'title') { openStages(); e.preventDefault(); return; }
    if (mode === 'select') return;
    if (mode === 'result') { retry(); e.preventDefault(); return; }
    if (mode === 'aim' && !$('settings').classList.contains('hidden')) return;
    if (mode === 'aim') {
      keyHeld = true;
      if (!pointer.hover) { aim.sx = W / 2; aim.sy = H / 2; }
      updateAim();
      setMode('press');
      charge.hold = 0; charge.c = 0; charge.over = 0; charge.crit = false; charge.inkShown = false; charge.critPlayed = false;
      showInk('狙点！', { x: inkX(), y: 0.2, size: 0.16, dur: 0.5 });
      snd.unlock(); snd.play('aim', { vol: 0.8 });
      darkGoal = 0.35;
      e.preventDefault();
    } else if (mode === 'collapse' || mode === 'settle') {
      doFollow(aim.sx, aim.sy);
    }
  } else if (e.code === 'KeyR') {
    if (mode !== 'title' && mode !== 'press' && mode !== 'charge') retry();
  } else if (e.code === 'Escape') {
    toggleSettings();
  } else if (e.code === 'KeyM') {
    toggleMute();
  }
}
function onKeyUp(e) {
  if ((e.code === 'Space' || e.code === 'Enter') && keyHeld) {
    keyHeld = false;
    if (mode === 'press') { setMode('aim'); darkGoal = 0; }
    else if (mode === 'charge') release();
  }
}

/* ───────────────────────── 蓄圧・解放 ───────────────────────── */

function updateCharge(dt) {
  charge.hold += dt;
  const h = charge.hold;
  if (h < CHARGE_TIME) {
    charge.c = Math.pow(h / CHARGE_TIME, 0.9);
    charge.crit = false; charge.over = 0;
  } else if (h < CHARGE_TIME + CRIT_WINDOW) {
    charge.c = 1; charge.crit = true; charge.over = 0;
    if (!charge.critPlayed) { charge.critPlayed = true; snd.play('charge', { vol: 0.9 }); flash = Math.max(flash, 0.12); flashColor = '255,235,220'; }
  } else {
    charge.c = 1; charge.crit = false;
    charge.over = Math.min(1, (h - CHARGE_TIME - CRIT_WINDOW) / OVER_TIME);
    if (charge.over > 0 && !charge.overPlayed) { charge.overPlayed = true; snd.play('over', { vol: 0.7 }); }
  }
  // 過蓄圧：照準がぶれる
  const t = performance.now() / 1000;
  const amp = charge.over * 16 / Math.max(0.4, cam.zoom);
  charge.jx = (Math.sin(t * 13.1) + Math.sin(t * 7.3)) * 0.5 * amp;
  charge.jy = (Math.cos(t * 11.7) + Math.sin(t * 5.1)) * 0.5 * amp;
  if (!charge.inkShown && h > 0.32) { charge.inkShown = true; showInk('蓄圧！', { x: inkX(), y: 0.2, size: 0.17, dur: 0.6 }); }
  // 音：うなりの高さと大きさ
  if (charge.loop) charge.loop.set(0.8 + charge.c * 0.7 + charge.over * 0.25 * Math.sin(t * 30), 0.25 + charge.c * 0.45);
  snd.duck(0.35 + charge.c * 0.45, charge.c * 0.7);
  // カメラ：指と標的に寄る
  const p = aimPoint() || overview;
  const z = overview.zoom * (1.18 + charge.c * 0.42);
  camGoal = { x: overview.x + (p.x - overview.x) * 0.62, y: overview.y + (p.y - overview.y) * 0.62, zoom: z };
  tiltGoal = 0.5;
  darkGoal = 0.35 + charge.c * 0.45;
}

function release() {
  charge.loop?.stop(0.02); charge.loop = null;
  let power, grade;
  const h = charge.hold;
  if (h < CHARGE_TIME) { power = Math.max(0.1, charge.c); grade = charge.c < 0.45 ? '弱' : '良'; }
  else if (h < CHARGE_TIME + CRIT_WINDOW) { power = CRIT_POWER; grade = '会心'; }
  else { power = 1 - 0.25 * charge.over; grade = '過蓄圧'; }
  // 狙点（過蓄圧のぶれを含む）
  let pt = aimPoint();
  if (!pt) pt = R.toWorld(cam, aim.sx, aim.sy);
  pt = { x: pt.x + charge.jx, y: pt.y + charge.jy };
  let hit = P.pick(pt, 22 / Math.max(0.3, cam.zoom));
  let dir = hit ? P.flickDir(hit.ent, hit.point) : aim.dir;
  if (charge.over > 0) {
    const a = Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * charge.over * 0.3;
    dir = { x: Math.cos(a), y: Math.sin(a) };
  }
  shot = { pt: hit ? hit.point : pt, dir, power, grade, hit, t: 0, applied: false };
  setMode('fire');
  speedLines = 1;
}

function applyShot() {
  shot.applied = true;
  record = { seed: roundSeed, flickStep: stepN, pt: { ...shot.pt }, dir: { ...shot.dir }, power: shot.power, grade: shot.grade, followStep: -1, followPt: null, endStep: 0, target: shot.hit?.ent?.name || null };
  const res = P.flick(shot.pt, shot.dir, shot.power);
  shot.crush = res.crush;
  if (!S.reduceFx) navigator.vibrate?.(shot.grade === '会心' ? [20, 30, 60] : 35);
  store.addPlay();
  playStartAt = performance.now();
  lastActionAt = performance.now();
  const crit = shot.grade === '会心';
  snd.play('snap', { vol: 1 });
  snd.play('boom', { vol: 0.5 + shot.power * 0.5, delay: 0.02 });
  shake = (8 + shot.power * 14) * (crit ? 1.3 : 1);
  flash = crit ? 0.65 : 0.35; flashColor = crit ? '255,230,200' : '255,255,255';
  const p = shot.pt;
  R.particles.ring(p.x, p.y, 10, 90 + shot.power * 120, 0.5, 'rgba(255,255,255,0.95)', 10);
  if (crit) R.particles.ring(p.x, p.y, 10, 200, 0.7, 'rgba(255,70,40,0.9)', 8);
  R.particles.dust(p.x, p.y, 8, '#d8d2c6', 20, 1.4);
  if (res.crush) setTimeout(() => showInk('圧砕！', { x: inkX(0.25), y: 0.32, size: 0.15, dur: 0.6 }), 260);
  if (!res.hit) setTimeout(() => showInk('空振り…', { x: 0.5, y: 0.34, size: 0.11, dur: 0.8, opts: { slash: false } }), 200);
  // スローモーション
  timeScale = 0.28; slowT = 0; slowBase = 0.28; slowHold = 0.35;
  setMode('collapse');
  tiltGoal = 1;
  camGoal = { ...overview, zoom: overview.zoom * 0.98 };
  darkGoal = 0;
  $('follow').classList.remove('hidden');
  snd.bgm('bgm_main');
  const gradeText = { 会心: '会心の一撃！', 良: '', 弱: '弱い…', 過蓄圧: '過蓄圧！ 威力ロス' }[shot.grade];
  if (gradeText) showHint(gradeText, 1.6);
}

function doFollow(sx, sy) {
  if (followUsed || !P || replaying) return;
  followUsed = true;
  const w = R.toWorld(cam, sx, sy);
  P.followUp(w);
  if (record) { record.followStep = stepN; record.followPt = { ...w }; }
  $('follow').classList.add('used');
  snd.play('follow', { vol: 0.9 });
  snd.play('whoosh', { vol: 0.6 });
  shake = Math.max(shake, 9);
  flash = Math.max(flash, 0.2); flashColor = '255,255,255';
  R.particles.ring(w.x, w.y, 10, 110, 0.45, 'rgba(255,90,60,0.95)', 8);
  R.particles.dust(w.x, w.y, 6, '#d8d2c6', 30, 1.2);
  showInk('追撃！', { x: inkX(0.25, sx / W), y: 0.24, size: 0.15, dur: 0.55 });
  // 指の突き
  followJab = { sx, sy, t: 0, dir: { x: sx < W / 2 ? 1 : -1, y: 0.25 } };
  timeScale = Math.min(timeScale, 0.5); slowT = 0; slowBase = 0.5; slowHold = 0.2;
}
let followJab = null;

/* ───────────────────────── 物理の出来事 → 演出・音 ───────────────────────── */

const SOUND_OF = { concrete: ['concrete1', 'concrete2'], metal: ['metal1', 'metal2'], glass: ['glass'], wood: ['wood'] };

function handleEvents() {
  const ev = P.events.splice(0);
  let impacts = 0;
  for (const e of ev) {
    switch (e.type) {
      case 'impact': {
        const E = e.energy;
        if (impacts < 4 && E > 60) {
          impacts++;
          const snd0 = (SOUND_OF[matSound(e.mat)] || SOUND_OF.concrete);
          const name = snd0[(Math.random() * snd0.length) | 0];
          const vol = Math.min(1, 0.18 + Math.log10(E) * 0.22);
          snd.play(e.ground && E > 400 ? 'thud' : name, { vol, vary: 0.2, gap: 0.05, pan: panOf(e.x) });
        }
        const md = matDef(e.mat);
        const n = Math.min(10, Math.floor(Math.sqrt(E) / 6));
        if (n > 0) {
          R.particles.chips(e.x, e.y, n, md.chips, 0, 0, Math.min(1.6, 0.5 + E / 1500));
          R.particles.dust(e.x, e.y, Math.min(5, Math.ceil(n / 2)), md.dust, 14, Math.min(1.8, 0.6 + E / 1200));
        }
        if (matSound(e.mat) === 'metal' && E > 150) R.particles.sparks(e.x, e.y, Math.min(10, Math.ceil(E / 120)));
        if (matSound(e.mat) === 'glass' && E > 120) R.particles.glass(e.x, e.y, Math.min(12, Math.ceil(E / 90)));
        if (E > 900) shake = Math.max(shake, Math.min(14, E / 260));
        break;
      }
      case 'break': {
        lastActionAt = performance.now();
        const md = e.matDef;
        const big = Math.sqrt((e.w || 40) * (e.h || 40));
        R.particles.chips(e.x, e.y, Math.min(26, 6 + big / 5), md.chips, 0, 0, 1.2);
        R.particles.dust(e.x, e.y, Math.min(14, 4 + big / 12), md.dust, big * 0.6, 1.6);
        if (md.sound === 'glass') R.particles.glass(e.x, e.y, 14);
        if (md.sound === 'metal') R.particles.sparks(e.x, e.y, 10);
        snd.play(e.isFrag ? matSoundName(md.sound) : 'crush', { vol: e.isFrag ? 0.5 : 0.85, vary: 0.15, gap: 0.08, pan: panOf(e.x) });
        if (!e.isFrag) { snd.play('collapse', { vol: 0.5, vary: 0.2, gap: 0.4, pan: panOf(e.x) }); shake = Math.max(shake, 7); }
        break;
      }
      case 'debris': {
        const md = matDef(e.mat);
        R.particles.chips(e.x, e.y, Math.min(8, e.count + 2), md.chips, e.vx, e.vy, 0.8);
        R.particles.dust(e.x, e.y, 2, md.dust, 10, 1);
        break;
      }
      case 'chain': {
        lastActionAt = performance.now();
        if (e.combo >= 2) snd.play('chain', { vol: 0.35, rate: 0.9 + Math.min(1.2, e.combo * 0.06), gap: 0.06 });
        const ms = [5, 10, 20, 35, 60].filter((m) => e.combo >= m && lastMilestone < m).pop();
        if (ms) {
          lastMilestone = ms;
          const word = { 5: '連鎖！', 10: '大連鎖！', 20: '超連鎖！', 35: '激連鎖！', 60: '神連鎖！' }[ms];
          showInk(word, { x: inkX(0.3), y: 0.26, size: 0.15 + Math.min(0.06, ms * 0.002), dur: 0.6 }, true);
        }
        break;
      }
      case 'destroy': {
        lastActionAt = performance.now();
        // 小さな点数はまとめて、大きなものだけ吹き出しにする（画面がうるさくならないように）
        pendingPts += e.pts;
        if (e.pts >= 40000 || e.level >= 1) {
          addPopup(e.x, e.y - 20, `+${pendingPts.toLocaleString('ja-JP')}`, e.pts >= 100000 ? 22 : 18, e.level >= 1 ? '#ffd36b' : '#ffffff');
          pendingPts = 0;
        }
        break;
      }
      case 'target': {
        snd.play('target', { vol: 1 });
        showInk('撃破！', { x: inkX(0.3), y: 0.3, size: 0.19, dur: 0.75 }, true);
        addPopup(e.x, e.y - 60, `${e.name} 撃破`, 22, '#ff8a6a', 2);
        shake = Math.max(shake, 10);
        break;
      }
      case 'group': {
        addPopup(e.x, e.y - 80, `→ ${e.name}`, 18, '#9fe0ff', 1.6);
        break;
      }
      case 'fall':
        R.particles.dust(e.x, 0, 3, '#bbb', 20, 1);
        break;
      default:
        break;
    }
  }
}

function matDef(name) { return MATS[name] || MATS.concrete; }
function matSound(name) { return (MATS[name] || MATS.concrete).sound; }
function matSoundName(s) { const l = SOUND_OF[s] || SOUND_OF.concrete; return l[(Math.random() * l.length) | 0]; }
function panOf(x) { const s = R.toScreen(cam, x, 0); return ((s.x / W) - 0.5) * 1.2; }

function addPopup(x, y, text, size = 16, color = '#fff', life = 1.1) {
  // 近くの吹き出しと重ならないように少しずらす
  for (const p of popups) if (p.t < 0.4 && Math.abs(p.x - x) < 70 && Math.abs(p.y - y) < 24) y -= 26;
  if (popups.length > 14) popups.shift();
  popups.push({ x, y, text, size, color, t: 0, life });
}

/* ───────────────────────── 墨字・ヒント ───────────────────────── */

// 墨字は照準と反対側に出す（標的を隠さない）
function inkX(spread = 0.27, ref) {
  const ax = ref ?? (aim.sx / Math.max(1, W));
  return ax > 0.5 ? 0.5 - spread : 0.5 + spread;
}

function showInk(text, o, important = false) {
  const now = performance.now() / 1000;
  if (!important && now - lastInkAt < 0.18) return;
  lastInkAt = now;
  ink.show(text, o);
}

let hintTimer = 0;
function showHint(text, dur = 2) {
  const el = $('hint');
  el.textContent = text;
  el.classList.add('show');
  hintTimer = dur;
}

/* ───────────────────────── HUD・結果 ───────────────────────── */

function updateHud(force = false) {
  if (!P) return;
  const sc = P.score();
  if (force) scoreShown = sc;
  scoreShown += (sc - scoreShown) * 0.25;
  if (Math.abs(sc - scoreShown) < 1) scoreShown = sc;
  $('score').textContent = Math.round(scoreShown).toLocaleString('ja-JP');
  const r = P.rate() * 100;
  $('rate').innerHTML = `${r.toFixed(1)}<small>%</small>`;
  $('rate-bar').style.width = `${Math.min(100, r)}%`;
  const combo = P.stats.chain;
  if (combo !== shownCombo || force) {
    const el = $('combo');
    el.textContent = `×${combo}`;
    if (!force) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
    shownCombo = combo;
  }
}

export function formatDeco(man) {
  const v = Math.round(man);
  if (v >= 10000) {
    const oku = Math.floor(v / 10000), rest = v % 10000;
    return `${oku.toLocaleString('ja-JP')}億${rest ? rest.toLocaleString('ja-JP') + '万' : ''}デコ`;
  }
  return `${v.toLocaleString('ja-JP')}万デコ`;
}

function rankOf(score) {
  const ranks = [[0, '見習いの指'], [200000, '一人前の指'], [600000, '熟練の指'], [1000000, '達人の指'], [1400000, '指聖'], [1800000, '指神']];
  let r = ranks[0][1];
  for (const [s, n] of ranks) if (score >= s) r = n;
  return r;
}

function showResult() {
  if (replaying) { endReplay(); return; }
  setMode('result');
  if (record) record.endStep = stepN;
  const fin = P.finalize();
  const s = P.stats;
  const rec = { score: fin.score, rate: fin.rate, chain: s.chain, damage: s.damage };
  const wasLocked = STAGES.map((_, i) => !isUnlocked(i));
  const upd = store.submit(stage.id, rec);
  checkAchievements(fin, s);
  const newly = STAGES.filter((_, i) => wasLocked[i] && isUnlocked(i));
  if (newly.length) setTimeout(() => showInk('新景解放！', { x: 0.5, y: 0.14, size: 0.1, dur: 1.4 }, true), 900);
  resultData = { fin, rec, upd };
  const rate = fin.rate;
  const word = rate >= (stage.zenkai ?? ZENKAI) ? '全壊。' : rate >= 0.4 ? '大破。' : rate >= 0.2 ? '中破。' : rate >= 0.07 ? '小破。' : 'かすり傷。';
  drawResultInk(word);
  $('rank-title').textContent = `称号：${rankOf(fin.score)}`;
  $('r-move').textContent = moveName();
  const stars = starsOf(rate);
  $('r-stars').textContent = starText(stars);
  $('r-headline').textContent = headline(fin, s);
  const idx = STAGES.indexOf(stage);
  const nextOk = idx >= 0 && idx + 1 < STAGES.length && isUnlocked(idx + 1);
  $('next').classList.toggle('hidden', !nextOk);
  $('replay').classList.toggle('hidden', !record);
  $('r-score').textContent = fin.score.toLocaleString('ja-JP');
  $('r-rate').textContent = `${(rate * 100).toFixed(1)}%`;
  $('r-chain').textContent = `${s.chain}`;
  $('r-damage').textContent = formatDeco(s.damage);
  const goals = $('r-goals');
  goals.innerHTML = '';
  const all = [
    ['target', '看板撃破'], ['reach', '三棟連鎖'], ['oneshot', '一撃全壊'], ['zenkai', '全壊'], ['combo', '大連鎖'],
  ];
  const got = new Set(fin.goals.map((g) => g.id));
  for (const g of fin.goals) {
    const li = document.createElement('li');
    li.innerHTML = `${g.label}<em>+${g.pts.toLocaleString('ja-JP')}</em>`;
    goals.appendChild(li);
  }
  for (const [id, label] of all) {
    if (got.has(id) || (id === 'zenkai' && got.has('oneshot')) || (id === 'oneshot' && got.has('zenkai'))) continue;
    const li = document.createElement('li');
    li.className = 'miss';
    li.textContent = label;
    goals.appendChild(li);
  }
  $('r-best').classList.toggle('hidden', !upd.score);
  $('result').classList.remove('hidden');
  $('hud').classList.add('hidden');
  snd.play(upd.score ? 'best' : 'result', { vol: 0.9 });
  snd.bgm('bgm_result', 0.3);
  updateHud(true);
  $('best-score').textContent = store.best(stage.id).score.toLocaleString('ja-JP');
  setTimeout(() => $('retry').focus({ preventScroll: true }), 50);
}

function drawResultInk(word) {
  const cv = $('result-ink');
  const w = 520, h = 200, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const spr = makeInk(word, { size: 120, seed: word.length * 31 + 7 });
  const sc = Math.min(w / spr.w, h / spr.h) * 1.05;
  g.drawImage(spr.canvas, (w - spr.w * sc) / 2, (h - spr.h * sc) / 2, spr.w * sc, spr.h * sc);
}

function drawLogo() {
  const cv = $('logo');
  if (!cv || mode !== 'title') return;
  const rect = cv.getBoundingClientRect();
  const w = Math.max(200, rect.width), h = w / 2.4;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = w * dpr; cv.height = h * dpr;
  const g = cv.getContext('2d');
  g.scale(dpr, dpr);
  const spr = makeInk('指一本。', { size: 200, seed: 11 });
  const sc = Math.min(w / spr.w, h / spr.h) * 1.08;
  g.drawImage(spr.canvas, (w - spr.w * sc) / 2, (h - spr.h * sc) / 2, spr.w * sc, spr.h * sc);
}

/* ───────────────────────── 設定・ボタン ───────────────────────── */

function toggleSettings(force) {
  const el = $('settings');
  const open = force ?? el.classList.contains('hidden');
  el.classList.toggle('hidden', !open);
  if (open) {
    $('set-bgm').value = S.bgm; $('set-sfx').value = S.sfx;
    $('set-fx').checked = !!S.reduceFx;
    $('set-hints').checked = hintsOn();
    $('set-quality').value = S.quality;
    $('set-assist').checked = S.assist !== false;
    if (mode === 'press' || mode === 'charge') { pointer.down = false; cancelCharge(); }
  }
}

// ヒントの既定：そのステージで ★1 を取るまでは表示
function hintsOn() {
  if (S.hints === null || S.hints === undefined) { const b = store.best(stage.id); return !(b && b.rate >= 0.4); }
  return !!S.hints;
}

function toggleMute() {
  snd.unlock();
  snd.setMuted(!snd.muted);
  store.setSetting('muted', snd.muted);
  $('btn-sound').classList.toggle('off', snd.muted);
}

function bindUi() {
  $('start').addEventListener('click', openStages);
  $('to-stages').addEventListener('click', openStages);
  $('stages-back').addEventListener('click', () => { $('stages').classList.add('hidden'); $('title').classList.remove('hidden'); setMode('title'); drawLogo(); });
  $('hud-stage').addEventListener('click', () => { if (mode === 'aim' || mode === 'result') openStages(); });
  $('replay').addEventListener('click', startReplay);
  $('next').addEventListener('click', () => { const i = STAGES.indexOf(stage); if (i >= 0 && STAGES[i + 1]) { $('result').classList.add('hidden'); startStage(STAGES[i + 1]); } });
  $('set-assist').addEventListener('change', (e) => { S.assist = e.target.checked; store.setSetting('assist', S.assist); });
  $('retry').addEventListener('click', retry);
  $('skip').addEventListener('click', () => { fast = true; $('skip').classList.add('hidden'); });
  $('share').addEventListener('click', async () => {
    if (!resultData) return;
    const t = `指一本。『${stage.name}』 破壊率 ${(resultData.fin.rate * 100).toFixed(1)}% / スコア ${resultData.fin.score.toLocaleString('ja-JP')} / 連鎖 ${resultData.rec.chain} #指一本`;
    const url = location.href.split('#')[0].split('?')[0];
    try {
      if (navigator.share) await navigator.share({ title: '指一本。', text: t, url });
      else { await navigator.clipboard.writeText(`${t} ${url}`); showHint('結果をコピーしました', 1.6); }
    } catch (e) { /* キャンセル */ }
  });
  $('btn-settings').addEventListener('click', () => toggleSettings());
  $('set-close').addEventListener('click', () => toggleSettings(false));
  $('btn-sound').addEventListener('click', toggleMute);
  $('btn-sound').classList.toggle('off', snd.muted);
  const fullOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
  if (!fullOk) $('btn-full').classList.add('hidden');
  $('btn-full').addEventListener('click', () => {
    const d = document;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else { const el = d.documentElement; (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el); }
  });
  $('set-bgm').addEventListener('input', (e) => { S.bgm = Number(e.target.value); snd.bgmVol = S.bgm; snd.applyVolumes(); store.setSetting('bgm', S.bgm); });
  $('set-sfx').addEventListener('input', (e) => { S.sfx = Number(e.target.value); snd.sfxVol = S.sfx; snd.applyVolumes(); store.setSetting('sfx', S.sfx); snd.play('tick', { vol: 0.8, gap: 0.1 }); });
  $('set-fx').addEventListener('change', (e) => { S.reduceFx = e.target.checked; store.setSetting('reduceFx', S.reduceFx); });
  $('set-hints').addEventListener('change', (e) => { S.hints = e.target.checked; store.setSetting('hints', S.hints); });
  $('set-quality').addEventListener('change', (e) => {
    S.quality = e.target.value; store.setSetting('quality', S.quality);
    quality = S.quality === 'low' ? 'low' : 'high';
    P?.setBudget(quality === 'low' ? 'low' : 'high');
    R.particles.setMax(quality === 'low' ? 220 : 520);
    resize();
  });
  $('set-reset').addEventListener('click', () => {
    if (!confirm('ベスト記録と設定を消しますか？')) return;
    store.reset();
    Object.assign(S, store.settings);
    $('best-score').textContent = '—';
    toggleSettings(false);
  });

  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (mode === 'press' || mode === 'charge')) { pointer.down = false; cancelCharge(); }
  });
}

/* ───────────────────────── 毎フレーム ───────────────────────── */

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;
  autoQuality(dt);
  modeT += dt;
  const fx = S.reduceFx ? 0.3 : 1;

  // ── 状態ごとの更新 ──
  if (mode === 'title' || mode === 'select') {
    // タイトル：街をゆっくり眺める
    const t = now / 1000;
    camGoal = { x: overview.x + Math.sin(t * 0.15) * 120, y: overview.y - 20, zoom: overview.zoom * 1.12 };
    tiltGoal = 0.8;
  } else if (mode === 'press') {
    if (performance.now() / 1000 - pointer.downAt > HOLD_DELAY || keyHeld) {
      setMode('charge');
      charge.loop = snd.loop('pressure', 0.3);
      charge.overPlayed = false;
    }
  } else if (mode === 'charge') {
    updateCharge(dt);
  } else if (mode === 'fire') {
    shot.t += dt;
    if (shot.t > 0.07) {
      // 指が当たった瞬間：静止して無音
      setMode('hitstop');
      snd.silence(0.45);
      showInk('解放！', { x: inkX(), y: 0.22, size: 0.2, dur: 0.65 }, true);
      flash = 0.25 * fx; flashColor = '255,255,255';
    }
  } else if (mode === 'hitstop') {
    if (modeT > 0.1) applyShot();
  } else if (mode === 'collapse' || mode === 'settle') {
    if (modeT > 1.4 && !fast) $('skip').classList.remove('hidden');
    const m = P.motion();
    if (m.max < 0.6) settleQuiet += dt; else settleQuiet = 0;
    const tCollapse = modeT;
    const sinceEvent = (performance.now() - lastActionAt) / 1000;
    const done = (tCollapse > 2.6 && settleQuiet > 0.8) || (tCollapse > 4 && sinceEvent > 2.8) || tCollapse > 14;
    if (mode === 'collapse' && (done || (fast && (settleQuiet > 0.25 || sinceEvent > 1.2 || tCollapse > 14)))) {
      setMode('settle');
      $('skip').classList.add('hidden');
    }
    if (mode === 'settle' && modeT > 0.7) showResult();
  }

  // ── 物理 ──
  if (P && mode !== 'hitstop' && mode !== 'fire') {
    slowT += dt;
    if (mode === 'collapse' && timeScale < 1) {
      const t = Math.max(0, slowT - slowHold);
      timeScale = Math.min(1, slowBase + t * 1.2);
    }
    const scale = fast ? 6 : timeScale;
    acc += dt * 1000 * scale;
    let n = 0;
    const maxSteps = fast ? 12 : 3;
    while (acc >= STEP_MS && n < maxSteps) {
      P.step(STEP_MS);
      stepN++;
      handleEvents();
      if (replaying) replayTick();
      acc -= STEP_MS; n++;
    }
    if (n === maxSteps) acc = 0;
  }

  // ── カメラ ──
  if (replayCam && P) {
    // リプレイ：動いている物の中心を追いかけて寄る
    let sx = 0, sy = 0, n = 0;
    for (const e of P.entities) if (!e.body.isSleeping && e.body.speed > 1) { sx += e.body.position.x; sy += e.body.position.y; n++; }
    if (n) camGoal = { x: overview.x + (sx / n - overview.x) * 0.55, y: overview.y + (sy / n - overview.y) * 0.4, zoom: overview.zoom * 1.35 };
    else camGoal = { ...overview };
  }
  const k = 1 - Math.pow(0.0015, dt);
  const kz = mode === 'collapse' && modeT < 0.6 ? 1 - Math.pow(0.02, dt) : k;
  cam.x += (camGoal.x - cam.x) * kz;
  cam.y += (camGoal.y - cam.y) * kz;
  cam.zoom += (camGoal.zoom - cam.zoom) * kz;
  tilt += (tiltGoal - tilt) * (1 - Math.pow(0.05, dt));
  dark += (darkGoal - dark) * (1 - Math.pow(0.001, dt));
  shake *= Math.pow(0.004, dt);
  cam.sx = (Math.random() - 0.5) * shake * fx;
  cam.sy = (Math.random() - 0.5) * shake * fx;
  flash *= Math.pow(0.002, dt);
  speedLines = Math.max(0, speedLines - dt * 4);

  // ── 指 ──
  updateFinger(dt);

  // ── 演出の更新 ──
  R.particles.update(dt * (mode === 'hitstop' ? 0 : Math.min(1, timeScale * 1.4)));
  ink.update(dt);
  for (const p of popups) p.t += dt;
  popups = popups.filter((p) => p.t < p.life);
  if (hintTimer > 0) { hintTimer -= dt; if (hintTimer <= 0) $('hint').classList.remove('show'); }
  if (mode !== 'title') updateHud();

  // ── 描画 ──
  const aiming = mode === 'aim' || mode === 'press' || mode === 'charge';
  const focus = aiming && aim.world ? R.toScreen(cam, (aimPoint() || aim.world).x, (aimPoint() || aim.world).y) : null;
  R.draw({
    P, cam, tilt, dark, focus,
    highlight: aiming && aim.hit && (pointer.hover || pointer.down || aim.locked || keyHeld) ? aim.hit.ent : null,
    hints: mode === 'aim' && hintsOn() ? hintPoints() : null,
    popups,
  }, dt);
  const g = R.g;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawSpeedLines(g);
  finger.draw(g);
  if (followJab) drawJab(g, dt);
  if (aiming && (pointer.hover || pointer.down || aim.locked || keyHeld)) drawReticle(g, now / 1000);
  ink.draw(g, W, H, DPR);
  if (flash > 0.01) {
    g.fillStyle = `rgba(${flashColor},${Math.min(0.8, flash * fx)})`;
    g.fillRect(0, 0, W, H);
  }
  if (charge.over > 0 && mode === 'charge') {
    g.strokeStyle = `rgba(255,30,20,${0.25 + 0.25 * Math.sin(now / 60)})`;
    g.lineWidth = 14 * charge.over;
    g.strokeRect(0, 0, W, H);
  }
}

function hintPoints() {
  const out = [];
  for (const wp of stage.weakPoints || []) {
    const e = P.entities.find((x) => x.id === wp.id);
    if (!e) continue;
    let x, y;
    if (wp.part && e.body.parts.length > 1) {
      const pt = e.body.parts.find((p) => p.label === wp.part);
      const pd = e.parts.find((p) => p.part === wp.part);
      x = pt.position.x + wp.dx * pd.w / 2; y = pt.position.y + wp.dy * pd.h / 2;
    } else {
      const w = e.w ?? e.r * 2, h = e.h ?? e.r * 2;
      x = e.body.position.x + wp.dx * w / 2; y = e.body.position.y + wp.dy * h / 2;
    }
    out.push({ x, y, label: wp.label });
  }
  return out;
}

function updateFinger(dt) {
  finger.t += dt;
  const baseW = Math.max(40, Math.min(128, Math.min(W, H) * 0.105));
  const zoomK = Math.pow(cam.zoom / Math.max(0.05, overview.zoom), 0.5);
  const aiming = mode === 'aim' || mode === 'press' || mode === 'charge';
  let target = null;
  if (aiming && (pointer.hover || pointer.down || aim.locked || keyHeld)) {
    const p = aimPoint() || aim.world;
    if (p) {
      const s = R.toScreen(cam, p.x + charge.jx * (mode === 'charge' ? 1 : 0), p.y + charge.jy * (mode === 'charge' ? 1 : 0));
      target = { x: s.x, y: s.y };
    }
  }
  const w = baseW * zoomK * (1 + charge.c * 0.25);
  finger.width += (w - finger.width) * Math.min(1, dt * 10);
  finger.charge = mode === 'charge' ? charge.c : Math.max(0, finger.charge - dt * 3);
  finger.over = mode === 'charge' ? charge.over : 0;
  if (target) {
    // 指先は狙点の手前で待つ。溜めるほど後ろに引く
    const d = aim.dir;
    finger.dir.x += (d.x - finger.dir.x) * Math.min(1, dt * 12);
    finger.dir.y += (d.y - finger.dir.y) * Math.min(1, dt * 12);
    const l = Math.hypot(finger.dir.x, finger.dir.y) || 1;
    finger.dir.x /= l; finger.dir.y /= l;
    const back = finger.width * (mode === 'aim' ? 1.05 : 0.85 + charge.c * 0.65);
    const tx = target.x - finger.dir.x * back, ty = target.y - finger.dir.y * back;
    if (finger.alpha < 0.05) { finger.tip.x = tx - finger.dir.x * W * 0.3; finger.tip.y = ty - finger.dir.y * W * 0.3; }
    finger.tip.x += (tx - finger.tip.x) * Math.min(1, dt * 14);
    finger.tip.y += (ty - finger.tip.y) * Math.min(1, dt * 14);
    finger.curl += ((mode === 'aim' ? 0.3 : 0.35 + charge.c * 0.65) - finger.curl) * Math.min(1, dt * 8);
    finger.alpha = Math.min(1, finger.alpha + dt * 5);
  } else if ((mode === 'fire' || mode === 'hitstop') && shot) {
    const s = R.toScreen(cam, shot.pt.x, shot.pt.y);
    const k = mode === 'fire' ? Math.min(1, shot.t / 0.07) : 1;
    finger.dir = { ...shot.dir };
    const back = finger.width * (1.5 * (1 - k)) - finger.width * 0.1 * k;
    finger.tip.x = s.x - shot.dir.x * back; finger.tip.y = s.y - shot.dir.y * back;
    finger.curl = 1 - k;
    finger.flash = 0.6;
    finger.alpha = 1;
  } else {
    // 引っ込める
    finger.flash = Math.max(0, finger.flash - dt * 3);
    if (finger.alpha > 0) {
      finger.tip.x -= finger.dir.x * dt * W * 1.4;
      finger.tip.y -= finger.dir.y * dt * W * 1.4;
      finger.alpha = Math.max(0, finger.alpha - dt * 3);
    }
  }
}

function drawSpeedLines(g) {
  if (speedLines <= 0 || !shot) return;
  const s = R.toScreen(cam, shot.pt.x, shot.pt.y);
  const r = rng(Math.floor(performance.now() / 50));
  g.save();
  g.strokeStyle = `rgba(255,255,255,${0.55 * speedLines})`;
  for (let i = 0; i < 18; i++) {
    const off = (r() - 0.5) * finger.width * 2.4;
    const nx = -shot.dir.y, ny = shot.dir.x;
    const len = finger.width * (2 + r() * 4);
    const x0 = s.x + nx * off - shot.dir.x * finger.width * (1 + r()), y0 = s.y + ny * off - shot.dir.y * finger.width * (1 + r());
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 - shot.dir.x * len, y0 - shot.dir.y * len); g.stroke();
  }
  g.restore();
}

// 追撃の指（画面の端から一突き）
function drawJab(g, dt) {
  followJab.t += dt;
  const t = followJab.t;
  if (t > 0.45) { followJab = null; return; }
  const f = new Finger();
  f.dir = followJab.dir;
  f.width = finger.width || 70;
  const k = t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.37;
  const back = f.width * (2.5 * (1 - k));
  f.tip = { x: followJab.sx - f.dir.x * back, y: followJab.sy - f.dir.y * back };
  f.curl = 0.1;
  f.alpha = Math.min(1, k * 2);
  f.flash = 0.4;
  f.draw(g);
}

function drawReticle(g, t) {
  const p = aimPoint() || aim.world;
  if (!p) return;
  const jx = mode === 'charge' ? charge.jx : 0, jy = mode === 'charge' ? charge.jy : 0;
  const s = R.toScreen(cam, p.x + jx, p.y + jy);
  const touch = pointer.type !== 'mouse' && pointer.type !== 'key';
  const Rr = touch ? 38 : 26;
  const has = !!aim.hit;
  const charging = mode === 'charge';
  g.save();
  g.translate(s.x, s.y);
  // 外周
  g.lineWidth = 2.5;
  g.strokeStyle = has ? 'rgba(230,30,30,0.95)' : 'rgba(255,255,255,0.75)';
  if (!has) g.setLineDash([5, 5]);
  const rr = Rr * (charging ? 1 - charge.c * 0.25 : 1 + Math.sin(t * 6) * 0.04);
  g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 2); g.stroke();
  g.setLineDash([]);
  // 十字
  g.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(dx * rr * 0.55, dy * rr * 0.55); g.lineTo(dx * rr * 1.35, dy * rr * 1.35); }
  g.stroke();
  g.fillStyle = has ? '#ff2a1a' : '#fff';
  g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill();
  // 弾く向き
  if (has) {
    const d = aim.dir;
    const a = Math.atan2(d.y, d.x);
    g.save();
    g.rotate(a);
    g.strokeStyle = 'rgba(255,40,25,0.9)'; g.fillStyle = 'rgba(255,40,25,0.9)';
    g.lineWidth = 4;
    g.beginPath(); g.moveTo(-rr - 26, 0); g.lineTo(-rr - 6, 0); g.stroke();
    g.beginPath(); g.moveTo(-rr - 2, 0); g.lineTo(-rr - 13, -7); g.lineTo(-rr - 13, 7); g.closePath(); g.fill();
    g.restore();
  }
  // 蓄圧ゲージ（照準のまわり）
  if (charging || mode === 'press') {
    const gr = rr + 10;
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.45)';
    g.beginPath(); g.arc(0, 0, gr, 0, Math.PI * 2); g.stroke();
    const c = charge.c;
    const col = charge.over > 0 ? `rgb(255,${40 + 60 * Math.sin(t * 40)},30)` : charge.crit ? '#ffffff' : c > 0.85 ? '#ffb238' : '#ff6a3d';
    g.strokeStyle = col;
    g.lineWidth = charge.crit ? 9 : 6;
    g.beginPath(); g.arc(0, 0, gr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c); g.stroke();
    // 会心の目印
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
    g.beginPath(); g.arc(0, 0, gr + 7, -Math.PI / 2 - 0.12, -Math.PI / 2 + 0.12); g.stroke();
    // 威力の表示
    const pw = charge.hold < CHARGE_TIME ? charge.c : charge.crit ? CRIT_POWER : 1 - 0.25 * charge.over;
    const label = charge.crit ? '会心！' : charge.over > 0 ? '過蓄圧！' : `圧 ${Math.round(pw * 100)}%`;
    g.font = `900 ${touch ? 16 : 14}px ${'system-ui, sans-serif'}`;
    g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.8)';
    g.strokeText(label, 0, gr + 24);
    g.fillStyle = charge.crit ? '#fff' : charge.over > 0 ? '#ff5a3c' : '#ffd36b';
    g.fillText(label, 0, gr + 24);
  } else if (has) {
    g.font = `800 ${touch ? 15 : 13}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(aim.hit.ent.name, 0, rr + 22);
    g.fillStyle = '#fff';
    g.fillText(aim.hit.ent.name, 0, rr + 22);
  }
  g.restore();
}

function autoQuality(dt) {
  if (S.quality !== 'auto' || mode === 'title') return;
  frameTimes.push(dt);
  if (frameTimes.length < 120) return;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
  frameTimes = [];
  if (avg > 0.026 && quality !== 'low') {
    quality = 'low';
    P?.setBudget('low');
    R.particles.setMax(220);
    resize();
  }
}

/* ───────────────────────── 起動 ───────────────────────── */

async function boot() {
  bindUi();
  // 筆文字フォントを読み込んでから墨字を作る
  try { await Promise.race([document.fonts.load(`64px ${INK_FONT}`, '指一本。狙点！'), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* 代わりの書体で描く */ }
  newRound();
  resize();
  computeOverview();
  Object.assign(cam, { ...overview, zoom: overview.zoom * 1.12 });
  drawLogo();
  // よく使う墨字を先に作っておく（初回の引っかかりを防ぐ）
  setTimeout(() => {
    const S0 = Math.min(W, H);
    for (const [t, s] of [['狙点！', 0.16], ['蓄圧！', 0.17], ['解放！', 0.2]]) ink.sprite(t, Math.max(24, Math.round(Math.min(220, S0 * s) * DPR / 8) * 8), {});
  }, 50);
  requestAnimationFrame(frame);
}

// 確認用（自動テストから照準の画面位置を知るため）
window.__yubi = {
  screenOf(id, dx = 0, dy = 0) {
    const e = P?.entities.find((x) => x.id === id);
    if (!e) return null;
    const b = e.body.bounds;
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y;
    return R.toScreen(cam, (b.min.x + b.max.x) / 2 + dx * w / 2, (b.min.y + b.max.y) / 2 + dy * h / 2);
  },
  get mode() { return mode; },
  get stats() { return P?.stats; },
};

boot();


/* ───────────────────────── 技名・号外 ───────────────────────── */

function moveName() {
  if (!shot) return '';
  const target = record?.target;
  if (!target) return '技名：空振りの舞';
  const pre = { 会心: '奥義・', 良: '', 弱: 'そっと', 過蓄圧: '暴発・' }[shot.grade] || '';
  const verb = shot.crush ? '砕き' : P.stats.chain >= 10 ? '崩し・百花繚乱' : P.stats.chain >= 5 ? '崩し' : '弾き';
  const tail = followUsed ? '＋追撃' : '';
  return `技名：${pre}${target}${verb}${tail}`;
}

function headline(fin, s) {
  const r = fin.rate;
  const name = stage.name;
  const tgt = stage.targetLabel?.replace('撃破', '') || '看板';
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  if (r >= (stage.zenkai ?? ZENKAI)) return pick([`【号外】${name}、指一本で全壊　関係者「まさか指で」`, `【速報】${name}消滅　現場には指紋ひとつ`, `【号外】「デコピンでした」${name}全壊の真相`]);
  if (s.targetDown) return pick([`【速報】${tgt}、ついに倒れる　「絶対」とは何だったのか`, `【号外】${tgt}陥落　市民「指が見えた」`]);
  if (r >= 0.3) return pick([`【地域】${name}で謎の崩落　被害総額${formatDeco(s.damage)}`, `【速報】${name}半壊　原因は「巨大な指」か`]);
  if (r >= 0.05) return pick([`【地域】${name}で小さな揺れ　住民「くすぐったい」`, `【天気】${name}付近、ところにより指`]);
  return pick([`【平和】${name}、今日も無事　指は空を切った`, `【コラム】空振りもまた、指の道`]);
}

/* ───────────────────────── リプレイ（同じ入力で物理をやり直す） ───────────────────────── */

function startReplay() {
  if (!record) return;
  store.unlock('replay');
  snd.play('ui');
  $('result').classList.add('hidden');
  $('replay-badge').classList.remove('hidden');
  P = createPhysics(M, stage, { quality: quality === 'low' ? 'low' : 'high', seed: record.seed });
  for (let i = 0; i < Math.min(record.flickStep, 7200); i++) P.step(STEP_MS);
  stepN = record.flickStep;
  R.particles.list = [];
  popups = [];
  lastMilestone = 0;
  replaying = true;
  P.flick(record.pt, record.dir, record.power);
  snd.play('snap'); snd.play('boom', { vol: 0.8 });
  showInk('解放！', { x: 0.5, y: 0.22, size: 0.18, dur: 0.7 }, true);
  shake = 14; flash = 0.3; flashColor = '255,255,255';
  timeScale = 0.22; slowT = 0; slowBase = 0.22; slowHold = 1.1; // 最初はじっくり
  setMode('collapse');
  fast = false;
  replayCam = true;
}

let replayCam = false;
function replayTick() {
  if (record.followStep >= 0 && stepN === record.followStep) {
    P.followUp(record.followPt);
    showInk('追撃！', { x: 0.5, y: 0.24, size: 0.14, dur: 0.55 }, true);
    snd.play('follow');
    R.particles.ring(record.followPt.x, record.followPt.y, 10, 110, 0.45, 'rgba(255,90,60,0.95)', 8);
  }
  if (stepN >= record.endStep && mode === 'collapse') setMode('settle');
}

function endReplay(silent = false) {
  replaying = false;
  replayCam = false;
  $('replay-badge').classList.add('hidden');
  if (silent) return;
  setMode('result');
  $('result').classList.remove('hidden');
}


/* ───────────────────────── 実績（指の記録） ───────────────────────── */

export const ACHIEVEMENTS = [
  ['first', 'はじめての一撃', '一回弾く'],
  ['crit', '会心', '会心のタイミングで離す'],
  ['over', '暴発', '過蓄圧のまま離す'],
  ['whiff', '空を切る', '何もない所を弾く'],
  ['crush', '圧砕', '標的を一撃で砕く'],
  ['target', '的中', 'ステージの目標を撃破'],
  ['chain10', '十連鎖', '一回で連鎖 10 以上'],
  ['chain20', '二十連鎖', '一回で連鎖 20 以上'],
  ['zenkai', '全壊', 'どこかのステージで全壊'],
  ['oneshot', '一撃全壊', '追撃なしで全壊'],
  ['million', '百万点', 'スコア 100 万点以上'],
  ['daily', '日課', '日替わり違法建築に挑戦'],
  ['replay', '見返し', 'リプレイを見る'],
  ['allstars', '全景制覇', '第一景〜第四景すべてで ★3'],
];

function checkAchievements(fin, s) {
  const got = [];
  const u = (id, cond) => { if (cond && store.unlock(id)) got.push(ACHIEVEMENTS.find((a) => a[0] === id)[1]); };
  u('first', true);
  u('crit', shot?.grade === '会心');
  u('over', shot?.grade === '過蓄圧');
  u('whiff', !record?.target);
  u('crush', !!shot?.crush);
  u('target', s.targetDown);
  u('chain10', s.chain >= 10);
  u('chain20', s.chain >= 20);
  u('zenkai', fin.rate >= (stage.zenkai ?? ZENKAI));
  u('oneshot', fin.goals.some((g) => g.id === 'oneshot'));
  u('million', fin.score >= 1000000);
  u('daily', !!stage.daily);
  u('allstars', STAGES.every((st) => { const b = store.best(st.id); return b && starsOf(b.rate, st) >= 3; }));
  if (got.length) setTimeout(() => { snd.play('best', { vol: 0.5 }); showHint(`実績解除：${got.join('・')}`, 3); }, 1200);
}

function renderAchievements() {
  const el = $('ach-list');
  if (!el) return;
  const n = ACHIEVEMENTS.filter((a) => store.has(a[0])).length;
  $('ach-count').textContent = `指の記録 ${n} / ${ACHIEVEMENTS.length}`;
  el.innerHTML = ACHIEVEMENTS.map(([id, name, desc]) => `<li class="${store.has(id) ? 'on' : ''}"><b>${store.has(id) ? name : '？？？'}</b><span>${desc}</span></li>`).join('');
}
