'use strict';
/**
 * 把曲库里带人声的旧作重制为纯器乐版。
 *
 * 人声由语音合成逐字生成，听感是"念字"而不是演唱，因此全站统一去掉人声轨：
 * 用同一颗种子重新渲染（编曲、和声、节奏完全不变），只把原本的人声旋律交给主奏乐器演奏。
 *
 *   node scripts/strip-vocals.js          # 重制曲库中所有 song 曲目
 *   node scripts/strip-vocals.js --dry    # 只列出将被重制的曲目，不生成音频
 */
const fs = require('fs');
const path = require('path');
const engine = require('./lib/compose-engine');
const composition = require('./compose-song');
const { toMp3 } = require('./lib/ffmpeg');
const { report } = require('./lib/analyze');

const ROOT = path.join(__dirname, '..');
const WAV_DIR = path.join(ROOT, 'build', 'wav');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const DATA_FILE = path.join(ROOT, 'data', 'tracks.json');
const LANGS = ['zh', 'en', 'es', 'fr', 'ja', 'ar'];
const DRY = process.argv.includes('--dry');

const mk = (zh, en) => {
  const o = {};
  for (const l of LANGS) o[l] = l === 'zh' ? zh : en;
  return o;
};

/** 《世界同频》由 compose-song.js 单独作曲，不走通用引擎 */
function renderSpecial(track) {
  const r = composition.build({ vocal: false });
  return { file: r.file, duration: r.duration, peaks: r.peaks, style: null };
}

function renderBySeed(track) {
  const seed = track.generatedBy && track.generatedBy.seed;
  if (!seed) return null;
  fs.mkdirSync(WAV_DIR, { recursive: true });
  const plan = engine.plan(seed, 'song');
  const outFile = path.join(WAV_DIR, `${seed}.wav`);
  const rend = engine.render(plan, { outFile, vocal: false });
  return { file: rend.file, duration: rend.duration, peaks: rend.peaks, style: plan.style, plan };
}

function main() {
  const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  const targets = (db.tracks || []).filter((t) => t.kind === 'song');
  if (!targets.length) {
    console.log('曲库中没有带人声的曲目，无需处理。');
    return;
  }
  console.log(`=== 去人声重制：${targets.length} 首 ===`);
  for (const t of targets) console.log(`  · ${t.id}${t.generatedBy ? '（种子 ' + t.generatedBy.seed + '）' : '（专用作曲）'}`);
  if (DRY) return;

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  let done = 0;
  for (const t of targets) {
    console.log(`\n──── ${t.title.zh} ────`);
    const out = t.id === 'world-in-sync' ? renderSpecial(t) : renderBySeed(t);
    if (!out) { console.warn('  跳过：缺少可复现的种子'); continue; }

    const check = report(out.file);
    if (!check.ok) console.warn(`  [警告] 体检未通过（削波 ${check.clippedSamples} / 静音段 ${check.silentSegments} / 电平 ${check.rms}）`);

    const mp3Abs = path.join(ROOT, 'public', t.audio);
    const meta = {
      title: `${t.title.zh} ${t.title.en}`,
      artist: '寰宇音乐台',
      album: '寰宇原创音乐集',
      genre: (t.genre && t.genre.en) || 'Instrumental',
      date: String(new Date().getFullYear()),
      comment: '由寰宇音乐台 AI 作曲引擎实时合成的纯音乐',
      cover: path.join(ROOT, 'public', t.cover)
    };
    toMp3(out.file, mp3Abs, meta, '192k');

    const genreZh = (t.genre && t.genre.zh) || (out.style && out.style.genre.zh) || '纯音乐';
    const genreEn = (t.genre && t.genre.en) || (out.style && out.style.genre.en) || 'Instrumental';
    t.kind = 'instrumental';
    t.duration = Math.round(out.duration * 10) / 10;
    t.peaks = out.peaks;
    t.lyrics = null;
    t.subtitle = mk(`纯音乐 · ${genreZh}`, `Instrumental · ${genreEn}`);
    t.credits = mk('作曲 / 编曲 / 混音：寰宇音乐台 AI 作曲引擎', 'Composed, arranged and mixed by the Huanyu Music AI engine');
    if (t.id === 'world-in-sync') {
      t.description = mk(
        '一首写给世界的曲子。山海与星辰都不能隔开彼此，不同的语言唱出的是同样的爱。旋律原本为人声而作，如今由主奏乐器完整奏出，全曲无人声。',
        'A piece written for the whole world. Neither mountains nor seas nor stars can keep us apart. The melodic line was originally written for a voice and is now played end to end by the lead instrument — no vocal at all.'
      );
    } else {
      t.description = mk(
        `《${t.title.zh}》是一首${genreZh}纯音乐，${t.bpm} BPM，${t.musicalKey}。它原本写有一条人声旋律，如今改由主奏乐器完整奏出——全曲无人声，和声、旋律、音色与混音都由算法现场生成，没有一个采样来自别处。`,
        `"${t.title.en}" is an instrumental ${genreEn} piece at ${t.bpm} BPM in ${t.musicalKey}. The melodic line was originally written for a voice and is now played end to end by the lead instrument — no vocal at all. Every note is synthesized from code, none borrowed.`
      );
    }
    const bytes = fs.statSync(mp3Abs).size;
    console.log(`  ✔ ${t.duration}s  ${(bytes / 1024 / 1024).toFixed(2)}MB  ${path.relative(ROOT, mp3Abs)}`);
    done++;
  }

  db.updatedAt = new Date().toISOString();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
  console.log(`\n=== 完成：重制 ${done} 首，全部改为纯器乐 ===`);
  console.log('  提示：本地服务需重启才会读到新曲库（npm start）');
}

main();
