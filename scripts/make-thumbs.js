'use strict';
/**
 * 封面分档压缩：把 800×800 的无损 PNG 转成多档 JPEG，按展示尺寸选用，避免小图拉大图。
 *
 *   img/covers/x.png         800×800 原图（保留，详情页"查看原图" / 下载用）
 *   img/covers/large/x.jpg   720×720 详情页大图、首页精选大卡
 *   img/covers/thumbs/x.jpg  320×320 卡片、推荐位
 *   img/covers/tiny/x.jpg     96×96  播放条、播放列表、后台列表
 *
 *   node scripts/make-thumbs.js            # 只补缺失的
 *   node scripts/make-thumbs.js --force    # 全部重做
 *   node scripts/make-thumbs.js --check    # 只体检，不生成
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { findFfmpeg } = require('./lib/ffmpeg');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const COVER_DIR = path.join(PUBLIC, 'img', 'covers');

const VARIANTS = [
  { key: 'tiny', dir: 'tiny', size: 96, q: 2 },
  { key: 'thumb', dir: 'thumbs', size: 320, q: 3 },
  { key: 'large', dir: 'large', size: 720, q: 4 }
];

const has = (name) => process.argv.slice(2).includes(`--${name}`);
const rel = (p) => path.relative(PUBLIC, p).split(path.sep).join('/');

/** 读 PNG 头拿真实宽高，避免非正方形封面被拉伸 */
function pngSize(file) {
  try {
    const b = fs.readFileSync(file).slice(0, 32);
    if (b.readUInt32BE(1) !== 0x89504e47) return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch (e) {
    return null;
  }
}

function ffmpegArgs(exe, src, dest, v, srcSize) {
  const square = srcSize && srcSize.w === srcSize.h;
  const vf = square
    ? `scale=${v.size}:${v.size}:flags=lanczos`
    : `scale=${v.size}:${v.size}:force_original_aspect_ratio=increase:flags=lanczos,crop=${v.size}:${v.size}`;
  return ['-y', '-hide_banner', '-loglevel', 'error', '-i', src, '-vf', vf, '-q:v', String(v.q), '-pix_fmt', 'yuvj420p', dest];
}

/**
 * 为一封面生成各档 JPEG
 * @param {string} pngAbs 封面 PNG 绝对路径
 * @param {{force?:boolean, variants?:Array}} [opts]
 * @returns {Record<string,string>|null} { tiny, thumb, large } → 相对 public 的路径
 */
function makeThumbs(pngAbs, opts = {}) {
  const exe = findFfmpeg();
  if (!exe || !fs.existsSync(pngAbs)) return null;
  const variants = opts.variants || VARIANTS;
  const srcSize = pngSize(pngAbs);
  const base = path.basename(pngAbs, path.extname(pngAbs));
  const out = {};
  for (const v of variants) {
    const dir = path.join(COVER_DIR, v.dir);
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `${base}.jpg`);
    if (!opts.force && fs.existsSync(dest) && fs.statSync(dest).size > 512) {
      out[v.key] = rel(dest);
      continue;
    }
    try {
      execFileSync(exe, ffmpegArgs(exe, pngAbs, dest, v, srcSize), {
        stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1024 * 1024
      });
    } catch (e) {
      continue;
    }
    if (fs.existsSync(dest) && fs.statSync(dest).size > 512) out[v.key] = rel(dest);
  }
  return Object.keys(out).length ? out : null;
}

/** 清掉没有对应 PNG 的过期 JPEG */
function prune() {
  const alive = new Set(fs.readdirSync(COVER_DIR).filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).map((f) => path.basename(f, path.extname(f))));
  let removed = 0;
  for (const v of VARIANTS) {
    const dir = path.join(COVER_DIR, v.dir);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!alive.has(path.basename(f, path.extname(f)))) {
        fs.unlinkSync(path.join(dir, f));
        removed++;
      }
    }
  }
  return removed;
}

function main() {
  if (!fs.existsSync(COVER_DIR)) {
    console.error('封面目录不存在：' + COVER_DIR);
    process.exit(1);
  }
  const exe = findFfmpeg();
  if (!exe) {
    console.error('未找到 ffmpeg，无法压缩封面。可手动安装后重试。');
    process.exit(1);
  }

  const pngs = fs.readdirSync(COVER_DIR).filter((f) => f.toLowerCase().endsWith('.png'));
  const check = has('check');
  let saved = 0;
  let missing = 0;
  const kb = (n) => `${(n / 1024).toFixed(0)}KB`;

  for (const f of pngs) {
    const png = path.join(COVER_DIR, f);
    const pngBytes = fs.statSync(png).size;
    if (check) {
      for (const v of VARIANTS) {
        const dest = path.join(COVER_DIR, v.dir, `${path.basename(f, '.png')}.jpg`);
        if (!fs.existsSync(dest)) missing++;
        else saved += pngBytes - fs.statSync(dest).size;
      }
      continue;
    }
    const made = makeThumbs(png, { force: has('force') });
    const t = path.join(COVER_DIR, 'thumbs', `${path.basename(f, '.png')}.jpg`);
    const size = fs.existsSync(t) ? fs.statSync(t).size : 0;
    saved += Math.max(0, pngBytes - size);
    console.log(`  ${f.padEnd(46)} ${kb(pngBytes).padStart(7)} → 缩略图 ${kb(size).padStart(6)}  ${made && made.large ? '' : '（缺少部分档位）'}`);
  }

  const removed = check ? 0 : prune();
  console.log(`\n共 ${pngs.length} 张封面${check ? '（仅体检）' : ''}：` +
    (check ? `缺失 ${missing} 个档位` : `已清理孤儿缩略图 ${removed} 个`) +
    `，按缩略图口径节省约 ${(saved / 1024 / 1024).toFixed(2)}MB`);
}

module.exports = { makeThumbs, VARIANTS };

if (require.main === module) main();
