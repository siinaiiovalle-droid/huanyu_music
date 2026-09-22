'use strict';
/**
 * 寰宇音乐台 · 零依赖 HTTP 服务
 *   - 静态站点托管（支持音频 Range 请求）
 *   - 开放 API：曲目列表 / 详情 / 播放计数 / 点赞
 *   - 后台 API：登录、上传新作品、编辑、删除（供"以后有新创作再发上去"使用）
 * 仅需 Node.js 18+，无需 npm install。
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const TRACKS_FILE = path.join(DATA_DIR, 'tracks.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'music888';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.flac': 'audio/flac',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

/* ---------------- 数据 ---------------- */
let state = { tracks: [], updatedAt: null };
let saveTimer = null;

function loadState() {
  try {
    state = JSON.parse(fs.readFileSync(TRACKS_FILE, 'utf8'));
  } catch (e) {
    state = { tracks: [] };
  }
  if (!Array.isArray(state.tracks)) state.tracks = [];
}
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      state.updatedAt = new Date().toISOString();
      fs.writeFileSync(TRACKS_FILE, JSON.stringify(state, null, 2), 'utf8');
    } catch (e) {
      console.error('[保存失败]', e.message);
    }
  }, 400);
}
function saveNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  state.updatedAt = new Date().toISOString();
  fs.writeFileSync(TRACKS_FILE, JSON.stringify(state, null, 2), 'utf8');
}
function findTrack(id) { return state.tracks.find((t) => t.id === id); }
function publicTrack(t) {
  if (!t) return null;
  const { id, kind, title, subtitle, description, credits, cover, audio, duration, bpm, musicalKey, genre, moods, peaks, lyrics, plays, likes, featured, releasedAt } = t;
  return { id, kind, title, subtitle, description, credits, cover, audio, duration, bpm, musicalKey, genre, moods, peaks, lyrics, plays: plays || 0, likes: likes || 0, featured: !!featured, releasedAt };
}

loadState();

/* ---------------- 鉴权 ---------------- */
const tokens = new Map(); // token -> 过期时间
function issueToken() {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, Date.now() + 1000 * 60 * 60 * 8);
  return token;
}
function checkAuth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const exp = tokens.get(token);
  if (!exp) return false;
  if (exp < Date.now()) { tokens.delete(token); return false; }
  return true;
}

/* ---------------- 工具 ---------------- */
function sendJson(res, code, data) {
  const body = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}
function readBody(req, limit = 200 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/** 极简 multipart/form-data 解析 */
function parseMultipart(buffer, boundary) {
  const parts = [];
  const sep = Buffer.from('--' + boundary);
  let idx = buffer.indexOf(sep);
  if (idx < 0) return parts;
  idx += sep.length;
  while (true) {
    const next = buffer.indexOf(sep, idx);
    if (next < 0) break;
    const chunk = buffer.slice(idx, next);
    const headEnd = chunk.indexOf('\r\n\r\n');
    if (headEnd < 0) break;
    const head = chunk.slice(0, headEnd).toString('utf8');
    let body = chunk.slice(headEnd + 4);
    if (body.length >= 2 && body[body.length - 2] === 13 && body[body.length - 1] === 10) body = body.slice(0, body.length - 2);
    const nameM = /name="([^"]*)"/.exec(head);
    const fileM = /filename="([^"]*)"/.exec(head);
    const ctM = /Content-Type:\s*([^\r\n]+)/i.exec(head);
    parts.push({
      name: nameM ? nameM[1] : '',
      filename: fileM ? fileM[1] : '',
      contentType: ctM ? ctM[1].trim() : '',
      data: body
    });
    idx = next + sep.length;
    if (buffer.slice(idx, idx + 2).toString() === '--') break;
  }
  return parts;
}

function slugify(text, fallback = 'track') {
  const s = String(text || '').trim().toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s || fallback;
}

function safeExt(filename, contentType) {
  const ext = path.extname(filename || '').toLowerCase();
  if (['.mp3', '.wav', '.ogg', '.m4a', '.flac'].includes(ext)) return ext;
  if (contentType.includes('mpeg')) return '.mp3';
  if (contentType.includes('wav')) return '.wav';
  if (contentType.includes('ogg')) return '.ogg';
  if (contentType.includes('mp4')) return '.m4a';
  return '.mp3';
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^([/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>页面不存在 <a href="/">返回首页</a></p>');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const range = req.headers.range;
    if (range && st.size > 0) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end = m[2] ? parseInt(m[2], 10) : st.size - 1;
        if (start >= st.size || end >= st.size || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          res.end(); return;
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Range': `bytes ${start}-${end}/${st.size}`,
          'Content-Length': end - start + 1,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000'
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': st.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- API ---------------- */
const api = {
  'GET /api/tracks': async (req, res) => {
    const list = state.tracks.map(publicTrack);
    sendJson(res, 200, {
      total: list.length,
      tracks: list,
      stats: {
        totalPlays: list.reduce((s, t) => s + t.plays, 0),
        totalLikes: list.reduce((s, t) => s + t.likes, 0),
        totalDuration: Math.round(list.reduce((s, t) => s + (t.duration || 0), 0))
      }
    });
  },
  'GET /api/tracks/:id': async (req, res, params) => {
    const t = findTrack(params.id);
    if (!t) return sendJson(res, 404, { error: '作品不存在' });
    sendJson(res, 200, publicTrack(t));
  },
  'POST /api/tracks/:id/play': async (req, res, params) => {
    const t = findTrack(params.id);
    if (!t) return sendJson(res, 404, { error: '作品不存在' });
    t.plays = (t.plays || 0) + 1;
    saveSoon();
    sendJson(res, 200, { plays: t.plays });
  },
  'POST /api/tracks/:id/like': async (req, res, params) => {
    const t = findTrack(params.id);
    if (!t) return sendJson(res, 404, { error: '作品不存在' });
    t.likes = (t.likes || 0) + 1;
    saveSoon();
    sendJson(res, 200, { likes: t.likes });
  },
  'POST /api/admin/login': async (req, res) => {
    const body = await readBody(req, 1024 * 64);
    let data = {};
    try { data = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { data = {}; }
    if (data.password !== ADMIN_PASSWORD) return sendJson(res, 401, { error: '密码不正确' });
    sendJson(res, 200, { token: issueToken(), expiresIn: 8 * 3600 });
  },
  'GET /api/admin/verify': async (req, res) => {
    sendJson(res, checkAuth(req) ? 200 : 401, { ok: checkAuth(req) });
  },
  'POST /api/admin/tracks': async (req, res) => {
    if (!checkAuth(req)) return sendJson(res, 401, { error: '未登录或登录已过期' });
    const ct = req.headers['content-type'] || '';
    if (!ct.includes('multipart/form-data')) return sendJson(res, 400, { error: '请用 multipart/form-data 提交' });
    const buf = await readBody(req);
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
    if (!bm) return sendJson(res, 400, { error: '缺少 boundary' });
    const parts = parseMultipart(buf, bm[1] || bm[2]);
    const field = (n) => { const p = parts.find((x) => x.name === n && !x.filename); return p ? p.data.toString('utf8') : ''; };
    const file = (n) => parts.find((x) => x.name === n && x.filename && x.data.length > 0);
    const audio = file('audio');
    if (!audio) return sendJson(res, 400, { error: '缺少音频文件' });
    const title = field('title') || audio.filename.replace(/\.[^.]+$/, '');
    const idRaw = field('id') || slugify(title) || ('track-' + Date.now());
    let id = slugify(idRaw, 'track-' + Date.now());
    if (findTrack(id)) id = `${id}-${Date.now().toString(36)}`;
    const ext = safeExt(audio.filename, audio.contentType);
    const audioRel = `audio/${id}${ext}`;
    fs.mkdirSync(path.join(PUBLIC_DIR, 'audio'), { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, audioRel), audio.data);

    let coverRel = '';
    const coverFile = file('cover');
    if (coverFile) {
      const cext = path.extname(coverFile.filename).toLowerCase() || '.png';
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(cext)) {
        coverRel = `img/covers/${id}${cext}`;
        fs.mkdirSync(path.join(PUBLIC_DIR, 'img', 'covers'), { recursive: true });
        fs.writeFileSync(path.join(PUBLIC_DIR, coverRel), coverFile.data);
      }
    }
    if (!coverRel) {
      try {
        const { autoCover } = require('./scripts/make-covers');
        coverRel = `img/covers/${id}.png`;
        fs.mkdirSync(path.join(PUBLIC_DIR, 'img', 'covers'), { recursive: true });
        autoCover(path.join(PUBLIC_DIR, coverRel), hashSeed(id), title);
      } catch (e) {
        coverRel = 'img/covers/starfield-overture.png';
      }
    }

    const langs = ['zh', 'en', 'es', 'fr', 'ja', 'ar'];
    const mk = (v) => { const o = {}; for (const l of langs) o[l] = v || ''; return o; };
    const track = {
      id,
      kind: field('kind') === 'instrumental' ? 'instrumental' : 'song',
      title: mk(field('title') || title),
      subtitle: mk(field('subtitle')),
      description: mk(field('description')),
      credits: mk(field('credits') || '寰宇音乐台'),
      cover: coverRel,
      audio: audioRel,
      duration: Number(field('duration')) || 0,
      bpm: Number(field('bpm')) || 0,
      musicalKey: field('musicalKey') || '',
      genre: { zh: field('genre') || '', en: field('genre') || '' },
      moods: { zh: [], en: [] },
      peaks: [],
      lyrics: field('lyrics') ? JSON.parse(field('lyrics')) : null,
      plays: 0,
      likes: 0,
      featured: field('featured') === '1',
      releasedAt: new Date().toISOString().slice(0, 10)
    };
    state.tracks.unshift(track);
    saveNow();
    sendJson(res, 201, { ok: true, track: publicTrack(track) });
  },
  'PUT /api/admin/tracks/:id': async (req, res, params) => {
    if (!checkAuth(req)) return sendJson(res, 401, { error: '未登录或登录已过期' });
    const t = findTrack(params.id);
    if (!t) return sendJson(res, 404, { error: '作品不存在' });
    const body = await readBody(req, 1024 * 1024);
    let patch = {};
    try { patch = JSON.parse(body.toString('utf8') || '{}'); } catch (e) { return sendJson(res, 400, { error: 'JSON 格式错误' }); }
    const allowed = ['title', 'subtitle', 'description', 'credits', 'genre', 'moods', 'musicalKey', 'bpm', 'featured', 'lyrics', 'cover', 'kind'];
    for (const k of allowed) if (patch[k] !== undefined) t[k] = patch[k];
    saveNow();
    sendJson(res, 200, { ok: true, track: publicTrack(t) });
  },
  'DELETE /api/admin/tracks/:id': async (req, res, params) => {
    if (!checkAuth(req)) return sendJson(res, 401, { error: '未登录或登录已过期' });
    const i = state.tracks.findIndex((t) => t.id === params.id);
    if (i < 0) return sendJson(res, 404, { error: '作品不存在' });
    const [t] = state.tracks.splice(i, 1);
    for (const rel of [t.audio, t.cover]) {
      if (!rel) continue;
      const p = path.join(PUBLIC_DIR, rel);
      if (p.startsWith(PUBLIC_DIR) && fs.existsSync(p)) { try { fs.unlinkSync(p); } catch (e) { /* ignore */ } }
    }
    saveNow();
    sendJson(res, 200, { ok: true });
  }
};

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 100000;
}

/* ---------------- 路由 ---------------- */
function matchApi(method, pathname) {
  for (const key of Object.keys(api)) {
    const [m, p] = key.split(' ');
    if (m !== method) continue;
    const ks = p.split('/');
    const ps = pathname.split('/');
    if (ks.length !== ps.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < ks.length; i++) {
      if (ks[i].startsWith(':')) params[ks[i].slice(1)] = decodeURIComponent(ps[i]);
      else if (ks[i] !== ps[i]) { ok = false; break; }
    }
    if (ok) return { handler: api[key], params };
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = u.pathname.replace(/\/+$/, '') || '/';
  try {
    if (pathname.startsWith('/api/')) {
      const hit = matchApi(req.method, pathname);
      if (!hit) return sendJson(res, 404, { error: '接口不存在' });
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      await hit.handler(req, res, hit.params);
      return;
    }
    serveStatic(req, res, pathname);
  } catch (e) {
    console.error('[请求异常]', req.method, pathname, e.message);
    if (!res.headersSent) sendJson(res, 500, { error: e.message || '服务器内部错误' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ┌──────────────────────────────────────────────┐');
  console.log('  │   寰宇音乐台 Huanyu Music · 已启动            │');
  console.log('  └──────────────────────────────────────────────┘');
  console.log(`  首页      http://localhost:${PORT}/`);
  console.log(`  作品详情  http://localhost:${PORT}/track.html?id=world-in-sync`);
  console.log(`  关于      http://localhost:${PORT}/about.html`);
  console.log(`  发布后台  http://localhost:${PORT}/admin.html   (密码 ${ADMIN_PASSWORD})`);
  console.log(`  开放接口  http://localhost:${PORT}/api/tracks`);
  console.log(`  当前曲目  ${state.tracks.length} 首`);
  console.log('');
});

module.exports = { server, state };
