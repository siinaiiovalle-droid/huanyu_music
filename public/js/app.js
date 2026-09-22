/* 首页：精选作品 + 全部作品栅格 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => {
    if (!isFinite(s)) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  let tracks = [];

  function lang() { return window.I18N.get(); }
  function title(t) { return (t.title && (t.title[lang()] || t.title.en || t.title.zh)) || 'Untitled'; }
  function sub(t) { return (t.subtitle && (t.subtitle[lang()] || t.subtitle.en)) || ''; }
  function desc(t) { return (t.description && (t.description[lang()] || t.description.en)) || ''; }

  function mountLang() {
    const sel = document.getElementById('langSelect');
    sel.innerHTML = window.I18N.LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
    sel.value = window.I18N.get();
    sel.onchange = () => window.I18N.set(sel.value);
  }

  function featuredCard(t) {
    return `
      <div class="section-head">
        <h2 data-i18n="sec.featured"></h2>
        <div class="divider"></div>
      </div>
      <div class="featured-card">
        <div class="featured-cover"><img src="${t.cover}" alt="${title(t)}"></div>
        <div class="featured-info">
          <span class="sub">${window.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song')}</span>
          <h3>${title(t)}</h3>
          <p class="desc">${desc(t)}</p>
          <div class="meta-row">
            <span class="chip">${window.I18N.t('label.duration')} <b>${fmt(t.duration)}</b></span>
            ${t.bpm ? `<span class="chip">${window.I18N.t('label.bpm')} <b>${t.bpm}</b></span>` : ''}
            ${t.musicalKey ? `<span class="chip">${window.I18N.t('label.key')} <b>${t.musicalKey}</b></span>` : ''}
            ${t.genre && t.genre[lang()] ? `<span class="chip">${window.I18N.t('label.genre')} <b>${t.genre[lang()]}</b></span>` : ''}
            <span class="chip"><b>${t.plays || 0}</b> ${window.I18N.t('label.plays')}</span>
          </div>
          <div class="hero-actions">
            <button class="btn btn-primary" id="featuredPlay">▶ ${window.I18N.t('btn.play')}</button>
            <a class="btn btn-ghost" href="track.html?id=${encodeURIComponent(t.id)}" data-i18n="btn.detail"></a>
          </div>
        </div>
      </div>`;
  }

  function card(t) {
    const kindLabel = window.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song');
    return `
      <article class="card" data-id="${t.id}">
        <div class="card-cover">
          <img src="${t.cover}" alt="${title(t)}" loading="lazy">
          <span class="card-kind">${kindLabel}</span>
          <div class="play-fab">▶</div>
        </div>
        <div class="card-body">
          <h4>${title(t)}</h4>
          <p>${sub(t)}</p>
          <div class="card-stats">
            <span>▶ ${t.plays || 0}</span>
            <span>♥ ${t.likes || 0}</span>
            <span>${fmt(t.duration)}</span>
          </div>
        </div>
      </article>`;
  }

  function bindGrid() {
    document.querySelectorAll('.card').forEach((el) => {
      const id = el.dataset.id;
      const t = tracks.find((x) => x.id === id);
      el.addEventListener('click', () => { location.href = 'track.html?id=' + encodeURIComponent(id); });
      const fab = el.querySelector('.play-fab');
      fab.addEventListener('click', (e) => { e.stopPropagation(); window.Player.playTrack(t); });
    });
  }

  function render() {
    const featured = tracks.find((t) => t.featured) || tracks[0];
    $('#featured').innerHTML = featured ? featuredCard(featured) : '';
    const fp = document.getElementById('featuredPlay');
    if (fp && featured) fp.onclick = () => window.Player.playTrack(featured);
    $('#grid').innerHTML = tracks.length ? tracks.map(card).join('') : `<div class="empty">${window.I18N.t('empty')}</div>`;
    document.getElementById('countLabel').textContent = window.I18N.t('sec.count', { n: tracks.length });
    bindGrid();
    window.I18N.translateDom();
  }

  async function boot() {
    mountLang();
    window.I18N.apply();
    const res = await fetch('/api/tracks');
    const data = await res.json();
    tracks = data.tracks || [];
    window.Player.init(tracks);
    render();
    document.getElementById('heroPlay').onclick = () => {
      const t = tracks.find((x) => x.featured) || tracks[0];
      if (t) window.Player.playTrack(t);
    };
    document.addEventListener('langchange', () => {
      if (document.activeElement !== document.getElementById('langSelect')) {
        document.getElementById('langSelect').value = window.I18N.get();
      }
      render();
    });
  }

  boot().catch((e) => {
    $('#grid').innerHTML = `<div class="empty">载入失败：${e.message}</div>`;
  });
})();
