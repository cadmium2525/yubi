/*
 * 指一本。 墨字（筆文字の演出）
 * 許諾済みの筆文字フォント（Yuji Boku, SIL OFL）に、かすれ・にじみ・飛沫・朱の一閃を重ねて描く。
 * 文字は前もって画像（オフスクリーン canvas）にしておき、表示のときは拡大縮小と不透明度だけを動かす。
 */
import { rng } from './physics.js';

export const INK_FONT = '"Yuji Boku", "Yu Mincho", "Hiragino Mincho ProN", serif';

/**
 * 墨字の画像を作る。
 * @param {string} text
 * @param {object} o { size(px), slash(朱の一閃), seed, color, halo }
 */
export function makeInk(text, o = {}) {
  const size = o.size ?? 120;
  const seed = o.seed ?? text.length * 97 + text.charCodeAt(0);
  const r = rng(seed);
  const pad = size * 0.55;
  const m = document.createElement('canvas').getContext('2d');
  m.font = `${size}px ${INK_FONT}`;
  const chars = [...text];
  const widths = chars.map((c) => m.measureText(c).width * (c === '！' || c === '。' ? 0.72 : 0.96));
  const tw = widths.reduce((a, b) => a + b, 0);
  const W = Math.ceil(tw + pad * 2), H = Math.ceil(size * 1.5 + pad);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const base = H / 2 + size * 0.36;

  // ── 朱の一閃（文字の後ろ） ──
  if (o.slash !== false) {
    g.save();
    g.translate(W / 2, H / 2 + size * 0.18);
    g.rotate(-0.12 + (r() - 0.5) * 0.06);
    brushStroke(g, -tw * 0.62, 0, tw * 0.62, 0, size * 0.34, o.slashColor || '#b3121b', r);
    g.restore();
  }

  // ── 文字の形（グリフ）を別の canvas に描く ──
  const gl = document.createElement('canvas');
  gl.width = W; gl.height = H;
  const gg = gl.getContext('2d');
  gg.font = `${size}px ${INK_FONT}`;
  gg.textBaseline = 'alphabetic';
  let x = pad;
  const glyphs = [];
  chars.forEach((c, i) => {
    const rot = (r() - 0.5) * 0.12;
    const sc = 1 + (r() - 0.5) * 0.12 + (i === 0 ? 0.08 : 0);
    const dy = (r() - 0.5) * size * 0.08;
    glyphs.push({ c, x: x + widths[i] / 2, y: base + dy, rot, sc });
    x += widths[i];
  });
  const drawGlyphs = (ctx, fn) => {
    for (const q of glyphs) {
      ctx.save();
      ctx.translate(q.x, q.y - size * 0.36);
      ctx.rotate(q.rot);
      ctx.scale(q.sc, q.sc);
      ctx.translate(0, size * 0.36);
      fn(ctx, q.c);
      ctx.restore();
    }
  };
  gg.textAlign = 'center';
  gg.fillStyle = o.color || '#0b0a0a';
  drawGlyphs(gg, (ctx, c) => ctx.fillText(c, 0, 0));
  // 太らせる（筆圧）：少しずらして重ね塗り
  gg.globalAlpha = 0.9;
  drawGlyphs(gg, (ctx, c) => { ctx.fillText(c, size * 0.018, size * 0.01); ctx.fillText(c, -size * 0.012, size * 0.016); });
  gg.globalAlpha = 1;
  // かすれ：筆の流れの向きに細い線で削る
  gg.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    const yy = r() * H, xx = r() * W;
    const len = size * (0.4 + r() * 1.4);
    gg.strokeStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`;
    gg.lineWidth = Math.max(0.6, size * (0.004 + r() * 0.012));
    gg.beginPath();
    gg.moveTo(xx, yy);
    gg.lineTo(xx + len, yy - len * (0.12 + r() * 0.1));
    gg.stroke();
  }
  gg.globalCompositeOperation = 'source-over';

  // ── 白い縁取り（どんな背景でも読めるように） ──
  if (o.halo !== false) {
    g.save();
    g.shadowColor = 'rgba(255,255,255,0.95)';
    g.shadowBlur = size * 0.16;
    g.globalAlpha = 0.95;
    g.font = `${size}px ${INK_FONT}`;
    g.textAlign = 'center';
    g.lineJoin = 'round';
    g.strokeStyle = '#fff';
    g.lineWidth = size * 0.13;
    drawGlyphs(g, (ctx, c) => ctx.strokeText(c, 0, 0));
    g.restore();
  }
  // にじみ（墨の影）
  g.save();
  g.globalAlpha = 0.35;
  g.filter = `blur(${Math.max(1, size * 0.02)}px)`;
  g.drawImage(gl, size * 0.01, size * 0.015);
  g.restore();
  g.drawImage(gl, 0, 0);

  // ── 飛沫 ──
  g.fillStyle = o.color || '#0b0a0a';
  const spl = Math.round(14 + r() * 10);
  for (let i = 0; i < spl; i++) {
    const ang = r() * Math.PI * 2;
    const rad = (0.35 + r() * 0.35) * Math.max(tw, size);
    const sx = W / 2 + Math.cos(ang) * rad * 0.62, sy = H / 2 + Math.sin(ang) * rad * 0.28;
    const s = size * (0.008 + r() * r() * 0.05);
    g.beginPath();
    g.ellipse(sx, sy, s * (1 + r()), s, ang, 0, Math.PI * 2);
    g.fill();
  }
  // 筆の払いの勢い線
  g.strokeStyle = 'rgba(10,10,10,0.75)';
  for (let i = 0; i < 6; i++) {
    const yy = H / 2 + (r() - 0.5) * size * 0.9;
    const xx = W * (0.75 + r() * 0.2);
    g.lineWidth = Math.max(1, size * 0.01 * r());
    g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + size * (0.2 + r() * 0.4), yy - size * 0.05); g.stroke();
  }
  return { canvas: cv, w: W, h: H, size };
}

/** 筆の一筆（先が細く、毛先のかすれがある帯） */
export function brushStroke(g, x0, y0, x1, y1, width, color, r = Math.random) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  g.save();
  g.translate(x0, y0);
  g.rotate(ang);
  g.fillStyle = color;
  // 太さの変化：入りは太く、払いで細く
  const N = 28;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const w = width * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * (1 - Math.pow(t, 3) * 0.92);
    g.lineTo(t * len, -w / 2 + (r() - 0.5) * width * 0.08);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const w = width * (0.35 + 0.65 * Math.sin(Math.min(1, t * 1.6) * Math.PI * 0.5)) * (1 - Math.pow(t, 3) * 0.92);
    g.lineTo(t * len, w / 2 + (r() - 0.5) * width * 0.08);
  }
  g.closePath();
  g.globalAlpha = 0.92;
  g.fill();
  // 毛先のかすれ
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const yy = (r() - 0.5) * width * 0.9;
    const xs = len * (0.25 + r() * 0.6);
    g.strokeStyle = `rgba(0,0,0,${0.4 + r() * 0.6})`;
    g.lineWidth = Math.max(0.6, width * 0.03 * r());
    g.beginPath(); g.moveTo(xs, yy); g.lineTo(len * (1.02), yy * 0.6); g.stroke();
  }
  g.restore();
}

/** 表示中の墨字を管理する */
export class InkLayer {
  constructor() {
    this.items = [];
    this.cache = new Map();
  }
  sprite(text, size, opts = {}) {
    const key = `${text}|${size}|${opts.slash !== false}|${opts.color || ''}`;
    if (!this.cache.has(key)) this.cache.set(key, makeInk(text, { size, ...opts }));
    return this.cache.get(key);
  }
  /**
   * @param {string} text
   * @param {object} o { x, y (0〜1 の画面比率), size (画面の短辺に対する比), dur, kind }
   */
  show(text, o = {}) {
    // 同じ種類の古い墨字はすぐ消す（乱発しない）
    for (const it of this.items) if (!o.keep && it.t < it.dur - 0.12) it.t = Math.max(it.t, it.dur - 0.12);
    this.items.push({ text, x: o.x ?? 0.5, y: o.y ?? 0.36, size: o.size ?? 0.2, t: 0, dur: o.dur ?? 0.55, rot: o.rot ?? -0.04, opts: o.opts || {}, big: !!o.big });
  }
  update(dt) {
    for (const it of this.items) it.t += dt;
    this.items = this.items.filter((it) => it.t < it.dur);
  }
  draw(g, W, H, dpr) {
    const S = Math.min(W, H);
    for (const it of this.items) {
      const px = Math.round(Math.min(220, S * it.size) * dpr);
      const spr = this.sprite(it.text, Math.max(24, Math.round(px / 8) * 8), it.opts);
      const k = it.t;
      // 押印のように：大きく入って、すっと定位置へ。最後に少し広がって消える
      const inT = 0.09;
      let sc, a;
      if (k < inT) { const u = k / inT; sc = 1.55 - 0.55 * easeOutBack(u); a = Math.min(1, u * 2); }
      else if (k > it.dur - 0.14) { const u = (k - (it.dur - 0.14)) / 0.14; sc = 1 + u * 0.08; a = 1 - u; }
      else { sc = 1; a = 1; }
      const shake = k < 0.16 ? (1 - k / 0.16) * S * 0.006 : 0;
      const w = (spr.w / spr.size) * (px / dpr) * sc, h = (spr.h / spr.size) * (px / dpr) * sc;
      g.save();
      g.globalAlpha = a;
      g.translate(it.x * W + (Math.random() - 0.5) * shake, it.y * H + (Math.random() - 0.5) * shake);
      g.rotate(it.rot);
      g.drawImage(spr.canvas, -w / 2, -h / 2, w, h);
      g.restore();
    }
  }
}

function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
