/*
 * 指一本。 描画（Canvas 2D・擬似立体のジオラマ）
 * 剛体は 2D だが、奥行きの向きに押し出した側面を描いて立体に見せる（斜投影）。
 * カメラの「俯瞰度」で押し出しの向きを変え、目線の高さ ⇄ 見下ろしを切り替える。
 */
import { rng, MATERIALS } from './physics.js';

const TS = 2; // テクスチャの解像度（ワールド 1 単位あたりの画素）

const DEPTH = {
  building: 92, office: 84, pillar: 14, slab: 104, container: 74, vending: 34, car: 46, tank: 50,
  roofsign: 10, shack: 64, crate: 42, roofbox: 52, ball: 0, base: 70, pole: 16, board: 14,
};

export function depthOf(ent, part) {
  const k = part || ent.style?.part || ent.style?.kind;
  if (k === 'building' && ent.root?.id === 'office') return DEPTH.office;
  return DEPTH[k] ?? 50;
}

// 色の明るさを変える
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 1) { r *= f; g *= f; b *= f; } else { r += (255 - r) * (f - 1); g += (255 - g) * (f - 1); b += (255 - b) * (f - 1); }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const UI_FONT = '"Hiragino Kaku Gothic ProN", "Hiragino Sans", "Noto Sans JP", "Yu Gothic", Meiryo, system-ui, sans-serif';

/* ───────────────────────── テクスチャ（正面の絵） ───────────────────────── */

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.ceil(w)); c.height = Math.max(2, Math.ceil(h));
  return c;
}

function windowsGrid(g, x, y, w, h, rows, cols, r, opt = {}) {
  const mx = w * 0.08, my = h * 0.12;
  const cw = (w - mx * 2) / cols, ch = (h - my * 2) / rows;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const wx = x + mx + j * cw + cw * 0.14, wy = y + my + i * ch + ch * 0.16;
      const ww = cw * 0.72, wh = ch * 0.62;
      const lit = r() < (opt.lit ?? 0.22);
      const gr = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      if (lit) { gr.addColorStop(0, '#ffe6a6'); gr.addColorStop(1, '#f2b866'); }
      else if (opt.glass) { gr.addColorStop(0, '#cfe6f4'); gr.addColorStop(0.5, '#7fa6c2'); gr.addColorStop(1, '#4b6f8c'); }
      else { gr.addColorStop(0, '#9fb7c8'); gr.addColorStop(1, '#4e6578'); }
      g.fillStyle = gr;
      g.fillRect(wx, wy, ww, wh);
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(wx, wy, ww * 0.25, wh);
      g.strokeStyle = 'rgba(40,40,40,0.55)';
      g.lineWidth = 1.2;
      g.strokeRect(wx, wy, ww, wh);
      if (!opt.glass && r() < 0.18) { // エアコンの室外機
        g.fillStyle = '#e8e6e0'; g.fillRect(wx + ww * 0.6, wy + wh + 2, ww * 0.45, ch * 0.18);
      }
    }
  }
}

function signPlate(g, cx, cy, text, bg, fg, h, vertical = false) {
  g.save();
  g.font = `bold ${Math.round(h * 0.62)}px ${UI_FONT}`;
  const tw = g.measureText(text).width;
  const pw = tw + h * 0.6;
  g.fillStyle = bg;
  g.fillRect(cx - pw / 2, cy - h / 2, pw, h);
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  g.strokeRect(cx - pw / 2, cy - h / 2, pw, h);
  g.fillStyle = fg;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, cx, cy + h * 0.04);
  g.restore();
}

function grime(g, w, h, r, amt = 0.15) {
  // 汚れ・雨だれ
  for (let i = 0; i < 10; i++) {
    const x = r() * w, y = r() * h * 0.4;
    const gr = g.createLinearGradient(x, y, x, y + h * (0.3 + r() * 0.5));
    gr.addColorStop(0, `rgba(40,35,30,${amt * r()})`);
    gr.addColorStop(1, 'rgba(40,35,30,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, 2 + r() * 5, h);
  }
}

/** 物体の正面テクスチャを作る（ワールド寸法 w×h） */
export function makeTexture(style, w, h, seed = 1, part = null) {
  const c = makeCanvas(w * TS, h * TS);
  const g = c.getContext('2d');
  g.scale(TS, TS);
  const r = rng(seed);
  const kind = part || style.kind;
  const col = style.color || '#cfc6b8';
  switch (kind) {
    case 'building': {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, shade(col, 1.12)); gr.addColorStop(1, shade(col, 0.86));
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      // 床の線
      g.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 1; i < (style.rows || 2); i++) g.fillRect(0, (h / (style.rows || 2)) * i - 1, w, 2);
      windowsGrid(g, 0, 0, w, h, style.rows || 2, style.cols || 4, r, { glass: style.glass, lit: style.glass ? 0.12 : 0.25 });
      if (style.glass) {
        // カーテンウォールの縦の桟
        g.fillStyle = 'rgba(30,45,60,0.5)';
        for (let i = 0; i <= (style.cols || 3); i++) g.fillRect((w / (style.cols || 3)) * i - 1, 0, 2, h);
      }
      grime(g, w, h, r, 0.18);
      if (style.sign) {
        if (h > w * 1.8) signPlate(g, w / 2, h * 0.08, style.sign.text, style.sign.bg, style.sign.fg, Math.min(16, w * 0.2));
        else signPlate(g, w * (0.3 + r() * 0.4), h * 0.5, style.sign.text, style.sign.bg, style.sign.fg, Math.min(18, h * 0.32));
      }
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
      // 屋上の手すり
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 0, w, 2);
      break;
    }
    case 'shack': {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(60,35,15,0.5)'; g.lineWidth = 1;
      for (let x = 0; x < w; x += 7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (r() - 0.5) * 2, h); g.stroke(); }
      g.fillStyle = '#5a7f99'; g.fillRect(w * 0.2, h * 0.35, w * 0.32, h * 0.3);
      g.strokeStyle = '#2b2b2b'; g.lineWidth = 1.5; g.strokeRect(w * 0.2, h * 0.35, w * 0.32, h * 0.3);
      if (style.sign) signPlate(g, w * 0.7, h * 0.22, style.sign.text, style.sign.bg, style.sign.fg, 12);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
      break;
    }
    case 'pillar': case 'slab': case 'base': {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#9d978d'); gr.addColorStop(0.5, '#c9c3b8'); gr.addColorStop(1, '#8e887f');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      for (let i = 0; i < 20; i++) g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
      if (kind === 'pillar') { g.fillStyle = 'rgba(120,50,30,0.35)'; g.fillRect(w * 0.45, h * 0.3, 1, h * 0.2); }
      grime(g, w, h, r, 0.12);
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, w - 1, h - 1);
      break;
    }
    case 'container': {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      for (let x = 3; x < w; x += 6) {
        g.fillStyle = 'rgba(0,0,0,0.16)'; g.fillRect(x, 2, 2, h - 4);
        g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 2, 2, 1, h - 4);
      }
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
      if (style.label) {
        g.fillStyle = 'rgba(255,255,255,0.9)';
        g.font = `bold ${Math.round(h * 0.28)}px ${UI_FONT}`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(style.label, w / 2, h / 2);
      }
      break;
    }
    case 'vending': {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.fillStyle = '#f7f7f4'; g.fillRect(w * 0.1, h * 0.08, w * 0.8, h * 0.45);
      const rows = 3, cols = 3;
      for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
        g.fillStyle = ['#d33', '#36c', '#2a2', '#e90', '#a3c', '#3aa'][Math.floor(r() * 6)];
        g.fillRect(w * (0.15 + j * 0.25), h * (0.12 + i * 0.14), w * 0.14, h * 0.09);
      }
      g.fillStyle = '#222'; g.fillRect(w * 0.15, h * 0.74, w * 0.7, h * 0.12);
      g.fillStyle = '#ddd'; g.fillRect(w * 0.72, h * 0.58, w * 0.12, h * 0.08);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 1.5; g.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
      break;
    }
    case 'car': {
      g.clearRect(0, 0, w, h);
      // 車体
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(2, h * 0.75); g.lineTo(2, h * 0.45); g.lineTo(w * 0.18, h * 0.4); g.lineTo(w * 0.3, h * 0.05);
      g.lineTo(w * 0.82, h * 0.05); g.lineTo(w - 2, h * 0.38); g.lineTo(w - 2, h * 0.75); g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = '#9cc8e0';
      g.fillRect(w * 0.34, h * 0.12, w * 0.2, h * 0.26); g.fillRect(w * 0.58, h * 0.12, w * 0.2, h * 0.26);
      g.fillStyle = '#ffe28a'; g.fillRect(w - 5, h * 0.45, 3, h * 0.1);
      // 車輪
      g.fillStyle = '#1d1d1d';
      for (const x of [w * 0.22, w * 0.78]) { g.beginPath(); g.arc(x, h * 0.78, h * 0.22, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#999';
      for (const x of [w * 0.22, w * 0.78]) { g.beginPath(); g.arc(x, h * 0.78, h * 0.09, 0, Math.PI * 2); g.fill(); }
      break;
    }
    case 'tank': {
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#7d8a93'); gr.addColorStop(0.45, '#d6dde2'); gr.addColorStop(1, '#6b767e');
      g.fillStyle = gr; g.fillRect(0, h * 0.15, w, h * 0.85);
      g.fillStyle = '#5e676e'; g.fillRect(0, 0, w, h * 0.18);
      g.fillStyle = 'rgba(0,0,0,0.2)';
      for (let y = h * 0.35; y < h; y += h * 0.22) g.fillRect(0, y, w, 2);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
      break;
    }
    case 'roofsign': {
      g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(2, 2, w - 4, h - 4);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(h * 0.5)}px ${UI_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(style.text || '', w / 2, h / 2 + 1, w - 6);
      break;
    }
    case 'roofbox': {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let x = 4; x < w; x += 8) g.fillRect(x, 3, 3, h - 6);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
      break;
    }
    case 'crate': {
      g.fillStyle = '#b48a5c'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#7a5532'; g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, h - 3);
      g.beginPath(); g.moveTo(3, 3); g.lineTo(w - 3, h - 3); g.moveTo(w - 3, 3); g.lineTo(3, h - 3); g.stroke();
      break;
    }
    case 'pole': {
      g.fillStyle = '#6f7a82'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#47515a'; g.lineWidth = 1.2;
      for (let y = 0; y < h; y += w) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.moveTo(w, y); g.lineTo(0, y + w); g.stroke(); }
      g.strokeRect(0.6, 0.6, w - 1.2, h - 1.2);
      break;
    }
    case 'board': {
      // 巨大看板：「絶対に倒れません」
      g.fillStyle = '#f4efe2'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#c4161c'; g.fillRect(0, 0, w, h * 0.2);
      g.fillStyle = '#fff';
      g.font = `bold ${Math.round(h * 0.13)}px ${UI_FONT}`;
      g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText(style.sub || '', 8, h * 0.1);
      g.fillStyle = '#111';
      g.font = `bold ${Math.round(h * 0.3)}px ${UI_FONT}`;
      g.textAlign = 'center';
      g.fillText(style.text || '', w / 2, h * 0.55, w - 14);
      g.fillStyle = '#c4161c';
      g.font = `bold ${Math.round(h * 0.12)}px ${UI_FONT}`;
      g.fillText('耐震・耐指 構造', w / 2, h * 0.85);
      g.strokeStyle = '#333'; g.lineWidth = 4; g.strokeRect(2, 2, w - 4, h - 4);
      break;
    }
    default: {
      g.fillStyle = col; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.strokeRect(0.5, 0.5, w - 1, h - 1);
    }
  }
  return c;
}

// 正面・側面・上面の色（テクスチャの代表色）
function faceColors(style, part) {
  const kind = part || style.kind;
  const base = {
    building: style.color, shack: style.color, container: style.color, vending: style.color, car: style.color,
    pillar: '#b5afa4', slab: '#b5afa4', base: '#a8a296', tank: '#9aa5ad', roofsign: '#c4161c', roofbox: style.color,
    crate: '#a67c50', pole: '#6f7a82', board: '#e7e1d2',
  }[kind] || style.color || '#bbb';
  return { side: shade(base, 0.62), top: shade(base, 1.08), front: base };
}

/* ───────────────────────── 粒子 ───────────────────────── */

export class Particles {
  constructor() { this.list = []; this.max = 500; }
  setMax(n) { this.max = n; }
  add(p) { if (this.list.length < this.max) this.list.push(p); }
  dust(x, y, n, color, spread = 30, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 1.6 * power;
      this.add({ k: 'dust', x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.5, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.5 - Math.random() * 0.8 * power, r: 8 + Math.random() * 16 * power, gr: 0.35 + Math.random() * 0.5, life: 1.2 + Math.random() * 1.4, t: 0, c: color, z: Math.random() * 60 });
    }
  }
  chips(x, y, n, colors, vx = 0, vy = 0, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 5) * power;
      this.add({ k: 'chip', x, y, vx: vx * 0.7 + Math.cos(a) * s, vy: vy * 0.7 + Math.sin(a) * s - 2 * power, r: 1.5 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.6, life: 1.6 + Math.random() * 1.2, t: 0, c: colors[(Math.random() * colors.length) | 0], z: Math.random() * 70, bounce: 0 });
    }
  }
  sparks(x, y, n, dir = null) {
    for (let i = 0; i < n; i++) {
      const a = dir ? Math.atan2(dir.y, dir.x) + (Math.random() - 0.5) * 1.6 : Math.random() * Math.PI * 2;
      const s = 4 + Math.random() * 9;
      this.add({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.35, t: 0, z: 30 });
    }
  }
  glass(x, y, n, vx = 0, vy = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1 + Math.random() * 6;
      this.add({ k: 'glass', x, y, vx: vx * 0.6 + Math.cos(a) * s, vy: vy * 0.6 + Math.sin(a) * s - 2, r: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.8, life: 1.2 + Math.random(), t: 0, z: Math.random() * 60, bounce: 0 });
    }
  }
  ring(x, y, r0, r1, life = 0.45, color = 'rgba(255,255,255,0.9)', w = 6) {
    this.add({ k: 'ring', x, y, r0, r1, life, t: 0, c: color, w, z: 0 });
  }
  update(dt) {
    const step = dt * 60;
    for (const p of this.list) {
      p.t += dt;
      if (p.k === 'dust') {
        p.x += p.vx * step; p.y += p.vy * step; p.vx *= 0.97; p.vy *= 0.97; p.r += p.gr * step;
      } else if (p.k === 'chip' || p.k === 'glass') {
        p.vy += 0.3 * step; p.x += p.vx * step; p.y += p.vy * step; p.rot += p.vr * step;
        if (p.y > -p.z * 0 && p.vy > 0 && p.bounce < 2) { p.y = 0; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; p.bounce++; }
        if (p.bounce >= 2) { p.y = 0; p.vx *= 0.8; p.vy = 0; }
      } else if (p.k === 'spark') {
        p.vy += 0.25 * step; p.x += p.vx * step; p.y += p.vy * step;
      }
    }
    this.list = this.list.filter((p) => p.t < p.life);
  }
  draw(g, DV) {
    for (const p of this.list) {
      const u = p.t / p.life;
      const ox = DV.x * p.z, oy = DV.y * p.z;
      if (p.k === 'dust') {
        g.globalAlpha = 0.55 * (1 - u) * Math.min(1, p.t * 8);
        g.fillStyle = p.c;
        g.beginPath(); g.arc(p.x + ox, p.y + oy, p.r, 0, Math.PI * 2); g.fill();
      } else if (p.k === 'chip') {
        g.globalAlpha = u > 0.8 ? (1 - u) * 5 : 1;
        g.fillStyle = p.c;
        g.save(); g.translate(p.x + ox, p.y + oy); g.rotate(p.rot); g.fillRect(-p.r, -p.r * 0.7, p.r * 2, p.r * 1.4); g.restore();
      } else if (p.k === 'glass') {
        g.globalAlpha = (u > 0.8 ? (1 - u) * 5 : 1) * 0.9;
        g.fillStyle = Math.sin(p.t * 30 + p.rot) > 0.3 ? '#ffffff' : '#a7d4ec';
        g.save(); g.translate(p.x + ox, p.y + oy); g.rotate(p.rot);
        g.beginPath(); g.moveTo(0, -p.r); g.lineTo(p.r * 0.7, p.r * 0.6); g.lineTo(-p.r * 0.6, p.r * 0.4); g.closePath(); g.fill(); g.restore();
      } else if (p.k === 'spark') {
        g.globalAlpha = 1 - u;
        g.strokeStyle = u < 0.4 ? '#fff6c8' : '#ffb347';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x + ox, p.y + oy); g.lineTo(p.x + ox - p.vx * 1.6, p.y + oy - p.vy * 1.6); g.stroke();
      } else if (p.k === 'ring') {
        const e = 1 - Math.pow(1 - u, 3);
        g.globalAlpha = 1 - u;
        g.strokeStyle = p.c; g.lineWidth = p.w * (1 - u);
        g.beginPath(); g.ellipse(p.x, p.y, p.r0 + (p.r1 - p.r0) * e, (p.r0 + (p.r1 - p.r0) * e) * 0.55, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    g.globalAlpha = 1;
  }
}

/* ───────────────────────── 描画本体 ───────────────────────── */

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.tex = new Map();
    this.W = 1; this.H = 1; this.dpr = 1;
    this.sky = null;
    this.time = 0;
    this.particles = new Particles();
  }

  resize(W, H, dpr) {
    this.W = W; this.H = H; this.dpr = dpr;
    this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    this.sky = this.makeSky(W, H);
  }

  setStage(stage) {
    this.stage = stage;
    const r = rng(99);
    // 奥の飾りのビル（物理なし）
    this.decorB = [];
    for (let x = -160; x < 1700;) {
      const w = 50 + r() * 90, h = 90 + r() * 260;
      this.decorB.push({ x, w, h, z: 200 + r() * 90, col: ['#a7b2bc', '#c2b8a8', '#b5bec6', '#9faab3', '#cbc2b3'][(r() * 5) | 0], seed: (r() * 1e6) | 0, rows: Math.max(2, Math.round(h / 34)), cols: Math.max(2, Math.round(w / 26)) });
      x += w + 6 + r() * 30;
    }
    this.far = this.makeFarCity();
  }

  makeSky(W, H) {
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1d2a44'); gr.addColorStop(0.35, '#4f6a8f'); gr.addColorStop(0.68, '#a9b8c8'); gr.addColorStop(0.85, '#e9d8bf'); gr.addColorStop(1, '#c9b49a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 光芒
    g.save();
    g.globalCompositeOperation = 'lighter';
    const sx = W * 0.12, sy = -H * 0.1;
    for (let i = 0; i < 7; i++) {
      const a = 0.35 + i * 0.13;
      g.fillStyle = `rgba(255,240,215,${0.035 + (i % 2) * 0.02})`;
      g.beginPath(); g.moveTo(sx, sy);
      g.lineTo(sx + Math.cos(a) * W * 2, sy + Math.sin(a) * W * 2);
      g.lineTo(sx + Math.cos(a + 0.05) * W * 2, sy + Math.sin(a + 0.05) * W * 2);
      g.closePath(); g.fill();
    }
    g.restore();
    // 雲
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const cx = r() * W, cy = H * (0.05 + r() * 0.5), s = (0.06 + r() * 0.12) * Math.max(W, H);
      for (let k = 0; k < 6; k++) {
        const x = cx + (r() - 0.5) * s * 1.6, y = cy + (r() - 0.5) * s * 0.3, rr = s * (0.3 + r() * 0.4);
        const cg = g.createRadialGradient(x, y - rr * 0.3, rr * 0.1, x, y, rr);
        cg.addColorStop(0, 'rgba(255,255,255,0.32)'); cg.addColorStop(0.6, 'rgba(210,220,232,0.16)'); cg.addColorStop(1, 'rgba(120,135,160,0)');
        g.fillStyle = cg; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
      }
    }
    return c;
  }

  makeFarCity() {
    const W = 2600, H = 420;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const r = rng(11);
    for (let layer = 0; layer < 2; layer++) {
      for (let x = 0; x < W;) {
        const w = 30 + r() * 80, h = (layer ? 60 : 120) + r() * (layer ? 160 : 260);
        g.fillStyle = layer ? '#7d8ea3' : '#93a3b6';
        g.fillRect(x, H - h, w, h);
        g.fillStyle = layer ? 'rgba(255,225,160,0.55)' : 'rgba(255,230,180,0.3)';
        for (let yy = H - h + 8; yy < H - 6; yy += 10) for (let xx = x + 4; xx < x + w - 4; xx += 8) if (r() < 0.12) g.fillRect(xx, yy, 3, 4);
        if (r() < 0.2) { g.fillStyle = g.fillStyle = layer ? '#7d8ea3' : '#93a3b6'; g.fillRect(x + w / 2 - 1, H - h - 30, 2, 30); }
        x += w + r() * 6;
      }
    }
    return c;
  }

  texFor(ent, partName = null) {
    const root = ent.root || ent;
    const style = ent.style || root.style;
    const part = partName || style?.part || null;
    const key = `${root.id}|${part || ''}`;
    if (!this.tex.has(key)) {
      let w = root.w, h = root.h;
      if (part && root.parts) { const p = root.parts.find((q) => q.part === part); w = p.w; h = p.h; }
      else if (part && root.def?.parts) { const p = root.def.parts.find((q) => q.part === part); w = p.w; h = p.h; }
      this.tex.set(key, { c: makeTexture(style, w, h, root.seed || 7, part), w, h, colors: faceColors(style, part) });
    }
    return this.tex.get(key);
  }

  /** 画面座標 ⇄ ワールド座標 */
  toScreen(cam, x, y) { return { x: (x - cam.x) * cam.zoom + this.W / 2 + (cam.sx || 0), y: (y - cam.y) * cam.zoom + this.H / 2 + (cam.sy || 0) }; }
  toWorld(cam, sx, sy) { return { x: (sx - this.W / 2 - (cam.sx || 0)) / cam.zoom + cam.x, y: (sy - this.H / 2 - (cam.sy || 0)) / cam.zoom + cam.y }; }

  /**
   * 1 フレーム描く
   * @param {object} s { P, cam, tilt, dark, highlight, hints, popups, flash, quality }
   */
  draw(s, dt) {
    this.time += dt;
    const { g, W, H, dpr } = this;
    const cam = s.cam;
    const DV = { x: 0.42 * s.tilt, y: -0.32 * s.tilt };
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = true;

    // ── 空 ──
    g.drawImage(this.sky, 0, 0, W, H);
    // 遠景（ゆっくり視差）
    const farScale = Math.max(0.5, cam.zoom * 0.55);
    const fx = -((cam.x * 0.25) % 1300) * farScale - 300 * farScale;
    const groundSY = this.toScreen(cam, 0, 0).y + DV.y * 300 * cam.zoom;
    g.globalAlpha = 0.85;
    g.drawImage(this.far, fx, groundSY - 420 * farScale + 10, 2600 * farScale, 420 * farScale);
    g.globalAlpha = 1;

    // ── ワールド座標へ ──
    const z = cam.zoom;
    g.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - cam.x * z + (cam.sx || 0)), dpr * (H / 2 - cam.y * z + (cam.sy || 0)));

    this.drawDesk(g, DV);
    this.drawTable(g, DV);
    this.drawDecor(g, DV);
    this.drawTrees(g, DV);

    const P = s.P;
    // ── 影 ──
    g.fillStyle = 'rgba(30,25,20,0.22)';
    for (const e of P.entities) {
      const b = e.body;
      const h = -b.bounds.max.y;
      if (h > 120) continue;
      const dep = depthOf(e);
      const wv = (b.bounds.max.x - b.bounds.min.x) / 2;
      g.globalAlpha = Math.max(0, 1 - h / 120);
      g.beginPath();
      g.ellipse(b.position.x + DV.x * dep * 0.5 + 6, DV.y * dep * 0.5, wv + dep * 0.25, Math.max(4, Math.abs(DV.y) * dep * 0.55 + 3), 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;

    // ── 側面（押し出し） → 正面 ──
    for (const e of P.entities) this.drawSides(g, e, DV);
    for (const e of P.entities) this.drawFront(g, e, s.highlight === e);

    // ── 粒子 ──
    this.particles.draw(g, DV);

    // ── 弱点のヒント ──
    if (s.hints) this.drawHints(g, s.hints, cam);

    // ── 画面座標へ ──
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // 点数の吹き出し
    if (s.popups) this.drawPopups(g, s.popups, cam);
    // 暗転（狙点・蓄圧で背景を少し暗く）
    if (s.dark > 0.01) {
      const cx = s.focus ? s.focus.x : W / 2, cy = s.focus ? s.focus.y : H / 2;
      const vg = g.createRadialGradient(cx, cy, Math.min(W, H) * 0.08, cx, cy, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(8,4,10,${0.72 * s.dark})`);
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
    }
  }

  // ジオラマを置いた机（手前に広がる木の天板）
  drawDesk(g, DV) {
    const top = 60, Z = 340;
    const dg = g.createLinearGradient(0, top + DV.y * Z, 0, top + 900);
    dg.addColorStop(0, '#3e2b1e'); dg.addColorStop(0.3, '#5e4230'); dg.addColorStop(1, '#2a1c13');
    g.fillStyle = dg;
    g.beginPath();
    g.moveTo(-3000, top + DV.y * Z); g.lineTo(5000, top + DV.y * Z); g.lineTo(5000, top + 3000); g.lineTo(-3000, top + 3000);
    g.closePath(); g.fill();
    // 木目
    g.strokeStyle = 'rgba(0,0,0,0.16)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const y = top + 30 + i * i * 9;
      g.beginPath(); g.moveTo(-3000, y); g.bezierCurveTo(-600, y + 8, 1200, y - 10, 5000, y + 6); g.stroke();
    }
    // 天板の照り返し
    const sh = g.createLinearGradient(0, top, 0, top + 120);
    sh.addColorStop(0, 'rgba(255,230,200,0.18)'); sh.addColorStop(1, 'rgba(255,230,200,0)');
    g.fillStyle = sh; g.fillRect(-3000, top, 8000, 120);
  }

  drawTable(g, DV) {
    const gr = this.stage.ground;
    const D = 320;
    const x0 = gr.x0, x1 = gr.x1;
    // 天板（奥へ）
    const tg = g.createLinearGradient(0, 0, DV.x * D, DV.y * D);
    tg.addColorStop(0, '#77736b'); tg.addColorStop(0.3, '#8b877e'); tg.addColorStop(1, '#a29d92');
    g.fillStyle = tg;
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.lineTo(x1 + DV.x * D, DV.y * D); g.lineTo(x0 + DV.x * D, DV.y * D); g.closePath(); g.fill();
    // 歩道と道路の線
    const line = (zz, col, w, dash) => {
      g.strokeStyle = col; g.lineWidth = w; g.setLineDash(dash || []);
      g.beginPath(); g.moveTo(x0 + DV.x * zz, DV.y * zz); g.lineTo(x1 + DV.x * zz, DV.y * zz); g.stroke();
    };
    g.fillStyle = 'rgba(200,195,185,0.5)';
    g.beginPath(); g.moveTo(x0 + DV.x * 150, DV.y * 150); g.lineTo(x1 + DV.x * 150, DV.y * 150); g.lineTo(x1 + DV.x * 185, DV.y * 185); g.lineTo(x0 + DV.x * 185, DV.y * 185); g.closePath(); g.fill();
    line(120, 'rgba(255,255,255,0.55)', 2, [26, 22]);
    line(150, 'rgba(240,240,230,0.7)', 1.5);
    g.setLineDash([]);
    // 手前の断面（ジオラマの台座）
    const fg = g.createLinearGradient(0, 0, 0, 60);
    fg.addColorStop(0, '#5b4532'); fg.addColorStop(1, '#2f241a');
    g.fillStyle = fg; g.fillRect(x0, 0, x1 - x0, 60);
    g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, 0, x1 - x0, 2);
    // 右の側面
    g.fillStyle = '#3d2f22';
    g.beginPath(); g.moveTo(x1, 0); g.lineTo(x1 + DV.x * D, DV.y * D); g.lineTo(x1 + DV.x * D, DV.y * D + 60); g.lineTo(x1, 60); g.closePath(); g.fill();
    // 銘板
    g.fillStyle = '#c9a85a'; g.fillRect(560, 14, 200, 30);
    g.strokeStyle = '#7d6328'; g.lineWidth = 2; g.strokeRect(560, 14, 200, 30);
    g.fillStyle = '#3a2a10'; g.font = `bold 15px ${UI_FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(`第一景　${this.stage.name}`, 660, 30);
  }

  drawDecor(g, DV) {
    const t = this.time;
    // 奥のビル
    for (const b of this.decorB) {
      const ox = DV.x * b.z, oy = DV.y * b.z;
      const dep = 40;
      g.fillStyle = shade(b.col, 0.7);
      g.beginPath(); g.moveTo(b.x + b.w + ox, oy - b.h); g.lineTo(b.x + b.w + ox + DV.x * dep, oy - b.h + DV.y * dep); g.lineTo(b.x + b.w + ox + DV.x * dep, oy + DV.y * dep); g.lineTo(b.x + b.w + ox, oy); g.closePath(); g.fill();
      g.fillStyle = shade(b.col, 1.1);
      g.beginPath(); g.moveTo(b.x + ox, oy - b.h); g.lineTo(b.x + b.w + ox, oy - b.h); g.lineTo(b.x + b.w + ox + DV.x * dep, oy - b.h + DV.y * dep); g.lineTo(b.x + ox + DV.x * dep, oy - b.h + DV.y * dep); g.closePath(); g.fill();
      if (!b.tex) b.tex = makeTexture({ kind: 'building', color: b.col, rows: b.rows, cols: b.cols }, b.w, b.h, b.seed);
      g.drawImage(b.tex, b.x + ox, oy - b.h, b.w, b.h);
    }
    // クレーン（左奥）
    const cr = this.stage.decor?.crane;
    if (cr) {
      const z = 170, ox = cr.x + DV.x * z, oy = DV.y * z;
      g.strokeStyle = '#d9a21b'; g.lineWidth = 3;
      g.beginPath();
      for (let y = 0; y > -cr.h; y -= 20) { g.moveTo(ox - 8, oy + y); g.lineTo(ox + 8, oy + y - 20); g.moveTo(ox + 8, oy + y); g.lineTo(ox - 8, oy + y - 20); }
      g.moveTo(ox - 8, oy); g.lineTo(ox - 8, oy - cr.h); g.moveTo(ox + 8, oy); g.lineTo(ox + 8, oy - cr.h);
      g.moveTo(ox - 60, oy - cr.h); g.lineTo(ox + 260, oy - cr.h); g.moveTo(ox - 60, oy - cr.h + 12); g.lineTo(ox + 260, oy - cr.h + 12);
      g.moveTo(ox, oy - cr.h - 40); g.lineTo(ox + 260, oy - cr.h); g.moveTo(ox, oy - cr.h - 40); g.lineTo(ox - 60, oy - cr.h);
      g.stroke();
      g.strokeStyle = '#333'; g.lineWidth = 1.2;
      const hx = ox + 180 + Math.sin(t * 0.3) * 30;
      g.beginPath(); g.moveTo(hx, oy - cr.h + 12); g.lineTo(hx, oy - cr.h + 140); g.stroke();
      g.fillStyle = '#c33'; g.fillRect(hx - 6, oy - cr.h + 140, 12, 10);
    }
    // 赤いトラス橋（右奥）
    const br = this.stage.decor?.bridge;
    if (br) {
      const z = 250, oy = DV.y * z, ox = DV.x * z;
      const y = oy - 120;
      g.fillStyle = '#6b6b6b'; g.fillRect(br.x0 + ox, y, br.x1 - br.x0, 10);
      for (const px of [br.x0 + 40, br.x0 + 220, br.x1 - 30]) { g.fillStyle = '#8a8a8a'; g.fillRect(px + ox - 8, y + 10, 16, 120); }
      g.strokeStyle = '#b32222'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(br.x0 + ox, y); g.lineTo(br.x1 + ox, y);
      g.moveTo(br.x0 + ox + 20, y - 50); g.lineTo(br.x1 + ox, y - 50);
      for (let x = br.x0 + 20; x < br.x1; x += 40) { g.moveTo(x + ox, y); g.lineTo(x + ox + 20, y - 50); g.lineTo(x + ox + 40, y); }
      g.stroke();
      // 電車
      const tx = br.x0 + ((t * 40) % (br.x1 - br.x0 + 400)) - 200;
      g.save();
      g.beginPath(); g.rect(br.x0 + ox, y - 60, br.x1 - br.x0, 60); g.clip();
      for (let k = 0; k < 3; k++) {
        const cx = tx - k * 62 + ox;
        g.fillStyle = '#eceae4'; g.fillRect(cx, y - 26, 58, 24);
        g.fillStyle = '#c33'; g.fillRect(cx, y - 12, 58, 3);
        g.fillStyle = '#5d7d96'; for (let w = 0; w < 5; w++) g.fillRect(cx + 4 + w * 11, y - 22, 7, 7);
      }
      g.restore();
    }
    // 空気遠近：奥の飾りをかすませて、手前の「壊せる物」を際立たせる
    const hz = g.createLinearGradient(0, DV.y * 170, 0, DV.y * 170 - 420);
    hz.addColorStop(0, 'rgba(176,190,206,0.62)');
    hz.addColorStop(1, 'rgba(150,168,190,0.35)');
    g.fillStyle = hz;
    const gr0 = this.stage.ground;
    g.beginPath();
    g.moveTo(gr0.x0 - 400 + DV.x * 160, DV.y * 160);
    g.lineTo(gr0.x1 + 600 + DV.x * 160, DV.y * 160);
    g.lineTo(gr0.x1 + 600, -1400); g.lineTo(gr0.x0 - 400, -1400);
    g.closePath(); g.fill();
  }

  drawTrees(g, DV) {
    for (const x of this.stage.decor?.trees || []) {
      const z = 135, ox = x + DV.x * z, oy = DV.y * z;
      g.fillStyle = '#5b4030'; g.fillRect(ox - 3, oy - 34, 6, 34);
      for (const [dx, dy, rr, c] of [[-10, -40, 18, '#3f7a3a'], [10, -46, 20, '#4f8f45'], [0, -60, 18, '#5ea350'], [0, -44, 16, '#467f3e']]) {
        g.fillStyle = c; g.beginPath(); g.arc(ox + dx, oy + dy, rr, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = 'rgba(255,255,255,0.15)'; g.beginPath(); g.arc(ox - 4, oy - 66, 8, 0, Math.PI * 2); g.fill();
    }
  }

  partsOf(e) {
    const b = e.body;
    if (b.parts.length > 1) {
      return b.parts.slice(1).map((p) => ({ body: p, w: null, h: null, name: p.label }));
    }
    return [{ body: b, name: null }];
  }

  drawSides(g, e, DV) {
    const b = e.body;
    if (e.kind === 'circle') return;
    for (const part of this.partsOf(e)) {
      const dep = depthOf(e, part.name);
      const tx = this.texFor(e, part.name || undefined);
      const vs = part.body.vertices;
      const n = vs.length;
      for (let i = 0; i < n; i++) {
        const a = vs[i], c = vs[(i + 1) % n];
        const nx = c.y - a.y, ny = -(c.x - a.x);
        const dot = nx * DV.x + ny * DV.y;
        if (dot <= 0) continue;
        const len = Math.hypot(nx, ny) || 1;
        const up = -ny / len; // 上向きの面ほど明るく
        g.fillStyle = up > 0.5 ? tx.colors.top : tx.colors.side;
        g.beginPath();
        g.moveTo(a.x, a.y); g.lineTo(c.x, c.y);
        g.lineTo(c.x + DV.x * dep, c.y + DV.y * dep); g.lineTo(a.x + DV.x * dep, a.y + DV.y * dep);
        g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.8; g.stroke();
      }
    }
  }

  drawFront(g, e, hl) {
    const b = e.body;
    if (e.kind === 'circle') {
      const r = e.r;
      const rg = g.createRadialGradient(b.position.x - r * 0.35, b.position.y - r * 0.4, r * 0.1, b.position.x, b.position.y, r);
      rg.addColorStop(0, '#d9dde0'); rg.addColorStop(0.35, '#7c858c'); rg.addColorStop(1, '#22272b');
      g.fillStyle = rg;
      g.beginPath(); g.arc(b.position.x, b.position.y, r, 0, Math.PI * 2); g.fill();
      // 回転がわかるように
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
      g.beginPath(); g.arc(b.position.x, b.position.y, r * 0.65, b.angle, b.angle + 1.2); g.stroke();
      if (hl) this.glowPath(g, () => { g.beginPath(); g.arc(b.position.x, b.position.y, r, 0, Math.PI * 2); });
      return;
    }
    for (const part of this.partsOf(e)) {
      const pb = part.body;
      const tx = this.texFor(e, part.name || undefined);
      let w, h;
      if (part.name) { w = tx.w; h = tx.h; } else { w = e.w; h = e.h; }
      g.save();
      g.translate(pb.position.x, pb.position.y);
      g.rotate(b.angle);
      if (e.crop && !part.name) {
        const c = e.crop;
        g.drawImage(tx.c, c.x * TS, c.y * TS, Math.max(1, c.w * TS), Math.max(1, c.h * TS), -w / 2, -h / 2, w, h);
      } else {
        g.drawImage(tx.c, -w / 2, -h / 2, w, h);
      }
      // ひび
      if (e.cracks.length) this.drawCracks(g, e, w, h);
      g.restore();
      if (hl) {
        const vs = pb.vertices;
        this.glowPath(g, () => { g.beginPath(); vs.forEach((v, i) => (i ? g.lineTo(v.x, v.y) : g.moveTo(v.x, v.y))); g.closePath(); });
      }
    }
  }

  glowPath(g, path) {
    g.save();
    const p = 0.6 + Math.sin(this.time * 10) * 0.4;
    path();
    g.strokeStyle = `rgba(255,60,40,${0.5 + p * 0.4})`;
    g.lineWidth = 4;
    g.shadowColor = 'rgba(255,40,20,0.9)';
    g.shadowBlur = 12;
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.2;
    g.shadowBlur = 0;
    g.stroke();
    g.restore();
  }

  drawCracks(g, e, w, h) {
    g.save();
    g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip();
    for (const c of e.cracks) {
      const r = rng(c.seed);
      const n = 3 + Math.round(c.s * 3);
      for (let k = 0; k < n; k++) {
        let x = c.x, y = c.y, a = r() * Math.PI * 2;
        g.beginPath(); g.moveTo(x, y);
        const steps = 3 + Math.round(r() * 3);
        for (let i = 0; i < steps; i++) {
          a += (r() - 0.5) * 1.1;
          const L = (4 + r() * 9) * (0.6 + c.s);
          x += Math.cos(a) * L; y += Math.sin(a) * L;
          g.lineTo(x, y);
        }
        g.strokeStyle = 'rgba(25,20,18,0.75)'; g.lineWidth = 1.4; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.6; g.stroke();
      }
    }
    g.restore();
  }

  drawHints(g, hints, cam) {
    for (const hnt of hints) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 4 + hnt.x * 0.01);
      g.save();
      g.translate(hnt.x, hnt.y);
      g.strokeStyle = `rgba(200,20,20,${0.45 + pulse * 0.4})`;
      g.lineWidth = 2.5 / Math.max(0.6, cam.zoom);
      const rr = (12 + pulse * 5) / Math.max(0.6, cam.zoom);
      g.beginPath(); g.arc(0, 0, rr, 0, Math.PI * 1.75); g.stroke();
      g.fillStyle = 'rgba(200,20,20,0.9)';
      g.beginPath(); g.arc(0, 0, 2.5 / Math.max(0.6, cam.zoom), 0, Math.PI * 2); g.fill();
      g.font = `bold ${Math.round(12 / Math.max(0.6, cam.zoom))}px ${UI_FONT}`;
      g.textAlign = 'center';
      g.lineWidth = 3 / Math.max(0.6, cam.zoom); g.strokeStyle = 'rgba(255,255,255,0.9)';
      g.strokeText(hnt.label, 0, -rr - 6 / cam.zoom);
      g.fillStyle = '#9b0f0f';
      g.fillText(hnt.label, 0, -rr - 6 / cam.zoom);
      g.restore();
    }
  }

  drawPopups(g, popups, cam) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of popups) {
      const s = this.toScreen(cam, p.x, p.y);
      const u = p.t / p.life;
      g.globalAlpha = u > 0.7 ? (1 - u) / 0.3 : 1;
      const size = Math.round(p.size * (u < 0.1 ? 1 + (0.1 - u) * 4 : 1));
      g.font = `900 ${size}px ${UI_FONT}`;
      g.lineWidth = Math.max(3, size * 0.18);
      g.strokeStyle = 'rgba(20,10,10,0.85)';
      g.strokeText(p.text, s.x, s.y - u * 40);
      g.fillStyle = p.color || '#ffe9a8';
      g.fillText(p.text, s.x, s.y - u * 40);
    }
    g.globalAlpha = 1;
  }
}

export { MATERIALS };
