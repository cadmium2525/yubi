/*
 * 指一本。 ステージ定義
 * 座標：x 右向き、y 下向き。地面の上面が y = 0（建物は負の y に積む）。
 * 物体はすべて長方形・円の剛体。人間キャラクターは置かない。
 */

// 下端の y を指定して箱を置く（積み上げを書きやすくするため）
function box(id, name, x, bottom, w, h, mat, style, value, price, group, extra = {}) {
  return { id, name, kind: 'box', x, y: bottom - h / 2, w, h, mat, style, value, price, group, ...extra };
}

/** 最初のステージ「違法建築タワー」 */
export const STAGE_TOWER = {
  id: 'tower',
  name: '違法建築タワー',
  label: '第一景',
  intro: '細い柱の上に増築を重ねた塔。どちらの柱を外すかで倒れる向きが変わる。',
  targetLabel: '看板撃破',
  // カメラが全体を収める範囲
  bounds: { x0: -30, x1: 1450, y0: -500, y1: 60 },
  ground: { x0: -120, x1: 1540, y: 0 },
  // 目標オブジェクト（倒すとボーナス）
  targetId: 'sign',
  // 最初の数回だけ表示する「弱点」の目印（狙点のヒント）
  weakPoints: [
    { id: 'ball', label: '鉄球', dx: -0.9, dy: 0 },
    { id: 'stiltR', label: '細い柱', dx: -0.9, dy: -0.2 },
    { id: 'sign', label: '看板', dx: -0.85, dy: -0.25, part: 'board' },
  ],
  groups: {
    yard: 'コンテナヤード',
    domino: '自販機通り',
    tower: '違法建築タワー',
    office: 'オフィスビル',
    sign: '巨大看板',
    street: '路上',
  },
  // 動かない物（鉄骨のスロープ）
  statics: [
  ],
  objects: [
    // ── 左：コンテナと鉄球 ──
    box('contA', 'コンテナ', 110, 0, 170, 64, 'container', { kind: 'container', color: '#b8493e', label: 'YUBI LINE' }, 300, 6000, 'yard'),
    box('contB', 'コンテナ', 104, -64, 150, 60, 'container', { kind: 'container', color: '#3f6f9e', label: '指圧運輸' }, 300, 6000, 'yard'),
    { id: 'ball', name: '鉄球', kind: 'circle', x: 72, y: -124 - 25, r: 25, mat: 'steel', style: { kind: 'ball' }, value: 0, price: 0, group: 'yard', tool: true },

    // ── 自販機のドミノ ──
    ...[[330, '#d63b3b'], [392, '#2f7fd0'], [454, '#f2f2ee'], [516, '#3aa35a'], [578, '#f0b429']].map(([x, color], i) =>
      box(`vend${i}`, '自販機', x, 0, 28, 76, 'vending', { kind: 'vending', color }, 160, 900, 'domino')),

    // ── 違法建築タワー（細い柱の上に増築を重ねた塔） ──
    box('stiltL', '細い柱', 652, 0, 14, 150, 'pillar', { kind: 'pillar' }, 300, 2000, 'tower'),
    box('stiltR', '細い柱', 790, 0, 14, 150, 'pillar', { kind: 'pillar' }, 300, 2000, 'tower'),
    box('slab', '床版', 722, -150, 208, 16, 'concrete', { kind: 'slab' }, 300, 3000, 'tower'),
    box('room1', 'スナック', 722, -166, 176, 66, 'concrete',
      { kind: 'building', color: '#d9c7a6', rows: 2, cols: 5, sign: { text: 'スナック指', bg: '#7a1e2a', fg: '#ffd9a0' } }, 900, 12000, 'tower'),
    box('room2', '雀荘', 748, -232, 200, 58, 'concrete',
      { kind: 'building', color: '#b9c4c9', rows: 2, cols: 6, sign: { text: '雀荘', bg: '#1f5d3a', fg: '#f5f5e8' } }, 900, 12000, 'tower'),
    box('room3', '事務所', 724, -290, 140, 56, 'concrete',
      { kind: 'building', color: '#e1d8c6', rows: 2, cols: 4 }, 800, 10000, 'tower'),
    box('annex', '違法増築', 826, -290, 62, 56, 'wood',
      { kind: 'shack', color: '#9c7b55', sign: { text: '増築', bg: '#c33', fg: '#fff' } }, 600, 4000, 'tower'),
    box('room4', '屋上の小屋', 752, -346, 176, 50, 'concrete',
      { kind: 'building', color: '#c9b8a3', rows: 1, cols: 5 }, 800, 9000, 'tower'),
    box('tank', '給水タンク', 712, -396, 48, 40, 'steelbox', { kind: 'tank' }, 400, 3000, 'tower'),
    box('roofSign', '屋上看板', 800, -396, 66, 34, 'sign', { kind: 'roofsign', text: '違法建築' }, 500, 5000, 'tower'),

    // ── 路上の車 ──
    box('car1', 'ワゴン車', 872, 0, 66, 28, 'car', { kind: 'car', color: '#e8e4da' }, 400, 3000, 'street'),
    box('car2', '軽トラ', 1124, 0, 62, 26, 'car', { kind: 'car', color: '#4a7ab8' }, 400, 2500, 'street'),

    // ── オフィスビル（細身の 4 階建て） ──
    box('office', 'オフィスビル', 975, 0, 76, 300, 'office',
      { kind: 'building', color: '#a3b4c0', rows: 8, cols: 3, glass: true, sign: { text: 'オフィス', bg: '#25384a', fg: '#e8f0f6' } }, 2800, 60000, 'office'),
    box('officeRoof', '屋上設備', 971, -300, 60, 24, 'steelbox', { kind: 'roofbox', color: '#7d8a93' }, 300, 2000, 'office'),

    // ── 巨大看板（目標） ──
    {
      id: 'sign', name: '巨大看板', kind: 'compound', x: 1250, mat: 'sign', group: 'sign', value: 3000, price: 300000, target: true,
      style: { kind: 'billboard', text: '絶対に倒れません', sub: '指圧建設' },
      parts: [
        { part: 'base', x: 1250, y: -11, w: 96, h: 22, mat: 'ballast' },
        { part: 'pole', x: 1250, y: -22 - 104, w: 16, h: 208, mat: 'steelbox' },
        { part: 'board', x: 1250, y: -230 - 50, w: 232, h: 100, mat: 'sign' },
      ],
    },

    // ── 右端の木箱 ──
    box('crate1', '木箱', 1392, 0, 44, 44, 'wood', { kind: 'crate' }, 150, 500, 'street'),
    box('crate2', '木箱', 1390, -44, 40, 40, 'wood', { kind: 'crate' }, 150, 500, 'street'),
  ],
  // 物理を持たない飾り（奥のレイヤー）
  decor: {
    far: 'city', // 遠景の街並み
    crane: { x: 40, h: 360 },
    bridge: { x0: 1180, x1: 1600 },
    trees: [200, 620, 950, 1330, 1470],
    train: true,
  },
};


/* ───────────────────────── 第二景：シャッター商店街 ───────────────────────── */

const SHOP_COLORS = ['#d9c7a6', '#c9d3c0', '#e2c9c0', '#cfd6dc', '#e6dcc0', '#d6c4d4', '#c8bfae'];
const SHOP_NAMES = [['八百屋', '#2f7d3a'], ['金物店', '#555'], ['喫茶 指', '#7a1e2a'], ['薬局', '#1f5d9a'], ['銭湯', '#9a3b1f'], ['写真館', '#4a3f7a'], ['質屋', '#6b5a1f']];
const shops = [];
{
  let x = 250, prevH = 0;
  const w = 54;
  for (let i = 0; i < 7; i++) {
    const h = Math.round(118 * Math.pow(1.14, i));
    if (i > 0) x += w + prevH * 0.55;
    shops.push(box(`shop${i}`, SHOP_NAMES[i][0], Math.round(x), 0, w, h, 'shop',
      { kind: 'shop', color: SHOP_COLORS[i], sign: { text: SHOP_NAMES[i][0], bg: SHOP_NAMES[i][1], fg: '#fff' }, rows: Math.max(1, Math.round((h - 60) / 34)) },
      300 + i * 120, 4000 + i * 2500, i < 4 ? 'west' : 'east'));
    prevH = h;
  }
}

export const STAGE_SHOP = {
  id: 'shop',
  name: 'シャッター商店街',
  label: '第二景',
  intro: '背の順に並んだ細長い店。一軒倒せば、あとは勝手に倒れていく……はず。',
  bounds: { x0: -40, x1: 1560, y0: -420, y1: 60 },
  ground: { x0: -120, x1: 1640, y: 0 },
  targetId: 'arch',
  targetLabel: 'アーチ撃破',
  reach: { groups: ['west', 'east', 'arch'], label: '商店街総崩れ' },
  weakPoints: [
    { id: 'shop0', label: '最初の一軒', dx: -0.9, dy: -0.75 },
    { id: 'bus', label: 'バス', dx: -0.9, dy: -0.2 },
    { id: 'arch', label: 'アーチ', dx: 0.9, dy: -0.85, part: 'beam' },
  ],
  groups: { street: '路上', west: '商店街・西', east: '商店街・東', arch: '商店街アーチ' },
  objects: [
    box('bus', '路線バス', 110, 0, 150, 54, 'car', { kind: 'bus', color: '#3d8f5f' }, 500, 8000, 'street'),
    ...shops,
    {
      id: 'arch', name: '商店街アーチ', kind: 'compound', x: 1375, mat: 'sign', group: 'arch', value: 3000, price: 200000, target: true,
      style: { kind: 'arch', text: '指一本商店街' },
      parts: [
        { part: 'post', x: 1310, y: -100, w: 14, h: 200, mat: 'steelbox' },
        { part: 'post', x: 1440, y: -100, w: 14, h: 200, mat: 'steelbox' },
        { part: 'beam', x: 1375, y: -224, w: 200, h: 48, mat: 'sign' },
      ],
    },
    box('crateS', '段ボール', 1580, 0, 40, 34, 'wood', { kind: 'crate' }, 100, 300, 'street'),
  ],
  decor: { trees: [180, 700, 1120, 1600], lanterns: true },
};

/* ───────────────────────── 第三景：コンテナヤード ───────────────────────── */

const C = (id, x, row, w, color, label) => box(id, 'コンテナ', x, -row * 56, w, 56, 'container', { kind: 'container', color, label }, 350, 6000, 'stack');

export const STAGE_YARD = {
  id: 'yard',
  name: 'コンテナヤード',
  label: '第三景',
  intro: 'クレーンに吊られた鉄球。押せば揺れ、戻ってくる。いつ、どちらから弾く？',
  bounds: { x0: -40, x1: 1480, y0: -640, y1: 60 },
  ground: { x0: -120, x1: 1560, y: 0 },
  targetId: 'hq',
  targetLabel: '管理棟撃破',
  reach: { groups: ['stack', 'light', 'hq'], label: '港湾総崩れ' },
  weakPoints: [
    { id: 'wball', label: '吊り鉄球', dx: -0.9, dy: 0 },
    { id: 'light', label: '照明塔', dx: -0.9, dy: 0.6, part: 'pole' },
    { id: 'c4', label: 'てっぺん', dx: -0.8, dy: -0.6 },
  ],
  groups: { stack: 'コンテナの山', light: '照明塔', hq: '管理棟', street: '構内' },
  ropes: [{ id: 'wball', anchor: { x: 420, y: -620 } }],
  objects: [
    { id: 'wball', name: '吊り鉄球', kind: 'circle', x: 420, y: -150, r: 38, mat: 'steel', style: { kind: 'ball' }, value: 0, price: 0, group: 'stack', tool: true, flickBoost: 2.1 },
    C('c1a', 545, 0, 150, '#b8493e', 'YUBI LINE'), C('c1b', 705, 0, 150, '#3f6f9e', '指圧運輸'), C('c1c', 865, 0, 150, '#d69a2d', 'DEKO'),
    C('c2a', 625, 1, 150, '#4f8a5b', 'OSHI'), C('c2b', 785, 1, 150, '#b8493e', 'YUBI LINE'),
    C('c3', 705, 2, 150, '#7a5aa0', 'PACHIN'),
    C('c4', 705, 3, 124, '#3f6f9e', '指圧運輸'),
    {
      id: 'light', name: '照明塔', kind: 'compound', x: 1020, mat: 'steelbox', group: 'light', value: 1200, price: 20000,
      style: { kind: 'lighttower' },
      parts: [
        { part: 'base', x: 1020, y: -9, w: 64, h: 18, mat: 'ballast' },
        { part: 'pole', x: 1020, y: -18 - 160, w: 14, h: 320, mat: 'steelbox' },
        { part: 'lamp', x: 1020, y: -338 - 15, w: 60, h: 30, mat: 'steelbox' },
      ],
    },
    box('fork', 'フォークリフト', 1105, 0, 56, 30, 'car', { kind: 'car', color: '#e0a21b' }, 400, 2500, 'street'),
    box('hq', '管理棟', 1240, 0, 96, 210, 'office', { kind: 'building', color: '#d7d2c4', rows: 5, cols: 2, sign: { text: '管理棟', bg: '#1f3f6a', fg: '#fff' } }, 2400, 60000, 'hq', { target: true }),
    box('hqTop', '屋上アンテナ室', 1244, -210, 56, 28, 'steelbox', { kind: 'roofbox', color: '#8b969e' }, 300, 2000, 'hq'),
    ...[[1385, 0], [1415, 0], [1400, -36]].map(([x, b], i) => box(`drum${i}`, 'ドラム缶', x, b, 28, 36, 'steelbox', { kind: 'drum', color: ['#2f6fb0', '#c0392b', '#2f6fb0'][i] }, 120, 400, 'street')),
  ],
  decor: { gantry: { x: 330, top: -640, tip: 420 }, bridge: { x0: 1100, x1: 1600 }, trees: [1470] },
};

/* ───────────────────────── 第四景：天守閣 ───────────────────────── */

const stones = [];
{
  const rows = [[530, 6], [560, 5], [590, 4]];
  rows.forEach(([x0, n], r) => {
    for (let i = 0; i < n; i++) stones.push(box(`st${r}_${i}`, '石垣', x0 + i * 60, -r * 40, 60, 40, 'stone', { kind: 'stone' }, 160, 1500, 'ishigaki'));
  });
}

export const STAGE_CASTLE = {
  id: 'castle',
  name: '天守閣',
  label: '第四景',
  intro: '石垣の上にそびえる天守。てっぺんの金のしゃちほこを落とせ。',
  bounds: { x0: 140, x1: 1320, y0: -500, y1: 60 },
  ground: { x0: 40, x1: 1420, y: 0 },
  targetId: 'shachi',
  targetLabel: 'しゃちほこ撃破',
  zenkai: 0.65,
  reach: { groups: ['ishigaki', 'tenshu', 'hotel'], label: '城下総崩れ' },
  weakPoints: [
    { id: 'st0_0', label: '隅石', dx: -0.85, dy: 0 },
    { id: 'hotel', label: 'ホテル', dx: 0.9, dy: -0.8 },
    { id: 'shachi', label: 'しゃちほこ', dx: -0.8, dy: 0 },
  ],
  groups: { ishigaki: '石垣', tenshu: '天守', hotel: '城下ホテル', street: '城下' },
  objects: [
    box('lantern1', '石灯籠', 330, 0, 34, 30, 'stone', { kind: 'stone' }, 80, 300, 'street'),
    box('lantern2', '石灯籠', 330, -30, 22, 34, 'stone', { kind: 'stone' }, 80, 300, 'street'),
    box('lantern3', '石灯籠', 330, -64, 40, 16, 'roof', { kind: 'castleroof' }, 80, 300, 'street'),
    box('kbus', '観光バス', 420, 0, 120, 46, 'car', { kind: 'bus', color: '#d94f3a' }, 400, 6000, 'street'),
    ...stones,
    box('t1', '一層', 680, -120, 230, 70, 'castle', { kind: 'castle', cols: 6 }, 700, 30000, 'tenshu'),
    box('r1', '一層の屋根', 680, -190, 272, 14, 'roof', { kind: 'castleroof' }, 300, 8000, 'tenshu'),
    box('t2', '二層', 680, -204, 190, 62, 'castle', { kind: 'castle', cols: 5 }, 700, 30000, 'tenshu'),
    box('r2', '二層の屋根', 680, -266, 230, 12, 'roof', { kind: 'castleroof' }, 300, 8000, 'tenshu'),
    box('t3', '三層', 680, -278, 150, 56, 'castle', { kind: 'castle', cols: 4 }, 700, 30000, 'tenshu'),
    box('r3', '三層の屋根', 680, -334, 188, 12, 'roof', { kind: 'castleroof' }, 300, 8000, 'tenshu'),
    box('t4', '最上階', 680, -346, 110, 50, 'castle', { kind: 'castle', cols: 3 }, 700, 30000, 'tenshu'),
    box('r4', '大屋根', 680, -396, 144, 14, 'roof', { kind: 'castleroof' }, 300, 8000, 'tenshu'),
    box('shachi', '金のしゃちほこ', 680, -410, 34, 30, 'gold', { kind: 'gold' }, 2000, 500000, 'tenshu', { target: true }),
    box('hotel', '城下ホテル', 1040, 0, 86, 330, 'office', { kind: 'building', color: '#e4ddd0', rows: 10, cols: 3, sign: { text: 'HOTEL', bg: '#7a1e2a', fg: '#ffe9b0' } }, 2600, 50000, 'hotel'),
    box('taxi', 'タクシー', 1170, 0, 62, 26, 'car', { kind: 'car', color: '#f2c230' }, 300, 2000, 'street'),
    box('omiyage', '土産物屋', 1270, 0, 90, 70, 'wood', { kind: 'shack', color: '#9c7b55', sign: { text: '土産', bg: '#c33', fg: '#fff' } }, 500, 3000, 'street'),
  ],
  decor: { trees: [250, 470, 900, 1350], pines: true },
};

/* ───────────────────────── 日替わり違法建築（日付から自動生成） ───────────────────────── */

export function makeDailyStage(dateStr) {
  let a = 0;
  for (const ch of dateStr) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
  const r = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  const objs = [];
  const groups = { street: '路上', sign: '巨大看板' };
  const colors = ['#d9c7a6', '#b9c4c9', '#e1d8c6', '#c9b8a3', '#a3b4c0', '#d6c4d4', '#c8d6bf'];
  const signs = [['焼肉', '#7a1e2a'], ['質屋', '#1f5d3a'], ['塾', '#1f3f6a'], ['整体', '#5a3f7a'], ['麻雀', '#1f5d3a'], ['カラオケ', '#9a3b1f'], ['占い', '#4a3f7a'], ['歯科', '#2a6f8a']];
  // 左：コンテナと鉄球
  objs.push(box('dcA', 'コンテナ', 110, 0, 170, 60, 'container', { kind: 'container', color: pick(['#b8493e', '#3f6f9e', '#4f8a5b']), label: 'DAILY' }, 300, 6000, 'yard'));
  objs.push({ id: 'dball', name: '鉄球', kind: 'circle', x: 70, y: -60 - 25, r: 25, mat: 'steel', style: { kind: 'ball' }, value: 0, price: 0, group: 'yard', tool: true });
  groups.yard = 'コンテナヤード';
  let x = 300;
  const nB = 2 + Math.floor(r() * 2);
  const groupIds = [];
  for (let b = 0; b < nB; b++) {
    const gid = `b${b}`;
    groupIds.push(gid);
    groups[gid] = `${['東', '西', '南', '北'][b]}棟`;
    const type = pick(['stilt', 'stack', 'tall']);
    if (type === 'tall') {
      const w = 70 + Math.round(r() * 30), h = 230 + Math.round(r() * 110);
      x += w / 2;
      const sg = pick(signs);
      objs.push(box(`${gid}t`, 'ペンシルビル', x, 0, w, h, 'office', { kind: 'building', color: pick(colors), rows: Math.round(h / 34), cols: 3, glass: r() < 0.5, sign: { text: sg[0], bg: sg[1], fg: '#fff' } }, 2200, 40000, gid));
      x += w / 2;
    } else {
      const baseW = 150 + Math.round(r() * 60);
      const cx = x + baseW / 2;
      let bottom = 0;
      if (type === 'stilt') {
        const sh = 90 + Math.round(r() * 60);
        objs.push(box(`${gid}sL`, '細い柱', cx - baseW / 2 + 10, 0, 14, sh, 'pillar', { kind: 'pillar' }, 300, 2000, gid));
        objs.push(box(`${gid}sR`, '細い柱', cx + baseW / 2 - 10, 0, 14, sh, 'pillar', { kind: 'pillar' }, 300, 2000, gid));
        objs.push(box(`${gid}sl`, '床版', cx, -sh, baseW + 8, 14, 'concrete', { kind: 'slab' }, 300, 3000, gid));
        bottom = -sh - 14;
      }
      const floors = 2 + Math.floor(r() * 3);
      let w = baseW, off = 0;
      for (let f = 0; f < floors; f++) {
        const h = 46 + Math.round(r() * 22);
        const sg = pick(signs);
        objs.push(box(`${gid}f${f}`, `${f + 1}階`, Math.round(cx + off), bottom, w, h, 'concrete',
          { kind: 'building', color: pick(colors), rows: h > 56 ? 2 : 1, cols: Math.max(2, Math.round(w / 34)), sign: r() < 0.6 ? { text: sg[0], bg: sg[1], fg: '#fff' } : undefined }, 800, 10000, gid));
        bottom -= h;
        const nw = Math.max(70, w - 10 - Math.round(r() * 40));
        off += (r() - 0.5) * Math.min(26, (w - nw) + 10) ;
        off = Math.max(-(w - nw) / 2, Math.min((w - nw) / 2, off));
        w = nw;
      }
      if (r() < 0.6) objs.push(box(`${gid}tank`, '給水タンク', Math.round(cx + off), bottom, 40, 34, 'steelbox', { kind: 'tank' }, 300, 2000, gid));
      x += baseW;
    }
    x += 90 + Math.round(r() * 70);
    if (r() < 0.6) { objs.push(box(`car${b}`, '車', x - 45, 0, 60, 26, 'car', { kind: 'car', color: pick(['#e8e4da', '#4a7ab8', '#c0392b', '#2c3e50']) }, 300, 2000, 'street')); }
  }
  x += 90;
  objs.push({
    id: 'dsign', name: '巨大看板', kind: 'compound', x, mat: 'sign', group: 'sign', value: 3000, price: 300000, target: true,
    style: { kind: 'billboard', text: pick(['本日も倒れません', '耐震基準ギリギリ', '日替わり安全宣言', '指一本ご遠慮ください']), sub: dateStr },
    parts: [
      { part: 'base', x, y: -11, w: 96, h: 22, mat: 'ballast' },
      { part: 'pole', x, y: -22 - 104, w: 16, h: 208, mat: 'steelbox' },
      { part: 'board', x, y: -230 - 50, w: 232, h: 100, mat: 'sign' },
    ],
  });
  const x1 = x + 160;
  return {
    id: `daily-${dateStr}`, bestKey: 'daily', name: '日替わり違法建築', label: '本日', daily: true,
    intro: `${dateStr} の街。毎日ちがう建物が並ぶ。`,
    bounds: { x0: -30, x1, y0: -480, y1: 60 },
    ground: { x0: -120, x1: x1 + 90, y: 0 },
    targetId: 'dsign', targetLabel: '看板撃破',
    reach: { groups: [...groupIds, 'sign'], label: '全棟連鎖' },
    weakPoints: [{ id: 'dball', label: '鉄球', dx: -0.9, dy: 0 }, { id: 'dsign', label: '看板', dx: -0.85, dy: -0.25, part: 'board' }],
    groups,
    objects: objs,
    decor: { crane: { x: 40, h: 340 }, trees: [220, x1 - 60] },
  };
}

export const STAGES = [STAGE_TOWER, STAGE_SHOP, STAGE_YARD, STAGE_CASTLE];

