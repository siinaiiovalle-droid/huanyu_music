'use strict';
/**
 * 极简 WAV 读写（16-bit PCM），零依赖。
 */
const fs = require('fs');

function writeWav(file, channels, sampleRate) {
  const numCh = channels.length;
  const n = channels[0].length;
  const dataSize = n * numCh * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(numCh, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * numCh * 2, 28);
  buf.writeUInt16LE(numCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < numCh; c++) {
      let v = channels[c][i];
      v = v > 1 ? 1 : v < -1 ? -1 : v;
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  fs.mkdirSync(require('path').dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return buf.length;
}

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是 WAV 文件: ' + file);
  }
  let pos = 12;
  let fmt = null;
  let data = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    const body = pos + 8;
    if (id === 'fmt ') {
      fmt = {
        format: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bits: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      data = buf.slice(body, body + size);
    }
    pos = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV 结构不完整: ' + file);
  if (fmt.format !== 1 || fmt.bits !== 16) {
    throw new Error(`仅支持 16-bit PCM（该文件 format=${fmt.format} bits=${fmt.bits}）: ${file}`);
  }
  const frames = Math.floor(data.length / (fmt.channels * 2));
  const chans = [];
  for (let c = 0; c < fmt.channels; c++) chans.push(new Float32Array(frames));
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      chans[c][i] = data.readInt16LE(o) / 32768;
      o += 2;
    }
  }
  return { channels: chans, sampleRate: fmt.sampleRate, numChannels: fmt.channels, frames };
}

function toMono(w) {
  if (w.numChannels === 1) return w.channels[0];
  const n = w.frames;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < w.numChannels; c++) s += w.channels[c][i];
    out[i] = s / w.numChannels;
  }
  return out;
}

/** 线性插值重采样（同时改变音高与时长） */
function resample(src, srcSr, dstSr) {
  if (srcSr === dstSr) return src;
  const ratio = dstSr / srcSr;
  const outLen = Math.max(1, Math.floor(src.length * ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = i / ratio;
    const i0 = Math.floor(x);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const f = x - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
  }
  return out;
}

/** 自适应窗口的时长伸缩（WSOLA 简化版），保持音高不变 */
function timeStretch(src, sr, ratio) {
  // ratio > 1 表示变长
  if (Math.abs(ratio - 1) < 0.02) return src;
  const win = Math.round(sr * 0.04);
  const hopIn = Math.round(win / 2);
  const hopOut = Math.round(hopIn * ratio);
  const outLen = Math.round(src.length * ratio) + win;
  const out = new Float32Array(outLen);
  const norm = new Float32Array(outLen);
  let inPos = 0;
  let outPos = 0;
  while (inPos + win < src.length && outPos + win < outLen) {
    // 相关性搜索（缩小搜索范围以提速）
    let best = 0;
    let bestCorr = -Infinity;
    const search = Math.min(sr * 0.02, src.length - win - inPos - 1);
    const ref = src.subarray(inPos, inPos + win);
    const startSearch = Math.max(0, inPos - Math.floor(search / 2));
    for (let k = startSearch; k <= startSearch + search; k++) {
      let corr = 0;
      for (let j = 0; j < win; j += 4) corr += ref[j] * src[k + j];
      if (corr > bestCorr) { bestCorr = corr; best = k; }
    }
    for (let j = 0; j < win; j++) {
      const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / win);
      out[outPos + j] += src[best + j] * w;
      norm[outPos + j] += w;
    }
    inPos += hopIn;
    outPos += hopOut;
  }
  for (let i = 0; i < outLen; i++) if (norm[i] > 1e-6) out[i] /= norm[i];
  return out.subarray(0, Math.min(outLen, Math.round(src.length * ratio) + hopOut));
}

/** 归一化到指定峰值 */
function normalize(channels, peak = 0.95) {
  let max = 0;
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > max) max = a; }
  if (max > 0) {
    const g = peak / max;
    for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g;
  }
  return max;
}

/**
 * 变调（重采样实现）：rate > 1 音高升高、时长变短；可叠加颤音。
 * 同时完成采样率转换（srcSr → dstSr）。
 */
function pitchShift(src, srcSr, dstSr, rate, opts = {}) {
  const vibRate = opts.vibratoRate || 0;
  const vibDepth = opts.vibratoDepthCents || 0;
  const vibDelay = opts.vibratoDelay ?? 0.12;
  const step0 = rate * (srcSr / dstSr);
  const outLen = Math.max(1, Math.floor(src.length / step0));
  const out = new Float32Array(outLen);
  let pos = 0;
  for (let i = 0; i < outLen; i++) {
    const t = pos / srcSr;
    let step = step0;
    if (vibRate && vibDepth && t > vibDelay) {
      step *= Math.pow(2, (vibDepth / 1200) * Math.sin(2 * Math.PI * vibRate * (t - vibDelay)));
    }
    const i0 = Math.floor(pos);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const f = pos - i0;
    out[i] = src[i0] * (1 - f) + src[i1] * f;
    pos += step;
  }
  return out;
}

/** 裁掉首尾静音，保留少量留白 */
function trimSilence(src, sr, opts = {}) {
  const win = Math.max(8, Math.round(sr * 0.008));
  const count = Math.floor(src.length / win);
  if (count < 2) return src;
  const rms = new Float32Array(count);
  let peak = 0;
  for (let c = 0; c < count; c++) {
    let s = 0;
    for (let i = 0; i < win; i++) { const v = src[c * win + i]; s += v * v; }
    rms[c] = Math.sqrt(s / win);
    if (rms[c] > peak) peak = rms[c];
  }
  if (peak <= 0) return src;
  const thr = peak * (opts.threshold ?? 0.12);
  let a = 0, b = count - 1;
  while (a < count && rms[a] < thr) a++;
  while (b > a && rms[b] < thr) b--;
  const pad = Math.round(sr * (opts.pad ?? 0.015));
  const s0 = Math.max(0, a * win - pad);
  const s1 = Math.min(src.length, (b + 1) * win + pad);
  return src.subarray(s0, s1);
}

/** 基频估计（归一化自相关），用于人声音高校准 */
function estimatePitch(mono, sr, from = 0, to = 1) {
  const s = Math.max(0, Math.floor(mono.length * from));
  const e = Math.min(mono.length, Math.floor(mono.length * to));
  const n = e - s;
  if (n < sr * 0.05) return 0;
  const win = Math.min(n, Math.floor(sr * 0.06));
  // 取能量最高的窗口
  let start = s, bestE = -1;
  for (let p = s; p + win <= e; p += Math.max(1, Math.floor(win / 2))) {
    let en = 0;
    for (let i = 0; i < win; i++) en += mono[p + i] * mono[p + i];
    if (en > bestE) { bestE = en; start = p; }
  }
  if (bestE <= 1e-9) return 0;
  const minLag = Math.floor(sr / 700);
  const maxLag = Math.floor(sr / 80);
  let bestLag = 0;
  let best = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, d1 = 0, d2 = 0;
    for (let i = 0; i < win - lag; i++) {
      const a = mono[start + i], b = mono[start + i + lag];
      num += a * b; d1 += a * a; d2 += b * b;
    }
    const c = num / Math.sqrt(Math.max(1e-9, d1 * d2));
    if (c > best) { best = c; bestLag = lag; }
  }
  return bestLag ? sr / bestLag : 0;
}

/** 计算一段音频的 RMS 电平（dBFS 近似） */
function rms(channels) {
  let sum = 0, count = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) { sum += ch[i] * ch[i]; count++; }
  }
  return Math.sqrt(sum / Math.max(1, count));
}

module.exports = { writeWav, readWav, toMono, resample, timeStretch, normalize, estimatePitch, rms, pitchShift, trimSilence };
