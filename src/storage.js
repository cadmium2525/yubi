/*
 * 指一本。 端末内の保存（localStorage）
 * ベスト記録と設定だけを保存する。使えない環境（プライベートモードなど）でも落ちないようにする。
 */
const KEY = 'yubi-ippon.v1';

const clone = (o) => JSON.parse(JSON.stringify(o));

const DEFAULTS = {
  settings: { bgm: 0.55, sfx: 0.9, reduceFx: false, quality: 'auto', hints: null, muted: false },
  best: {},
  plays: 0,
};

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return clone(DEFAULTS);
    const d = JSON.parse(raw);
    return { ...clone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d.settings || {}) } };
  } catch (e) {
    return clone(DEFAULTS);
  }
}

let data = read();

function write() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { /* 保存できなくても遊べる */ }
}

export const store = {
  get settings() { return data.settings; },
  setSetting(k, v) { data.settings[k] = v; write(); },
  best(stageId) { return data.best[stageId] || null; },
  /** 記録を更新し、更新した項目を返す */
  submit(stageId, rec) {
    const old = data.best[stageId] || { score: 0, rate: 0, chain: 0, damage: 0 };
    const upd = {
      score: rec.score > old.score, rate: rec.rate > old.rate, chain: rec.chain > old.chain, damage: rec.damage > old.damage,
    };
    data.best[stageId] = {
      score: Math.max(old.score, rec.score), rate: Math.max(old.rate, rec.rate),
      chain: Math.max(old.chain, rec.chain), damage: Math.max(old.damage, rec.damage),
    };
    write();
    return upd;
  },
  get plays() { return data.plays; },
  addPlay() { data.plays += 1; write(); },
  reset() { data = clone(DEFAULTS); write(); },
};
