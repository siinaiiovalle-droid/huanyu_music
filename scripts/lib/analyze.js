'use strict';
/**
 * 音频体检：时长、电平、削波、静音段检测，用于自动化检查作品是否可发布。
 */
const wav = require('./wav');

function report(file, opts = {}) {
  const w = wav.readWav(file);
  const mono = w.numChannels === 1 ? w.channels[0] : wav.toMono(w);
  const sr = w.sampleRate;
  const dur = mono.length / sr;
  const seg = Math.max(1, Math.round(dur / (opts.segments || 16)));
  const segLen = Math.floor(mono.length / seg);
  const bars = [];
  let clipped = 0;
  let silent = 0;
  for (let s = 0; s < seg; s++) {
    let sum = 0, peak = 0;
    for (let i = s * segLen; i < (s + 1) * segLen; i++) {
      const v = mono[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
    const rms = Math.sqrt(sum / segLen);
    bars.push(rms);
    if (rms < 0.001) silent++;
  }
  const overall = bars.reduce((a, b) => a + b, 0) / bars.length;
  const maxRms = Math.max(...bars);
  return {
    file, durationSec: Math.round(dur * 100) / 100, sampleRate: sr, channels: w.numChannels,
    rms: Math.round(overall * 10000) / 10000,
    peakRms: Math.round(maxRms * 10000) / 10000,
    clippedSamples: clipped,
    silentSegments: silent,
    ok: clipped === 0 && silent === 0 && overall > 0.02,
    bars: bars.map((v) => Math.round(v * 1000) / 1000)
  };
}

function printReport(file) {
  const r = report(file);
  console.log(`\n体检：${file.split(/[\\/]/).pop()}`);
  console.log(`  时长 ${r.durationSec}s  采样率 ${r.sampleRate}  声道 ${r.channels}`);
  console.log(`  平均电平 ${r.rms}  峰值电平 ${r.peakRms}  削波采样 ${r.clippedSamples}  静音段 ${r.silentSegments}`);
  console.log(`  电平分布 ${r.bars.join(' ')}`);
  console.log(`  结论：${r.ok ? '通过' : '需检查'}`);
  return r;
}

module.exports = { report, printReport };
