/* 寰宇音乐台 · 全局播放器（底部常驻 + 播放列表 + 频谱分析） */
(function (global) {
  'use strict';

  const fmt = (s) => {
    if (!isFinite(s) || s < 0) s = 0;
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  };
  const hash = (str) => {
    let h = 2166136261;
    for (let i = 0; i < String(str).length; i++) { h ^= String(str).charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h);
  };

  const Player = {
    tracks: [],
    index: -1,
    audio: null,
    ctx: null,
    analyser: null,
    shuffle: false,
    loop: false,
    _listeners: [],
    _counted: new Set(),

    init(tracks) {
      this.tracks = tracks || [];
      this._mount();
      this._bind();
      this._renderList();
      const saved = sessionStorage.getItem('huanyu-current');
      if (saved != null) {
        const i = this.tracks.findIndex((t) => t.id === saved);
        if (i >= 0) this._select(i, false);
      }
    },

    on(fn) { this._listeners.push(fn); },
    _emit() { for (const fn of this._listeners) { try { fn(this.current(), this.index); } catch (e) { /* ignore */ } } },
    current() { return this.index >= 0 ? this.tracks[this.index] : null; },

    _mount() {
      if (document.getElementById('huanyu-player')) return;
      const el = document.createElement('div');
      el.innerHTML = `
        <div class="player" id="huanyu-player">
          <div class="player-now">
            <img id="p-cover" alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
            <div>
              <div class="t" id="p-title">—</div>
              <div class="s" id="p-sub"></div>
              <div class="k" id="p-lyric"></div>
            </div>
          </div>
          <div class="player-center">
            <div class="player-controls">
              <button class="icon-btn" id="p-prev" data-i18n-title="player.prev">◀◀</button>
              <button class="icon-btn big" id="p-toggle">▶</button>
              <button class="icon-btn" id="p-next" data-i18n-title="player.next">▶▶</button>
              <button class="icon-btn" id="p-shuffle" data-i18n-title="player.shuffle">⇄</button>
              <button class="icon-btn" id="p-loop" data-i18n-title="player.loop">↻</button>
              <button class="icon-btn" id="p-list" data-i18n-title="player.list">☰</button>
            </div>
            <div class="progress-row">
              <span id="p-cur">0:00</span>
              <div class="wave" id="p-wave"></div>
              <span id="p-dur">0:00</span>
            </div>
          </div>
          <div class="player-right">
            <span>🔈</span>
            <input type="range" class="volume" id="p-vol" min="0" max="1" step="0.01" value="0.85" data-i18n-title="player.volume">
          </div>
        </div>
        <div class="playlist-drawer" id="p-drawer">
          <h5 data-i18n="player.list"></h5>
          <div id="p-list-items"></div>
        </div>`;
      while (el.firstChild) document.body.appendChild(el.firstChild);
      this.audio = new Audio();
      this.audio.preload = 'metadata';
      this.audio.volume = 0.85;
    },

    _bind() {
      const $ = (id) => document.getElementById(id);
      const a = this.audio;
      $('p-toggle').onclick = () => this.toggle();
      $('p-prev').onclick = () => this.prev();
      $('p-next').onclick = () => this.next();
      $('p-shuffle').onclick = (e) => { this.shuffle = !this.shuffle; e.currentTarget.classList.toggle('on', this.shuffle); };
      $('p-loop').onclick = (e) => { this.loop = !this.loop; e.currentTarget.classList.toggle('on', this.loop); };
      $('p-list').onclick = () => $('p-drawer').classList.toggle('open');
      $('p-vol').oninput = (e) => { a.volume = Number(e.target.value); };
      $('p-wave').onclick = (e) => {
        if (this.index < 0) return;
        const r = e.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        if (a.duration) a.currentTime = ratio * a.duration;
      };
      a.onloadedmetadata = () => { $('p-dur').textContent = fmt(a.duration); };
      a.ontimeupdate = () => { this._progress(); };
      a.onplay = () => { $('p-toggle').textContent = '❚❚'; this._emit(); };
      a.onpause = () => { $('p-toggle').textContent = '▶'; this._emit(); };
      a.onended = () => { if (this.loop) { a.currentTime = 0; a.play(); } else this.next(); };
      a.onerror = () => { $('p-sub').textContent = '播放失败'; };
      document.addEventListener('langchange', () => {
        $('p-title').textContent = this.current() ? this._title(this.current()) : global.I18N.t('player.idle');
      });
    },

    _title(track) {
      const lang = global.I18N.get();
      return (track.title && (track.title[lang] || track.title.en || track.title.zh)) || 'Untitled';
    },
    _sub(track) {
      const lang = global.I18N.get();
      return (track.subtitle && (track.subtitle[lang] || track.subtitle.en)) || (track.kind === 'instrumental' ? global.I18N.t('kind.instrumental') : global.I18N.t('kind.song'));
    },

    /** 显示当前正在唱的这一句（由详情页歌词同步调用） */
    setLyric(text) {
      const el = document.getElementById('p-lyric');
      if (!el) return;
      const s = text || '';
      if (el.textContent !== s) el.textContent = s;
    },

    _renderList() {
      const box = document.getElementById('p-list-items');
      if (!box) return;
      box.innerHTML = '';
      this.tracks.forEach((t, i) => {
        const d = document.createElement('div');
        d.className = 'pl-item' + (i === this.index ? ' active' : '');
        d.innerHTML = `${window.COVER.img(t.cover, 'tiny', { alt: '' })}<div><div class="n">${this._title(t)}</div><div class="d">${fmt(t.duration)} · ${global.I18N.t(t.kind === 'instrumental' ? 'kind.instrumental' : 'kind.song')}</div></div>`;
        d.onclick = () => { this.playIndex(i); box.parentElement.classList.remove('open'); };
        box.appendChild(d);
      });
    },

    _peaks(track) {
      if (track.peaks && track.peaks.length) return track.peaks;
      const out = [];
      let s = hash(track.id);
      for (let i = 0; i < 64; i++) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        out.push(0.25 + ((s % 1000) / 1000) * 0.75);
      }
      return out;
    },

    _renderWave(track) {
      const wave = document.getElementById('p-wave');
      wave.innerHTML = '';
      const peaks = this._peaks(track);
      const frag = document.createDocumentFragment();
      for (const p of peaks) {
        const s = document.createElement('span');
        s.style.height = Math.max(3, Math.round(p * 30)) + 'px';
        frag.appendChild(s);
      }
      wave.appendChild(frag);
    },

    _progress() {
      const a = this.audio;
      const wave = document.getElementById('p-wave');
      document.getElementById('p-cur').textContent = fmt(a.currentTime);
      const spans = wave.children;
      if (!spans.length) return;
      const ratio = a.duration ? a.currentTime / a.duration : 0;
      const upto = Math.round(ratio * spans.length);
      for (let i = 0; i < spans.length; i++) spans[i].classList.toggle('done', i < upto);
      document.dispatchEvent(new CustomEvent('tick', { detail: { time: a.currentTime } }));
    },

    _select(i, autoplay = true) {
      if (i < 0 || i >= this.tracks.length) return;
      this.index = i;
      const t = this.tracks[i];
      const $ = (id) => document.getElementById(id);
      const el = $('p-cover');
      el.onerror = () => window.COVER.fix(el, t.cover);
      el.src = window.COVER.tiny(t.cover);
      $('p-title').textContent = this._title(t);
      $('p-sub').textContent = this._sub(t);
      $('p-dur').textContent = fmt(t.duration);
      this.setLyric('');
      this._renderWave(t);
      this.audio.src = t.audio;
      sessionStorage.setItem('huanyu-current', t.id);
      this._renderList();
      document.querySelectorAll('.card').forEach((c) => c.classList.toggle('playing', c.dataset.id === t.id));
      if (autoplay) this.play();
      this._emit();
    },

    /**
     * 这里刻意不建立 Web Audio 链路。
     * createMediaElementSource 会把 <audio> 的输出独占接管给 AudioContext，而 iOS 上
     * AudioContext 的输出受机身静音键控制（原生 <audio> 播放不受影响）——静音键一开，
     * 整站就彻底没声音。为了保证手机上有声，音频始终由 <audio> 自身播出，
     * 可视化改用 tracks.json 里已有的 peaks 波形（见 track.js）。
     */
    play() {
      if (this.index < 0 && this.tracks.length) this._select(0);
      if (this.index < 0) return;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => {
        // 手机浏览器常在没有用户手势时拦截播放，给出可见提示而不是静默失败
        const el = document.getElementById('p-lyric');
        if (el) el.textContent = '请再点一次 ▶ 开始播放';
      });
      const t = this.current();
      if (t && !this._counted.has(t.id)) {
        this._counted.add(t.id);
        fetch(`/api/tracks/${encodeURIComponent(t.id)}/play`, { method: 'POST' }).catch(() => {});
      }
    },
    pause() { this.audio.pause(); },
    toggle() { if (!this.audio.src) { this.play(); return; } this.audio.paused ? this.play() : this.pause(); },
    playIndex(i) { this._select(i, true); },
    playTrack(track) {
      const i = this.tracks.findIndex((t) => t.id === track.id);
      if (i >= 0) this.playIndex(i);
      else { this.tracks.push(track); this._select(this.tracks.length - 1, true); }
      if (location.pathname.indexOf('track.html') < 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    next() {
      if (!this.tracks.length) return;
      if (this.shuffle) {
        let i = this.index;
        while (this.tracks.length > 1 && i === this.index) i = Math.floor(Math.random() * this.tracks.length);
        this._select(i, true);
      } else {
        this._select((this.index + 1) % this.tracks.length, true);
      }
    },
    prev() {
      if (!this.tracks.length) return;
      this._select((this.index - 1 + this.tracks.length) % this.tracks.length, true);
    }
  };

  global.Player = Player;
})(window);
