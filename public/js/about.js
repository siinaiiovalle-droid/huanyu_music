/* 关于页：多语言文案 + 作品一览 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => {
    if (!isFinite(s)) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  let tracks = [];

  function title(t) {
    const lang = window.I18N.get();
    return (t.title && (t.title[lang] || t.title.en || t.title.zh)) || 'Untitled';
  }

  function mountLang() {
    const sel = document.getElementById('langSelect');
    sel.innerHTML = window.I18N.LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
    sel.value = window.I18N.get();
    sel.onchange = () => window.I18N.set(sel.value);
  }

  function render() {
    const box = $('#aboutList');
    if (!tracks.length) {
      box.innerHTML = `<div class="empty">${window.I18N.t('empty')}</div>`;
    } else {
      box.innerHTML = tracks.map((t) => `
        <a class="admin-item" href="track.html?id=${encodeURIComponent(t.id)}">
          <img src="${t.cover}" alt="${title(t)}">
          <div class="grow">
            <b>${title(t)}</b>
            <span>${window.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song')} · ${fmt(t.duration)} · ▶ ${t.plays || 0}</span>
          </div>
        </a>`).join('');
    }
    window.I18N.translateDom();
  }

  async function boot() {
    mountLang();
    window.I18N.apply();
    try {
      const res = await fetch('/api/tracks');
      const data = await res.json();
      tracks = data.tracks || [];
      window.Player.init(tracks);
    } catch (e) { tracks = []; }
    render();
    document.addEventListener('langchange', () => {
      const sel = document.getElementById('langSelect');
      if (document.activeElement !== sel) sel.value = window.I18N.get();
      render();
    });
  }

  boot().catch((e) => { $('#aboutList').innerHTML = `<div class="empty">载入失败：${e.message}</div>`; });
})();
