'use strict';
/**
 * 作品一（纯音乐）：《星海序曲》 Starfield Overture
 * 风格：电影感氛围电子 / Ambient Cinematic
 * 结构：Intro(星尘) → A(钢琴琶音) → B(弦乐进入) → C(主题呈示) → D(高潮) → E(留白) → F(再现与尾声)
 */
const path = require('path');
const fs = require('fs');
const D = require('./lib/dsp');
const wav = require('./lib/wav');

const SR = 44100;
const BPM = 76;
const seq = new D.Seq(BPM, SR);
const BARS = 50;

const CH = {
  Am: { bass: 45, pad: [57, 60, 64], arp: [45, 57, 60, 64, 69, 64, 60, 57] },
  F: { bass: 41, pad: [53, 57, 60], arp: [41, 53, 57, 60, 65, 60, 57, 53] },
  C: { bass: 36, pad: [55, 60, 64], arp: [36, 48, 55, 60, 64, 60, 55, 48] },
  G: { bass: 43, pad: [55, 59, 62], arp: [43, 55, 59, 62, 67, 62, 59, 55] },
  Dm: { bass: 38, pad: [57, 62, 65], arp: [38, 50, 57, 62, 65, 62, 57, 50] },
  Em: { bass: 40, pad: [55, 59, 64], arp: [40, 52, 55, 59, 64, 59, 55, 52] },
  Bb: { bass: 46, pad: [58, 62, 65], arp: [46, 58, 62, 65, 70, 65, 62, 58] }
};

// 每一小节的和声（50 小节）
const prog = [];
const push = (names) => { for (const n of names) prog.push(n); };
push(['Am', 'Am', 'F', 'F']);            // 0-3   Intro
push(['Am', 'F', 'C', 'G']);             // 4-7   A1
push(['Am', 'F', 'C', 'G']);             // 8-11  A2
push(['Am', 'F', 'C', 'G']);             // 12-15 B1
push(['F', 'G', 'Am', 'Am']);            // 16-19 B2
push(['F', 'G', 'Am', 'C']);             // 20-23 C1
push(['F', 'G', 'Am', 'C']);             // 24-27 C2
push(['C', 'G', 'Am', 'F']);             // 28-31 D1
push(['C', 'G', 'Am', 'F']);             // 32-35 D2
push(['Dm', 'Am', 'Em', 'Am']);          // 36-39 E1
push(['Dm', 'Bb', 'F', 'G']);            // 40-43 E2
push(['C', 'G', 'Am', 'F']);             // 44-47 F1
push(['Am', 'F', 'C', 'Am']);            // 48-49 尾声

// 主题旋律（相对小节 / 拍 / 音高 / 时值）
const THEME = [
  [4, 0, 69, 2], [4, 2, 72, 1], [4, 3, 74, 1],
  [5, 0, 76, 2], [5, 2, 74, 1], [5, 3, 72, 1],
  [6, 0, 69, 1.5], [6, 1.5, 67, 0.5], [6, 2, 69, 2],
  [7, 0, 72, 1], [7, 1, 71, 1], [7, 2, 69, 2],
  [8, 0, 76, 2], [8, 2, 79, 1], [8, 3, 76, 1],
  [9, 0, 74, 2], [9, 2, 72, 1], [9, 3, 74, 1],
  [10, 0, 76, 1.5], [10, 1.5, 74, 0.5], [10, 2, 72, 1], [10, 3, 69, 1],
  [11, 0, 67, 1], [11, 1, 69, 1], [11, 2, 72, 2]
];

function build() {
  const total = seq.len(BARS) + 8;
  const mix = new D.Mix(total, SR);
  const beat = seq.beat;

  // ---------- 铺底与和声 ----------
  for (let bar = 0; bar < BARS; bar++) {
    const ch = CH[prog[bar]];
    const t0 = seq.t(bar);
    const inIntro = bar < 4;
    const inBreak = bar >= 36 && bar < 44;
    const climax = bar >= 28 && bar < 36;
    const finale = bar >= 44;

    // 弦乐 / 铺底
    const padAmp = inIntro ? 0.34 : inBreak ? 0.4 : climax ? 0.5 : finale ? 0.52 : 0.36;
    D.pad(mix, t0, ch.pad, beat * 4, { amp: padAmp, a: inIntro ? 1.6 : 0.8, r: 1.6, cutoff: climax ? 2200 : 1500 });
    if (climax || finale) {
      D.strings(mix, t0, ch.pad.map((m) => m + 12), beat * 4, { amp: 0.14, a: 0.6, r: 1.2, cutoff: 3200 });
    }

    // 低音
    if (!inIntro) {
      const pattern = climax || finale ? [0, 1, 2, 3] : [0, 2];
      for (const b of pattern) {
        D.bass(mix, seq.t(bar, b), ch.bass, beat * 0.9, { amp: climax ? 0.55 : 0.45 });
      }
    }

    // 钢琴琶音
    if (bar >= 4) {
      const dense = bar >= 16 && bar < 36;
      const steps = dense ? 16 : 8;
      const amp = inBreak ? 0.5 : climax ? 0.42 : 0.36;
      for (let s = 0; s < steps; s++) {
        const b = (s * 4) / steps;
        const note = ch.arp[s % ch.arp.length] + (s >= ch.arp.length ? 12 : 0);
        D.piano(mix, seq.t(bar, b), note, beat * (4 / steps) * 0.95, {
          amp: amp * (s % 2 === 0 ? 1 : 0.75), pan: (s % 2 === 0 ? -0.25 : 0.25), bright: dense ? 1.1 : 0.9
        });
      }
    }

    // 鼓组
    if (bar >= 12 && !inBreak) {
      const full = climax || finale;
      D.kick(mix, seq.t(bar, 0), { amp: full ? 1 : 0.75 });
      if (full) D.kick(mix, seq.t(bar, 2.5), { amp: 0.6 });
      if (bar >= 20) {
        D.snare(mix, seq.t(bar, 2), { amp: full ? 0.5 : 0.32 });
        if (full) D.snare(mix, seq.t(bar, 3.5), { amp: 0.16 });
      }
      const hatSteps = full ? 8 : 4;
      for (let s = 0; s < hatSteps; s++) {
        D.hat(mix, seq.t(bar, (s * 4) / hatSteps), { amp: 0.16, open: full && s === hatSteps - 1 });
      }
      if (bar === 12 || bar === 20 || bar === 28 || bar === 44) D.crash(mix, seq.t(bar, 0), { amp: 0.2 });
      if (bar >= 16 && !inBreak) {
        for (let s = 0; s < 4; s++) D.shaker(mix, seq.t(bar, s + 0.5), { amp: 0.12 });
      }
    }
    if (inBreak) {
      for (let s = 0; s < 2; s++) D.shaker(mix, seq.t(bar, s * 2 + 0.5), { amp: 0.08 });
      if (bar === 43) D.crash(mix, seq.t(bar, 0), { amp: 0.18 });
    }
  }

  // ---------- 主题旋律 ----------
  const themeAt = (offsetBars, octave, inst, amp, harmony) => {
    for (const [bar, b, midi, dur] of THEME) {
      const t0 = seq.t(bar + offsetBars, b);
      const len = dur * beat;
      if (inst === 'bell') D.bell(mix, t0, midi + octave, len, { amp, pan: 0.1 });
      else D.lead(mix, t0, midi + octave, len, { amp, pan: 0 });
      if (harmony) {
        D.voice(mix, {
          t0, freq: D.mtof(midi + octave - 5), dur: len, amp: amp * 0.35, wave: 'saw',
          a: 0.06, d: 0.2, s: 0.6, r: 0.3, cutoff: 2400, pan: -0.3
        });
      }
      // 竖琴式回应
      if (inst === 'bell') {
        D.pluck(mix, t0 + len * 0.98, midi + octave - 12, len * 0.5, { amp: amp * 0.4, pan: -0.4 });
      }
    }
  };

  // Intro：星尘点缀
  for (let i = 0; i < 6; i++) {
    D.bell(mix, seq.t(0) + i * beat * 0.7 + 0.3, [81, 76, 79, 72, 84, 74][i], 1.6, { amp: 0.22, pan: (i % 2 ? 0.35 : -0.35) });
  }
  themeAt(0, 0, 'bell', 0.3, false);        // 4-11  钟琴主题
  themeAt(8, 0, 'lead', 0.2, false);        // 12-19 主音音色重复
  themeAt(16, 0, 'lead', 0.3, true);        // 20-27 加和声
  themeAt(24, 0, 'lead', 0.34, true);       // 28-35 高潮
  // 留白：钢琴独白
  for (let bar = 36; bar < 44; bar += 1) {
    const ch = CH[prog[bar]];
    const notes = [ch.pad[2], ch.pad[1] + 12, ch.pad[0] + 12, ch.pad[2] + 12];
    notes.forEach((m, i) => {
      D.piano(mix, seq.t(bar, i), m, beat * 0.95, { amp: 0.42, pan: i % 2 ? 0.3 : -0.3 });
    });
  }
  themeAt(40, 0, 'lead', 0.32, true);       // 44-51 再现（实际到 49）
  // 尾声星尘
  for (let i = 0; i < 8; i++) {
    D.bell(mix, seq.t(48) + i * beat * 0.45, [72, 76, 79, 74, 69, 72, 67, 64][i], 2.2, { amp: 0.2, pan: (i % 2 ? 0.4 : -0.4) });
  }

  // ---------- 效果与母带 ----------
  const rev = new D.Reverb(SR, 0.86, 0.3);
  const wetL = new Float32Array(mix.n);
  const wetR = new Float32Array(mix.n);
  rev.process(mix.l, mix.r, wetL, wetR, 1);
  const wet = 0.34;
  for (let i = 0; i < mix.n; i++) {
    mix.l[i] = mix.l[i] * (1 - wet) + wetL[i] * wet;
    mix.r[i] = mix.r[i] * (1 - wet) + wetR[i] * wet;
  }
  D.pingpongDelay(mix, { time: beat * 0.75, fb: 0.26, wet: 0.14 });
  D.fade(mix, 1.2, 4.5);
  const peak = D.master(mix, { ceiling: 0.93, drive: 1.1 });

  const out = path.join(__dirname, '..', 'build', 'wav', 'starfield-overture.wav');
  const chans = mix.toChannels();
  const durSec = seq.len(BARS) + 4;
  wav.writeWav(out, [chans[0].subarray(0, Math.round(durSec * SR)), chans[1].subarray(0, Math.round(durSec * SR))], SR);
  const peaks = computePeaks(chans, SR, durSec, 240);
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'starfield.peaks.json'), JSON.stringify(peaks));
  console.log(`[星海序曲] 时长 ${durSec.toFixed(1)}s  峰值 ${peak.toFixed(3)}  → ${out}`);
  return { file: out, duration: durSec, peaks };
}

function computePeaks(chans, sr, durSec, count) {
  const n = Math.round(durSec * sr);
  const step = Math.floor(n / count);
  const out = [];
  for (let i = 0; i < count; i++) {
    let max = 0;
    for (let j = i * step; j < (i + 1) * step && j < n; j++) {
      const v = Math.max(Math.abs(chans[0][j]), Math.abs(chans[1][j]));
      if (v > max) max = v;
    }
    out.push(Math.round(Math.min(1, max) * 100) / 100);
  }
  const mx = Math.max(...out, 0.001);
  return out.map((v) => Math.round((v / mx) * 100) / 100);
}

if (require.main === module) build();
module.exports = { build, computePeaks };
