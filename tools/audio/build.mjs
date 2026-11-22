#!/usr/bin/env node
/*
 * BGM・効果音を作り直す。
 * 音は「かなでる」（https://github.com/cadmium2525/mp4mp3 の daw/）の JSON 形式で書いてあり、
 * 同じエンジンの render.mjs で WAV にしてから ffmpeg で MP3 にする。
 *
 *   git clone https://github.com/cadmium2525/mp4mp3 ../mp4mp3
 *   node tools/audio/build.mjs ../mp4mp3            （全部）
 *   node tools/audio/build.mjs ../mp4mp3 se_snap    （一つだけ）
 *
 * bgm_main は 16 小節を 2 回描画し、後半だけを切り出してループにする（前の周の残響が頭に入るので継ぎ目が切れない）。
 */
import { readdirSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const tool = process.argv[2];
const only = process.argv[3];
if (!tool) { console.error('使い方: node tools/audio/build.mjs <mp4mp3 のフォルダ> [名前]'); process.exit(1); }
const render = join(resolve(tool), 'daw', 'tools', 'render.mjs');
const outDir = join(root, 'assets', 'audio');
mkdirSync(outDir, { recursive: true });
const tmp = join(root, 'tools', 'audio', '.tmp');
mkdirSync(tmp, { recursive: true });

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} が失敗しました`);
  return r.stdout;
};

const files = readdirSync(here).filter((f) => f.endsWith('.json') && (!only || f === `${only}.json`));
for (const f of files) {
  const name = f.replace(/\.json$/, '');
  const wav = join(tmp, `${name}.wav`);
  const mp3 = join(outDir, `${name}.mp3`);
  run('node', [render, join(here, f), wav]);
  const isBgm = name.startsWith('bgm_');
  const br = isBgm ? '128k' : '96k';
  if (name === 'bgm_main') {
    const song = JSON.parse(readFileSync(join(here, f), 'utf8'));
    const loopBars = 16;
    const sec = (loopBars * song.sig[0] * 60) / song.bpm;
    const sr = 48000;
    const s0 = Math.round(sec * sr), s1 = Math.round(sec * 2 * sr);
    run('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', `atrim=start_sample=${s0}:end_sample=${s1}`, '-c:a', 'libmp3lame', '-b:a', br, mp3]);
    console.log(`${name}: ループ ${sec.toFixed(3)} 秒`);
  } else {
    // 効果音は頭の無音を詰め、モノラルで軽くする（BGM はステレオ）
    const args = ['-v', 'error', '-y', '-i', wav];
    if (!isBgm) args.push('-af', 'silenceremove=start_periods=1:start_threshold=-60dB', '-ac', '1');
    run('ffmpeg', [...args, '-c:a', 'libmp3lame', '-b:a', br, mp3]);
    console.log(name);
  }
  unlinkSync(wav);
}
