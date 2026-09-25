/* 封面分档加载：按展示尺寸选取对应 JPEG，避免用 800×800 原图去喂 34px 的小图。
   分档由 scripts/make-thumbs.js 生成：tiny 96 / thumb 320 / large 720。
   任何一档缺失时自动回退到 cover 原图，保证不出现破图。 */
(function () {
  var DIRS = { tiny: 'tiny', thumb: 'thumbs', large: 'large' };
  var SIZE = { tiny: 96, thumb: 320, large: 720 };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** 原封面路径 → 指定档位路径；非标准封面（如用户上传的自定义图）原样返回 */
  function pick(cover, variant) {
    var c = String(cover || '');
    var m = c.match(/^img\/covers\/([^/]+)\.(png|jpe?g|webp)$/i);
    if (!m || !DIRS[variant]) return c;
    return 'img/covers/' + DIRS[variant] + '/' + m[1] + '.jpg';
  }

  /**
   * 生成完整的 img 标签
   * @param {string} cover  原始封面路径
   * @param {'tiny'|'thumb'|'large'} variant 档位
   * @param {{alt?:string, eager?:boolean, cls?:string, draggable?:boolean}} [opts]
   */
  function img(cover, variant, opts) {
    opts = opts || {};
    var size = SIZE[variant] || 320;
    var attrs = [
      'src="' + esc(pick(cover, variant)) + '"',
      'alt="' + esc(opts.alt == null ? '' : opts.alt) + '"',
      'width="' + size + '" height="' + size + '"',
      opts.eager ? 'decoding="async" fetchpriority="high"' : 'loading="lazy" decoding="async"',
      "onerror=\"window.COVER.fix(this, '" + esc(cover) + "')\""
    ];
    if (opts.cls) attrs.push('class="' + esc(opts.cls) + '"');
    return '<img ' + attrs.join(' ') + '>';
  }

  window.COVER = {
    pick: pick,
    tiny: function (c) { return pick(c, 'tiny'); },
    thumb: function (c) { return pick(c, 'thumb'); },
    large: function (c) { return pick(c, 'large'); },
    img: img,
    fallbackIfMissing: function (el, cover) { return img(cover, 'thumb'); },
    /** 某档加载失败时退回原图（只尝试一次） */
    fix: function (el, original) {
      if (!el || el.dataset.coverFallback) return;
      el.dataset.coverFallback = '1';
      el.src = original || '';
    }
  };
})();
