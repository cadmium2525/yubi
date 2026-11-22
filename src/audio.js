/*
 * 指一本。 音（Web Audio API）
 * 効果音・BGM は「かなでる」（mp4mp3 リポジトリの作曲アプリ）で JSON から作った自作の音。
 * 最初の操作のあとで AudioContext を起こす（ブラウザの自動再生の制限のため）。
 */

const FILES = {
  bgm_main: 'assets/audio/bgm_main.mp3',
  bgm_result: 'assets/audio/bgm_result.mp3',
  aim: 'assets/audio/se_aim.mp3',
  charge: 'assets/audio/se_charge.mp3',
  pressure: 'assets/audio/se_pressure.mp3',
  over: 'assets/audio/se_over.mp3',
  snap: 'assets/audio/se_snap.mp3',
  boom: 'assets/audio/se_boom.mp3',
  crush: 'assets/audio/se_crush.mp3',
  concrete1: 'assets/audio/se_concrete1.mp3',
  concrete2: 'assets/audio/se_concrete2.mp3',
  metal1: 'assets/audio/se_metal1.mp3',
  metal2: 'assets/audio/se_metal2.mp3',
  glass: 'assets/audio/se_glass.mp3',
  wood: 'assets/audio/se_wood.mp3',
  collapse: 'assets/audio/se_collapse.mp3',
  thud: 'assets/audio/se_thud.mp3',
  chain: 'assets/audio/se_chain.mp3',
  follow: 'assets/audio/se_follow.mp3',
  whoosh: 'assets/audio/se_whoosh.mp3',
  target: 'assets/audio/se_target.mp3',
  result: 'assets/audio/se_result.mp3',
  best: 'assets/audio/se_best.mp3',
  tick: 'assets/audio/se_tick.mp3',
  ui: 'assets/audio/se_ui.mp3',
  whiff: 'assets/audio/se_whiff.mp3',
};

// ループの範囲（秒）。MP3 は前後に数十ミリ秒の余白が入るので、ループは曲の長さで区切る
const LOOPS = {
  bgm_main: [0, (16 * 4 * 60) / 88], // 16 小節・88 BPM
  pressure: [1, 5], // 48Hz・96Hz のちょうど整数周期
};

export class Sound {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.muted = false;
    this.bgmVol = 0.55;
    this.sfxVol = 0.9;
    this.bgmSrc = null;
    this.bgmName = null;
    this.last = {};
    this.loading = null;
  }

  /** 最初のタップ・クリックで呼ぶ */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -10; this.comp.ratio.value = 4; this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
      this.master.connect(this.comp).connect(c.destination);
      this.bgmGain = c.createGain();
      this.bgmFilter = c.createBiquadFilter();
      this.bgmFilter.type = 'lowpass'; this.bgmFilter.frequency.value = 20000;
      this.bgmGain.connect(this.bgmFilter).connect(this.master);
      this.sfxGain = c.createGain();
      this.sfxGain.connect(this.master);
      this.applyVolumes();
      // iOS：無音を一度鳴らして起こす
      const b = c.createBuffer(1, 1, 22050);
      const s = c.createBufferSource(); s.buffer = b; s.connect(c.destination); s.start(0);
      this.loading = this.loadAll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.loading;
  }

  async loadAll() {
    const entries = Object.entries(FILES);
    await Promise.all(entries.map(async ([k, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const ab = await res.arrayBuffer();
        this.buffers[k] = await new Promise((ok, ng) => this.ctx.decodeAudioData(ab, ok, ng));
      } catch (e) { /* 音が無くても遊べる */ }
    }));
    if (this.pendingBgm) { const n = this.pendingBgm; this.pendingBgm = null; this.bgm(n); }
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.02);
    this.bgmGain.gain.setTargetAtTime(this.bgmVol, t, 0.05);
    this.sfxGain.gain.setTargetAtTime(this.sfxVol, t, 0.02);
  }

  setMuted(m) { this.muted = m; this.applyVolumes(); }

  /** 効果音を鳴らす */
  play(name, o = {}) {
    if (!this.ctx || this.muted) return null;
    const buf = this.buffers[name];
    if (!buf) return null;
    const now = this.ctx.currentTime;
    // 同じ音の鳴らしすぎを防ぐ
    const gap = o.gap ?? 0.04;
    if (this.last[name] && now - this.last[name] < gap) return null;
    this.last[name] = now;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = (o.rate ?? 1) * (o.vary ? 1 + (Math.random() - 0.5) * o.vary : 1);
    const gn = this.ctx.createGain();
    gn.gain.value = o.vol ?? 1;
    let node = gn;
    if (o.pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      gn.connect(p); node = p;
    }
    src.connect(gn);
    node.connect(this.sfxGain);
    src.start(now + (o.delay || 0));
    return { src, gain: gn };
  }

  /** 鳴らし続ける音（蓄圧のうなり） */
  loop(name, vol = 0.5) {
    if (!this.ctx) return null;
    const buf = this.buffers[name];
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    if (LOOPS[name] && buf.duration > LOOPS[name][1]) { src.loopStart = LOOPS[name][0]; src.loopEnd = LOOPS[name][1]; }
    const gn = this.ctx.createGain();
    gn.gain.value = 0;
    src.connect(gn).connect(this.sfxGain);
    src.start();
    gn.gain.setTargetAtTime(this.muted ? 0 : vol, this.ctx.currentTime, 0.05);
    return {
      set: (rate, v) => {
        if (!this.ctx) return;
        src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.05);
        gn.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
      },
      stop: (fade = 0.06) => {
        if (!this.ctx) return;
        gn.gain.setTargetAtTime(0, this.ctx.currentTime, fade);
        try { src.stop(this.ctx.currentTime + fade * 5); } catch (e) { /* 止まっている */ }
      },
    };
  }

  /** BGM を切り替える（ループ） */
  bgm(name, fade = 0.6) {
    if (!this.ctx) return;
    if (this.bgmName === name && this.bgmSrc) return;
    if (!this.buffers[name]) { this.pendingBgm = name; return; }
    const c = this.ctx, t = c.currentTime;
    if (this.bgmSrc) {
      const old = this.bgmSrc;
      old.gain.gain.setTargetAtTime(0, t, fade / 4);
      try { old.src.stop(t + fade * 2); } catch (e) { /* 止まっている */ }
    }
    const src = c.createBufferSource();
    src.buffer = this.buffers[name];
    src.loop = name !== 'bgm_result';
    if (src.loop && LOOPS[name] && src.buffer.duration >= LOOPS[name][1] - 0.01) { src.loopStart = LOOPS[name][0]; src.loopEnd = LOOPS[name][1]; }
    const gn = c.createGain();
    gn.gain.value = 0;
    src.connect(gn).connect(this.bgmGain);
    src.start(t);
    gn.gain.setTargetAtTime(1, t, fade / 4);
    this.bgmSrc = { src, gain: gn };
    this.bgmName = name;
  }

  stopBgm(fade = 0.4) {
    if (!this.ctx || !this.bgmSrc) return;
    const t = this.ctx.currentTime;
    this.bgmSrc.gain.gain.setTargetAtTime(0, t, fade / 4);
    try { this.bgmSrc.src.stop(t + fade * 2); } catch (e) { /* 止まっている */ }
    this.bgmSrc = null; this.bgmName = null;
  }

  /** 蓄圧中は BGM をこもらせて小さく、解放の瞬間は無音 */
  duck(amount, muffle = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bgmGain.gain.setTargetAtTime(this.bgmVol * (1 - amount), t, 0.08);
    this.bgmFilter.frequency.setTargetAtTime(20000 * Math.pow(0.02, muffle), t, 0.08);
  }

  silence(hold = 0.35) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const gg = this.bgmGain.gain;
    gg.cancelScheduledValues(t);
    gg.setValueAtTime(0, t);
    gg.setTargetAtTime(this.bgmVol, t + hold, 0.25);
    this.bgmFilter.frequency.setTargetAtTime(20000, t + hold, 0.2);
  }
}
