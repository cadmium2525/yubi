/*
 * 指一本。 巨大な指（画面の手前に大きく描く）
 * 画像素材は使わず、関節ごとの円筒をグラデーションで塗って描く。
 *
 * 指先の位置（画面座標）と、弾く向き（単位ベクトル）を受け取る。
 * 指は「弾く向きの反対側」から画面の外へ伸びる。
 */

const SKIN = { base: '#e9ae8c', dark: '#a8654a', deep: '#7d4433', light: '#f9d6c0', nail: '#f3c9bd', nailTip: '#fff4ee' };

export class Finger {
  constructor() {
    this.tip = { x: 0, y: 0 }; // 指先（画面座標）
    this.dir = { x: 1, y: 0 }; // 弾く向き
    this.curl = 0.25; // 曲げ具合 0〜1（蓄圧で増える）
    this.alpha = 0; // 表示の濃さ
    this.width = 80;
    this.charge = 0;
    this.over = 0; // 過蓄圧
    this.t = 0;
    this.flash = 0;
    this.side = 1; // 曲げる側（手のひら側）
  }

  draw(g) {
    if (this.alpha <= 0.01) return;
    const w = this.width;
    const d = this.dir;
    const ang = Math.atan2(d.y, d.x);
    // 指は下側（画面の手前）から来るように曲げる
    const side = d.x >= 0 ? 1 : -1;
    const curl = this.curl;
    // 関節：指先から根元へ。長さは指の太さの倍率
    const segs = [
      { len: w * 1.05, bend: 0.32 * curl + 0.05 },
      { len: w * 1.2, bend: 0.55 * curl + 0.08 },
      { len: w * 1.55, bend: 0.38 * curl + 0.06 },
    ];
    const pts = [{ x: this.tip.x, y: this.tip.y }];
    let a = ang + Math.PI; // 指先から根元へ向かう向き
    let p = pts[0];
    const ws = [w * 0.86, w * 0.97, w * 1.06, w * 1.12];
    for (const s of segs) {
      a += s.bend * side;
      p = { x: p.x + Math.cos(a) * s.len, y: p.y + Math.sin(a) * s.len };
      pts.push(p);
    }
    const tremble = (this.charge * 1.2 + this.over * 3) * w * 0.02;
    const jx = (Math.random() - 0.5) * tremble, jy = (Math.random() - 0.5) * tremble;

    g.save();
    g.globalAlpha = this.alpha;
    g.translate(jx, jy);

    // 落ち影（画面の奥へ）
    g.save();
    g.globalAlpha = this.alpha * 0.22;
    g.translate(w * 0.25, w * 0.35);
    g.fillStyle = '#000';
    g.filter = `blur(${Math.round(w * 0.18)}px)`;
    this.capsulePath(g, pts, ws);
    g.fill();
    g.filter = 'none';
    g.restore();

    // 手の甲・拳（根元の先、画面の外へ続く）
    const base = pts[pts.length - 1];
    const ba = a;
    g.save();
    g.translate(base.x, base.y);
    g.rotate(ba);
    const hg = g.createLinearGradient(0, -w * 1.6, 0, w * 1.6);
    hg.addColorStop(0, SKIN.dark); hg.addColorStop(0.3, SKIN.base); hg.addColorStop(0.55, SKIN.light); hg.addColorStop(0.8, SKIN.base); hg.addColorStop(1, SKIN.deep);
    g.fillStyle = hg;
    g.beginPath();
    g.ellipse(w * 1.5, side * w * 0.35, w * 2.4, w * 1.7, side * 0.2, 0, Math.PI * 2);
    g.fill();
    // 折りたたんだ他の指の関節（拳の凹凸）
    g.strokeStyle = 'rgba(125,68,51,0.45)';
    g.lineWidth = w * 0.05;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.arc(w * (0.55 + i * 0.75), side * w * 1.05, w * 0.42, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
    }
    g.restore();

    // 指の本体（関節ごとの円筒）
    for (let i = pts.length - 2; i >= 0; i--) {
      this.segment(g, pts[i + 1], pts[i], ws[i + 1], ws[i], i === 0, side);
    }

    // 蓄圧の赤い気（指先のまわり）
    if (this.charge > 0.02 || this.flash > 0) this.aura(g, pts[0], ang, w);
    g.restore();
  }

  capsulePath(g, pts, ws) {
    g.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x);
      g.save();
      g.translate(a.x, a.y);
      g.rotate(ang);
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const r = ws[i] / 2;
      g.moveTo(0, -r);
      g.lineTo(len, -ws[i + 1] / 2);
      g.lineTo(len, ws[i + 1] / 2);
      g.lineTo(0, r);
      g.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5);
      g.restore();
    }
  }

  // 一つの節（a：根元側、b：指先側）
  segment(g, a, b, wa, wb, isTip, side) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    g.save();
    g.translate(a.x, a.y);
    g.rotate(ang);
    const grad = g.createLinearGradient(0, -wa / 2, 0, wa / 2);
    // 光は画面の上から：上側が明るい
    const top = side > 0 ? 0 : 1;
    const stops = [[0, SKIN.dark], [0.18, SKIN.base], [0.38, SKIN.light], [0.6, SKIN.base], [0.9, SKIN.dark], [1, SKIN.deep]];
    for (const [o, c] of stops) grad.addColorStop(top ? 1 - o : o, c);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-wa * 0.05, -wa / 2);
    g.lineTo(len, -wb / 2);
    if (isTip) {
      // 指先は丸く
      g.ellipse(len, 0, wb * 0.62, wb / 2, 0, -Math.PI / 2, Math.PI / 2);
    } else {
      g.lineTo(len, wb / 2);
    }
    g.lineTo(-wa * 0.05, wa / 2);
    g.ellipse(-wa * 0.05, 0, wa * 0.32, wa / 2, 0, Math.PI / 2, Math.PI * 1.5);
    g.closePath();
    g.fill();
    // 輪郭の暗い線（ごく薄く）
    g.strokeStyle = 'rgba(110,56,40,0.35)';
    g.lineWidth = Math.max(1, wa * 0.025);
    g.stroke();
    // 関節のしわ（手の甲側）
    const s = -side; // 甲の側
    g.strokeStyle = 'rgba(120,62,45,0.5)';
    g.lineWidth = Math.max(1, wa * 0.03);
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      const x = -wa * 0.02 + k * wa * 0.07;
      g.ellipse(x, s * wa * 0.12, wa * 0.05, wa * 0.3, 0, -Math.PI * 0.5, Math.PI * 0.5, s < 0);
      g.stroke();
    }
    // 爪（指先の節の甲側）
    if (isTip) {
      const nx = len - wb * 0.15, ny = s * wb * 0.18;
      g.save();
      g.translate(nx, ny);
      const ng = g.createLinearGradient(-wb * 0.5, 0, wb * 0.4, 0);
      ng.addColorStop(0, '#d9a698'); ng.addColorStop(0.7, SKIN.nail); ng.addColorStop(1, SKIN.nailTip);
      g.fillStyle = ng;
      g.beginPath();
      g.ellipse(0, 0, wb * 0.46, wb * 0.27, 0, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(150,90,75,0.55)';
      g.lineWidth = Math.max(1, wb * 0.025);
      g.stroke();
      // 爪のつや
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(-wb * 0.05, -s * wb * 0.08, wb * 0.25, wb * 0.06, 0, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    // 縁の光（リムライト）
    g.strokeStyle = 'rgba(255,220,200,0.5)';
    g.lineWidth = Math.max(1, wa * 0.04);
    g.beginPath();
    g.moveTo(0, -top * 0 + (side > 0 ? -wa / 2 : wa / 2) * 0.92);
    g.lineTo(len, (side > 0 ? -wb / 2 : wb / 2) * 0.92);
    g.stroke();
    g.restore();
  }

  // 蓄圧の赤い気：指先を取り巻く弧
  aura(g, tip, ang, w) {
    const c = Math.min(1, this.charge + this.flash);
    g.save();
    g.globalCompositeOperation = 'lighter';
    const n = 3 + Math.round(c * 4);
    for (let i = 0; i < n; i++) {
      const rr = w * (0.7 + i * 0.28 + Math.sin(this.t * 9 + i) * 0.05);
      const a0 = ang + Math.PI - 1.2 + i * 0.13 + Math.sin(this.t * 5 + i * 1.7) * 0.2;
      const span = 0.9 + c * 0.9;
      const red = this.over > 0.2 ? 'rgba(255,40,20,' : 'rgba(255,70,50,';
      g.strokeStyle = red + (0.18 + c * 0.45) * (1 - i / (n + 2)) + ')';
      g.lineWidth = w * (0.05 + c * 0.05) * (1 - i / (n + 3));
      g.beginPath();
      g.arc(tip.x, tip.y, rr, a0, a0 + span);
      g.stroke();
      g.strokeStyle = `rgba(255,240,230,${0.25 * c})`;
      g.lineWidth = w * 0.015;
      g.stroke();
    }
    // 指先の光
    const rg = g.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, w * (0.6 + c * 0.6));
    rg.addColorStop(0, `rgba(255,230,220,${0.45 * c})`);
    rg.addColorStop(0.4, `rgba(255,60,40,${0.25 * c})`);
    rg.addColorStop(1, 'rgba(255,0,0,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(tip.x, tip.y, w * (0.6 + c * 0.6), 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
}
