'use strict';
/**
 * 零依赖软件合成器：
 *   - 带限振荡器（PolyBLEP 锯齿/方波）、递归正弦谐振器
 *   - ADSR 包络、一阶低通/高通、颤音、滑音
 *   - 乐器：钢琴、弦乐铺底、贝斯、钟琴、拨弦、合成主音
 *   - 打击乐：底鼓、军鼓、踩镲、拍手、沙锤
 *   - 效果：Freeverb 混响、乒乓延迟、软饱和、母带归一化
 */
const TWO_PI = Math.PI * 2;
const SR = 44100;

const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function noteToMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d+)$/.exec(String(name).trim());
  if (!m) throw new Error('音名无法解析: ' + name);
  let v = SEMITONE[m[1]];
  if (m[2] === '#') v += 1;
  if (m[2] === 'b') v -= 1;
  return v + (parseInt(m[3], 10) + 1) * 12;
}
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function chordOf(str) { return String(str).split(/[,\s]+/).filter(Boolean).map(noteToMidi); }
function fr(name) { return mtof(noteToMidi(name)); }

class Mix {
  constructor(seconds, sr = SR) {
    this.sr = sr;
    this.n = Math.ceil(seconds * sr) + Math.ceil(sr * 2);
    this.l = new Float32Array(this.n);
    this.r = new Float32Array(this.n);
  }
  add(i, v, pan = 0) {
    if (i < 0 || i >= this.n || !isFinite(v)) return;
    let gl, gr;
    if (pan === 0) { gl = 0.7071; gr = 0.7071; }
    else {
      const a = (pan + 1) * Math.PI / 4;
      gl = Math.cos(a); gr = Math.sin(a);
    }
    this.l[i] += v * gl;
    this.r[i] += v * gr;
  }
  addMono(i, v, gainL = 1, gainR = 1) {
    if (i < 0 || i >= this.n || !isFinite(v)) return;
    this.l[i] += v * gainL;
    this.r[i] += v * gainR;
  }
  toChannels() { return [this.l, this.r]; }
}

/* ---------------- 基础波形 ---------------- */

function polyBlep(t, dt) {
  if (t < dt) { const x = t / dt; return x + x - x * x - 1; }
  if (t > 1 - dt) { const x = (t - 1) / dt; return x * x + x + x + 1; }
  return 0;
}

function waveSample(wave, p, dt) {
  switch (wave) {
    case 'sine': return Math.sin(TWO_PI * p);
    case 'saw': return (2 * p - 1) - polyBlep(p, dt);
    case 'square': {
      let v = p < 0.5 ? 1 : -1;
      v += polyBlep(p, dt) - polyBlep((p + 0.5) % 1, dt);
      return v;
    }
    case 'tri': return 2 * Math.abs(2 * p - 0.5) - 1;
    case 'noise': return Math.random() * 2 - 1;
    default: return Math.sin(TWO_PI * p);
  }
}

function adsr(t, hold, a, d, s, r) {
  if (t < 0) return 0;
  if (a > 0 && t < a) return t / a;
  if (d > 0 && t < a + d) return 1 - (1 - s) * ((t - a) / d);
  if (t < hold) return s;
  const rt = t - hold;
  if (rt >= r) return 0;
  const k = 1 - rt / r;
  return s * k * k;
}

/* ---------------- 通用单音 ---------------- */

function voice(mix, o) {
  const sr = mix.sr;
  const t0 = o.t0 || 0;
  const a = o.a ?? 0.01;
  const d = o.d ?? 0.15;
  const s = o.s ?? 0.6;
  const r = o.r ?? 0.3;
  const hold = o.dur ?? 0.5;
  const amp = o.amp ?? 0.25;
  const pan = o.pan ?? 0;
  const wave = o.wave || 'sine';
  const vib = o.vibrato;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil((hold + r) * sr) + 2;
  const cutoff = o.cutoff;
  const cutFrom = o.cutoffFrom ?? null;
  const cutTime = o.cutoffTime ?? 0.08;
  let lp = 0, lpa = 0;
  let phase = o.phase0 || 0;
  const baseFreq = o.freq;
  const glide = o.glide;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let fq = typeof baseFreq === 'function' ? baseFreq(t) : baseFreq;
    if (glide) fq = glide(t, fq);
    if (vib && t > (vib.delay || 0)) {
      fq *= Math.pow(2, ((vib.depth || 10) / 1200) * Math.sin(TWO_PI * (vib.rate || 5) * (t - (vib.delay || 0))));
    }
    const dt = fq / sr;
    phase += dt;
    if (phase >= 1) phase -= Math.floor(phase);
    let v = waveSample(wave, phase, dt);
    if (cutoff) {
      const target = cutFrom ? cutFrom + (cutoff - cutFrom) * Math.min(1, t / cutTime) : cutoff;
      lpa = Math.exp(-TWO_PI * Math.max(20, target) / sr);
      lp = (1 - lpa) * v + lpa * lp;
      v = lp;
    }
    const e = adsr(t, hold, a, d, s, r);
    mix.add(i0 + i, v * e * amp, pan);
  }
}

/** 递归正弦谐振器：批量写入（比 Math.sin 快很多） */
function addSine(mix, i0, n, freq, amp0, decayPerSec, pan = 0, phase0 = 0) {
  const sr = mix.sr;
  const w = TWO_PI * freq / sr;
  const c = 2 * Math.cos(w);
  let y1 = Math.sin(phase0 - w);
  let y2 = Math.sin(phase0 - 2 * w);
  let env = 1;
  let dec = Math.exp(-decayPerSec / sr);
  let a = amp0;
  for (let i = 0; i < n; i++) {
    const y = c * y1 - y2;
    y2 = y1; y1 = y;
    mix.add(i0 + i, y * a, pan);
    a *= dec;
    env = env; // 占位，保持结构清晰
  }
  return y1;
}

/* ---------------- 乐器 ---------------- */

function piano(mix, t0, midi, dur, o = {}) {
  const sr = mix.sr;
  const f = mtof(midi);
  const amp = (o.amp ?? 0.5) * 0.16;
  const pan = o.pan ?? 0;
  const tail = o.tail ?? 1.6;
  const bright = o.bright ?? 1;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil((dur + tail) * sr);
  const parts = [];
  for (let k = 1; k <= 6; k++) {
    const inharm = 1 + 0.0004 * k * k;
    parts.push({
      f: f * k * inharm,
      a: Math.pow(k, -1.25) * bright * (k === 1 ? 1 : 0.85 + 0.3 * bright),
      dec: 1 / (2.4 / Math.pow(k, 0.55) + 0.05)
    });
  }
  let lp = 0, lpa = Math.exp(-TWO_PI * Math.max(200, 2600 * bright) / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    for (let p = 0; p < parts.length; p++) {
      const pt = parts[p];
      const w = TWO_PI * pt.f / sr;
      v += Math.sin(w * i) * pt.a * Math.exp(-t * pt.dec);
    }
    // 琴槌噪声瞬态
    if (i < sr * 0.006) v += (Math.random() * 2 - 1) * 0.25 * Math.exp(-i / (sr * 0.0015));
    let e = 1 - Math.exp(-t * 500);
    if (t >= dur) e *= Math.exp(-(t - dur) * 14); // 松键/踏板收束
    lp = (1 - lpa) * v + lpa * lp;
    mix.add(i0 + i, lp * e * amp, pan);
  }
}

function pad(mix, t0, midis, dur, o = {}) {
  const amp = (o.amp ?? 0.3) / Math.max(1, midis.length);
  const a = o.a ?? 0.7;
  const r = o.r ?? 1.4;
  for (let m = 0; m < midis.length; m++) {
    const midi = midis[m];
    const spread = midis.length > 1 ? (m / (midis.length - 1)) * 2 - 1 : 0;
    const pan = Math.max(-0.7, Math.min(0.7, spread * 0.55 + (o.pan ?? 0)));
    for (let u = 0; u < 3; u++) {
      const detune = (u - 1) * 7;
      voice(mix, {
        t0: t0 + u * 0.008, freq: mtof(midi) * Math.pow(2, detune / 1200),
        dur, amp: amp * 0.5, wave: 'saw', pan,
        a, d: 0.6, s: 0.78, r,
        cutoff: o.cutoff ?? 1500, cutoffFrom: o.cutoffFrom ?? 700, cutoffTime: 1.2,
        vibrato: { rate: 4.6 + u * 0.3, depth: 6, delay: 0.5 }
      });
    }
  }
}

function strings(mix, t0, midis, dur, o = {}) {
  pad(mix, t0, midis, dur, { amp: (o.amp ?? 0.26), a: o.a ?? 0.5, r: o.r ?? 0.9, cutoff: 2600, cutoffFrom: 900, cutoffTime: 0.6, ...o });
}

function bass(mix, t0, midi, dur, o = {}) {
  const f = mtof(midi);
  voice(mix, {
    t0, freq: f, dur, amp: (o.amp ?? 0.5) * 0.5, wave: 'sine',
    a: 0.006, d: 0.18, s: 0.72, r: 0.12, pan: o.pan ?? 0
  });
  voice(mix, {
    t0, freq: f * 2, dur, amp: (o.amp ?? 0.5) * 0.12, wave: 'saw',
    a: 0.006, d: 0.12, s: 0.4, r: 0.1, cutoff: 420, cutoffFrom: 900, cutoffTime: 0.12, pan: o.pan ?? 0
  });
}

function pluck(mix, t0, midi, dur, o = {}) {
  voice(mix, {
    t0, freq: mtof(midi), dur, amp: (o.amp ?? 0.35) * 0.5, wave: o.wave ?? 'tri',
    a: 0.002, d: 0.35, s: 0.12, r: 0.25,
    cutoff: o.cutoff ?? 2600, cutoffFrom: o.cutoffFrom ?? 5200, cutoffTime: 0.25, pan: o.pan ?? 0
  });
}

function bell(mix, t0, midi, dur, o = {}) {
  const f = mtof(midi);
  const i0 = Math.round(t0 * mix.sr);
  const n = Math.ceil((dur + 2.4) * mix.sr);
  const ratios = [1, 2.0, 2.76, 5.4, 8.9];
  const amps = [1, 0.42, 0.3, 0.14, 0.07];
  const decs = [0.55, 0.4, 0.34, 0.25, 0.18];
  for (let k = 0; k < ratios.length; k++) {
    addSine(mix, i0, n, f * ratios[k], (o.amp ?? 0.3) * amps[k] * 0.4, 1 / decs[k], o.pan ?? 0);
  }
}

function lead(mix, t0, midi, dur, o = {}) {
  const f = mtof(midi);
  const pan = o.pan ?? 0;
  voice(mix, {
    t0, freq: f, dur, amp: (o.amp ?? 0.3) * 0.42, wave: 'saw', pan,
    a: 0.04, d: 0.2, s: 0.7, r: 0.25,
    cutoff: o.cutoff ?? 3200, cutoffFrom: o.cutoffFrom ?? 1200, cutoffTime: 0.15,
    vibrato: { rate: 5.2, depth: 14, delay: dur * 0.4 }
  });
  voice(mix, {
    t0, freq: f * 2, dur, amp: (o.amp ?? 0.3) * 0.12, wave: 'square', pan,
    a: 0.05, d: 0.2, s: 0.5, r: 0.25, cutoff: 4200
  });
}

/* ---------------- 打击乐 ---------------- */

function kick(mix, t0, o = {}) {
  const sr = mix.sr;
  const amp = o.amp ?? 0.9;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(0.55 * sr);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const f = 46 + 125 * Math.exp(-t * 30);
    phase += f / sr;
    const body = Math.sin(TWO_PI * phase) * Math.exp(-t * 5.2);
    const click = i < sr * 0.004 ? (Math.random() * 2 - 1) * Math.exp(-t * 400) * 0.5 : 0;
    mix.add(i0 + i, (body + click) * amp * 0.85, 0);
  }
}

function snare(mix, t0, o = {}) {
  const sr = mix.sr;
  const amp = o.amp ?? 0.55;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(0.28 * sr);
  let hp = 0, prev = 0, lp = 0;
  const hpa = Math.exp(-TWO_PI * 900 / sr);
  const lpa = Math.exp(-TWO_PI * 6500 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = Math.exp(-t * 26);
    let nz = (Math.random() * 2 - 1) * e;
    // 带通：高通 + 低通
    const hpx = hpa * (hp + nz - prev); hp = hpx; prev = nz;
    lp = (1 - lpa) * hpx + lpa * lp;
    const tone = Math.sin(TWO_PI * 185 * t) * Math.exp(-t * 40) * 0.35;
    mix.add(i0 + i, (lp * 0.9 + tone) * amp * 0.7, 0);
  }
}

function hat(mix, t0, o = {}) {
  const sr = mix.sr;
  const amp = (o.amp ?? 0.3) * 0.6;
  const dec = o.open ? 9 : 46;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil((o.open ? 0.35 : 0.09) * sr);
  let hp = 0, prev = 0;
  const hpa = Math.exp(-TWO_PI * 7800 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const nz = (Math.random() * 2 - 1) * Math.exp(-t * dec);
    const hpx = hpa * (hp + nz - prev); hp = hpx; prev = nz;
    mix.add(i0 + i, hpx * amp, o.pan ?? 0.15);
  }
}

function clap(mix, t0, o = {}) {
  const sr = mix.sr;
  const amp = (o.amp ?? 0.4);
  for (let k = 0; k < 3; k++) {
    const off = k * 0.011;
    const i0 = Math.round((t0 + off) * sr);
    const n = Math.ceil(0.16 * sr);
    let hp = 0, prev = 0;
    const hpa = Math.exp(-TWO_PI * 1400 / sr);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const e = Math.exp(-t * (k === 2 ? 16 : 60));
      const nz = (Math.random() * 2 - 1) * e;
      const hpx = hpa * (hp + nz - prev); hp = hpx; prev = nz;
      mix.add(i0 + i, hpx * amp * 0.5, o.pan ?? 0);
    }
  }
}

function shaker(mix, t0, o = {}) {
  const sr = mix.sr;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(0.08 * sr);
  let hp = 0, prev = 0;
  const hpa = Math.exp(-TWO_PI * 5200 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = Math.min(1, t * 300) * Math.exp(-t * 45);
    const nz = (Math.random() * 2 - 1) * e;
    const hpx = hpa * (hp + nz - prev); hp = hpx; prev = nz;
    mix.add(i0 + i, hpx * (o.amp ?? 0.22) * 0.5, o.pan ?? 0.3);
  }
}

function crash(mix, t0, o = {}) {
  const sr = mix.sr;
  const i0 = Math.round(t0 * sr);
  const n = Math.ceil(3.0 * sr);
  let hp = 0, prev = 0;
  const hpa = Math.exp(-TWO_PI * 4200 / sr);
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const e = Math.min(1, t * 500) * Math.exp(-t * 1.6);
    const nz = (Math.random() * 2 - 1) * e;
    const hpx = hpa * (hp + nz - prev); hp = hpx; prev = nz;
    mix.add(i0 + i, hpx * (o.amp ?? 0.22) * 0.4, 0);
  }
}

/* ---------------- 效果 ---------------- */

class Reverb {
  constructor(sr, room = 0.8, damp = 0.35) {
    const scale = sr / 44100;
    this.sr = sr;
    const combDelays = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const apDelays = [556, 441, 341, 225];
    this.combs = combDelays.map((d, i) => ({
      buf: new Float32Array(Math.max(4, Math.round(d * scale + i * 3))),
      idx: 0, store: 0
    }));
    this.combsR = combDelays.map((d, i) => ({
      buf: new Float32Array(Math.max(4, Math.round((d + 23) * scale + i * 3))),
      idx: 0, store: 0
    }));
    this.aps = apDelays.map((d) => ({ buf: new Float32Array(Math.max(4, Math.round(d * scale))), idx: 0 }));
    this.apsR = apDelays.map((d) => ({ buf: new Float32Array(Math.max(4, Math.round(d * scale))), idx: 0 }));
    this.fb = 0.7 + Math.min(0.95, Math.max(0, room)) * 0.25;
    this.damp = damp;
  }
  process(inL, inR, outL, outR, wet) {
    const n = outL.length;
    const cnt = this.combs.length;
    for (let i = 0; i < n; i++) {
      const xL = inL[i], xR = inR[i];
      let sL = 0, sR = 0;
      for (let c = 0; c < cnt; c++) {
        const cb = this.combs[c];
        const y = cb.buf[cb.idx];
        cb.store = y * (1 - this.damp) + cb.store * this.damp;
        cb.buf[cb.idx] = xL + cb.store * this.fb;
        if (++cb.idx >= cb.buf.length) cb.idx = 0;
        sL += y;

        const cbR = this.combsR[c];
        const yR = cbR.buf[cbR.idx];
        cbR.store = yR * (1 - this.damp) + cbR.store * this.damp;
        cbR.buf[cbR.idx] = xR + cbR.store * this.fb;
        if (++cbR.idx >= cbR.buf.length) cbR.idx = 0;
        sR += yR;
      }
      sL /= cnt; sR /= cnt;
      for (let a = 0; a < this.aps.length; a++) {
        const ap = this.aps[a];
        const v = ap.buf[ap.idx];
        ap.buf[ap.idx] = sL + v * 0.5;
        if (++ap.idx >= ap.buf.length) ap.idx = 0;
        sL = v - sL * 0.5;

        const apR = this.apsR[a];
        const vR = apR.buf[apR.idx];
        apR.buf[apR.idx] = sR + vR * 0.5;
        if (++apR.idx >= apR.buf.length) apR.idx = 0;
        sR = vR - sR * 0.5;
      }
      outL[i] += sL * wet;
      outR[i] += sR * wet;
    }
  }
}

/** 立体声乒乓延迟 */
function pingpongDelay(mix, o = {}) {
  const sr = mix.sr;
  const time = o.time ?? 0.28;
  const fb = o.fb ?? 0.32;
  const wet = o.wet ?? 0.25;
  const d = Math.round(time * sr);
  const L = mix.l, R = mix.r;
  const n = mix.n;
  const tmpL = Float32Array.from(L);
  const tmpR = Float32Array.from(R);
  const dampA = Math.exp(-TWO_PI * 4200 / sr);
  let sL = 0, sR = 0;
  for (let i = d; i < n; i++) {
    const xL = tmpL[i - d] + sR * fb;
    const xR = tmpR[i - d] + sL * fb;
    sL = (1 - dampA) * xL + dampA * sL;
    sR = (1 - dampA) * xR + dampA * sR;
    L[i] += sR * wet;
    R[i] += sL * wet;
  }
}

/** 母带：软饱和 + 峰值归一化 */
function master(mix, o = {}) {
  const ceiling = o.ceiling ?? 0.92;
  const drive = o.drive ?? 1.15;
  const L = mix.l, R = mix.r;
  let peak = 0;
  for (let i = 0; i < mix.n; i++) {
    let a = Math.tanh(L[i] * drive) * 0.92;
    let b = Math.tanh(R[i] * drive) * 0.92;
    L[i] = a; R[i] = b;
    const m = Math.max(Math.abs(a), Math.abs(b));
    if (m > peak) peak = m;
  }
  const g = peak > 0 ? ceiling / peak : 1;
  for (let i = 0; i < mix.n; i++) { L[i] *= g; R[i] *= g; }
  return peak;
}

/** 淡入淡出（秒） */
function fade(mix, inSec = 0.02, outSec = 0.5, outStart = null) {
  const sr = mix.sr;
  const nIn = Math.round(inSec * sr);
  for (let i = 0; i < nIn && i < mix.n; i++) {
    const g = i / nIn;
    mix.l[i] *= g; mix.r[i] *= g;
  }
  const start = outStart == null ? mix.n - Math.round(outSec * sr) : Math.round(outStart * sr);
  const nOut = Math.round(outSec * sr);
  for (let i = 0; i < nOut; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= mix.n) continue;
    const g = 1 - i / nOut;
    mix.l[idx] *= g; mix.r[idx] *= g;
  }
}

/** 简易音序器时间换算（4/4 拍） */
class Seq {
  constructor(bpm, sr = SR) { this.bpm = bpm; this.beat = 60 / bpm; this.sr = sr; }
  t(bar, b = 0) { return (bar * 4 + b) * this.beat; }
  len(bars) { return bars * 4 * this.beat; }
}

module.exports = {
  SR, TWO_PI, Mix, Seq,
  noteToMidi, mtof, chordOf, fr,
  voice, addSine, adsr, waveSample,
  piano, pad, strings, bass, pluck, bell, lead,
  kick, snare, hat, clap, shaker, crash,
  Reverb, pingpongDelay, master, fade
};
