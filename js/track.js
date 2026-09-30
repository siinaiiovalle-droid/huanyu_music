/* 作品详情：封面 / 简介 / 实时频谱 / 逐句歌词高亮 / 相关推荐 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => {
    if (!isFinite(s)) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  let all = [];
  let track = null;
  let lyricLines = [];
  let curLine = -1;
  let curChar = -1;
  let followLocked = false;

  /* "10.43|清 11.09|晨 ..." → [{ t, c }] */
  function parseChars(l) {
    return String(l.chars || '').trim().split(/\s+/).map((s) => {
      const p = s.indexOf('|');
      return p > 0 ? { t: Number(s.slice(0, p)), c: s.slice(p + 1) } : null;
    }).filter((x) => x && x.c && isFinite(x.t));
  }

  function charHtml(l) {
    const chs = parseChars(l);
    if (chs.length) return chs.map((x) => `<span class="ch" data-t="${x.t}">${x.c}</span>`).join('');
    const zh = Array.isArray(l.zh) ? l.zh.join('') : (l.zh || '');
    return zh;
  }

  function lang() { return window.I18N.get(); }
  function title(t) { return (t.title && (t.title[lang()] || t.title.en || t.title.zh)) || 'Untitled'; }
  function sub(t) { return (t.subtitle && (t.subtitle[lang()] || t.subtitle.en)) || ''; }
  function desc(t) { return (t.description && (t.description[lang()] || t.description.en)) || ''; }
  function credits(t) { return (t.credits && (t.credits[lang()] || t.credits.en)) || ''; }

  function mountLang() {
    const sel = document.getElementById('langSelect');
    sel.innerHTML = window.I18N.LANGS.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
    sel.value = window.I18N.get();
    sel.onchange = () => window.I18N.set(sel.value);
  }

  function render() {
    const t = track;
    document.title = title(t) + ' · 寰宇音乐台';
    const kindLabel = window.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song');
    const lines = (t.lyrics && t.lyrics.lines) || [];
    const showEn = lang() !== 'zh';
    const lyricHtml = lines.length
      ? `<div class="lyrics-wrap">
           <div class="lyrics" id="lyrics">${lines.map((l, i) => `
            <div class="lyric-line" data-i="${i}" data-t="${l.time}">
              <div class="zh">${charHtml(l)}</div>
              ${showEn && l.en ? `<div class="en">${l.en}</div>` : ''}
            </div>`).join('')}</div>
           <div class="lyric-back" id="lyricBack" data-i18n="track.follow"></div>
         </div>`
      : `<div class="lyric-empty">${window.I18N.t('track.noLyrics')}</div>`;

    const others = all.filter((x) => x.id !== t.id).slice(0, 4);
    const related = others.length ? `
      <section class="section">
        <div class="section-head"><h2 data-i18n="track.related"></h2><div class="divider"></div></div>
        <div class="grid">
          ${others.map((o) => `
            <article class="card" data-id="${o.id}">
              <div class="card-cover">
                ${window.COVER.img(o.cover, 'thumb', { alt: title(o) })}
                <span class="card-kind">${window.I18N.t(o.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song')}</span>
                <div class="play-fab">▶</div>
              </div>
              <div class="card-body">
                <h4>${title(o)}</h4>
                <p>${sub(o)}</p>
                <div class="card-stats"><span>▶ ${o.plays || 0}</span><span>${fmt(o.duration)}</span></div>
              </div>
            </article>`).join('')}
        </div>
      </section>` : '';

    $('#detail').innerHTML = `
      <div class="detail-grid">
        <div>
          <div class="detail-cover">
            ${window.COVER.img(t.cover, 'large', { alt: title(t), eager: true })}
            <span class="badge">${kindLabel}</span>
          </div>
          <div class="panel" style="margin-top:16px">
            <h3 data-i18n="track.spectrum"></h3>
            <canvas class="viz" id="viz" width="600" height="120"></canvas>
          </div>
        </div>
        <div>
          <span class="sub">${sub(t)}</span>
          <h1>${title(t)}</h1>
          <div class="meta-row" style="margin-top:12px">
            <span class="chip">${window.I18N.t('label.duration')} <b>${fmt(t.duration)}</b></span>
            ${t.bpm ? `<span class="chip">${window.I18N.t('label.bpm')} <b>${t.bpm}</b></span>` : ''}
            ${t.musicalKey ? `<span class="chip">${window.I18N.t('label.key')} <b>${t.musicalKey}</b></span>` : ''}
            ${t.releasedAt ? `<span class="chip">${window.I18N.t('label.released')} <b>${t.releasedAt}</b></span>` : ''}
            <span class="chip"><b>${t.plays || 0}</b> ${window.I18N.t('label.plays')}</span>
          </div>
          <p class="desc">${desc(t)}</p>
          <div class="detail-actions">
            <button class="btn btn-primary" id="btnPlay">▶ ${window.I18N.t('btn.play')}</button>
            <button class="btn" id="btnLike">♥ ${window.I18N.t('track.like')} (${t.likes || 0})</button>
            <a class="btn" href="${t.audio}" download>⬇ ${window.I18N.t('btn.download')}</a>
            <a class="btn btn-ghost" href="index.html" data-i18n="btn.back"></a>
          </div>
          <div class="panel">
            <h3 data-i18n="track.credits"></h3>
            <div class="prose" style="font-size:13px">${credits(t)}</div>
          </div>
        </div>
      </div>
      <section class="section">
        <div class="section-head">
          <h2 data-i18n="track.lyrics"></h2>
          <span data-i18n="track.autoFollow"></span><div class="divider"></div>
        </div>
        <div class="panel">${lyricHtml}</div>
      </section>
      ${related}`;

    lyricLines = Array.from(document.querySelectorAll('.lyric-line'));
    curLine = -1;
    curChar = -1;
    followLocked = false;
    lyricLines.forEach((el) => {
      el.onclick = () => {
        window.Player.playTrack(t);
        const a = window.Player.audio;
        if (a) a.currentTime = Number(el.dataset.t) || 0;
      };
    });
    const box = document.getElementById('lyrics');
    const backBtn = document.getElementById('lyricBack');
    if (box) {
      const onManual = () => {
        followLocked = true;
        if (backBtn) backBtn.classList.add('show');
      };
      box.addEventListener('wheel', onManual, { passive: true });
      box.addEventListener('touchmove', onManual, { passive: true });
    }
    if (backBtn) {
      backBtn.onclick = () => {
        followLocked = false;
        backBtn.classList.remove('show');
        scrollToLine(Math.max(0, curLine));
      };
    }
    document.querySelectorAll('.card').forEach((el) => {
      el.onclick = () => { location.href = 'track.html?id=' + encodeURIComponent(el.dataset.id); };
      el.querySelector('.play-fab').onclick = (e) => {
        e.stopPropagation();
        window.Player.playTrack(all.find((x) => x.id === el.dataset.id));
      };
    });
    $('#btnPlay').onclick = () => window.Player.playTrack(t);
    $('#btnLike').onclick = async () => {
      const r = await fetch(`/api/tracks/${encodeURIComponent(t.id)}/like`, { method: 'POST' });
      const d = await r.json();
      $('#btnLike').textContent = '♥ ' + window.I18N.t('track.like') + ' (' + d.likes + ')';
    };
    window.I18N.translateDom();
    startLyricLoop();
    startViz();
  }

  function scrollToLine(idx) {
    const box = document.getElementById('lyrics');
    const el = lyricLines[idx];
    if (!box || !el) return;
    const top = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
    box.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }

  /* 按播放进度推进：先定当前句，再逐字点亮（卡拉 OK 式） */
  function syncLyrics(time) {
    if (!lyricLines.length) return;
    let idx = -1;
    for (let i = 0; i < lyricLines.length; i++) {
      if (Number(lyricLines[i].dataset.t) <= time + 0.05) idx = i; else break;
    }
    if (idx !== curLine) {
      lyricLines.forEach((el, i) => {
        el.classList.toggle('active', i === idx);
        el.classList.toggle('done', i < idx);
        if (i !== idx) el.querySelectorAll('.ch').forEach((c) => c.classList.remove('sung', 'cur'));
      });
      curLine = idx;
      curChar = -1;
      const line = lyricLines[idx];
      const text = line ? ((line.querySelector('.zh') || line).textContent || '').trim() : '';
      if (window.Player.setLyric) window.Player.setLyric(text);
      if (!followLocked) scrollToLine(idx);
    }
    const line = lyricLines[curLine];
    if (!line) return;
    const chs = line.querySelectorAll('.ch');
    if (!chs.length) return;
    let ci = -1;
    for (let j = 0; j < chs.length; j++) {
      if (Number(chs[j].dataset.t) <= time + 0.05) ci = j; else break;
    }
    if (ci === curChar) return;
    curChar = ci;
    for (let j = 0; j < chs.length; j++) {
      chs[j].classList.toggle('sung', j < ci);
      chs[j].classList.toggle('cur', j === ci);
    }
  }

  /* timeupdate 只有 4Hz，逐字会顿；这里用 rAF 直接读 currentTime 追求字级精度 */
  let lyricRaf = 0;
  function startLyricLoop() {
    if (!lyricLines.length) { if (lyricRaf) cancelAnimationFrame(lyricRaf); lyricRaf = 0; return; }
    const step = () => {
      lyricRaf = requestAnimationFrame(step);
      const P = window.Player;
      const a = P && P.audio;
      if (a && !a.paused && P.current() && P.current().id === track.id) syncLyrics(a.currentTime);
    };
    if (lyricRaf) cancelAnimationFrame(lyricRaf);
    step();
  }

  let raf = 0;
  function startViz() {
    const canvas = document.getElementById('viz');
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const peaks = (track.peaks && track.peaks.length) ? track.peaks : [];
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const w = canvas.width, h = canvas.height;
      g.clearRect(0, 0, w, h);
      // 不做实时频谱：那需要把 <audio> 接管进 AudioContext，而 iOS 上 AudioContext
      // 受机身静音键控制，会把手机端的声音整段掐掉。这里改用曲库自带的波形数据，
      // 播放时按进度点亮并轻微律动，既好看又不碰音频链路。
      const P = window.Player;
      const a = P && P.audio;
      const playing = !!(a && !a.paused && P.current() && P.current().id === track.id);
      const ratio = playing && a.duration ? a.currentTime / a.duration : 0;
      const upto = Math.round(ratio * peaks.length);
      const bw = w / peaks.length;
      const t = Date.now() / 200;
      for (let i = 0; i < peaks.length; i++) {
        const wobble = playing ? 0.1 * Math.sin(t + i * 0.55) : 0;
        const v = Math.max(0.06, Math.min(1, peaks[i] + wobble));
        const bh = Math.max(2, v * h);
        if (i < upto) {
          const grad = g.createLinearGradient(0, h, 0, h - bh);
          grad.addColorStop(0, '#6ea8ff');
          grad.addColorStop(1, '#ff7aa2');
          g.fillStyle = grad;
        } else {
          g.fillStyle = 'rgba(110,168,255,0.35)';
        }
        g.fillRect(i * bw, h - bh, bw - 1, bh);
      }
    };
    if (raf) cancelAnimationFrame(raf);
    draw();
  }

  async function boot() {
    mountLang();
    window.I18N.apply();
    const id = new URLSearchParams(location.search).get('id');
    const res = await fetch('/api/tracks');
    const data = await res.json();
    all = data.tracks || [];
    window.Player.init(all);
    track = all.find((t) => t.id === id) || all[0];
    if (!track) {
      $('#detail').innerHTML = `<div class="empty">${window.I18N.t('empty')}</div>`;
      return;
    }
    render();
    document.addEventListener('tick', (e) => {
      if (window.Player.current() && window.Player.current().id === track.id) syncLyrics(e.detail.time);
    });
    document.addEventListener('langchange', () => {
      document.getElementById('langSelect').value = window.I18N.get();
      render();
    });
  }

  boot().catch((e) => { $('#detail').innerHTML = `<div class="empty">载入失败：${e.message}</div>`; });
})();
