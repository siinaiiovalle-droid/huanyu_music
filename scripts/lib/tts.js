'use strict';
/**
 * 调用 Windows 语音合成（SAPI）批量生成中文人声素材。
 * 每个音节单独合成，可通过 SSML 指定音高（Hz）与语速，从而"唱"出旋律。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PS1 = path.join(ROOT, 'scripts', '_tts.ps1');

function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {Array} jobs [{id, text, pitchHz, ratePercent, lang}]
 * @param {string} outDir
 * @param {string} voice 例如 'Microsoft Huihui Desktop'
 */
function synth(jobs, outDir, voice) {
  fs.mkdirSync(outDir, { recursive: true });
  const prepared = jobs.map((j) => {
    const rate = j.ratePercent == null ? null : `${j.ratePercent}%`;
    const pitch = j.pitchHz == null ? null : `${Math.round(j.pitchHz)}Hz`;
    if (!rate && !pitch) return { id: j.id, text: j.text };
    const attrs = [];
    if (pitch) attrs.push(`pitch="${pitch}"`);
    if (rate) attrs.push(`rate="${rate}"`);
    const lang = j.lang || 'zh-CN';
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/2005/Synthesis" xml:lang="${lang}"><prosody ${attrs.join(' ')}>${escapeXml(j.text)}</prosody></speak>`;
    return { id: j.id, ssml };
  });
  const jobsFile = path.join(outDir, '_jobs.json');
  fs.writeFileSync(jobsFile, JSON.stringify(prepared), 'utf8');
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS1, '-Jobs', jobsFile, '-OutDir', outDir];
  if (voice) args.push('-Voice', voice);
  execFileSync('powershell', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const result = {};
  for (const j of prepared) {
    const f = path.join(outDir, j.id + '.wav');
    result[j.id] = fs.existsSync(f) && fs.statSync(f).size > 1024 ? f : null;
  }
  return result;
}

module.exports = { synth, ROOT };
