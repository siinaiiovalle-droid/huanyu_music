/* 静态站导出：把 public/ + 曲库数据导出成可在 GitHub Pages（纯静态托管）运行的 dist/。
   用法：npm run build:static  → 产出 dist/，推送到 gh-pages 分支即可。 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data', 'tracks.json');
const SHIM = path.join(__dirname, 'assets', 'static-shim.js');
const DIST = path.join(ROOT, 'dist');

const PUBLIC_FIELDS = [
  'id', 'kind', 'title', 'subtitle', 'description', 'credits', 'cover', 'audio',
  'duration', 'bpm', 'musicalKey', 'genre', 'moods', 'peaks', 'lyrics',
  'plays', 'likes', 'featured', 'releasedAt'
];

function publicTrack(t) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (t[k] !== undefined) out[k] = t[k];
  out.plays = out.plays || 0;
  out.likes = out.likes || 0;
  out.featured = !!out.featured;
  return out;
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const src = path.join(from, name);
    const dst = path.join(to, name);
    if (fs.statSync(src).isDirectory()) copyDir(src, dst);
    else fs.copyFileSync(src, dst);
  }
}

function walkHtml(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...walkHtml(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyDir(PUBLIC, DIST);
  fs.rmSync(path.join(DIST, 'admin.html'), { force: true });
  fs.copyFileSync(SHIM, path.join(DIST, 'static-shim.js'));

  // 曲库快照（等价于 GET /api/tracks 的响应）
  const raw = JSON.parse(fs.readFileSync(DATA, 'utf8'));
  const list = (raw.tracks || []).map(publicTrack);
  const payload = {
    total: list.length,
    tracks: list,
    stats: {
      totalPlays: list.reduce((s, t) => s + (t.plays || 0), 0),
      totalLikes: list.reduce((s, t) => s + (t.likes || 0), 0),
      totalDuration: Math.round(list.reduce((s, t) => s + (t.duration || 0), 0))
    },
    updatedAt: raw.updatedAt || null
  };
  fs.writeFileSync(path.join(DIST, 'tracks.json'), JSON.stringify(payload), 'utf8');

  // 静态镜像不支持后台，替换成一个说明页
  fs.writeFileSync(path.join(DIST, 'admin.html'), `<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>内容后台 · 寰宇音乐台</title>
<link rel="stylesheet" href="css/style.css"><link rel="icon" href="img/favicon.svg"></head>
<body style="display:grid;place-items:center;min-height:100vh;text-align:center">
  <div style="max-width:520px;padding:32px">
    <h1 style="margin-bottom:12px">内容后台仅在本地运行</h1>
    <p style="opacity:.8;line-height:1.8">
      当前打开的是托管在 GitHub Pages 上的<b>静态镜像</b>，没有 Node 服务，因此无法登录后台、发布作品。<br>
      请在本地执行 <code>npm start</code> 后访问 http://localhost:3000/admin.html 使用完整后台。
    </p>
    <p style="margin-top:18px"><a class="btn btn-primary" href="index.html">返回首页</a></p>
  </div>
</body></html>
`, 'utf8');

  // 注入垫片 + 修正页脚 API 链接
  const injected = [];
  for (const file of walkHtml(DIST)) {
    let html = fs.readFileSync(file, 'utf8');
    if (file.endsWith('admin.html')) continue;
    html = html.replace('<head>', '<head>\n  <script src="static-shim.js"></script>');
    html = html.replace(/<a href="api\/tracks">API<\/a>/, '<a href="tracks.json">曲目数据</a>');
    fs.writeFileSync(file, html, 'utf8');
    injected.push(path.relative(DIST, file));
  }

  fs.writeFileSync(path.join(DIST, '.nojekyll'), '', 'utf8');

  console.log('静态站导出完成 →', DIST);
  console.log('  曲目数量：', list.length);
  console.log('  注入垫片：', injected.join('、'));
  console.log('  忽略 Jekyll： .nojekyll ✓');
}

main();
