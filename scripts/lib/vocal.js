'use strict';
/**
 * 通用中文人声轨：把任意"歌词 + 旋律"合成成可听清咬字的演唱轨。
 *
 * 做法（沿用《世界同频》验证过的方案）：
 *   1. 逐字调用 Windows SAPI 生成音节素材，并按字符缓存（越用越快）；
 *   2. 用基准音高换算比例，对每个音节做重采样定音高（带颤音）；
 *   3. 低通 / 高通 / 峰值 EQ 修音色，按谱面逐个摆放到时间轴；
 *   4. 混响 + 乒乓延迟给人声空间感。
 */
const path = require('path');
const fs = require('fs');
const wav = require('./wav');
const tts = require('./tts');
const D = require('./dsp');

const SR = 44100;
const BUILD = path.join(__dirname, '..', '..', 'build');
const DEFAULT_VOICE = process.env.TTS_VOICE || 'Microsoft Huihui Desktop';

function lowpass(arr, sr, cut) {
  const a = Math.exp((-2 * Math.PI * cut) / sr);
  let z = 0;
  for (let i = 0; i < arr.length; i++) { z = (1 - a) * arr[i] + a * z; arr[i] = z; }
}
function highpass(arr, sr, cut) {
  const a = Math.exp((-2 * Math.PI * cut) / sr);
  let y = 0, x1 = 0;
  for (let i = 0; i < arr.length; i++) { const x = arr[i]; y = a * (y + x - x1); x1 = x; arr[i] = y; }
}
/** 峰值 EQ：补偿变调后损失的"胸腔共鸣" */
function peakEQ(arr, sr, freq, gainDb, q = 1.1) {
  const A = Math.pow(10, gainDb / 40);
  const w0 = (2 * Math.PI * freq) / sr;
  const alpha = Math.sin(w0) / (2 * q);
  const b0 = 1 + alpha * A, b1 = -2 * Math.cos(w0), b2 = 1 - alpha * A;
  const a0 = 1 + alpha / A, a1 = -2 * Math.cos(w0), a2 = 1 - alpha / A;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < arr.length; i++) {
    const x = arr[i];
    const y = (b0 / a0) * x + (b1 / a0) * x1 + (b2 / a0) * x2 - (a1 / a0) * y1 - (a2 / a0) * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y;
    arr[i] = y;
  }
}

/** 把一个音节按包络摆进混音（避免叠音爆音） */
function place(mix, t0, src, gain, maxLen, pan = 0) {
  const sr = mix.sr;
  const i0 = Math.round(t0 * sr);
  const limit = Math.round(maxLen * sr);
  const n = Math.min(src.length, limit + Math.round(0.06 * sr));
  const atk = Math.round(0.008 * sr);
  const rel = Math.round(0.075 * sr);
  for (let i = 0; i < n; i++) {
    let g = 1;
    if (i < atk) g = i / atk;
    const fromEnd = n - i;
    if (fromEnd < rel) g *= fromEnd / rel;
    mix.add(i0 + i, src[i] * g * gain, pan);
  }
}

/** 取得一批字符的音节素材（缺哪些合成哪些，其余复用缓存） */
function loadClips(chars, opts = {}) {
  const rawDir = path.join(BUILD, 'vocal', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const mapFile = path.join(rawDir, '_map.json');
  let map = {};
  try { if (fs.existsSync(mapFile)) map = JSON.parse(fs.readFileSync(mapFile, 'utf8')); } catch (e) { map = {}; }

  const missing = chars.filter((c) => !map[c] || !fs.existsSync(path.join(rawDir, map[c])));
  if (missing.length) {
    console.log(`[人声] 需要新合成 ${missing.length} 个音节…`);
    const jobs = missing.map((c, i) => ({ id: 's' + Date.now().toString(36) + '_' + i, text: c }));
    const res = tts.synth(jobs, rawDir, opts.voice || DEFAULT_VOICE);
    for (let i = 0; i < missing.length; i++) {
      const f = res[jobs[i].id];
      if (f) map[missing[i]] = path.basename(f);
    }
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), 'utf8');
  } else {
    console.log(`[人声] 复用缓存音节 ${chars.length} 个`);
  }

  const clips = new Map();
  for (const c of chars) {
    const f = map[c] ? path.join(rawDir, map[c]) : null;
    if (!f || !fs.existsSync(f)) { console.warn('  缺少音节：' + c); continue; }
    const w = wav.readWav(f);
    const mono = wav.trimSilence(wav.toMono(w), w.sampleRate, { threshold: 0.12, pad: 0.02 });
    if (mono.length < w.sampleRate * 0.05) { console.warn('  音节过短，跳过：' + c); continue; }
    clips.set(c, { mono: Float32Array.from(mono), sr: w.sampleRate });
  }
  console.log(`[人声] 可用音节 ${clips.size}/${chars.length}`);
  return clips;
}

function calibrateBaseF0(clips) {
  const list = [];
  for (const [, c] of clips) {
    const f0 = wav.estimatePitch(c.mono, c.sr, 0.1, 0.9);
    if (f0 > 90 && f0 < 500) list.push(f0);
  }
  if (!list.length) return 200;
  list.sort((a, b) => a - b);
  return list[Math.floor(list.length / 2)];
}

/**
 * @param {Array} syllables [{ char, midi, t0, durSec, harmony?:boolean, gain?:number }]
 * @param {number} totalSec
 * @param {Object} opts { voice, harmonyPan }
 * @returns {Mix} 已加混响与延迟的人声轨
 */
function buildVocalTrack(syllables, totalSec, opts = {}) {
  const chars = [...new Set(syllables.map((s) => s.char))];
  const clips = loadClips(chars, opts);
  const baseF0 = calibrateBaseF0(clips);
  console.log(`[人声] 基准音高 ${baseF0.toFixed(1)}Hz，共 ${syllables.length} 个位置`);

  const vox = new D.Mix(totalSec, SR);
  let placed = 0;
  for (const s of syllables) {
    const clip = clips.get(s.char);
    if (!clip) continue;
    const ratio = D.mtof(s.midi) / baseF0;
    let audio = wav.pitchShift(clip.mono, clip.sr, SR, ratio, {
      vibratoRate: 5.4, vibratoDepthCents: 13, vibratoDelay: 0.11
    });
    lowpass(audio, SR, 5200);
    highpass(audio, SR, 110);
    peakEQ(audio, SR, 420, 5.5, 1.0);
    peakEQ(audio, SR, 1100, 3.5, 1.2);
    const base = s.gain ?? 0.9;
    place(vox, s.t0, audio, base, s.durSec * 0.98, 0);
    if (s.harmony) {
      const r2 = D.mtof(s.midi - 4) / baseF0;
      let h = wav.pitchShift(clip.mono, clip.sr, SR, r2, { vibratoRate: 5.1, vibratoDepthCents: 10, vibratoDelay: 0.13 });
      lowpass(h, SR, 4200);
      highpass(h, SR, 120);
      place(vox, s.t0, h, base * 0.36, s.durSec * 0.95, -0.35);
    }
    placed++;
  }
  console.log(`[人声] 已放置 ${placed}/${syllables.length} 个音节`);

  const rev = new D.Reverb(SR, 0.72, 0.42);
  const wetL = new Float32Array(vox.n);
  const wetR = new Float32Array(vox.n);
  rev.process(vox.l, vox.r, wetL, wetR, 1);
  const wet = 0.24;
  for (let i = 0; i < vox.n; i++) {
    vox.l[i] = vox.l[i] * (1 - wet) + wetL[i] * wet;
    vox.r[i] = vox.r[i] * (1 - wet) + wetR[i] * wet;
  }
  D.pingpongDelay(vox, { time: opts.delayTime ?? 0.32, fb: 0.2, wet: 0.1 });
  return vox;
}

module.exports = { buildVocalTrack, loadClips, SR };
