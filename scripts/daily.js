'use strict';
/**
 * 每日生产流水线：合成 N 首纯音乐 + M 首歌曲 → 体检 → 转 MP3 → 生成封面 → 入库 → 同步线上。
 *
 *   npm run daily                       # 默认 3 首纯音乐（全站无人声），完成后同步到 GitHub Pages
 *   npm run daily -- --songs=1 --instrumental=1   # 只各做一首（调试用）
 *   npm run daily -- --no-push          # 只入库，不推送
 *   npm run daily -- --date=2026-09-22  # 指定批次日期（默认今天）
 *   npm run daily -- --bitrate=128k     # 指定 MP3 码率
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const engine = require('./lib/compose-engine');
const lyricsEngine = require('./lib/lyrics-engine');
const covers = require('./make-covers');
const { toMp3 } = require('./lib/ffmpeg');
const { report } = require('./lib/analyze');
const D = require('./lib/dsp');

const ROOT = path.join(__dirname, '..');
const BUILD = path.join(ROOT, 'build');
const WAV_DIR = path.join(BUILD, 'wav');
const AUDIO_DIR = path.join(ROOT, 'public', 'audio');
const COVER_DIR = path.join(ROOT, 'public', 'img', 'covers');
const DATA_FILE = path.join(ROOT, 'data', 'tracks.json');
const REPORT_FILE = path.join(BUILD, 'last-daily-run.json');
const LANGS = ['zh', 'en', 'es', 'fr', 'ja', 'ar'];
const REMOTE = 'https://github.com/siinaiiovalle-droid/huanyu_music.git';
const COVER_VARIANTS = ['nebula', 'waves', 'orbit'];

/* ---------------- 工具 ---------------- */
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    if (!a.startsWith('--')) continue;
    a = a.slice(2);
    if (a.includes('=')) {
      const [k, v] = a.split('=');
      out[k] = v;
    } else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
      out[a] = argv[++i];
    } else {
      out[a] = '1';
    }
  }
  return out;
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const rpad = (s, n) => String(s).padEnd(n, ' ');

function slugify(text) {
  const s = String(text || '').trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'track';
}

const mk = (zh, en) => {
  const o = {};
  for (const l of LANGS) o[l] = l === 'zh' ? zh : en;
  return o;
};

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!Array.isArray(db.tracks)) db.tracks = [];
    return db;
  } catch (e) {
    return { tracks: [] };
  }
}

/* ---------------- 单首作品生产 ---------------- */
function buildTrack(kind, idx, dateStr, bitrate, ordinal, existingTitles = []) {
  const seed = `${dateStr}-${kind}-${idx}`;
  fs.mkdirSync(WAV_DIR, { recursive: true });
  const plan = engine.plan(seed, kind);
  const outFile = path.join(WAV_DIR, `${seed}.wav`);
  // 人声由语音合成逐字生成，听感接近"念字"而非演唱，因此一律产出无人声演奏版
  const rend = engine.render(plan, { outFile, vocal: false });

  const check = report(rend.file);
  if (!check.ok) {
    console.warn(`[警告] ${seed} 体检未通过（削波 ${check.clippedSamples} / 静音段 ${check.silentSegments} / 电平 ${check.rms}）`);
  }

  // 标题由独立随机流挑选：本批次与历史上用过的都会避开，实在用尽则加罗马数字后缀
  const trng = engine.mulberry32(engine.hashSeed('title-' + seed));
  const pool = lyricsEngine.TITLES;
  const taken = new Set([...existingTitles.map((t) => t.zh), ...(buildTrack.used || [])]);
  let base = null;
  for (let attempt = 0; attempt < pool.length && !base; attempt++) {
    const cand = pool[Math.floor(trng() * pool.length)];
    if (!taken.has(cand.zh)) base = cand;
  }
  if (!base) base = pool[Math.floor(trng() * pool.length)];

  let titleZh = base.zh;
  let titleEn = base.en;
  let suffixLevel = 0;
  while (taken.has(titleZh)) {
    const roman = ['II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][suffixLevel] || String(suffixLevel + 2);
    titleZh = `${base.zh} ${roman}`;
    titleEn = `${base.en} ${roman}`;
    suffixLevel++;
  }
  (buildTrack.used || (buildTrack.used = new Set())).add(titleZh);
  const title = { zh: titleZh, en: titleEn };

  const idBase = slugify(`${dateStr}-${ordinal}-${title.en}`).slice(0, 48);
  const db = readDb();
  let id = idBase;
  if (db.tracks.some((t) => t.id === id)) id = `${idBase}-${ordinal}`;

  // 封面
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const coverRel = `img/covers/${id}.png`;
  covers.makeCover(path.join(ROOT, 'public', coverRel), engine.hashSeed(id), COVER_VARIANTS[idx % COVER_VARIANTS.length]);

  // 转 MP3
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  const mp3Abs = path.join(AUDIO_DIR, `${id}.mp3`);
  const meta = {
    title: `${title.zh} ${title.en}`,
    artist: '寰宇音乐台',
    album: '寰宇原创音乐集',
    genre: plan.style.genre.en,
    date: String(new Date().getFullYear()),
    comment: '由寰宇音乐台 AI 作曲引擎实时合成的纯音乐',
    cover: path.join(ROOT, 'public', coverRel)
  };
  toMp3(rend.file, mp3Abs, meta, bitrate);
  const audioRel = `audio/${id}.mp3`;
  const bytes = fs.statSync(mp3Abs).size;

  const isSong = kind === 'song';
  const seq = new D.Seq(plan.bpm, engine.SR);
  const descZh = isSong
    ? `《${title.zh}》是一首${plan.style.genre.zh}纯音乐，${plan.bpm} BPM，${plan.keyName}。它原本写有一条人声旋律，如今改由主奏乐器完整奏出——全曲无人声，和声、旋律、音色与混音都由算法在发布当天现场生成，没有一个采样来自别处。`
    : `《${title.zh}》是一首${plan.style.genre.zh}纯音乐，${plan.bpm} BPM，${plan.keyName}。全曲由寰宇音乐台 AI 作曲引擎实时合成：和声、旋律、音色与混音都由算法在发布当天现场生成，没有一个采样来自别处。`;
  const descEn = isSong
    ? `"${title.en}" is an instrumental ${plan.style.genre.en} piece at ${plan.bpm} BPM in ${plan.keyName}. The melodic line was originally written for a voice and is now played end to end by the lead instrument — no vocal at all. Harmony, melody, timbre and mix are all generated by algorithm on the day it is published — every note is synthesized from code, none borrowed.`
    : `"${title.en}" is an instrumental ${plan.style.genre.en} piece at ${plan.bpm} BPM in ${plan.keyName}. Harmony, melody, timbre and mix are all generated by algorithm on the day it is published — every note is synthesized from code, none borrowed.`;

  const track = {
    id,
    kind: 'instrumental',
    title: mk(title.zh, title.en),
    subtitle: mk(`纯音乐 · ${plan.style.genre.zh}`, `Instrumental · ${plan.style.genre.en}`),
    description: mk(descZh, descEn),
    credits: mk('作曲 / 编曲 / 混音：寰宇音乐台 AI 作曲引擎', 'Composed, arranged and mixed by the Huanyu Music AI engine'),
    cover: coverRel,
    audio: audioRel,
    duration: Math.round(rend.duration * 10) / 10,
    bpm: plan.bpm,
    musicalKey: plan.keyName,
    genre: plan.style.genre,
    moods: plan.style.moods,
    peaks: rend.peaks,
    lyrics: null,
    plays: 0,
    likes: 0,
    featured: false,
    releasedAt: today(),
    generatedBy: { engine: 'huanyu-compose-engine', seed, style: plan.style.id }
  };

  return { track, bytes, plan, check, wavFile: rend.file };
}

/* ---------------- 同步到 GitHub ---------------- */
function gitEnv() {
  const env = { ...process.env };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  return env;
}

function run(cmd, args, cwd) {
  return spawnSync(cmd, args, { cwd, env: gitEnv(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function gitPushRetry(args, cwd, times = 3) {
  for (let i = 1; i <= times; i++) {
    const r = run('git', ['-c', 'http.proxy=', '-c', 'https.proxy=', ...args], cwd);
    const out = (r.stdout || '') + (r.stderr || '');
    if (r.status === 0) return true;
    console.warn(`  推送第 ${i} 次失败：${out.trim().split('\n').slice(-2).join(' ')}`);
    if (i < times) spawnSync('ping', ['-n', '20', '127.0.0.1'], { stdio: 'ignore' });
  }
  return false;
}

function syncOnline(dateStr, produced) {
  console.log('\n[同步] 重新导出静态站…');
  const b = run(process.execPath, [path.join(ROOT, 'scripts', 'build-static.js')], ROOT);
  if (b.status !== 0) {
    console.error('[同步] 静态导出失败：' + (b.stderr || ''));
    return false;
  }

  const files = ['data/tracks.json', ...produced.map((p) => 'public/' + p.track.audio), ...produced.map((p) => 'public/' + p.track.cover)];
  console.log('[同步] 提交到 main 分支…');
  run('git', ['add', '--', ...files], ROOT);
  const msg = `每日新作 ${dateStr}：${produced.length} 首作品入库`;
  const c = run('git', ['commit', '-m', msg], ROOT);
  if (c.status !== 0) {
    const out = (c.stdout || '') + (c.stderr || '');
    if (!/nothing to commit/i.test(out)) console.warn('[同步] commit 异常：' + out.trim().split('\n').slice(-2).join(' '));
  }
  gitPushRetry(['push', 'origin', 'main'], ROOT);

  console.log('[同步] 推送静态站到 gh-pages…');
  const distDir = path.join(ROOT, 'dist');
  run('git', ['init', '-b', 'main'], distDir);
  run('git', ['remote', 'remove', 'origin'], distDir);
  run('git', ['remote', 'add', 'origin', REMOTE], distDir);
  run('git', ['add', '-A'], distDir);
  const dc = run('git', ['commit', '-m', `Pages update ${dateStr}（共 ${produced.length} 首新作）`], distDir);
  if (dc.status !== 0) {
    const out = (dc.stdout || '') + (dc.stderr || '');
    if (!/nothing to commit/i.test(out)) console.warn('[同步] dist commit 异常：' + out.trim().split('\n').slice(-2).join(' '));
  }
  const ok = gitPushRetry(['push', '-f', 'origin', 'main:gh-pages'], distDir);
  console.log(ok ? '[同步] 线上已更新：https://siinaiiovalle-droid.github.io/huanyu_music/' : '[同步] gh-pages 推送未完成，请稍后手动重试');
  return ok;
}

/* ---------------- 主流程 ---------------- */
function main() {
  const args = parseArgs(process.argv.slice(2));
  const dateStr = args.date || today();
  const nInst = Number(args.instrumental ?? 3);
  const nSong = Number(args.songs ?? 0);
  const bitrate = args.bitrate || '128k';
  const doPush = args.push !== '0' && args['no-push'] !== '1' && args['no-push'] !== 'true';

  console.log(`=== 寰宇音乐台 · 每日生产 ${dateStr} ===`);
  console.log(`  纯音乐 ${nInst} 首，歌曲 ${nSong} 首，MP3 码率 ${bitrate}\n`);

  const started = Date.now();
  const db = readDb();
  const produced = [];
  const failures = [];

  const existingTitles = db.tracks.map((t) => (t.title || {})).filter(Boolean);
  const jobs = [];
  for (let i = 0; i < nInst; i++) jobs.push({ kind: 'instrumental', i, ordinal: jobs.length + 1 });
  for (let i = 0; i < nSong; i++) jobs.push({ kind: 'song', i, ordinal: jobs.length + 1 });

  for (const job of jobs) {
    const label = job.kind === 'instrumental' ? '纯音乐' : '歌曲';
    console.log(`\n──── ${label} ${job.i + 1}/${job.kind === 'instrumental' ? nInst : nSong}（当日第 ${job.ordinal} 首）────`);
    try {
      const r = buildTrack(job.kind, job.i, dateStr, bitrate, job.ordinal, existingTitles);
      // 每天第一首歌作为首页精选
      if (r.track.kind === 'song' && !produced.some((p) => p.track.kind === 'song')) r.track.featured = true;
      db.tracks.unshift(r.track);
      produced.push(r);
      const mm = String(Math.floor(r.track.duration / 60)).padStart(2, '0');
      const ss = String(Math.round(r.track.duration % 60)).padStart(2, '0');
      console.log(`  ✔ ${rpad(r.track.title.zh, 10)} ${mm}:${ss}  ${r.track.bpm}BPM  ${r.track.musicalKey}  ${(r.bytes / 1024 / 1024).toFixed(2)}MB  ${r.plan.style.genre.zh}`);
    } catch (e) {
      console.error(`  ✖ ${label} ${job.i + 1} 生产失败：${e.message}`);
      failures.push({ kind: job.kind, index: job.i, error: e.message });
    }
  }

  // 写回曲库（每首都已在磁盘上，失败不影响前面成果）
  // 同 id 覆盖：重复执行同一天任务时替换而不是堆积重复条目
  const map = new Map();
  for (const t of db.tracks) map.set(t.id, t);
  for (const p of produced) map.set(p.track.id, { ...(map.get(p.track.id) || {}), ...p.track, plays: (map.get(p.track.id) || {}).plays || 0, likes: (map.get(p.track.id) || {}).likes || 0 });
  db.tracks = [...map.values()].sort((a, b) => String(b.releasedAt || '').localeCompare(String(a.releasedAt || '')) || b.id.localeCompare(a.id));
  db.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');

  let synced = false;
  if (produced.length && doPush) synced = syncOnline(dateStr, produced);

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  const summary = {
    date: dateStr, startedAt: new Date(started).toISOString(), minutes: Number(minutes),
    produced: produced.map((p) => ({ id: p.track.id, title: p.track.title.zh, kind: p.track.kind, duration: p.track.duration, bpm: p.track.bpm, style: p.plan.style.id, bytes: p.bytes })),
    failures, totalTracks: db.tracks.length, pushed: synced
  };
  try {
    fs.mkdirSync(BUILD, { recursive: true });
    fs.writeFileSync(REPORT_FILE, JSON.stringify(summary, null, 2), 'utf8');
  } catch (e) { /* ignore */ }

  console.log('\n=== 每日生产完成 ===');
  console.log(`  新增作品：${produced.length} 首（失败 ${failures.length} 首）`);
  console.log(`  曲库总数：${db.tracks.length} 首`);
  console.log(`  总耗时  ：${minutes} 分钟`);
  if (failures.length) console.log(`  失败清单：${failures.map((f) => `${f.kind}#${f.index + 1}`).join('、')}`);
  console.log(`  报告    ：${path.relative(ROOT, REPORT_FILE)}`);
  console.log('  提示    ：本地服务需重启才会读到新曲库（npm start）');
  if (!doPush) console.log('  提示    ：本次未推送（--no-push），可手动 npm run sync:pages 上线');
}

main();
