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

export const STAGES = [STAGE_TOWER];
