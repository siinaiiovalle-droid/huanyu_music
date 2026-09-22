#!/usr/bin/env node
'use strict';
/**
 * 接口与页面冒烟自检：npm run test:api
 * 会在临时端口启动服务，跑完全部用例后恢复 data/tracks.json 与临时文件。
 * 零第三方依赖。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = Number(process.env.TEST_PORT || 3999);
const PASSWORD = 'test-pw-' + Date.now().toString(36);
process.env.PORT = String(PORT);
process.env.ADMIN_PASSWORD = PASSWORD;

const ROOT = path.join(__dirname, '..');
const DATA_FILE = path.join(ROOT, 'data', 'tracks.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const TMP_DIR = path.join(ROOT, 'build', 'tmp-test');
const { writeWav } = require('./lib/wav');
const { server } = require('../server.js');

const backup = fs.existsSync(DATA_FILE) ? fs.readFileSync(DATA_FILE, 'utf8') : '';
const cleanupFiles = [];
let pass = 0, fail = 0;

function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✔ ${name}`); }
  else { fail++; console.log(`  ✖ ${name}${extra ? '  → ' + extra : ''}`); }
}

function request(method, p, { body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, raw, json, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const get = (p, headers) => request('GET', p, { headers });
const postJson = (p, obj, headers = {}) => {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  return request('POST', p, { body: b, headers: { 'Content-Type': 'application/json', 'Content-Length': b.length, ...headers } });
};

function buildMultipart(fields, files) {
  const b = '----test' + Date.now().toString(36);
  const parts = [];
  for (const k of Object.keys(fields)) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${fields[k]}\r\n`));
  }
  for (const f of files) {
    parts.push(Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="${f.field}"; filename="${f.name}"\r\nContent-Type: ${f.type}\r\n\r\n`));
    parts.push(f.data);
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  console.log(`\n  寰宇音乐台 · 接口自检（端口 ${PORT}）\n`);

  /* ---------- 开放接口 ---------- */
  const list = await get('/api/tracks');
  check('GET /api/tracks 返回 200', list.status === 200, list.status);
  check('曲目列表非空', Array.isArray(list.json.tracks) && list.json.tracks.length > 0);
  check('统计字段完整', list.json.stats && typeof list.json.stats.totalPlays === 'number');

  const first = (list.json.tracks || [])[0];
  check('曲目含封面与音频路径', !!first && !!first.cover && !!first.audio);
  if (!first) throw new Error('数据为空，无法继续');

  const one = await get('/api/tracks/' + encodeURIComponent(first.id));
  check('GET /api/tracks/:id 返回作品', one.status === 200 && one.json.id === first.id);

  const missing = await get('/api/tracks/not-exist-xyz');
  check('不存在的作品返回 404', missing.status === 404);

  const before = one.json.plays || 0;
  const played = await postJson('/api/tracks/' + encodeURIComponent(first.id) + '/play', {});
  check('POST /play 播放计数 +1', played.status === 200 && played.json.plays === before + 1, JSON.stringify(played.json));

  const likedBefore = (await get('/api/tracks/' + encodeURIComponent(first.id))).json.likes || 0;
  const liked = await postJson('/api/tracks/' + encodeURIComponent(first.id) + '/like', {});
  check('POST /like 点赞计数 +1', liked.status === 200 && liked.json.likes === likedBefore + 1);

  const noApi = await get('/api/unknown');
  check('未知接口返回 404', noApi.status === 404);

  /* ---------- 后台鉴权 ---------- */
  const badLogin = await postJson('/api/admin/login', { password: 'wrong' });
  check('错误密码登录返回 401', badLogin.status === 401);

  const noAuth = await request('POST', '/api/admin/tracks', { body: Buffer.alloc(0), headers: { 'Content-Type': 'multipart/form-data; boundary=x' } });
  check('未登录上传返回 401', noAuth.status === 401);

  const login = await postJson('/api/admin/login', { password: PASSWORD });
  check('正确密码登录返回 token', login.status === 200 && typeof login.json.token === 'string');
  const auth = { Authorization: 'Bearer ' + (login.json.token || '') };

  const verify = await get('/api/admin/verify', auth);
  check('GET /api/admin/verify 通过', verify.status === 200 && verify.json.ok === true);

  const verifyBad = await get('/api/admin/verify', { Authorization: 'Bearer bad-token' });
  check('无效 token 校验失败', verifyBad.status === 401);

  /* ---------- 上传 / 编辑 / 删除 ---------- */
  fs.mkdirSync(TMP_DIR, { recursive: true });
  const wavPath = path.join(TMP_DIR, 'cli-test.wav');
  const n = 44100;
  const ch = new Float32Array(n);
  for (let i = 0; i < n; i++) ch[i] = Math.sin((2 * Math.PI * 440 * i) / 44100) * 0.3;
  writeWav(wavPath, [ch, ch], 44100);
  cleanupFiles.push(wavPath);

  const mp = buildMultipart(
    { title: 'CLI 测试曲', kind: 'instrumental', genre: '测试', bpm: '100', featured: '1', duration: '1' },
    [{ field: 'audio', name: 'cli-test.wav', type: 'audio/wav', data: fs.readFileSync(wavPath) }]
  );
  const up = await request('POST', '/api/admin/tracks', {
    body: mp.body,
    headers: { 'Content-Type': mp.contentType, 'Content-Length': mp.body.length, ...auth }
  });
  check('上传新作品返回 201', up.status === 201, up.raw.slice(0, 200));
  const newId = up.json && up.json.track ? up.json.track.id : '';
  check('上传后自动生成封面', !!newId && !!up.json.track.cover);
  if (newId) {
    cleanupFiles.push(path.join(PUBLIC_DIR, up.json.track.audio));
    cleanupFiles.push(path.join(PUBLIC_DIR, up.json.track.cover));
  }

  const gotNew = await get('/api/tracks/' + encodeURIComponent(newId));
  check('新作品可被查询', gotNew.status === 200 && gotNew.json.title.zh === 'CLI 测试曲');

  const patch = Buffer.from(JSON.stringify({ subtitle: { zh: '副标题', en: 'Sub' }, bpm: 120 }), 'utf8');
  const put = await request('PUT', '/api/admin/tracks/' + encodeURIComponent(newId), {
    body: patch, headers: { 'Content-Type': 'application/json', 'Content-Length': patch.length, ...auth }
  });
  check('PUT 修改作品成功', put.status === 200 && put.json.track.bpm === 120);

  const del = await request('DELETE', '/api/admin/tracks/' + encodeURIComponent(newId), { headers: auth });
  check('DELETE 删除作品成功', del.status === 200);
  const delAgain = await request('DELETE', '/api/admin/tracks/' + encodeURIComponent(newId), { headers: auth });
  check('重复删除返回 404', delAgain.status === 404);

  /* ---------- 页面与静态资源 ---------- */
  for (const page of ['/', '/index.html', '/track.html?id=' + encodeURIComponent(first.id), '/about.html', '/admin.html', '/css/style.css', '/js/i18n.js', '/img/favicon.svg']) {
    const r = await get(page);
    check(`静态资源 ${page} 可访问`, r.status === 200, r.status);
  }

  const audioRange = await get('/' + first.audio, { Range: 'bytes=0-1023' });
  check('音频支持 Range 分段请求', audioRange.status === 206 && /bytes 0-1023\//.test(audioRange.headers['content-range'] || ''),
    audioRange.status + ' ' + (audioRange.headers['content-range'] || ''));

  const cover = await get('/' + first.cover);
  check('封面图片可访问', cover.status === 200 && (cover.headers['content-type'] || '').startsWith('image/'));

  const notFound = await get('/no-such-page.html');
  check('未知页面返回 404', notFound.status === 404);
}

function restore() {
  if (backup) fs.writeFileSync(DATA_FILE, backup, 'utf8');
  for (const f of cleanupFiles) {
    try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) { /* ignore */ }
  }
  try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch (e) { /* ignore */ }
}

async function start() {
  try {
    await run();
  } catch (e) {
    fail++;
    console.log('  ✖ 运行异常：' + e.message);
  }
  await sleep(800); // 等待服务防抖落盘
  console.log(`\n  通过 ${pass} 项，失败 ${fail} 项\n`);
  server.close(() => {
    restore();
    process.exit(fail ? 1 : 0);
  });
}

// server.js 在 require 时已经 listen，这里等它就绪即可
if (server.listening) start();
else server.once('listening', start);
