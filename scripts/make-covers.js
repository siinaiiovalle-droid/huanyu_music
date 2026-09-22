'use strict';
/**
 * 程序化生成专辑封面（不依赖任何图片素材与第三方库）。
 */
const path = require('path');
const { Canvas, rng, mixColor } = require('./lib/png');

const SIZE = 800;
const OUT_DIR = path.join(__dirname, '..', 'public', 'img', 'covers');

/** 星空：径向渐变 + 星点 + 同心环 + 声波线 */
function starfield(file, seed = 7) {
  const c = new Canvas(SIZE, SIZE);
  const rand = rng(seed);
  const cx = SIZE * 0.5, cy = SIZE * 0.52;
  const top = [8, 12, 34];
  const bottom = [86, 61, 158];
  const glow = [120, 210, 255];
  c.paint((x, y) => {
    const d = Math.hypot(x - cx, y - cy) / (SIZE * 0.72);
    const t = Math.min(1, Math.pow(d, 0.85));
    const col = mixColor(bottom, top, t);
    // 中心冷光辉
    const halo = Math.max(0, 1 - d * 1.6);
    return [
      Math.min(255, col[0] + glow[0] * halo * 0.55),
      Math.min(255, col[1] + glow[1] * halo * 0.55),
      Math.min(255, col[2] + glow[2] * halo * 0.55)
    ];
  });
  // 星点
  for (let i = 0; i < 420; i++) {
    const x = rand() * SIZE, y = rand() * SIZE;
    const r = rand() * 1.9 + 0.4;
    const a = 90 + rand() * 165;
    const tint = rand();
    const col = tint > 0.8 ? [255, 226, 190] : tint > 0.5 ? [190, 226, 255] : [255, 255, 255];
    c.circle(x, y, r, col[0], col[1], col[2], a);
  }
  // 大亮星
  for (let i = 0; i < 10; i++) {
    const x = rand() * SIZE, y = rand() * SIZE;
    c.circle(x, y, 3.4, 255, 255, 255, 235);
    c.ring(x, y, 9, 1.4, 200, 232, 255, 90);
  }
  // 同心环（声波）
  for (let i = 0; i < 5; i++) {
    const r = 120 + i * 74;
    c.ring(cx, cy, r, 2.2 - i * 0.25, 130, 190, 255, 120 - i * 16);
  }
  // 声波曲线
  const drawWave = (amp, freq, phase, color, width, alpha) => {
    c.wave((u) => {
      const v = Math.sin(u * Math.PI * 2 * freq + phase) * Math.exp(-Math.pow((u - 0.5) * 2.4, 2));
      return v * amp;
    }, color, width, alpha);
  };
  drawWave(0.55, 3, 0.0, [150, 220, 255], 5, 210);
  drawWave(0.34, 5, 1.1, [180, 150, 255], 3.5, 180);
  drawWave(0.2, 8, 2.3, [255, 210, 160], 2.5, 150);
  c.vignette(0.5);
  return c.save(file);
}

/** 日出：暖色渐变 + 太阳 + 声波环 + 飞鸟点缀 */
function sunrise(file, seed = 21) {
  const c = new Canvas(SIZE, SIZE);
  const rand = rng(seed);
  const cx = SIZE * 0.5;
  const sunY = SIZE * 0.56;
  const bands = [
    [0.0, [255, 214, 120]],
    [0.32, [255, 140, 96]],
    [0.6, [214, 76, 120]],
    [0.82, [88, 42, 128]],
    [1.0, [26, 16, 52]]
  ];
  c.paint((x, y) => {
    const u = y / SIZE;
    let i = 0;
    while (i < bands.length - 2 && u > bands[i + 1][0]) i++;
    const [p0, c0] = bands[i];
    const [p1, c1] = bands[i + 1];
    const t = Math.min(1, Math.max(0, (u - p0) / (p1 - p0)));
    return mixColor(c0, c1, t);
  });
  // 太阳与光晕
  for (let r = 300; r > 60; r -= 12) {
    const a = 8 + (300 - r) * 0.28;
    c.circle(cx, sunY, r, 255, 226, 160, a);
  }
  c.circle(cx, sunY, 92, 255, 248, 214, 245);
  // 声波环
  for (let i = 0; i < 6; i++) {
    c.ring(cx, sunY, 110 + i * 56, 2.4 - i * 0.2, 255, 255, 255, 110 - i * 12);
  }
  // 地平线上的波形
  c.wave((u) => Math.sin(u * Math.PI * 2 * 2.4) * 0.5 * Math.exp(-Math.pow((u - 0.5) * 2.2, 2)), [255, 255, 255], 5, 225);
  c.wave((u) => Math.sin(u * Math.PI * 2 * 4.1 + 1.2) * 0.3 * Math.exp(-Math.pow((u - 0.5) * 2.6, 2)), [255, 236, 200], 3, 190);
  // 飞鸟
  for (let i = 0; i < 7; i++) {
    const bx = 90 + rand() * (SIZE - 180);
    const by = 90 + rand() * 240;
    const s = 6 + rand() * 7;
    for (let k = 0; k < 12; k++) {
      const t = k / 11;
      const px = bx + (t - 0.5) * s * 2.4;
      const py = by - Math.sin(t * Math.PI) * s * 0.9;
      c.circle(px, py, 1.7, 40, 24, 60, 170);
    }
  }
  c.vignette(0.45);
  return c.save(file);
}

/** 后台上传作品时的默认封面：按 id 生成确定性的渐变声波图 */
function autoCover(file, seed = 1, label = '') {
  const c = new Canvas(SIZE, SIZE);
  const rand = rng(seed || 1);
  const hue = (seed * 47) % 360;
  const c1 = hsl(hue, 0.62, 0.2);
  const c2 = hsl((hue + 48) % 360, 0.7, 0.52);
  const c3 = hsl((hue + 120) % 360, 0.55, 0.72);
  c.paint((x, y) => {
    const t = (x / SIZE) * 0.55 + (y / SIZE) * 0.45;
    const col = t < 0.5 ? mixColor(c1, c2, t * 2) : mixColor(c2, c3, (t - 0.5) * 2);
    return col;
  });
  const cx = SIZE * 0.5, cy = SIZE * 0.5;
  for (let i = 0; i < 6; i++) c.ring(cx, cy, 90 + i * 62, 2.4 - i * 0.2, 255, 255, 255, 110 - i * 13);
  c.wave((u) => Math.sin(u * Math.PI * 2 * 3 + seed) * 0.42 * Math.exp(-Math.pow((u - 0.5) * 2.2, 2)), [255, 255, 255], 5, 220);
  c.wave((u) => Math.sin(u * Math.PI * 2 * 5.5 + seed * 2) * 0.22, [255, 255, 255], 2.5, 150);
  for (let i = 0; i < 160; i++) {
    const x = rand() * SIZE, y = rand() * SIZE;
    c.circle(x, y, rand() * 1.8 + 0.3, 255, 255, 255, 60 + rand() * 120);
  }
  c.vignette(0.45);
  return c.save(file);
}

function hsl(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)))));
  };
  return [f(0), f(8), f(4)];
}

function build() {
  const a = starfield(path.join(OUT_DIR, 'starfield-overture.png'));
  const b = sunrise(path.join(OUT_DIR, 'world-in-sync.png'));
  console.log(`[封面] 星海序曲 ${(a / 1024).toFixed(0)}KB，世界同频 ${(b / 1024).toFixed(0)}KB → ${OUT_DIR}`);
  return { starfield: 'img/covers/starfield-overture.png', sunrise: 'img/covers/world-in-sync.png' };
}

if (require.main === module) build();
module.exports = { build, starfield, sunrise, autoCover, SIZE };
