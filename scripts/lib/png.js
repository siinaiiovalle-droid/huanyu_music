'use strict';
/**
 * 零依赖 PNG 编码器 + 程序化封面绘制（专辑封面由代码生成，不依赖任何素材）。
 */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** rgba: Buffer，长度 w*h*4 */
function writePNG(file, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return png.length;
}

/** 画布：提供像素级绘制工具 */
class Canvas {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.data = Buffer.alloc(w * h * 4);
  }
  set(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    const srcA = a / 255;
    const dstA = this.data[i + 3] / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) { this.data[i + 3] = 0; return; }
    this.data[i] = Math.round((r * srcA + this.data[i] * dstA * (1 - srcA)) / outA);
    this.data[i + 1] = Math.round((g * srcA + this.data[i + 1] * dstA * (1 - srcA)) / outA);
    this.data[i + 2] = Math.round((b * srcA + this.data[i + 2] * dstA * (1 - srcA)) / outA);
    this.data[i + 3] = Math.round(outA * 255);
  }
  fill(r, g, b, a = 255) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, r, g, b, a);
  }
  /** 逐像素回调：fn(x,y) -> [r,g,b,a] */
  paint(fn) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c[0], c[1], c[2], c[3] ?? 255);
      }
    }
  }
  circle(cx, cy, radius, r, g, b, a = 255) {
    const r0 = Math.max(0, Math.floor(cy - radius - 1));
    const r1 = Math.min(this.h - 1, Math.ceil(cy + radius + 1));
    for (let y = r0; y <= r1; y++) {
      for (let x = Math.max(0, Math.floor(cx - radius - 1)); x <= Math.min(this.w - 1, Math.ceil(cx + radius + 1)); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d <= radius) {
          const edge = Math.min(1, (radius - d) * 1.6);
          this.set(x, y, r, g, b, a * edge);
        }
      }
    }
  }
  ring(cx, cy, radius, width, r, g, b, a = 255) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const diff = Math.abs(d - radius);
        if (diff <= width / 2) {
          const edge = 1 - diff / (width / 2);
          this.set(x, y, r, g, b, a * (0.35 + 0.65 * edge));
        }
      }
    }
  }
  /** 波形线：fn(x) -> y 偏移比例 */
  wave(fn, color, width = 3, alpha = 255) {
    for (let x = 0; x < this.w; x++) {
      const y = this.h / 2 + fn(x / this.w) * this.h * 0.32;
      for (let dy = -width / 2; dy <= width / 2; dy++) {
        this.set(x, Math.round(y + dy), color[0], color[1], color[2], alpha);
      }
    }
  }
  vignette(strength = 0.55) {
    const cx = this.w / 2, cy = this.h / 2;
    const maxD = Math.hypot(cx, cy);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x - cx, y - cy) / maxD;
        const k = 1 - strength * Math.pow(d, 2.2);
        const i = (y * this.w + x) * 4;
        this.data[i] = Math.round(this.data[i] * k);
        this.data[i + 1] = Math.round(this.data[i + 1] * k);
        this.data[i + 2] = Math.round(this.data[i + 2] * k);
      }
    }
  }
  save(file) { return writePNG(file, this.w, this.h, this.data); }
}

/** 简易确定性伪随机 */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return function () {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

module.exports = { Canvas, writePNG, rng, mixColor };
