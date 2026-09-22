#!/usr/bin/env node
'use strict';
/**
 * 命令行发布新作品：npm run add -- --file 你的音乐.mp3 --title "作品名"
 *
 * 两种模式：
 *   1) 本地入库（默认）：把音频复制进 public/audio/，自动生成封面，写入 data/tracks.json。
 *      注意：服务在运行时会把数据缓存在内存里，改完请重启服务（npm start）。
 *   2) 远程上传（--server http://localhost:3000）：登录后台后走 multipart 接口上传，无需重启。
 *
 * 零第三方依赖，仅需 Node.js 18+；可选依赖 ffmpeg（用于自动推算时长与波形）。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { URL } = require('url');
const { execFileSync } = require('child_process');
const { findFfmpeg } = require('./lib/ffmpeg');
const { autoCover } = require('./make-covers');

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'tracks.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const AUDIO_DIR = path.join(PUBLIC_DIR, 'audio');
const COVER_DIR = path.join(PUBLIC_DIR, 'img', 'covers');
const LANGS = ['zh', 'en', 'es', 'fr', 'ja', 'ar'];
const AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];
const IMG_EXT = ['.png', '.jpg', '.jpeg', '.webp'];

/* ---------------- 参数 ---------------- */
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

function usage() {
  console.log(`
  用法：npm run add -- --file <音频文件> --title <作品名> [选项]

  必填
    --file          音频文件路径（mp3 / wav / ogg / m4a / flac）
    --title         作品名称

  常用
    --subtitle      一句话副标题
    --desc          作品简介
    --kind          song（歌曲，默认） | instrumental（纯音乐）
    --genre         风格，如 "流行"
    --bpm           速度，如 92
    --key           调性，如 "A 小调"
    --moods         情绪标签，逗号分隔，如 "温暖,辽阔"
    --cover         封面图片（png/jpg），留空则自动程序化生成
    --lyrics        歌词 JSON 文件路径（{ lines: [{ time, zh, en }] }）
    --id            自定义作品 id（默认由标题生成）
    --duration      手动指定时长（秒），不填则用 ffmpeg 自动推算
    --featured      设为首页精选

  远程上传（服务运行中时使用，无需重启）
    --server http://localhost:3000 --password music888

  示例
    npm run add -- --file D:/music/新歌.mp3 --title "海风" --kind song --genre 流行 --bpm 96
    npm run add -- --file D:/music/新歌.mp3 --title "海风" --server http://localhost:3000
`);
}

function slugify(text, fallback = 'track') {
  const s = String(text || '').trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 100000;
}

/* ---------------- 音频分析（可选，依赖 ffmpeg） ---------------- */
function probeDuration(file) {
  const exe = findFfmpeg();
  if (!exe) return 0;
  let err = '';
  try {
    execFileSync(exe, ['-hide_banner', '-i', file], { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 << 20 });
  } catch (e) {
    err = (e.stderr ? e.stderr.toString('utf8') : '') || '';
  }
  const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(err);
  if (!m) return 0;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 10) / 10;
}

function computePeaks(file, n = 240) {
  const exe = findFfmpeg();
  if (!exe) return [];
  let pcm;
  try {
    pcm = execFileSync(exe, ['-v', 'error', '-i', file, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], {
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 96 * 1024 * 1024
    });
  } catch (e) { return []; }
  const total = Math.floor(pcm.length / 2);
  if (total < n) return [];
  const peaks = new Array(n).fill(0);
  const size = total / n;
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * size);
    const to = Math.min(total, Math.floor((i + 1) * size));
    let peak = 0;
    for (let j = from; j < to; j++) {
      const v = Math.abs(pcm.readInt16LE(j * 2)) / 32768;
      if (v > peak) peak = v;
    }
    peaks[i] = Math.round(peak * 1000) / 1000;
  }
  const max = Math.max(...peaks, 0.001);
  return peaks.map((p) => Math.round((p / max) * 1000) / 1000);
}

/* ---------------- multipart（远程模式） ---------------- */
function buildMultipart(fields, files) {
  const b = '----huanyu' + Date.now().toString(36);
  const parts = [];
  for (const k of Object.keys(fields)) {
    const v = fields[k];
    if (v == null || v === '') continue;
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  for (const f of files) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${path.basename(f.file)}"\r\nContent-Type: ${f.type || 'application/octet-stream'}\r\n\r\n`));
    parts.push(fs.readFileSync(f.file));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}

function request(method, url, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? require('https') : http;
    const req = mod.request({
      protocol: u.protocol, hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search, method, headers
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, raw, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/* ---------------- 主流程 ---------------- */
async function remotePublish(args, audioFile, coverFile) {
  const base = String(args.server).replace(/\/+$/, '');
  const password = args.password || process.env.ADMIN_PASSWORD || 'music888';
  const login = await request('POST', base + '/api/admin/login', {
    body: Buffer.from(JSON.stringify({ password })),
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(JSON.stringify({ password })) }
  });
  if (login.status !== 200) throw new Error('登录失败：' + (login.json && login.json.error ? login.json.error : login.status));
  const token = login.json.token;

  const fields = {
    title: args.title, subtitle: args.subtitle || '', description: args.desc || '',
    kind: args.kind === 'instrumental' ? 'instrumental' : 'song',
    genre: args.genre || '', bpm: args.bpm || '', musicalKey: args.key || '',
    featured: args.featured ? '1' : '', id: args.id || '',
    duration: args.duration || String(probeDuration(audioFile) || ''),
    credits: args.credits || '寰宇音乐台'
  };
  const files = [{ field: 'audio', file: audioFile }];
  if (coverFile) files.push({ field: 'cover', file: coverFile });
  const mp = buildMultipart(fields, files);
  const res = await request('POST', base + '/api/admin/tracks', {
    body: mp.body,
    headers: { 'Content-Type': mp.contentType, Authorization: 'Bearer ' + token, 'Content-Length': mp.body.length }
  });
  if (res.status !== 201) throw new Error('上传失败：' + (res.json && res.json.error ? res.json.error : res.status + ' ' + res.raw.slice(0, 300)));
  console.log(`\n  ✔ 已发布到 ${base}：${res.json.track.title.zh || args.title}（id: ${res.json.track.id}）`);
  console.log(`    详情 ${base}/track.html?id=${encodeURIComponent(res.json.track.id)}\n`);
}

function localPublish(args, audioFile, coverFile) {
  const title = args.title;
  let id = slugify(args.id || title, 'track-' + Date.now().toString(36));
  let db = { tracks: [] };
  try { db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch (e) { db = { tracks: [] }; }
  if (!Array.isArray(db.tracks)) db.tracks = [];
  if (db.tracks.some((t) => t.id === id)) id = `${id}-${Date.now().toString(36)}`;

  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(COVER_DIR, { recursive: true });

  const aExt = path.extname(audioFile).toLowerCase();
  const audioRel = `audio/${id}${aExt}`;
  fs.copyFileSync(audioFile, path.join(PUBLIC_DIR, audioRel));

  let coverRel = '';
  if (coverFile) {
    const cExt = path.extname(coverFile).toLowerCase();
    coverRel = `img/covers/${id}${cExt}`;
    fs.copyFileSync(coverFile, path.join(PUBLIC_DIR, coverRel));
  } else {
    coverRel = `img/covers/${id}.png`;
    autoCover(path.join(PUBLIC_DIR, coverRel), hashSeed(id), title);
  }

  const duration = Number(args.duration) || probeDuration(audioFile);
  const peaks = computePeaks(audioFile, 240);
  const moods = String(args.moods || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  const mk = (v) => { const o = {}; for (const l of LANGS) o[l] = v || ''; return o; };

  let lyrics = null;
  if (args.lyrics) {
    try {
      const raw = JSON.parse(fs.readFileSync(args.lyrics, 'utf8'));
      lyrics = raw.lines ? raw : { lang: raw.lang || 'zh', languages: raw.languages || ['zh'], lines: raw.lines || [] };
    } catch (e) { console.warn('[警告] 歌词文件解析失败，已忽略：' + e.message); }
  }

  const track = {
    id,
    kind: args.kind === 'instrumental' ? 'instrumental' : 'song',
    title: mk(title),
    subtitle: mk(args.subtitle || ''),
    description: mk(args.desc || ''),
    credits: mk(args.credits || '寰宇音乐台'),
    cover: coverRel,
    audio: audioRel,
    duration,
    bpm: Number(args.bpm) || 0,
    musicalKey: args.key || '',
    genre: { zh: args.genre || '', en: args.genreEn || args.genre || '' },
    moods: { zh: moods, en: moods },
    peaks,
    lyrics,
    plays: 0,
    likes: 0,
    featured: !!args.featured,
    releasedAt: new Date().toISOString().slice(0, 10)
  };

  db.tracks.unshift(track);
  db.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');

  const min = Math.floor(duration / 60), sec = Math.round(duration % 60);
  console.log('\n  ── 已入库 ─────────────────────────────');
  console.log(`  作品    ${title}（${track.kind === 'instrumental' ? '纯音乐' : '歌曲'}）`);
  console.log(`  id      ${id}`);
  console.log(`  音频    public/${audioRel}`);
  console.log(`  封面    public/${coverRel}${coverFile ? '' : '（自动生成）'}`);
  console.log(`  时长    ${duration ? `${min}:${String(sec).padStart(2, '0')}` : '未知（未安装 ffmpeg 时请加 --duration）'}`);
  console.log(`  波形    ${peaks.length ? peaks.length + ' 个采样点' : '未提供（前台会自动生成占位波形）'}`);
  console.log('  ──────────────────────────────────────');
  console.log('  提示：服务在运行时会把数据缓存在内存里，请重启服务（npm start）后刷新页面。');
  console.log(`  或改用远程上传（无需重启）：npm run add -- --file "${audioFile}" --title "${title}" --server http://localhost:3000\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.h || !args.file) { usage(); process.exit(args.file ? 0 : 1); }

  const audioFile = path.resolve(args.file);
  if (!fs.existsSync(audioFile)) { console.error('找不到音频文件：' + audioFile); process.exit(1); }
  if (!AUDIO_EXT.includes(path.extname(audioFile).toLowerCase())) {
    console.error(`不支持的音频格式：${path.extname(audioFile)}（支持 ${AUDIO_EXT.join(' / ')}）`);
    process.exit(1);
  }
  args.title = args.title || path.basename(audioFile, path.extname(audioFile));

  let coverFile = null;
  if (args.cover) {
    coverFile = path.resolve(args.cover);
    if (!fs.existsSync(coverFile)) { console.error('找不到封面文件：' + coverFile); process.exit(1); }
    if (!IMG_EXT.includes(path.extname(coverFile).toLowerCase())) {
      console.error(`不支持的图片格式：${path.extname(coverFile)}（支持 ${IMG_EXT.join(' / ')}）`);
      process.exit(1);
    }
  }

  const task = args.server ? remotePublish(args, audioFile, coverFile) : Promise.resolve(localPublish(args, audioFile, coverFile));
  task.catch((e) => { console.error('\n  ✖ ' + e.message + '\n'); process.exit(1); });
}

main();
