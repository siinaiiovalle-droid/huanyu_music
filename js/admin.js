/* 发布后台：登录 → 上传新作品 → 列表管理（调用 /api/admin/* 接口） */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const fmt = (s) => {
    if (!isFinite(s)) s = 0;
    return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
  };
  let token = '';
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

  function msg(el, text, ok) {
    el.textContent = text;
    el.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  function showLogged(state) {
    $('#loginCard').hidden = state;
    $('#uploadCard').hidden = !state;
    $('#listCard').hidden = !state;
  }

  /* ---------- 登录 ---------- */
  async function login() {
    const pw = $('#pw').value;
    const el = $('#loginMsg');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      const data = await res.json();
      if (!res.ok) { msg(el, data.error || window.I18N.t('admin.wrongPw'), false); return; }
      token = data.token;
      sessionStorage.setItem('huanyu-token', token);
      msg(el, '', true);
      $('#pw').value = '';
      showLogged(true);
      loadList();
    } catch (e) {
      msg(el, e.message, false);
    }
  }

  function logout() {
    token = '';
    sessionStorage.removeItem('huanyu-token');
    showLogged(false);
  }

  async function verify() {
    try {
      const res = await fetch('/api/admin/verify', { headers: { Authorization: 'Bearer ' + token } });
      return res.ok;
    } catch (e) { return false; }
  }

  /* ---------- 上传 ---------- */
  async function submit() {
    const el = $('#upMsg');
    const file = $('#f-audio').files[0];
    if (!file) { msg(el, window.I18N.t('admin.f.audio'), false); return; }
    const fd = new FormData($('#uploadForm'));
    $('#btnSubmit').disabled = true;
    msg(el, window.I18N.t('admin.uploading'), true);
    try {
      const res = await fetch('/api/admin/tracks', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
        body: fd
      });
      const data = await res.json();
      if (!res.ok) { msg(el, data.error || ('HTTP ' + res.status), false); return; }
      msg(el, window.I18N.t('admin.uploaded'), true);
      $('#uploadForm').reset();
      window.I18N.translateDom();
      loadList();
    } catch (e) {
      msg(el, e.message, false);
    } finally {
      $('#btnSubmit').disabled = false;
    }
  }

  /* ---------- 列表 ---------- */
  async function loadList() {
    try {
      const res = await fetch('/api/tracks');
      const data = await res.json();
      tracks = data.tracks || [];
    } catch (e) { tracks = []; }
    renderList();
  }

  async function remove(id) {
    if (!confirm(window.I18N.t('admin.confirmDel'))) return;
    const res = await fetch('/api/admin/tracks/' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || ('HTTP ' + res.status));
    }
    loadList();
  }

  function renderList() {
    const box = $('#trackList');
    if (!tracks.length) {
      box.innerHTML = `<div class="empty">${window.I18N.t('empty')}</div>`;
      return;
    }
    box.innerHTML = tracks.map((t) => `
      <div class="admin-item" data-id="${t.id}">
        ${window.COVER.img(t.cover, 'tiny', { alt: title(t) })}
        <div class="grow">
          <b>${title(t)}</b>
          <span>${window.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song')} · ${fmt(t.duration)} · ▶ ${t.plays || 0} · ♥ ${t.likes || 0}</span>
        </div>
        <a class="btn btn-ghost" href="track.html?id=${encodeURIComponent(t.id)}" data-i18n="btn.detail"></a>
        <button class="btn btn-danger" data-del="${t.id}" data-i18n="admin.delete"></button>
      </div>`).join('');
    box.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => remove(b.dataset.del); });
    window.I18N.translateDom();
  }

  async function boot() {
    mountLang();
    window.I18N.apply();
    $('#btnLogin').onclick = login;
    $('#btnLogout').onclick = logout;
    $('#uploadForm').onsubmit = (e) => { e.preventDefault(); submit(); };
    $('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });

    token = sessionStorage.getItem('huanyu-token') || '';
    if (token && await verify()) {
      showLogged(true);
      loadList();
    } else {
      token = '';
      showLogged(false);
    }

    document.addEventListener('langchange', () => {
      const sel = document.getElementById('langSelect');
      if (document.activeElement !== sel) sel.value = window.I18N.get();
      if (token) renderList();
    });
  }

  boot();
})();
