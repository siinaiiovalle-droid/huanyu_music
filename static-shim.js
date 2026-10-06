/* 静态镜像垫片：GitHub Pages 上没有 Node 服务，用它把 /api/* 请求落到静态 tracks.json。
   需在页面所有业务脚本【之前】加载。 */
(function () {
  var nativeFetch = window.fetch ? window.fetch.bind(window) : null;
  if (!nativeFetch) return;

  var cache = null;
  function loadAll() {
    if (cache) return Promise.resolve(cache);
    return nativeFetch('tracks.json').then(function (r) {
      if (!r.ok) throw new Error('tracks.json 载入失败（HTTP ' + r.status + '）');
      return r.json();
    }).then(function (d) {
      cache = d;
      return d;
    });
  }

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' }
    });
  }

  function find(data, id) {
    var list = data.tracks || [];
    var raw = decodeURIComponent(id);
    for (var i = 0; i < list.length; i++) if (list[i].id === raw) return list[i];
    return null;
  }

  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var path = String(url).replace(/^https?:\/\/[^/]+/, '');
    var m;

    // GET /api/tracks —— 曲库列表
    if (path === '/api/tracks') {
      return loadAll().then(function (d) { return json(d); });
    }

    // GET /api/tracks/:id —— 单曲详情
    if ((m = path.match(/^\/api\/tracks\/([^/?]+)$/))) {
      return loadAll().then(function (d) {
        var t = find(d, m[1]);
        return t ? json(t) : json({ error: '作品不存在' }, 404);
      });
    }

    // POST /api/tracks/:id/(play|like) —— 静态站没有计数服务，返回乐观结果
    if ((m = path.match(/^\/api\/tracks\/([^/?]+)\/(play|like)$/))) {
      var kind = m[2];
      return loadAll().then(function (d) {
        var t = find(d, m[1]);
        if (!t) return json({ error: '作品不存在' }, 404);
        t[kind === 'play' ? 'plays' : 'likes'] = (t[kind === 'play' ? 'plays' : 'likes'] || 0) + 1;
        return json(kind === 'play' ? { plays: t.plays } : { likes: t.likes });
      });
    }

    // 后台相关接口：静态镜像不支持，明确报错而不是让页面卡在加载中
    if (path.indexOf('/api/admin') === 0) {
      return Promise.resolve(json({ error: '静态镜像不支持内容后台，请在本地运行 npm start 使用' }, 401));
    }

    return nativeFetch(input, init);
  };
})();
