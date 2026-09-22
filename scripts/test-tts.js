'use strict';
/**
 * 人声合成校准：验证 SSML 绝对音高是否被支持，并测量单字时长，
 * 供《世界同频》人声轨道使用。
 */
const path = require('path');
const fs = require('fs');
const { synth } = require('./lib/tts');
const wav = require('./lib/wav');

const OUT = path.join(__dirname, '..', 'build', 'tts-test');
const VOICE = 'Microsoft Huihui Desktop';

const jobs = [
  { id: 'plain', text: '啊' },
  { id: 'p220', text: '啊', pitchHz: 220 },
  { id: 'p262', text: '啊', pitchHz: 262 },
  { id: 'p330', text: '啊', pitchHz: 330 },
  { id: 'p440', text: '啊', pitchHz: 440 },
  { id: 'word', text: '世界' },
  { id: 'fast', text: '世界同频', ratePercent: 40 }
];

console.log('正在合成测试样本…');
const res = synth(jobs, OUT, VOICE);
console.log('音高(Hz)  实测基频(Hz)  时长(s)  采样率  文件');
for (const j of jobs) {
  const f = res[j.id];
  if (!f) { console.log(`${String(j.pitchHz ?? '-').padEnd(9)} FAILED`); continue; }
  const w = wav.readWav(f);
  const mono = wav.toMono(w);
  const f0 = wav.estimatePitch(mono, w.sampleRate, 0.15, 0.85);
  const dur = mono.length / w.sampleRate;
  console.log(
    `${String(j.pitchHz ?? '-').padEnd(9)} ${f0.toFixed(1).padEnd(12)} ${dur.toFixed(3).padEnd(8)} ${String(w.sampleRate).padEnd(7)} ${path.basename(f)}`
  );
}
console.log('\n样本目录：' + OUT);
console.log(fs.readdirSync(OUT).join(', '));
