'use strict';
/**
 * 参数化作曲引擎：给定种子即可"长出"一首全新的作品。
 *
 * plan()   —— 决定调性、速度、和声进行、段落结构、旋律动机、歌词与逐字旋律；
 * render() —— 用 dsp 里的乐器把 plan 渲染成 WAV（歌曲还会调用 vocal.js 生成人声）。
 *
 * 同一颗种子必然产出同一首曲子，因此每次发布都可以追溯重放。
 */
const path = require('path');
const fs = require('fs');
const D = require('./dsp');
const wav = require('./wav');
const vocal = require('./vocal');
const lyricsEngine = require('./lyrics-engine');
const { computePeaks } = require('../compose-instrumental');

const SR = 44100;
const BUILD = path.join(__dirname, '..', '..', 'build');

/* ---------------- 随机 ---------------- */
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) || 1;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const choose = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const randRange = (rng, a, b) => a + rng() * (b - a);
const randInt = (rng, a, b) => Math.floor(randRange(rng, a, b + 1));

/* ---------------- 乐理 ---------------- */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const KEY_NAMES = {
  major: ['C 大调', 'D 大调', 'E 大调', 'F 大调', 'G 大调', 'A 大调', 'B 大调'],
  minor: ['C 小调', 'D 小调', 'E 小调', 'F 小调', 'G 小调', 'A 小调', 'B 小调']
};
const KEY_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const PROG_TEMPLATES = {
  major: [[1, 5, 6, 4], [1, 6, 4, 5], [6, 4, 1, 5], [1, 4, 5, 1], [4, 5, 3, 6]],
  minor: [[1, 6, 3, 7], [6, 7, 1, 5], [1, 4, 6, 5], [6, 5, 4, 5], [1, 7, 6, 7]]
};

/** 由调式 + 主音 + 级数生成一个和弦（含低音、铺底、琶音） */
function buildChord(mode, keyPc, degree) {
  const scale = mode === 'minor' ? MINOR : MAJOR;
  const idx = degree - 1;
  const at = (k) => scale[((idx + k) % 7 + 7) % 7] + 12 * Math.floor((idx + k) / 7);
  // 主音取 C4 区（60），低音再降两个八度
  const root = 60 + keyPc + at(0);
  const third = 60 + keyPc + at(2);
  const fifth = 60 + keyPc + at(4);
  const notes = [root, third, fifth];
  return {
    degree,
    root,
    pad: notes,
    bass: root - 24,
    arp: [root - 12, notes[0], notes[1], notes[2], notes[1] + 12, notes[2], notes[1], notes[0]]
  };
}

/* ---------------- 风格预设 ---------------- */
const STYLES = [
  {
    id: 'ambient', kind: 'instrumental', bpm: [66, 82], drums: false, padAmp: 0.42, lead: 'bell',
    reverb: [0.88, 0.3], delay: 0.62, swirl: true,
    genre: { zh: '氛围电子', en: 'Ambient Electronic' },
    moods: { zh: ['辽阔', '宁静', '希望'], en: ['Expansive', 'Tranquil', 'Hopeful'] }
  },
  {
    id: 'neoclassical', kind: 'instrumental', bpm: [70, 86], drums: false, padAmp: 0.3, lead: 'lead',
    reverb: [0.82, 0.28], delay: 0.3, pianoDensity: 1.4, strings: true,
    genre: { zh: '新古典', en: 'Neo-Classical' },
    moods: { zh: ['温柔', '沉思', '治愈'], en: ['Gentle', 'Thoughtful', 'Healing'] }
  },
  {
    id: 'lofi', kind: 'instrumental', bpm: [78, 96], drums: true, padAmp: 0.34, lead: 'lead',
    reverb: [0.7, 0.34], delay: 0.34, swing: true, vinyl: true,
    genre: { zh: 'Lo-fi 轻电子', en: 'Lo-fi Electronica' },
    moods: { zh: ['松弛', '夜色', '微醺'], en: ['Relaxed', 'Nocturnal', 'Mellow'] }
  },
  {
    id: 'cinematic', kind: 'instrumental', bpm: [72, 92], drums: true, padAmp: 0.46, lead: 'lead',
    reverb: [0.9, 0.28], delay: 0.5, strings: true, big: true,
    genre: { zh: '电影感交响电子', en: 'Cinematic Synphonic' },
    moods: { zh: ['磅礴', '史诗', '燃'], en: ['Epic', 'Majestic', 'Fiery'] }
  },
  {
    id: 'pop-ballad', kind: 'song', bpm: [84, 98], drums: true, padAmp: 0.34, lead: 'lead',
    reverb: [0.74, 0.34], delay: 0.3, vocalGain: 1.55,
    genre: { zh: '流行抒情', en: 'Pop Ballad' },
    moods: { zh: ['温暖', '希望', '团结'], en: ['Warm', 'Hopeful', 'United'] }
  },
  {
    id: 'city-pop', kind: 'song', bpm: [96, 112], drums: true, padAmp: 0.3, lead: 'lead',
    reverb: [0.66, 0.36], delay: 0.26, vocalGain: 1.45, guitarish: true,
    genre: { zh: '城市流行', en: 'City Pop' },
    moods: { zh: ['轻快', '都市', '明亮'], en: ['Breezy', 'Urban', 'Bright'] }
  },
  {
    id: 'dream-pop', kind: 'song', bpm: [78, 92], drums: true, padAmp: 0.4, lead: 'bell',
    reverb: [0.86, 0.32], delay: 0.42, vocalGain: 1.5, harmony: 'all',
    genre: { zh: '梦幻流行', en: 'Dream Pop' },
    moods: { zh: ['梦幻', '柔软', '思念'], en: ['Dreamy', 'Tender', 'Longing'] }
  }
];

const INSTRUMENTAL_STRUCTURE = [
  { name: 'intro', bars: 4 },
  { name: 'a1', bars: 8 },
  { name: 'a2', bars: 8 },
  { name: 'b', bars: 8 },
  { name: 'break', bars: 4 },
  { name: 'climax', bars: 8 },
  { name: 'outro', bars: 4 }
];

const SONG_STRUCTURE = (lineCount) => {
  const parts = [
    { name: 'intro', bars: 4 },
    { name: 'lines', bars: lineCount * 2 },
    { name: 'outro', bars: 4 }
  ];
  return parts;
};

/* ---------------- 规划 ---------------- */

/** 生成一条旋律动机（音阶级进为主） */
function makeMotif(rng, mode, beats = 8) {
  const scale = mode === 'minor' ? MINOR : MAJOR;
  const STEPS = [-2, -1, -1, 1, 1, 2, -3, 3, 0];
  const DURS = [1, 1, 0.5, 0.5, 1.5, 2, 0.75];
  let deg = randInt(rng, 2, 5);
  const notes = [];
  let t = 0;
  while (t < beats - 0.25) {
    const step = choose(rng, STEPS);
    deg = Math.max(0, Math.min(11, deg + step));
    const pc = scale[deg % 7] + 12 * Math.floor(deg / 7);
    const d = Math.min(choose(rng, DURS), beats - t);
    if (d <= 0) break;
    notes.push({ t, degOffset: pc, dur: d });
    t += d;
  }
  return notes;
}

/** 把动机落到小节里，并做变奏（位移八度 / 逆行 / 加装饰） */
function renderMotif(motif, { transpose = 0, retro = false, keepRhythm = true } = {}) {
  const src = retro ? [...motif].reverse() : motif;
  let acc = 0;
  const out = [];
  for (const n of src) {
    out.push({ beat: acc, off: n.degOffset + transpose, dur: keepRhythm ? n.dur : n.dur });
    acc += n.dur;
  }
  return out;
}

function planInstrumental(seed) {
  const rng = mulberry32(hashSeed(seed));
  const styles = STYLES.filter((s) => s.kind === 'instrumental');
  const style = choose(rng, styles);
  const bpm = Math.round(randRange(rng, style.bpm[0], style.bpm[1]));
  const mode = choose(rng, ['major', 'minor']);
  const keyIdx = randInt(rng, 0, 6);
  const keyPc = Object.values(KEY_PC)[keyIdx];
  const keyName = KEY_NAMES[mode][keyIdx];

  const sections = [];
  let bar = 0;
  for (const part of INSTRUMENTAL_STRUCTURE) {
    sections.push({ name: part.name, from: bar, to: bar + part.bars });
    bar += part.bars;
  }
  const totalBars = bar;

  // 每小节和弦：每个段落挑一条进行并循环
  const prog = [];
  for (const sec of sections) {
    const tpl = choose(rng, PROG_TEMPLATES[mode]);
    const rotate = randInt(rng, 0, 3);
    for (let i = sec.from; i < sec.to; i++) {
      const deg = tpl[(i - sec.from + rotate) % tpl.length];
      prog.push(buildChord(mode, keyPc, deg));
    }
  }

  const motif = makeMotif(rng, mode, 8);
  return {
    kind: 'instrumental', seed: String(seed), style, bpm, mode, keyName, keyPc,
    totalBars, sections, prog, motif,
    transpose: Number(process.env.TRANSPOSE ?? 0)
  };
}

function planSong(seed) {
  const rng = mulberry32(hashSeed(seed));
  const styles = STYLES.filter((s) => s.kind === 'song');
  const style = choose(rng, styles);
  const bpm = Math.round(randRange(rng, style.bpm[0], style.bpm[1]));
  const mode = rng() < 0.68 ? 'major' : 'minor';
  const keyIdx = randInt(rng, 0, 6);
  const keyPc = Object.values(KEY_PC)[keyIdx];
  const keyName = KEY_NAMES[mode][keyIdx];
  const lyric = lyricsEngine.compose(rng);

  const intro = 4;
  const outro = 4;
  const lineBlocks = lyric.lines.length;
  const totalBars = intro + lineBlocks * 2 + outro;

  const sections = [
    { name: 'intro', from: 0, to: intro },
    ...lyric.lines.map((l, i) => ({ name: l.role, from: intro + i * 2, to: intro + i * 2 + 2, role: l.role })),
    { name: 'outro', from: intro + lineBlocks * 2, to: totalBars }
  ];

  // 和声：按角色选进行，副歌用同一条以保证记忆点
  const tplVerse = choose(rng, PROG_TEMPLATES[mode]);
  const tplChorus = choose(rng, PROG_TEMPLATES[mode]);
  const tplBridge = choose(rng, PROG_TEMPLATES[mode]);
  const prog = new Array(totalBars);
  for (let bar = 0; bar < totalBars; bar++) {
    const sec = sections.find((s) => bar >= s.from && bar < s.to);
    let idx;
    if (!sec || sec.name === 'intro' || sec.name === 'outro') idx = 0;
    else if (sec.name.startsWith('chorus')) idx = (bar - sec.from) % tplChorus.length;
    else if (sec.name === 'bridge') idx = (bar - sec.from) % tplBridge.length;
    else idx = (bar - sec.from) % tplVerse.length;
    const tpl = (!sec || sec.name === 'intro' || sec.name === 'outro') ? tplVerse
      : sec.name.startsWith('chorus') ? tplChorus : sec.name === 'bridge' ? tplBridge : tplVerse;
    prog[bar] = buildChord(mode, keyPc, tpl[idx]);
  }

  // 逐字旋律：每个歌词行占 2 小节（8 拍），留 0.6 拍换气
  const scale = mode === 'minor' ? MINOR : MAJOR;
  const lines = lyric.lines.map((raw, li) => {
    const bar = intro + li * 2;
    const section = raw.role;
    const chars = [...raw.zh];
    const slot = 7.4;
    const per = slot / chars.length;
    // 旋律轮廓：以和弦音为骨架，行内做波浪起伏
    const ch = prog[bar];
    const anchor = [ch.root, ch.pad[1], ch.pad[2], ch.root + 12];
    const contour = [];
    let cur = randInt(rng, 0, 1);
    for (let i = 0; i < chars.length; i++) {
      const step = choose(rng, [0, 1, 1, -1, -1, 2, -2]);
      cur = Math.max(0, Math.min(3, cur + step));
      contour.push(anchor[cur]);
    }
    let beat = 0;
    const midis = [];
    const durs = [];
    const times = [];
    for (let i = 0; i < chars.length; i++) {
      times.push(beat);
      // 副歌抬高三度左右，桥段压低一度制造对比
      const shift = section.startsWith('chorus') ? 4 : section === 'bridge' ? -1 : 0;
      midis.push(contour[i] + shift);
      durs.push(Math.round(per * 100) / 100);
      beat += per;
    }
    return { role: section, bar, beat: 0, chars: raw.zh, en: raw.en, midis, durs, times };
  });

  return {
    kind: 'song', seed: String(seed), style, bpm, mode, keyName, keyPc,
    totalBars, sections, prog, lines, title: lyric.title,
    transpose: Number(process.env.TRANSPOSE ?? -3)
  };
}

/* ---------------- 渲染 ---------------- */

function sectionNameAt(plan, bar) {
  const sec = plan.sections.find((s) => bar >= s.from && bar < s.to);
  return sec ? sec.name : 'intro';
}

/** 伴奏床：铺底 / 低音 / 钢琴 / 弦乐 / 打击 */
function buildBeds(mix, seq, plan) {
  const st = plan.style;
  const beat = seq.beat;
  for (let bar = 0; bar < plan.totalBars; bar++) {
    const ch = plan.prog[bar];
    const sec = sectionNameAt(plan, bar);
    const isIntro = sec === 'intro';
    const isBreak = sec === 'break';
    const isOutro = sec === 'outro';
    const big = sec === 'climax' || sec.startsWith('chorus') || sec === 'b';
    const quiet = sec === 'intro' || sec === 'break' || sec.startsWith('verse');

    const padMidis = ch.pad.map((m) => m + plan.transpose);
    const bassMidi = ch.bass + plan.transpose;

    // 铺底
    const padAmp = (isIntro ? 0.3 : isBreak ? 0.36 : big ? st.padAmp + 0.06 : st.padAmp) * (quiet ? 0.9 : 1);
    D.pad(mix, seq.t(bar), padMidis, beat * 4, {
      amp: padAmp, a: isIntro ? 1.4 : 0.6, r: 1.1, cutoff: big ? 2200 : 1500
    });
    if (st.strings && big) D.strings(mix, seq.t(bar), padMidis.map((m) => m + 12), beat * 4, { amp: 0.13, a: 0.5, r: 0.9, cutoff: 3000 });

    // 低音
    if (!isIntro) {
      const pattern = big ? [0, 1, 1.5, 2, 3, 3.5] : isBreak ? [0] : [0, 2];
      for (const b of pattern) {
        D.bass(mix, seq.t(bar, b), bassMidi, beat * (big ? 0.45 : 0.85), { amp: big ? 0.5 : 0.42 });
      }
    }

    // 钢琴 / 拨弦
    const density = st.pianoDensity ?? 1;
    if (plan.kind === 'song' && (sec.startsWith('verse') || sec === 'intro' || sec === 'outro')) {
      for (let s = 0; s < 8; s++) {
        const b = s * 0.5;
        const note = ch.arp[s % ch.arp.length] + 12 + plan.transpose;
        D.piano(mix, seq.t(bar, b), note, beat * 0.48, { amp: 0.28, pan: s % 2 ? 0.28 : -0.28 });
      }
    } else if (plan.kind === 'song' && big) {
      [0, 1.5, 2, 3].forEach((b, i) => {
        for (const m of padMidis) D.piano(mix, seq.t(bar, b), m + 12, beat * 0.6, { amp: 0.2, pan: i % 2 ? 0.2 : -0.2 });
      });
    } else if (bar >= plan.sections[0].bars || sec !== 'intro') {
      const steps = Math.round(8 * density);
      const amp = isBreak ? 0.42 : big ? 0.34 : 0.3;
      for (let s = 0; s < steps; s++) {
        const b = (s * 4) / steps;
        const note = ch.arp[s % ch.arp.length] + (s >= ch.arp.length ? 12 : 0) + plan.transpose;
        D.piano(mix, seq.t(bar, b), note, beat * (4 / steps) * 0.95, {
          amp: amp * (s % 2 === 0 ? 1 : 0.75), pan: s % 2 ? 0.25 : -0.25
        });
      }
    }
    if (st.guitarish && !isIntro && sec !== 'break') {
      for (const b of [0.5, 1.5, 2.5, 3.5]) D.pluck(mix, seq.t(bar, b), ch.pad[2] + 12 + plan.transpose, beat * 0.4, { amp: 0.16, pan: 0.3 });
    }

    // 打击乐
    if (st.drums && !isIntro && !isBreak && !(isOutro && bar > plan.totalBars - 3)) {
      const full = big;
      D.kick(mix, seq.t(bar, 0), { amp: full ? 0.95 : 0.68 });
      D.kick(mix, seq.t(bar, 2), { amp: full ? 0.8 : 0.5 });
      if (full) D.kick(mix, seq.t(bar, 3.5), { amp: 0.5 });
      if (sec === 'pre' || full) {
        D.snare(mix, seq.t(bar, 1), { amp: full ? 0.42 : 0.22 });
        D.snare(mix, seq.t(bar, 3), { amp: full ? 0.46 : 0.24 });
      }
      const steps = full ? 8 : 4;
      for (let s = 0; s < steps; s++) D.hat(mix, seq.t(bar, (s * 4) / steps), { amp: 0.12, open: full && s === steps - 1 });
      if (sec === 'climax' || (plan.kind === 'song' && sec.startsWith('chorus') && bar % 16 === plan.sections[0].bars)) {
        D.crash(mix, seq.t(bar, 0), { amp: 0.18 });
      }
      if (quiet) for (let s = 0; s < 4; s++) D.shaker(mix, seq.t(bar, s + 0.5), { amp: 0.08 });
      else if (full) for (let s = 0; s < 4; s++) D.shaker(mix, seq.t(bar, s + 0.5), { amp: 0.12 });
    }
    if (isIntro && bar >= 2 && st.drums) D.shaker(mix, seq.t(bar, 2), { amp: 0.09 });
    if (isBreak) {
      for (let s = 0; s < 2; s++) D.shaker(mix, seq.t(bar, s * 2 + 0.5), { amp: 0.08 });
      if (bar === plan.sections.find((s) => s.name === 'break').to - 1) D.crash(mix, seq.t(bar, 0), { amp: 0.16 });
    }
  }
  // 首尾点缀
  D.bell(mix, seq.t(0, 0), plan.prog[0].pad[2] + 12 + plan.transpose, 1.4, { amp: 0.15 });
  D.bell(mix, seq.t(1, 2), plan.prog[2].pad[1] + 12 + plan.transpose, 1.4, { amp: 0.13 });
  D.bell(mix, seq.t(plan.totalBars - 2, 0), plan.prog[plan.totalBars - 2].pad[0] + 12 + plan.transpose, 1.8, { amp: 0.15 });
}

function mixdown(mix, seq, plan, tailSec) {
  const st = plan.style;
  const rev = new D.Reverb(SR, st.reverb[0], st.reverb[1]);
  const wetL = new Float32Array(mix.n);
  const wetR = new Float32Array(mix.n);
  rev.process(mix.l, mix.r, wetL, wetR, 1);
  const wet = st.id === 'ambient' || st.id === 'dream-pop' ? 0.3 : 0.2;
  for (let i = 0; i < mix.n; i++) {
    mix.l[i] = mix.l[i] * (1 - wet) + wetL[i] * wet;
    mix.r[i] = mix.r[i] * (1 - wet) + wetR[i] * wet;
  }
  if (st.swirl !== false) D.pingpongDelay(mix, { time: seq.beat * st.delay, fb: st.id === 'ambient' ? 0.28 : 0.2, wet: st.id === 'ambient' ? 0.16 : 0.1 });
  D.fade(mix, 0.6, tailSec);
  return D.master(mix, { ceiling: 0.93, drive: st.id === 'cinematic' ? 1.18 : 1.1 });
}

function mixdownPeak(mix) {
  let p = 0;
  for (let i = 0; i < mix.n; i++) {
    const a = Math.max(Math.abs(mix.l[i]), Math.abs(mix.r[i]));
    if (a > p) p = a;
  }
  return p;
}

/** 响度归一：不同编配的整体电平差异较大，统一抬到接近目标峰值再压限 */
function loudness(mix, seq, plan, target = 0.9) {
  let p = 0;
  for (let i = 0; i < mix.n; i++) {
    const a = Math.max(Math.abs(mix.l[i]), Math.abs(mix.r[i]));
    if (a > p) p = a;
  }
  if (p <= 0.001) return;
  const g = Math.min(2.4, target / p);
  if (g <= 1.02) return;
  for (let i = 0; i < mix.n; i++) { mix.l[i] *= g; mix.r[i] *= g; }
  D.master(mix, { ceiling: plan.style.id === 'cinematic' ? 0.95 : 0.93, drive: 1.04 });
}

function writeOut(mix, outFile, durSec, sr = SR) {
  const chans = mix.toChannels();
  const keep = Math.round(durSec * sr);
  const stereo = [chans[0].subarray(0, keep), chans[1].subarray(0, keep)];
  wav.writeWav(outFile, stereo, sr);
  return computePeaks(chans, sr, durSec, 240);
}

function renderInstrumental(plan, opts = {}) {
  const seq = new D.Seq(plan.bpm, SR);
  const totalSec = seq.len(plan.totalBars) + 8;
  const mix = new D.Mix(totalSec, SR);
  const beat = seq.beat;
  buildBeds(mix, seq, plan);

  // 主题旋律：动机在不同段落变形出现
  const tp = plan.transpose;
  const playMotif = (startBar, variant) => {
    const notes = renderMotif(plan.motif, variant);
    const base = plan.prog[startBar].pad[0] + tp;
    for (const n of notes) {
      const midi = base + n.off;
      const t0 = seq.t(startBar, n.beat);
      const dur = n.dur * beat * 0.96;
      const sec = sectionNameAt(plan, startBar);
      if (plan.style.lead === 'bell') {
        D.bell(mix, t0, midi, dur, { amp: sec === 'climax' ? 0.34 : 0.26, pan: 0.1 });
        D.pluck(mix, t0 + dur * 0.98, midi - 12, dur * 0.5, { amp: 0.12, pan: -0.4 });
      } else {
        D.lead(mix, t0, midi, dur, { amp: sec === 'climax' ? 0.32 : 0.24 });
        if (sec === 'climax' || sec === 'b') {
          D.lead(mix, t0, midi - 5, dur, { amp: 0.1, pan: -0.3 });
        }
      }
      if (plan.style.strings) D.pad(mix, t0, [midi], dur, { amp: 0.1, a: 0.2, r: 0.5, cutoff: 2400 });
    }
  };

  const { sections } = plan;
  const at = (name) => sections.find((s) => s.name === name);
  const a1 = at('a1'), a2 = at('a2'), b = at('b'), climax = at('climax');
  for (let bar = a1.from; bar < a1.to; bar += 2) playMotif(bar, { transpose: 0 });
  for (let bar = a2.from; bar < a2.to; bar += 2) playMotif(bar, { transpose: 12, retro: bar % 4 === 0 });
  for (let bar = b.from; bar < b.to; bar += 2) playMotif(bar, { transpose: 0, retro: true });
  for (let bar = climax.from; bar < climax.to; bar += 2) playMotif(bar, { transpose: 12 });

  mixdown(mix, seq, plan, 4.2);
  loudness(mix, seq, plan);
  const peak = mixdownPeak(mix);
  const outFile = opts.outFile || path.join(BUILD, 'wav', `${plan.seed}.wav`);
  const durSec = seq.len(plan.totalBars) + 3;
  const peaks = writeOut(mix, outFile, durSec);
  console.log(`[${plan.seed}] 纯音乐时长 ${durSec.toFixed(1)}s 峰值 ${peak.toFixed(3)} → ${outFile}`);
  return { file: outFile, duration: durSec, peaks };
}

function renderSong(plan, opts = {}) {
  const seq = new D.Seq(plan.bpm, SR);
  const totalSec = seq.len(plan.totalBars) + 6;
  const mix = new D.Mix(totalSec, SR);
  buildBeds(mix, seq, plan);

  // 逐字旋律骨架：有人声时交给 vocal.js 演唱，无人声时由乐器演奏
  const tp = plan.transpose;
  const vocalOn = opts.vocal !== false && process.env.VOCAL !== '0';
  const harmonyAll = plan.style.harmony === 'all';
  const syllables = [];
  for (const line of plan.lines) {
    for (let i = 0; i < line.midis.length; i++) {
      const t0 = seq.t(line.bar, line.times[i]);
      syllables.push({
        char: line.chars[i],
        midi: line.midis[i] + tp,
        t0,
        durSec: line.durs[i] * seq.beat,
        harmony: harmonyAll ? line.role.startsWith('chorus') : line.role === 'chorusFinal',
        gain: line.role === 'chorusFinal' ? 1.0 : line.role === 'bridge' ? 0.82 : 0.9
      });
    }
  }
  if (vocalOn) {
    const vox = vocal.buildVocalTrack(syllables, totalSec, { voice: opts.voice });
    const vg = opts.vocalGain ?? plan.style.vocalGain ?? 1.6;
    for (let i = 0; i < mix.n; i++) { mix.l[i] += vox.l[i] * vg; mix.r[i] += vox.r[i] * vg; }
    plan.syllables = syllables.length;
  } else {
    // 无人声版：把逐字旋律连成乐句，用主奏音色唱出原本的旋律线
    const bell = plan.style.lead === 'bell';
    for (let k = 0; k < syllables.length;) {
      const s = syllables[k];
      let dur = s.durSec;
      let j = k + 1;
      while (j < syllables.length && syllables[j].midi === s.midi && Math.abs(syllables[j].t0 - (s.t0 + dur)) < 1e-6) {
        dur += syllables[j].durSec;
        j++;
      }
      const long = dur >= seq.beat * 1.5;
      if (bell) D.bell(mix, s.t0, s.midi, dur * 0.96, { amp: long ? 0.3 : 0.24 });
      else D.lead(mix, s.t0, s.midi, dur * 0.96, { amp: long ? 0.3 : 0.25 });
      k = j;
    }
    plan.syllables = 0;
  }

  // 副歌上方的应答旋律（器乐对句）
  for (const line of plan.lines) {
    if (!line.role.startsWith('chorus')) continue;
    const ch = plan.prog[line.bar];
    for (let i = 0; i < 4; i++) {
      const midi = ch.pad[i % 3] + 24 + tp;
      D.bell(mix, seq.t(line.bar, i * 2), midi, seq.beat * 0.9, { amp: 0.13, pan: i % 2 ? 0.3 : -0.3 });
    }
  }

  mixdown(mix, seq, plan, 3.6);
  loudness(mix, seq, plan);
  const peak = mixdownPeak(mix);
  const outFile = opts.outFile || path.join(BUILD, 'wav', `${plan.seed}.wav`);
  const durSec = seq.len(plan.totalBars) + 2.6;
  const peaks = writeOut(mix, outFile, durSec);
  console.log(`[${plan.seed}] 歌曲时长 ${durSec.toFixed(1)}s 峰值 ${peak.toFixed(3)} → ${outFile}`);
  return { file: outFile, duration: durSec, peaks, syllables };
}

/** 把 plan 的歌词转成前台需要的逐字时间轴 */
function lyricTimeline(plan, seq) {
  return plan.lines.map((line) => {
    const chars = [...line.chars];
    let beat = 0;
    const list = chars.map((c, i) => {
      const t = Math.round(seq.t(line.bar, line.times[i]) * 100) / 100;
      beat += line.durs[i];
      return `${t}|${c}`;
    });
    return {
      time: Math.round(seq.t(line.bar, line.times[0]) * 100) / 100,
      zh: line.chars,
      en: line.en,
      chars: list.join(' ')
    };
  });
}

function plan(seed, kind) {
  return kind === 'song' ? planSong(seed) : planInstrumental(seed);
}
function render(p, opts = {}) {
  return p.kind === 'song' ? renderSong(p, opts) : renderInstrumental(p, opts);
}

module.exports = {
  plan, render, planInstrumental, planSong, renderInstrumental, renderSong,
  lyricTimeline, STYLES, buildChord, hashSeed, mulberry32, SR
};
