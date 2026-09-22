'use strict';
/**
 * 作品二（歌曲）：《世界同频》 World in Sync
 * 风格：流行抒情 / Pop Ballad，92 BPM，C 大调
 * 人声：Windows 语音合成逐字生成音节，再按旋律重采样定音高、按谱面对齐节奏，
 *       叠加颤音、和声与混响，形成可听清中文歌词的演唱轨。
 */
const path = require('path');
const fs = require('fs');
const D = require('./lib/dsp');
const wav = require('./lib/wav');
const tts = require('./lib/tts');
const { computePeaks } = require('./compose-instrumental');

const SR = 44100;
const BPM = 92;
const seq = new D.Seq(BPM, SR);
const BARS = 60;
const VOICE = process.env.TTS_VOICE || 'Microsoft Huihui Desktop';
const BUILD = path.join(__dirname, '..', 'build');
// 整体移调：合成人声的自然音高约 204Hz，下调 3 个半音使旋律落在人声最自然的音区
const TP = Number(process.env.TRANSPOSE ?? -3);

/* ---------------- 和声 ---------------- */
const CH = {
  Am: { bass: 45, pad: [57, 60, 64], arp: [45, 57, 60, 64, 60, 57, 60, 64] },
  F: { bass: 41, pad: [53, 57, 60], arp: [41, 53, 57, 60, 57, 53, 57, 60] },
  C: { bass: 36, pad: [52, 55, 60], arp: [36, 48, 52, 55, 60, 55, 52, 48] },
  G: { bass: 43, pad: [50, 55, 59], arp: [43, 50, 55, 59, 55, 50, 55, 59] },
  Dm: { bass: 38, pad: [53, 57, 62], arp: [38, 50, 53, 57, 62, 57, 53, 50] }
};
if (TP !== 0) {
  for (const k of Object.keys(CH)) {
    CH[k].bass += TP;
    CH[k].pad = CH[k].pad.map((m) => m + TP);
    CH[k].arp = CH[k].arp.map((m) => m + TP);
  }
}
const PROG = [];
const add = (n) => { for (const x of n) PROG.push(x); };
add(['Am', 'F', 'C', 'G']);                 // 0-3   前奏
add(['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G']); // 4-11  主歌一
add(['F', 'G', 'Am', 'G']);                 // 12-15 预副歌
add(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G']); // 16-23 副歌
add(['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G']); // 24-31 主歌二
add(['F', 'G', 'Am', 'G']);                 // 32-35 预副歌
add(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G']); // 36-43 副歌
add(['Dm', 'Am', 'F', 'G']);                // 44-47 桥段
add(['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G']); // 48-55 终副歌
add(['C', 'G', 'F', 'C']);                  // 56-59 尾声

/* ---------------- 歌词与旋律（一字一音） ---------------- */
const L = (bar, beat, chars, midis, durs) => ({ bar, beat, chars, midis, durs });
const VERSE1 = [
  L(4, 0, '清晨的风吹过窗台', [57, 60, 64, 60, 57, 55, 59, 57], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(6, 0, '第一缕光照亮未来', [55, 57, 60, 62, 64, 62, 60, 57], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(8, 0, '心跳在远处轻轻回响', [60, 62, 64, 62, 60, 57, 59, 60, 62], [1, 1, 1, 1, 1, 0.5, 0.5, 1, 1]),
  L(10, 0, '像海浪拍打胸怀', [57, 60, 62, 60, 59, 57, 55], [1, 1, 1, 1, 1, 1, 2])
];
const PRE = [
  L(12, 0, '越过山海', [60, 62, 64, 62], [1, 1, 1, 1]),
  L(13, 0, '越过星辰', [64, 62, 60, 62], [1, 1, 1, 1]),
  L(14, 0, '所有距离', [60, 62, 64, 65], [1, 1, 1, 1]),
  L(15, 0, '都不算远', [64, 62, 60, 59], [1, 1, 1, 1])
];
const CHORUS = [
  L(16, 0, '同一个世界同节拍', [60, 62, 64, 65, 64, 62, 60, 62], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(18, 0, '不同语言同样的爱', [62, 64, 65, 64, 62, 60, 62, 64], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(20, 0, '让音符飞向那云海', [60, 64, 65, 64, 62, 60, 62, 64], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(22, 0, '我们与世界同频', [65, 64, 62, 60, 62, 64, 62], [1, 1, 1, 1, 1, 1, 2])
];
const VERSE2 = [
  L(24, 0, '黄昏的雨落在屋檐', [57, 59, 60, 62, 60, 57, 55, 57], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(26, 0, '陌生的城市也温暖', [55, 57, 60, 62, 64, 62, 60, 57], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(28, 0, '每一次呼吸都相连', [60, 62, 64, 62, 60, 57, 59, 60], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(30, 0, '每一双眼里有星海', [59, 60, 62, 60, 59, 57, 55, 57], [1, 1, 1, 1, 1, 1, 1, 1])
];
const BRIDGE = [
  L(44, 0, '当黎明升起', [64, 62, 60, 62, 64], [1, 1, 0.5, 0.5, 1]),
  L(45, 0, '当歌声响起', [65, 64, 62, 60, 62], [1, 1, 0.5, 0.5, 1]),
  L(46, 0, '这颗心跳动', [60, 62, 64, 65, 64], [1, 1, 0.5, 0.5, 1]),
  L(47, 0, '与世界同频', [62, 60, 59, 57, 55], [0.5, 0.5, 1, 1, 1])
];
const OUTRO = [
  L(56, 0, '啦啦啦啦啦啦啦啦', [64, 62, 60, 62, 64, 62, 60, 62], [1, 1, 1, 1, 1, 1, 1, 1]),
  L(58, 0, '啦啦啦啦', [60, 62, 64, 60], [2, 2, 2, 2])
];

const LINES = [
  ...VERSE1, ...PRE, ...CHORUS,
  ...VERSE2, ...PRE.map((l) => L(l.bar + 20, l.beat, l.chars, l.midis, l.durs)),
  ...CHORUS.map((l) => L(l.bar + 20, l.beat, l.chars, l.midis, l.durs)),
  ...BRIDGE,
  ...CHORUS.map((l) => L(l.bar + 32, l.beat, l.chars, l.midis, l.durs)),
  ...OUTRO
];

function sectionOf(bar) {
  if (bar < 4) return 'intro';
  if (bar < 12) return 'verse';
  if (bar < 16) return 'pre';
  if (bar < 24) return 'chorus';
  if (bar < 32) return 'verse2';
  if (bar < 36) return 'pre';
  if (bar < 44) return 'chorus';
  if (bar < 48) return 'bridge';
  if (bar < 56) return 'chorusFinal';
  return 'outro';
}

/* ---------------- 人声 ---------------- */

function lowpass(arr, sr, cut) {
  const a = Math.exp(-2 * Math.PI * cut / sr);
  let z = 0;
  for (let i = 0; i < arr.length; i++) { z = (1 - a) * arr[i] + a * z; arr[i] = z; }
}
function highpass(arr, sr, cut) {
  const a = Math.exp(-2 * Math.PI * cut / sr);
  let y = 0, x1 = 0;
  for (let i = 0; i < arr.length; i++) { const x = arr[i]; y = a * (y + x - x1); x1 = x; arr[i] = y; }
}
/** 峰值 EQ：补偿变调后损失的"胸腔共鸣"，让人声更温暖 */
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

function buildSyllables() {
  const list = [];
  for (const line of LINES) {
    if (line.midis.length !== line.durs.length || line.midis.length !== line.chars.length) {
      throw new Error(`歌词与旋律不匹配：${line.chars}（字 ${line.chars.length} / 音 ${line.midis.length}）`);
    }
    let beat = line.beat;
    for (let i = 0; i < line.chars.length; i++) {
      const dur = line.durs[i];
      list.push({
        char: line.chars[i],
        midi: line.midis[i] + TP,
        t0: seq.t(line.bar, beat),
        durBeats: dur,
        durSec: dur * seq.beat,
        section: sectionOf(line.bar)
      });
      beat += dur;
    }
  }
  return list;
}

function synthSyllables(syllables, opts = {}) {
  const chars = [...new Set(syllables.map((s) => s.char))];
  const rawDir = path.join(BUILD, 'vocal', 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const mapFile = path.join(rawDir, '_map.json');
  let map = fs.existsSync(mapFile) ? JSON.parse(fs.readFileSync(mapFile, 'utf8')) : {};
  const missing = chars.filter((c) => !map[c] || !fs.existsSync(path.join(rawDir, map[c])));
  if (missing.length) {
    console.log(`[人声] 需要合成 ${missing.length} 个音节…`);
    const jobs = missing.map((c, i) => ({ id: 's' + Date.now().toString(36) + '_' + i, text: c }));
    const res = tts.synth(jobs, rawDir, opts.voice || VOICE);
    for (let i = 0; i < missing.length; i++) {
      if (res[jobs[i].id]) map[missing[i]] = path.basename(res[jobs[i].id]);
    }
    fs.writeFileSync(mapFile, JSON.stringify(map, null, 2), 'utf8');
  } else {
    console.log(`[人声] 复用已缓存的 ${chars.length} 个音节`);
  }
  const clips = new Map();
  let okCount = 0;
  for (const c of chars) {
    const f = map[c] ? path.join(rawDir, map[c]) : null;
    if (!f || !fs.existsSync(f)) { console.warn('  缺少音节：' + c); continue; }
    const w = wav.readWav(f);
    const mono = wav.trimSilence(wav.toMono(w), w.sampleRate, { threshold: 0.12, pad: 0.02 });
    if (mono.length < w.sampleRate * 0.05) { console.warn('  音节过短，跳过：' + c); continue; }
    clips.set(c, { mono: Float32Array.from(mono), sr: w.sampleRate });
    okCount++;
  }
  console.log(`[人声] 可用音节 ${okCount}/${chars.length}`);
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

function buildVocalTrack(syllables, totalSec, opts = {}) {
  const clips = synthSyllables(syllables, opts);
  const baseF0 = calibrateBaseF0(clips);
  console.log(`[人声] 基准音高 ${baseF0.toFixed(1)}Hz`);
  const vox = new D.Mix(totalSec, SR);
  let placed = 0;
  for (const s of syllables) {
    const clip = clips.get(s.char);
    if (!clip) continue;
    const target = D.mtof(s.midi);
    const ratio = target / baseF0;
    let audio = wav.pitchShift(clip.mono, clip.sr, SR, ratio, {
      vibratoRate: 5.4, vibratoDepthCents: 13, vibratoDelay: 0.11
    });
    lowpass(audio, SR, 5200);
    highpass(audio, SR, 110);
    peakEQ(audio, SR, 420, 5.5, 1.0);
    peakEQ(audio, SR, 1100, 3.5, 1.2);
    const gain = s.section === 'chorusFinal' ? 0.95 : s.section === 'bridge' ? 0.8 : 0.88;
    place(vox, s.t0, audio, gain, s.durSec * 0.98, 0);
    // 终副歌加三度和声
    if (s.section === 'chorusFinal') {
      const r2 = D.mtof(s.midi - 4) / baseF0;
      let h = wav.pitchShift(clip.mono, clip.sr, SR, r2, { vibratoRate: 5.1, vibratoDepthCents: 10, vibratoDelay: 0.13 });
      lowpass(h, SR, 4200);
      highpass(h, SR, 120);
      place(vox, s.t0, h, 0.34, s.durSec * 0.95, -0.35);
    }
    placed++;
  }
  console.log(`[人声] 已放置 ${placed}/${syllables.length} 个音节`);

  // 人声空间感：混响 + 短延迟
  const rev = new D.Reverb(SR, 0.72, 0.42);
  const wetL = new Float32Array(vox.n);
  const wetR = new Float32Array(vox.n);
  rev.process(vox.l, vox.r, wetL, wetR, 1);
  const wet = 0.24;
  for (let i = 0; i < vox.n; i++) {
    vox.l[i] = vox.l[i] * (1 - wet) + wetL[i] * wet;
    vox.r[i] = vox.r[i] * (1 - wet) + wetR[i] * wet;
  }
  D.pingpongDelay(vox, { time: seq.beat * 0.5, fb: 0.2, wet: 0.1 });
  return vox;
}

/* ---------------- 伴奏 ---------------- */

function buildBeds(mix) {
  const beat = seq.beat;
  for (let bar = 0; bar < BARS; bar++) {
    const sec = sectionOf(bar);
    const ch = CH[PROG[bar]];
    const t0 = seq.t(bar);
    const isChorus = sec.startsWith('chorus');

    // 铺底
    const padAmp = sec === 'intro' ? 0.3 : sec === 'bridge' ? 0.34 : isChorus ? 0.4 : 0.3;
    D.pad(mix, t0, ch.pad, beat * 4, { amp: padAmp, a: sec === 'intro' ? 1.2 : 0.55, r: 0.9, cutoff: isChorus ? 2000 : 1400 });
    if (isChorus) D.strings(mix, t0, ch.pad.map((m) => m + 12), beat * 4, { amp: 0.13, a: 0.4, r: 0.7, cutoff: 3000 });

    // 低音
    if (sec !== 'intro') {
      const pattern = isChorus || sec === 'pre' ? [0, 1, 1.5, 2, 3, 3.5] : [0, 2];
      for (const b of pattern) {
        D.bass(mix, seq.t(bar, b), ch.bass, beat * (isChorus ? 0.45 : 0.85), { amp: isChorus ? 0.5 : 0.42 });
      }
    }

    // 钢琴
    if (sec === 'intro' || sec.startsWith('verse') || sec === 'outro') {
      for (let s = 0; s < 8; s++) {
        const b = s * 0.5;
        const note = ch.arp[s % ch.arp.length] + 12;
        D.piano(mix, seq.t(bar, b), note, beat * 0.48, { amp: 0.3, pan: s % 2 ? 0.28 : -0.28 });
      }
    } else if (isChorus || sec === 'pre') {
      // 柱式和弦
      [0, 1.5, 2, 3].forEach((b, i) => {
        for (const m of ch.pad) {
          D.piano(mix, seq.t(bar, b), m + 12, beat * 0.6, { amp: 0.22, pan: (i % 2 ? 0.2 : -0.2) });
        }
      });
    } else if (sec === 'bridge') {
      D.piano(mix, seq.t(bar, 0), ch.pad[2] + 12, beat * 1.8, { amp: 0.32, pan: -0.2 });
      D.piano(mix, seq.t(bar, 2), ch.pad[1] + 12, beat * 1.8, { amp: 0.28, pan: 0.2 });
    }

    // 鼓组
    if (sec !== 'intro' && sec !== 'bridge' && !(sec === 'outro' && bar > 57)) {
      const full = isChorus;
      D.kick(mix, seq.t(bar, 0), { amp: full ? 0.95 : 0.7 });
      D.kick(mix, seq.t(bar, 2), { amp: full ? 0.8 : 0.55 });
      if (full) D.kick(mix, seq.t(bar, 3.5), { amp: 0.5 });
      if (sec === 'pre' || full) {
        D.snare(mix, seq.t(bar, 1), { amp: full ? 0.42 : 0.24 });
        D.snare(mix, seq.t(bar, 3), { amp: full ? 0.46 : 0.26 });
      }
      const steps = full ? 8 : 4;
      for (let s = 0; s < steps; s++) {
        D.hat(mix, seq.t(bar, (s * 4) / steps), { amp: 0.13, open: full && s === steps - 1 });
      }
      if (bar === 16 || bar === 36 || bar === 48) D.crash(mix, seq.t(bar, 0), { amp: 0.18 });
    }
    if (sec === 'bridge' && bar === 47) {
      // 桥段末尾过门
      for (let i = 0; i < 4; i++) D.snare(mix, seq.t(bar, 3 + i * 0.25), { amp: 0.2 + i * 0.08 });
    }
    if (sec === 'intro' && bar >= 2) D.shaker(mix, seq.t(bar, 2), { amp: 0.1 });
    if (sec.startsWith('verse')) for (let s = 0; s < 4; s++) D.shaker(mix, seq.t(bar, s + 0.5), { amp: 0.09 });
    if (isChorus) for (let s = 0; s < 4; s++) D.shaker(mix, seq.t(bar, s + 0.5), { amp: 0.12 });
  }
  // 前奏与尾声的点缀
  D.bell(mix, seq.t(0, 0), 84 + TP, 1.2, { amp: 0.16 });
  D.bell(mix, seq.t(1, 2), 79 + TP, 1.2, { amp: 0.14 });
  D.bell(mix, seq.t(58, 0), 72 + TP, 1.6, { amp: 0.16 });
}

/* ---------------- 组装 ---------------- */

function build(opts = {}) {
  for (const line of LINES) {
    if (line.midis.length !== line.chars.length) throw new Error('歌词与旋律长度不一致：' + line.chars);
  }
  const totalSec = seq.len(BARS) + 5;
  const mix = new D.Mix(totalSec, SR);
  const bedsOn = process.env.BEDS !== '0';
  if (bedsOn) { console.log('[伴奏] 开始编曲…'); buildBeds(mix); }

  const syllables = buildSyllables();
  console.log(`[人声] 共 ${syllables.length} 个音节`);
  const vox = buildVocalTrack(syllables, totalSec, opts);

  const voxGain = opts.vocalGain ?? 1.6;
  for (let i = 0; i < mix.n; i++) { mix.l[i] += vox.l[i] * voxGain; mix.r[i] += vox.r[i] * voxGain; }

  const rev = new D.Reverb(SR, 0.7, 0.36);
  const wetL = new Float32Array(mix.n);
  const wetR = new Float32Array(mix.n);
  rev.process(mix.l, mix.r, wetL, wetR, 1);
  const wet = 0.2;
  for (let i = 0; i < mix.n; i++) {
    mix.l[i] = mix.l[i] * (1 - wet) + wetL[i] * wet;
    mix.r[i] = mix.r[i] * (1 - wet) + wetR[i] * wet;
  }
  D.fade(mix, 0.05, 4.2);
  const peak = D.master(mix, { ceiling: 0.93, drive: 1.12 });

  const durSec = seq.len(BARS) + 3.2;
  const chans = mix.toChannels();
  const out = path.join(BUILD, 'wav', bedsOn ? 'world-in-sync.wav' : 'world-in-sync-vocal-only.wav');
  wav.writeWav(out, [chans[0].subarray(0, Math.round(durSec * SR)), chans[1].subarray(0, Math.round(durSec * SR))], SR);
  const peaks = computePeaks(chans, SR, durSec, 240);
  console.log(`[世界同频] 时长 ${durSec.toFixed(1)}s  峰值 ${peak.toFixed(3)}  → ${out}`);
  return { file: out, duration: durSec, peaks, syllables: syllables.length };
}

if (require.main === module) build();
module.exports = { build, LINES, seq };
