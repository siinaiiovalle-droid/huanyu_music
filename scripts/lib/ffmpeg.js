'use strict';
/**
 * 定位并调用 ffmpeg（用于把 WAV 编码为 MP3，减小网页端体积）。
 * 找不到 ffmpeg 时返回 null，调用方自动降级为直接发布 WAV。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function candidates() {
  const list = [];
  const env = process.env;
  const localAppData = env.LOCALAPPDATA || '';
  list.push(path.join(localAppData, 'Microsoft', 'WinGet', 'Packages'));
  list.push(path.join(localAppData, 'Programs'));
  list.push(path.join(localAppData, 'WinGet', 'Links', 'ffmpeg.exe'));
  list.push(path.join(env.ProgramFiles || '', 'ffmpeg', 'bin', 'ffmpeg.exe'));
  return list;
}

let cached = undefined;

function findFfmpeg() {
  if (cached !== undefined) return cached;
  // 1) PATH 中查找
  try {
    const out = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['ffmpeg'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const p = out.split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (p && fs.existsSync(p)) { cached = p; return cached; }
  } catch (e) { /* ignore */ }
  // 2) 常见安装目录
  for (const base of candidates()) {
    try {
      if (base.endsWith('.exe')) {
        if (fs.existsSync(base)) { cached = base; return cached; }
        continue;
      }
      if (!fs.existsSync(base)) continue;
      const found = searchDir(base, 3);
      if (found) { cached = found; return cached; }
    } catch (e) { /* ignore */ }
  }
  cached = null;
  return cached;
}

function searchDir(dir, depth) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isFile() && e.name.toLowerCase() === 'ffmpeg.exe') return full;
  }
  if (depth > 0) {
    for (const e of entries) {
      if (e.isDirectory()) {
        const hit = searchDir(path.join(dir, e.name), depth - 1);
        if (hit) return hit;
      }
    }
  }
  return null;
}

/**
 * 把 WAV 编码成 MP3
 * @returns {string|null} 输出路径，失败返回 null
 */
function toMp3(wavFile, mp3File, meta = {}, bitrate = '192k') {
  const exe = findFfmpeg();
  if (!exe) return null;
  fs.mkdirSync(path.dirname(mp3File), { recursive: true });
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', wavFile];
  if (meta.cover && fs.existsSync(meta.cover)) args.push('-i', meta.cover);
  if (meta.cover && fs.existsSync(meta.cover)) {
    args.push('-map', '0:a', '-map', '1:v', '-c:v', 'mjpeg', '-id3v2_version', '3',
      '-metadata:s:v', 'title=Album cover', '-metadata:s:v', 'comment=Cover (front)');
  } else {
    args.push('-map', '0:a');
  }
  if (meta.title) args.push('-metadata', `title=${meta.title}`);
  if (meta.artist) args.push('-metadata', `artist=${meta.artist}`);
  if (meta.album) args.push('-metadata', `album=${meta.album}`);
  if (meta.genre) args.push('-metadata', `genre=${meta.genre}`);
  if (meta.date) args.push('-metadata', `date=${meta.date}`);
  if (meta.comment) args.push('-metadata', `comment=${meta.comment}`);
  args.push('-codec:a', 'libmp3lame', '-b:a', bitrate, '-ar', '44100', mp3File);
  try {
    execFileSync(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    const msg = (e.stderr ? e.stderr.toString('utf8') : '') || e.message;
    throw new Error(`ffmpeg 编码失败（${exe}）：${msg.slice(0, 800)}`);
  }
  return fs.existsSync(mp3File) && fs.statSync(mp3File).size > 1024 ? mp3File : null;
}

module.exports = { findFfmpeg, toMp3 };
