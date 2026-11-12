/* وين أرخص؟ — منطق الموقع (بدون مكتبات وبدون بناء) */
(function () {
  'use strict';

  var CFG = window.WA_CONFIG || {};
  var main = document.getElementById('main');
  var curSelect = document.getElementById('currency-select');

  var CURRENCIES = [
    { code: 'USD', label: 'دولار أمريكي', inLabel: 'بالدولار الأمريكي', sym: '$', prefix: true },
    { code: 'JOD', label: 'دينار أردني', inLabel: 'بالدينار الأردني', sym: 'د.أ' },
    { code: 'SAR', label: 'ريال سعودي', inLabel: 'بالريال السعودي', sym: 'ر.س' },
    { code: 'AED', label: 'درهم إماراتي', inLabel: 'بالدرهم الإماراتي', sym: 'د.إ' },
    { code: 'KWD', label: 'دينار كويتي', inLabel: 'بالدينار الكويتي', sym: 'د.ك', dec: 3 },
    { code: 'QAR', label: 'ريال قطري', inLabel: 'بالريال القطري', sym: 'ر.ق' },
    { code: 'BHD', label: 'دينار بحريني', inLabel: 'بالدينار البحريني', sym: 'د.ب', dec: 3 },
    { code: 'OMR', label: 'ريال عماني', inLabel: 'بالريال العماني', sym: 'ر.ع', dec: 3 },
    { code: 'EGP', label: 'جنيه مصري', inLabel: 'بالجنيه المصري', sym: 'ج.م', dec: 0 },
    { code: 'IQD', label: 'دينار عراقي', inLabel: 'بالدينار العراقي', sym: 'د.ع', dec: 0 },
    { code: 'MAD', label: 'درهم مغربي', inLabel: 'بالدرهم المغربي', sym: 'د.م' }
  ];

  var ICON = {
    search: 'M11 4a7 7 0 1 1 0 14a7 7 0 1 1 0-14z M20 20l-4.3-4.3',
    globe: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M3 12h18 M12 3c2.8 3.2 2.8 14.8 0 18 M12 3c-2.8 3.2-2.8 14.8 0 18',
    clock: 'M12 3a9 9 0 1 1 0 18a9 9 0 1 1 0-18z M12 7.5V12l3 2',
    shield: 'M12 3l8 3v6c0 4.6-3.3 8-8 9c-4.7-1-8-4.4-8-9V6z M8.8 12.2l2.2 2.2l4.2-4.4',
    lock: 'M6 11h12v10H6z M8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
    check: 'M20 6L9 17l-5-5',
    alert: 'M12 3.5l9.5 16.5h-19z M12 10v4.5 M12 17.2v.3',
    external: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
    card: 'M3 6.5h18v11H3z M3 10.5h18 M7 14.5h4',
    flag: 'M5 21V4 M5 4h11l-2 4l2 4H5',
    sparkle: 'M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5L18 18 M6 18l2.5-2.5 M15.5 8.5L18 6',
    ps: 'M5 4.5h14a.5.5 0 0 1 .5.5v14a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5z M12 8v8 M8 12h8',
    xbox: 'M7.5 6h9a5 5 0 0 1 4.9 4.1l.9 5.2a2.6 2.6 0 0 1-4.6 2.1L15.5 15h-7l-2.2 2.4a2.6 2.6 0 0 1-4.6-2.1l.9-5.2A5 5 0 0 1 7.5 6z M8 9.5v3 M6.5 11h3 M15.5 10.5h.01 M17.5 12.5h.01',
    pc: 'M3.5 5h17v11h-17z M8.5 20h7 M12 16v4'
  };

  function icon(name, size, cls) {
    var d = ICON[name] || name;
    return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" width="' + (size || 18) + '" height="' + (size || 18) +
      '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* التخزين مش متاح */ } }
  };

  var state = {
    currency: store.get('wa-currency', CFG.defaultCurrency || 'USD'),
    region: store.get('wa-region', CFG.defaultRegion || 'SA'),
    sort: 'saving',
    filter: '',
    selected: {}
  };

  var DB = null;
  var firstRender = true;
  var lastRouteKey = null;

  /* ===== أدوات مساعدة ===== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
      .replace(/[ً-ْ]/g, '').replace(/\s+/g, ' ').trim();
  }
  function curInfo() {
    for (var i = 0; i < CURRENCIES.length; i++) if (CURRENCIES[i].code === state.currency) return CURRENCIES[i];
    return CURRENCIES[0];
  }
  function money(usd) {
    if (usd == null || !isFinite(usd)) return '—';
    var c = curInfo();
    var rate = DB.rates[c.code];
    if (!rate) { c = CURRENCIES[0]; rate = 1; }
    var v = usd * rate;
    var dec = c.dec != null ? c.dec : (v >= 1000 ? 0 : 2);
    var s = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
    return c.prefix ? c.sym + s : s + ' ' + c.sym;
  }
  // داخل جملة عربية: الدولار لازم ينعزل عشان يطلع "$63.89" مش "63.89$"
  function moneyInline(usd) {
    var s = money(usd);
    return curInfo().prefix && DB.rates[curInfo().code] ? '<bdi dir="ltr">' + s + '</bdi>' : s;
  }
  function pct(n) { return '<bdi dir="ltr">' + n + '%</bdi>'; }
  function localMoney(amount, currency) {
    var dec = amount >= 1000 ? 0 : 2;
    return amount.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' ' + currency;
  }
  var dateFmt = new Intl.DateTimeFormat('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' });
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? '' : dateFmt.format(d);
  }
  function relTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var diff = (Date.now() - d.getTime()) / 1000;
    if (diff > 7 * 86400 || diff < 0) return fmtDate(iso);
    var rtf = new Intl.RelativeTimeFormat('ar-u-nu-latn', { numeric: 'auto' });
    if (diff < 3600) return rtf.format(-Math.max(1, Math.round(diff / 60)), 'minute');
    if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
    return rtf.format(-Math.round(diff / 86400), 'day');
  }
  function hexA(hex, a) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }
  function shortName(p) { return p.short || p.name; }
  function repoUrl() { return String(CFG.repoUrl || '').replace(/\/+$/, ''); }

  /* ===== تحميل البيانات ===== */
  function loadJSON(path) {
    return fetch(path, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(path + ' ' + r.status);
      return r.json();
    });
  }

  function build(regions, catalog, manual, auto, ratesFile, status) {
    var rates = ratesFile.rates || {};
    var regionMap = {};
    regions.forEach(function (r) { regionMap[r.code] = r; });
    var manualP = (manual && manual.products) || {};
    var autoP = (auto && auto.products) || {};
    var names = (auto && auto.names) || {};

    var products = catalog.products.map(function (p) {
      var name = names[p.id] || p.name;
      var rows = [];
      regions.forEach(function (reg) {
        var a = autoP[p.id] && autoP[p.id][reg.code];
        var m = manualP[p.id] && manualP[p.id][reg.code];
        var e = a || m;
        if (!e || !(e.amount > 0) || !rates[e.currency]) return;
        var usd = e.amount / rates[e.currency];
        var origUsd = e.original && e.original > e.amount ? e.original / rates[e.currency] : null;
        rows.push({ region: reg, entry: e, usd: usd, origUsd: origUsd, auto: !!a });
      });
      rows.sort(function (x, y) { return x.usd - y.usd; });
      var min = rows[0] || null;
      var max = rows.length ? rows[rows.length - 1] : null;
      var saving = rows.length > 1 ? Math.round((1 - min.usd / max.usd) * 100) : 0;
      return Object.assign({}, p, {
        name: name,
        rows: rows,
        min: min,
        max: max,
        saving: saving,
        search: norm([name, p.name, p.short, p.keywords, p.variant].join(' '))
      });
    });

    var productMap = {};
    products.forEach(function (p) { productMap[p.id] = p; });

    return {
      regions: regions,
      regionMap: regionMap,
      products: products,
      productMap: productMap,
      platforms: catalog.platforms || {},
      categories: catalog.categories || [],
      comingSoon: catalog.comingSoon || [],
      popular: catalog.popular || [],
      rates: rates,
      ratesMeta: ratesFile,
      auto: auto || {},
      status: status || {}
    };
  }

  /* ===== مكوّنات ===== */
  function mono(p) {
    if (p.mono) return p.mono;
    var words = String(p.name).replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return String(p.name).trim().slice(0, 1);
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  function tile(p, cls) {
    var pl = DB.platforms[p.platform] || {};
    var color = pl.color || '#A7B0BF';
    return '<span class="tile ' + (cls || '') + '" dir="ltr" style="background:' + hexA(color, 0.14) + ';color:' + color + '" aria-hidden="true">' + esc(mono(p)) + '</span>';
  }
  function platformBadge(p) {
    var pl = DB.platforms[p.platform] || { name: p.platform, color: '#A7B0BF' };
    return '<span class="badge badge-muted"><span class="badge-dot" style="background:' + pl.color + '"></span>' + esc(pl.name) + '</span>';
  }
  function isAutoSource(p) { return p.source && (p.source.type === 'steam' || p.source.type === 'xbox'); }

  function productCard(p) {
    var bottom;
    if (p.min) {
      bottom =
        '<div class="pcard-where"><span class="pcard-label">الأرخص في</span>' +
        '<span class="pcard-region"><span class="rpill">' + esc(p.min.region.code) + '</span>' + esc(p.min.region.name) + '</span></div>' +
        '<div class="pcard-price"><span class="mono">' + money(p.min.usd) + '</span>' +
        (p.saving > 0 ? '<span class="badge badge-soft">أرخص بـ ' + pct(p.saving) + '</span>' : '') + '</div>';
    } else {
      bottom = '<span class="pcard-pending">' + (isAutoSource(p) ? 'الأسعار بتنزل مع أول تحديث تلقائي' : 'الأسعار قريباً') + '</span>';
    }
    return '<a class="pcard" href="#/p/' + encodeURIComponent(p.id) + '">' +
      '<div class="pcard-top">' + tile(p) + '<div class="pcard-titles"><span class="pcard-name">' + esc(p.name) + '</span>' +
      '<span class="pcard-variant">' + esc(p.variant || '') + '</span></div></div>' +
      '<div class="pcard-bottom">' + bottom + '</div></a>';
  }

  function searchBox(id, placeholder) {
    return '<div class="search" data-search>' +
      '<label class="visually-hidden" for="' + id + '">ابحث عن لعبة أو اشتراك</label>' +
      '<span class="search-icon">' + icon('search', 22) + '</span>' +
      '<input id="' + id + '" class="search-input" type="search" autocomplete="off" spellcheck="false" enterkeyhint="search" ' +
      'placeholder="' + esc(placeholder) + '" role="combobox" aria-expanded="false" aria-controls="' + id + '-list" aria-autocomplete="list">' +
      '<ul id="' + id + '-list" class="search-results" role="listbox" aria-label="نتائج البحث" hidden></ul>' +
      '</div>';
  }

  function bindSearch(root) {
    root.querySelectorAll('[data-search]').forEach(function (box) {
      var input = box.querySelector('input');
      var list = box.querySelector('ul');
      var items = [];
      var active = -1;

      function close() {
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
        active = -1;
      }
      function go(p) { location.hash = '#/p/' + encodeURIComponent(p.id); }
      function setActive(i) {
        var opts = list.querySelectorAll('.search-option');
        if (!opts.length) return;
        active = i;
        opts.forEach(function (o, k) { o.setAttribute('aria-selected', k === i ? 'true' : 'false'); });
        if (opts[i]) {
          input.setAttribute('aria-activedescendant', opts[i].id);
          opts[i].scrollIntoView({ block: 'nearest' });
        }
      }
      function render() {
        var q = norm(input.value);
        if (!q) { close(); return; }
        items = DB.products.filter(function (p) { return p.search.indexOf(q) !== -1; })
          .sort(function (a, b) {
            var as = norm(a.name).indexOf(q) === 0 ? 0 : 1;
            var bs = norm(b.name).indexOf(q) === 0 ? 0 : 1;
            if (as !== bs) return as - bs;
            return (b.rows.length ? 1 : 0) - (a.rows.length ? 1 : 0);
          })
          .slice(0, 8);
        if (!items.length) {
          list.innerHTML = '<li class="search-empty" role="option" aria-disabled="true">ما لقينا «' + esc(input.value) + '». جرّب اسم ثاني.</li>';
        } else {
          list.innerHTML = items.map(function (p, i) {
            return '<li id="' + list.id + '-' + i + '" class="search-option" role="option" aria-selected="false" data-i="' + i + '">' +
              tile(p) +
              '<span class="search-option-text"><span class="search-option-name">' + esc(p.name) + '</span>' +
              '<span class="search-option-meta">' + esc(p.variant || '') + '</span></span>' +
              (p.min ? '<span class="search-option-price"><span class="mono">' + money(p.min.usd) + '</span>' +
                '<span class="search-option-meta">الأرخص في ' + esc(p.min.region.name) + '</span></span>' : '') +
              '</li>';
          }).join('');
        }
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        active = -1;
      }

      input.addEventListener('input', render);
      input.addEventListener('focus', function () { if (input.value) render(); });
      input.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          if (list.hidden) render();
          if (items.length) setActive(Math.min(items.length - 1, active + 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (items.length) setActive(Math.max(0, active - 1));
        } else if (e.key === 'Enter') {
          if (items.length && !list.hidden) { e.preventDefault(); go(items[Math.max(0, active)]); }
        } else if (e.key === 'Escape') {
          close();
        }
      });
      list.addEventListener('mousedown', function (e) {
        var li = e.target.closest('[data-i]');
        if (li) { e.preventDefault(); go(items[+li.getAttribute('data-i')]); }
      });
      input.addEventListener('blur', function () { setTimeout(close, 150); });
    });
  }

  var VPN_NOTE = 'ما بننصح بتغيير المنطقة بالـ VPN، لأنه مخالف لشروط المنصات وممكن يسكّر حسابك.';

  // regionName/platformName اختياريين: بدونهم بيطلع التنبيه العام
  function lockNotice(regionName, platformName) {
    var first = regionName
      ? 'بطاقات ' + esc(regionName) + ' بتشتغل بس على حسابات ' + esc(platformName) + ' من ' + esc(regionName) + '. '
      : 'بطاقة كل منطقة بتشتغل بس على حساب من نفس المنطقة. ';
    return '<div class="notice" role="note">' + icon('lock', 20) +
      '<p><strong>قبل ما تشتري: </strong>' + first + VPN_NOTE + '</p></div>';
  }

  function updatedText() {
    if (DB.auto && DB.auto.updated) return 'آخر تحديث تلقائي ' + relTime(DB.auto.updated);
    return 'الأسعار التلقائية بتتحدّث كل يوم';
  }

  function soonBox() {
    if (!DB.comingSoon.length) return '';
    return '<div class="soon-box"><span class="soon-title">' + icon('sparkle', 18) + 'قريباً على الموقع</span>' +
      '<ul class="soon-list">' + DB.comingSoon.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></div>';
  }

  /* ===== الصفحات ===== */
  // لوحة جانبية بالواجهة: أول منتج مشهور عنده أسعار، بأرخص 5 مناطق
  function heroBoard(popular) {
    var p = popular.filter(function (x) { return x.rows.length > 2; })[0];
    if (!p) return '';
    var rows = p.rows.slice(0, 5).map(function (r, i) {
      return '<li class="board-row' + (i === 0 ? ' is-top' : '') + '">' +
        '<span class="rpill' + (i === 0 ? ' is-accent' : '') + '">' + esc(r.region.code) + '</span>' +
        '<span class="board-name">' + esc(r.region.name) + '</span>' +
        '<span class="board-price mono">' + money(r.usd) + '</span></li>';
    }).join('');
    return '<aside class="hero-board" aria-label="مثال: أسعار ' + esc(shortName(p)) + ' بأرخص المناطق">' +
      '<div class="board-head">' + tile(p) +
        '<span class="board-titles"><span class="board-title">' + esc(p.name) + '</span>' +
        '<span class="board-sub">' + esc(p.variant || '') + '</span></span></div>' +
      '<ol class="board-list">' + rows + '</ol>' +
      '<a class="board-more" href="#/p/' + encodeURIComponent(p.id) + '">شوف كل المناطق (' + p.rows.length + ') ←</a>' +
    '</aside>';
  }

  function viewHome() {
    var priced = DB.products.filter(function (p) { return p.rows.length > 1; });
    var top = priced.slice().sort(function (a, b) { return b.saving - a.saving; }).slice(0, 8);
    var popular = DB.popular.map(function (id) { return DB.productMap[id]; }).filter(Boolean);

    var steps = [
      ['01', 'بنجمع السعر من كل منطقة', 'من المتجر نفسه، أو من مصدر منشور مع رابطه وتاريخ التحقق منه.'],
      ['02', 'بنحوّله لعملتك', 'بسعر صرف بيتحدّث كل يوم، عشان تقارن الأسعار ببعض صح.'],
      ['03', 'بنرتّب من الأرخص', 'وبنحسبلك قديش أرخص من أغلى منطقة.'],
      ['04', 'بنقلك شو بيلزمك', 'أي بطاقة بتشحن فيها، ومع تنبيه إذا ما بتمشي على حسابك.']
    ];

    return '' +
      '<section class="hero"><div class="container hero-grid">' +
        '<div class="hero-copy">' +
          '<span class="eyebrow">' + icon('globe', 14) + 'قارن الأسعار بين ' + DB.regions.length + ' منطقة حول العالم</span>' +
          '<h1 class="hero-title">نفس اللعبة،<br><span class="accent">بسعر أقل بكثير.</span></h1>' +
          '<p class="hero-sub">اكتب اسم اللعبة أو الاشتراك، وبنوريك بأي منطقة أرخص، وكم بيطلع عليك بعملتك، وأي بطاقة بتلزمك.</p>' +
          searchBox('hero-search', 'جرّب: GTA VI، بلايستيشن بلس، جيم باس، Elden Ring…') +
          (popular.length ? '<div class="quick"><span class="quick-label">الأكثر بحثاً:</span>' +
            popular.map(function (p) { return '<a class="chip" href="#/p/' + encodeURIComponent(p.id) + '">' + esc(shortName(p)) + '</a>'; }).join('') +
          '</div>' : '') +
        '</div>' +
        heroBoard(popular) +
      '</div></section>' +

      '<div class="container"><div class="stats">' +
        '<span class="stat">' + icon('globe') + DB.regions.length + ' منطقة</span>' +
        '<span class="stat">' + icon('card') + DB.products.length + ' منتج</span>' +
        '<span class="stat">' + icon('clock') + esc(updatedText()) + '</span>' +
        '<span class="stat">' + icon('shield') + 'كل سعر معه مصدره وتاريخه</span>' +
      '</div></div>' +

      '<section class="section"><div class="container">' +
        '<div class="section-head"><div><h2 class="section-title">أكبر فروقات الأسعار</h2>' +
        '<p class="section-sub">الفرق بين أرخص منطقة وأغلى منطقة، محسوب بعملتك</p></div>' +
        '<a class="link-more" href="#/all">كل المنتجات ←</a></div>' +
        (top.length ? '<div class="grid cards">' + top.map(productCard).join('') + '</div>'
          : '<div class="empty"><span class="empty-title">الأسعار عم تتجهّز</span><span>رح تظهر هون أول ما يخلص التحديث التلقائي.</span></div>') +
      '</div></section>' +

      '<section class="section"><div class="container">' +
        '<div class="section-head"><h2 class="section-title">تصفّح حسب القسم</h2></div>' +
        '<div class="grid cats">' + DB.categories.map(function (c) {
          var n = DB.products.filter(function (p) { return p.category === c.id; }).length;
          return '<a class="catcard" href="#/c/' + encodeURIComponent(c.id) + '"><span class="catcard-icon">' + icon(c.icon || 'card', 22) + '</span>' +
            '<span class="catcard-body"><span class="catcard-name">' + esc(c.name) + '</span>' +
            '<span class="catcard-desc">' + esc(c.desc) + '</span><span class="catcard-count">' + n + ' منتج</span></span></a>';
        }).join('') + '</div>' +
        soonBox() +
      '</div></section>' +

      '<section class="section"><div class="container">' +
        '<div class="section-head"><div><h2 class="section-title">كيف بنحسب؟</h2>' +
        '<p class="section-sub">نفس الطريقة لكل منتج، وكل رقم بتقدر تتأكد منه</p></div>' +
        '<a class="link-more" href="#/about">التفاصيل ←</a></div>' +
        '<div class="grid steps">' + steps.map(function (s, i) {
          return '<div class="step' + (i === steps.length - 1 ? ' is-result' : '') + '"><span class="step-num">' + s[0] + '</span>' +
            '<span class="step-title">' + s[1] + '</span><span class="step-text">' + s[2] + '</span></div>';
        }).join('') + '</div>' +
        '<div style="margin-top:16px">' + lockNotice() + '</div>' +
      '</div></section>';
  }

  function viewBrowse(catId) {
    var cat = null;
    if (catId) {
      cat = DB.categories.filter(function (c) { return c.id === catId; })[0] || null;
      if (!cat) return null;
    }
    var title = cat ? cat.name : 'كل المنتجات';
    return '<div class="container">' +
      '<div class="page-head">' +
        '<nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الرئيسية</a><span aria-hidden="true">/</span><span>' + esc(title) + '</span></nav>' +
        '<h1 class="page-title">' + esc(title) + '</h1>' +
        '<p class="page-sub">' + (cat ? esc(cat.desc) : 'كل الألعاب والاشتراكات اللي بنقارن أسعارها بين المناطق') + '</p>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="chips" role="group" aria-label="الأقسام">' +
          '<a class="chip" href="#/all"' + (!cat ? ' aria-current="true"' : '') + '>الكل</a>' +
          DB.categories.map(function (c) {
            return '<a class="chip" href="#/c/' + encodeURIComponent(c.id) + '"' + (cat && cat.id === c.id ? ' aria-current="true"' : '') + '>' + esc(c.name) + '</a>';
          }).join('') +
        '</div>' +
        '<div class="tools">' +
          '<label class="visually-hidden" for="filter">فلترة بالاسم</label>' +
          '<input id="filter" class="filter-input" type="search" placeholder="فلترة بالاسم…" autocomplete="off" value="' + esc(state.filter) + '">' +
          '<label class="visually-hidden" for="sort">الترتيب</label>' +
          '<select id="sort" class="select">' +
            '<option value="saving">أكبر فرق بالسعر</option>' +
            '<option value="cheap">الأرخص أولاً</option>' +
            '<option value="name">حسب الاسم</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<p class="result-count" id="result-count" aria-live="polite"></p>' +
      '<div class="grid cards" id="browse-grid" style="padding-bottom:56px"></div>' +
    '</div>';
  }

  function fillBrowse(catId) {
    var grid = document.getElementById('browse-grid');
    var count = document.getElementById('result-count');
    if (!grid) return;
    var list = DB.products.filter(function (p) { return !catId || p.category === catId; });
    var q = norm(state.filter);
    if (q) list = list.filter(function (p) { return p.search.indexOf(q) !== -1; });
    list.sort(function (a, b) {
      if (state.sort === 'name') return a.name.localeCompare(b.name, 'en');
      var ap = a.min ? 0 : 1, bp = b.min ? 0 : 1;
      if (ap !== bp) return ap - bp;
      if (state.sort === 'cheap') return (a.min ? a.min.usd : 0) - (b.min ? b.min.usd : 0);
      return b.saving - a.saving;
    });
    grid.innerHTML = list.length ? list.map(productCard).join('') :
      '<div class="empty" style="grid-column:1/-1"><span class="empty-title">ما في نتائج</span><span>جرّب كلمة ثانية أو امسح الفلترة.</span></div>';
    count.textContent = list.length + ' منتج';
  }

  function bindBrowse(catId) {
    var f = document.getElementById('filter');
    var s = document.getElementById('sort');
    s.value = state.sort;
    f.addEventListener('input', function () { state.filter = f.value; fillBrowse(catId); });
    s.addEventListener('change', function () { state.sort = s.value; fillBrowse(catId); });
    fillBrowse(catId);
  }

  function selectedRow(p) {
    var code = state.selected[p.id];
    var r = code && p.rows.filter(function (x) { return x.region.code === code; })[0];
    return r || p.min;
  }

  function viewProduct(id) {
    var p = DB.productMap[id];
    if (!p) return null;
    var cat = DB.categories.filter(function (c) { return c.id === p.category; })[0];
    var pl = DB.platforms[p.platform] || { name: p.platform, card: 'بطاقة شحن', cardEn: 'gift card' };
    var cur = curInfo();

    var head = '<div class="page-head">' +
      '<nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الرئيسية</a><span aria-hidden="true">/</span>' +
      (cat ? '<a href="#/c/' + encodeURIComponent(cat.id) + '">' + esc(cat.name) + '</a><span aria-hidden="true">/</span>' : '') +
      '<span>' + esc(shortName(p)) + '</span></nav>' +
      '<div class="product-head">' + tile(p, 'tile-lg') +
        '<div class="product-titles"><h1 class="page-title">' + esc(p.name) + '</h1>' +
        '<div class="product-meta">' + platformBadge(p) + '<span>' + esc(p.variant || '') + '</span></div></div>' +
      '</div></div>';

    if (!p.rows.length) {
      return '<div class="container">' + head +
        '<div class="empty" style="margin-bottom:56px"><span class="empty-title">' +
        (isAutoSource(p) ? 'الأسعار بتنزل مع أول تحديث تلقائي' : 'أسعار هالمنتج قريباً') + '</span>' +
        '<span>' + (isAutoSource(p) ? 'التحديث التلقائي بيشتغل كل يوم، وبتظهر الأسعار هون أول ما يخلص.' : 'لسا ما أضفنا أسعار موثّقة لهالمنتج.') + '</span>' +
        '<a class="btn btn-ghost" href="#/all">تصفّح منتجات ثانية</a></div></div>';
    }

    var sel = selectedRow(p);
    var mine = p.rows.filter(function (r) { return r.region.code === state.region; })[0] || null;

    var regionOptions = DB.regions.map(function (r) {
      return '<option value="' + r.code + '"' + (r.code === state.region ? ' selected' : '') + '>' + esc(r.name) + '</option>';
    }).join('');

    var mineValue, mineNote;
    if (mine) {
      mineValue = money(mine.usd);
      if (mine === p.min) mineNote = '<span class="badge badge-soft">' + icon('check', 13) + 'منطقتك هي الأرخص</span>';
      else mineNote = 'أغلى من الأرخص بـ ' + pct(Math.round((mine.usd / p.min.usd - 1) * 100));
    } else {
      mineValue = '<span style="font-size:18px;color:var(--text-3)">ما عندنا سعر</span>';
      mineNote = 'لسا ما أضفنا سعر هالمنتج بمتجر ' + esc((DB.regionMap[state.region] || {}).name || '');
    }

    var summary = '<div class="summary area-summary">' +
      '<div class="summary-cell"><span class="summary-label">أرخص منطقة</span>' +
        '<span class="summary-value is-accent mono">' + money(p.min.usd) + '</span>' +
        '<span class="summary-note"><span class="rpill is-accent">' + esc(p.min.region.code) + '</span>' + esc(p.min.region.name) +
        ' · ' + esc(localMoney(p.min.entry.amount, p.min.entry.currency)) + '</span></div>' +
      '<div class="summary-cell"><span class="summary-label"><label for="my-region">منطقة حسابك</label>' +
        '<select id="my-region" class="select">' + regionOptions + '</select></span>' +
        '<span class="summary-value mono">' + mineValue + '</span>' +
        '<span class="summary-note">' + mineNote + '</span></div>' +
      '<div class="summary-cell"><span class="summary-label">الفرق بين المناطق</span>' +
        '<span class="summary-value mono">' + (p.rows.length > 1 ? pct(p.saving) : '—') + '</span>' +
        '<span class="summary-note">' + (p.rows.length > 1 ? 'بين ' + esc(p.min.region.name) + ' (الأرخص) و' + esc(p.max.region.name) + ' (الأغلى)' : 'منطقة وحدة بس لحد الآن') + '</span></div>' +
      '</div>';

    var rowsHtml = p.rows.map(function (r) {
      var isMin = r === p.min;
      var isSel = r === sel;
      var tags = '';
      if (isMin) tags += '<span class="badge badge-accent">الأرخص</span>';
      if (r.region.code === state.region) tags += '<span class="badge badge-muted">منطقتك</span>';
      if (r.entry.discount > 0) tags += '<span class="badge badge-soft">خصم ' + pct(r.entry.discount) + '</span>';
      var diff = isMin ? '<span class="muted">الأرخص</span>' : 'أغلى بـ ' + pct(Math.round((r.usd / p.min.usd - 1) * 100));
      var checked = r.entry.checked ? (r.auto ? relTime(r.entry.checked) : fmtDate(r.entry.checked)) : '';
      var src = r.entry.source ? '<a class="src-link" href="' + esc(r.entry.source) + '" target="_blank" rel="noopener noreferrer">المصدر' + icon('external', 12) + '</a>' : '';
      return '<tr class="' + (isMin ? 'is-cheapest ' : '') + (isSel ? 'is-selected' : '') + '">' +
        '<td class="c-region"><button type="button" class="row-btn" data-region="' + r.region.code + '" aria-pressed="' + (isSel ? 'true' : 'false') + '">' +
          '<span class="rpill' + (isSel ? ' is-accent' : '') + '">' + esc(r.region.code) + '</span><span class="row-name">' + esc(r.region.name) + '</span></button> ' +
          '<span class="row-tags">' + tags + '</span></td>' +
        '<td class="c-local num">' + esc(localMoney(r.entry.amount, r.entry.currency)) + (r.entry.converted ? ' <span class="muted">(محوّل)</span>' : '') + '</td>' +
        '<td class="c-yours num num-strong"' + (isMin ? ' style="color:var(--accent)"' : '') + '>' + money(r.usd) +
          (r.origUsd ? '<span class="old">' + money(r.origUsd) + '</span>' : '') + '</td>' +
        '<td class="c-diff">' + diff + '</td>' +
        '<td class="c-date"><span class="muted">' + esc(checked) + '</span> ' + src + '</td>' +
      '</tr>';
    }).join('');

    var anyAuto = p.rows.some(function (r) { return r.auto; });
    var srcName = p.source && p.source.type === 'steam' ? 'Steam' : (p.source && p.source.type === 'xbox' ? 'متجر Xbox' : '');
    var table = '<div class="table-card area-table">' +
      '<div class="table-head"><h2 class="table-title">الأسعار بكل المناطق</h2>' +
      '<span class="table-sub">مرتّبة من الأرخص · ' + esc(cur.inLabel) + ' · اضغط على منطقة لتشوف بطاقتها</span></div>' +
      '<table class="ptable"><caption class="visually-hidden">أسعار ' + esc(p.name) + ' بكل المناطق</caption>' +
      '<thead><tr><th scope="col">المنطقة</th><th scope="col">السعر المحلي</th><th scope="col">بعملتك</th><th scope="col">مقارنة بالأرخص</th><th scope="col">آخر تحقق</th></tr></thead>' +
      '<tbody>' + rowsHtml + '</tbody></table>' +
      '<div class="table-foot">' +
        '<span>' + (anyAuto ? 'أسعار هالمنتج بتتحدّث تلقائياً كل يوم من ' + esc(srcName) + '.' : 'أسعار هالمنتج مأخوذة من مصادر منشورة، وكل سعر معه رابطه وتاريخ التحقق منه.') + '</span>' +
        '<span>التحويل لعملتك بسعر صرف ' + esc(fmtDate(DB.ratesMeta.updated)) + (DB.ratesMeta.approximate ? ' (تقريبي لحد أول تحديث تلقائي)' : '') + '.</span>' +
        (repoUrl() ? '<a class="src-link" style="font-size:13px;margin-top:4px" target="_blank" rel="noopener noreferrer" href="' +
          esc(repoUrl() + '/issues/new?title=' + encodeURIComponent('سعر غلط: ' + p.name) +
            '&body=' + encodeURIComponent('المنتج: ' + p.name + '\nالمنطقة: \nالسعر الصحيح: \nرابط المصدر: ')) +
          '">' + icon('flag', 14) + 'شفت سعر غلط؟ بلّغنا وبنصلّحه</a>' : '') +
      '</div></div>';

    var searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(pl.cardEn + ' ' + sel.region.en);
    var side = '<aside class="col-side area-side" aria-label="البطاقة اللي بتلزمك">' +
      '<div class="side-card is-accent">' +
        '<h2 class="side-title">البطاقة اللي بتلزمك</h2>' +
        '<div class="card-line"><span class="catcard-icon" style="width:40px;height:40px">' + icon('card', 20) + '</span>' +
          '<span style="display:flex;flex-direction:column;min-width:0"><span class="card-line-name">' + esc(pl.card) + ' من ' + esc(sel.region.name) + '</span>' +
          '<span class="card-line-sub">لحساب ' + esc(pl.name) + ' من ' + esc(sel.region.name) + ' · ' + esc(shortName(p)) + ' بـ ' + moneyInline(sel.usd) + '</span></span></div>' +
        '<a class="btn btn-primary btn-block" href="' + esc(searchUrl) + '" target="_blank" rel="noopener noreferrer">دوّر على البطاقة' + icon('external', 16) + '</a>' +
        '<ul class="tips">' +
          '<li><span style="color:var(--accent)">' + icon('check', 16) + '</span><span>اشتري من موزّع رسمي أو متجر معروف، وتأكد إن البطاقة لنفس منطقة حسابك.</span></li>' +
          '<li><span style="color:var(--warn)">' + icon('alert', 16) + '</span><span>البطاقات الأرخص بكثير عند البائعين الوسطاء ممكن تطلع مسروقة وتنلغى.</span></li>' +
        '</ul>' +
      '</div>' +
      lockNotice(sel.region.name, pl.name) +
    '</aside>';

    // على الموبايل: الملخص، بعدين البطاقة، بعدين الجدول
    return '<div class="container">' + head +
      '<div class="product-layout">' + summary + side + table + '</div></div>';
  }

  function bindProduct(id) {
    var my = document.getElementById('my-region');
    if (my) my.addEventListener('change', function () {
      state.region = my.value;
      store.set('wa-region', my.value);
      rerender(function () { var el = document.getElementById('my-region'); if (el) el.focus(); });
    });
    main.querySelectorAll('.row-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var code = b.getAttribute('data-region');
        state.selected[id] = code;
        rerender(function () {
          var el = main.querySelector('.row-btn[data-region="' + code + '"]');
          if (el) el.focus();
        });
      });
    });
  }

  function viewAbout() {
    var st = DB.status && DB.status.sources ? DB.status.sources : {};
    var autoLine = DB.auto && DB.auto.updated ? 'آخر تحديث تلقائي: ' + fmtDate(DB.auto.updated) + ' (' + relTime(DB.auto.updated) + ').' : 'التحديث التلقائي بيشتغل يومياً على GitHub.';
    var repo = repoUrl();
    return '<div class="container">' +
      '<div class="page-head"><nav class="crumbs" aria-label="مسار التنقل"><a href="#/">الرئيسية</a><span aria-hidden="true">/</span><span>كيف بنشتغل</span></nav>' +
      '<h1 class="page-title">كيف بنشتغل؟</h1>' +
      '<p class="page-sub">«وين أرخص؟» بيقارن سعر نفس اللعبة أو الاشتراك بين مناطق العالم، وبيحوّل كل الأسعار لعملتك.</p></div>' +
      '<div class="prose">' +
        '<section><h2>من وين بتيجي الأسعار؟</h2><ul>' +
          '<li><strong>ألعاب ستيم و Game Pass:</strong> بتتحدّث تلقائياً كل يوم من متجر Steam ومتجر Xbox مباشرة.</li>' +
          '<li><strong>أسعار الصرف:</strong> بتتحدّث تلقائياً كل يوم.</li>' +
          '<li><strong>بلايستيشن:</strong> متجر بلايستيشن ما بيعرض أسعار الاشتراكات بدون تسجيل دخول، فبناخذ الأسعار من مصادر منشورة، وكل سعر معه رابطه وتاريخ التحقق منه.</li>' +
        '</ul><p style="margin-top:8px">' + esc(autoLine) + '</p></section>' +
        '<section><h2>كيف بنحسب؟</h2>' +
          '<div class="formula"><span class="term">السعر بعملة المنطقة</span><span class="op">÷</span><span class="term">سعر صرف عملتها</span><span class="op">×</span><span class="term">سعر صرف عملتك</span><span class="op">=</span><span class="term is-result">السعر بعملتك</span></div>' +
          '<p style="margin-top:12px">بعدها بنرتّب المناطق من الأرخص، وبنحسب الفرق بين أرخص منطقة وأغلى منطقة. الأسعار قبل أي ضرائب أو رسوم ممكن تنضاف عند الدفع.</p></section>' +
        '<section><h2>قبل ما تشتري</h2>' + lockNotice() + '</section>' +
        '<section><h2>شو الجاي؟</h2><p>عم نشتغل على إضافة:</p>' + '<ul class="soon-list" style="margin-top:10px;padding:0">' + DB.comingSoon.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ul></section>' +
        (repo ? '<section><h2>لاحظت سعر غلط أو بدك تضيف منتج؟</h2><p>الموقع مفتوح المصدر. <a href="' + esc(repo + '/issues/new') + '" target="_blank" rel="noopener noreferrer">افتح طلب على GitHub</a> وبنراجعه.</p></section>' : '') +
        '<section><h2>تنبيه</h2><p>الأسعار للمعلومية وممكن تتغير بأي وقت، فتأكد من السعر بالمتجر قبل ما تشتري. «وين أرخص؟» مش تابع لسوني أو مايكروسوفت أو Valve، وكل الأسماء التجارية لأصحابها.</p></section>' +
      '</div></div>';
  }

  function viewNotFound() {
    return '<div class="container"><div class="page-head"><h1 class="page-title">الصفحة مش موجودة</h1>' +
      '<p class="page-sub">ممكن الرابط غلط أو المنتج انشال.</p></div>' +
      '<div style="display:flex;gap:12px;flex-wrap:wrap;padding-bottom:56px"><a class="btn btn-primary" href="#/">ارجع للرئيسية</a><a class="btn btn-ghost" href="#/all">كل المنتجات</a></div></div>';
  }

  function viewError() {
    return '<div class="container"><div class="page-head"><h1 class="page-title">ما قدرنا نحمّل الأسعار</h1>' +
      '<p class="page-sub">تأكد من الاتصال بالإنترنت وجرّب كمان مرة.</p></div>' +
      '<div style="padding-bottom:56px"><button type="button" class="btn btn-primary" id="retry">جرّب مرة ثانية</button></div></div>';
  }

  /* ===== التنقل ===== */
  function setNav(key) {
    document.querySelectorAll('[data-nav]').forEach(function (a) {
      if (a.getAttribute('data-nav') === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function route(opts) {
    opts = opts || {};
    var raw = location.hash || '';
    if (raw && raw.indexOf('#/') !== 0) {
      if (!firstRender) return;
      raw = '#/';
    }
    var parts = raw.replace(/^#\/?/, '').split('/').filter(Boolean);
    var html = null, after = null, title = 'وين أرخص؟', nav = '';

    // الفلترة بتخص الصفحة الحالية بس، فبتنمسح لما ننتقل لصفحة ثانية
    var routeKey = parts.join('/');
    if (routeKey !== lastRouteKey) state.filter = '';
    lastRouteKey = routeKey;

    if (!parts.length) {
      html = viewHome(); nav = 'home';
      title = 'وين أرخص؟ | قارن أسعار الألعاب والاشتراكات بين المناطق';
      after = function () { bindSearch(main); };
    } else if (parts[0] === 'all') {
      html = viewBrowse(null); nav = 'all'; title = 'كل المنتجات | وين أرخص؟';
      after = function () { bindBrowse(null); };
    } else if (parts[0] === 'c' && parts[1]) {
      var catId = decodeURIComponent(parts[1]);
      html = viewBrowse(catId); nav = 'all';
      var c = DB.categories.filter(function (x) { return x.id === catId; })[0];
      title = (c ? c.name : 'قسم') + ' | وين أرخص؟';
      after = function () { bindBrowse(catId); };
    } else if (parts[0] === 'p' && parts[1]) {
      var id = decodeURIComponent(parts[1]);
      html = viewProduct(id);
      var p = DB.productMap[id];
      if (p) title = 'وين أرخص ' + shortName(p) + '؟ | قارن السعر بين المناطق';
      after = function () { bindProduct(id); };
    } else if (parts[0] === 'about') {
      html = viewAbout(); nav = 'about'; title = 'كيف بنشتغل | وين أرخص؟';
    }

    if (html == null) { html = viewNotFound(); after = null; title = 'الصفحة مش موجودة | وين أرخص؟'; }

    var y = window.scrollY;
    main.innerHTML = html;
    document.title = title;
    setNav(nav);
    if (after) after();

    if (opts.keepScroll) {
      window.scrollTo(0, y);
      if (opts.focus) opts.focus();
    } else if (!firstRender) {
      window.scrollTo(0, 0);
      var h = main.querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    firstRender = false;
  }

  function rerender(focusFn) { route({ keepScroll: true, focus: focusFn }); }

  function setupCurrency() {
    curSelect.innerHTML = CURRENCIES.filter(function (c) { return c.code === 'USD' || DB.rates[c.code]; }).map(function (c) {
      return '<option value="' + c.code + '"' + (c.code === state.currency ? ' selected' : '') + '>' + esc(c.label) + ' (' + esc(c.sym) + ')</option>';
    }).join('');
    if (!curSelect.value) { state.currency = 'USD'; curSelect.value = 'USD'; }
    curSelect.addEventListener('change', function () {
      state.currency = curSelect.value;
      store.set('wa-currency', curSelect.value);
      rerender();
    });
  }

  function setupFooter() {
    var a = document.getElementById('footer-repo');
    if (!a) return;
    if (repoUrl()) { a.href = repoUrl(); a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    else a.remove();
  }

  function init() {
    Promise.all([
      loadJSON('data/regions.json'),
      loadJSON('data/catalog.json'),
      loadJSON('data/manual-prices.json'),
      loadJSON('data/auto-prices.json').catch(function () { return { products: {}, names: {} }; }),
      loadJSON('data/rates.json'),
      loadJSON('data/status.json').catch(function () { return {}; })
    ]).then(function (res) {
      DB = build(res[0], res[1], res[2], res[3], res[4], res[5]);
      setupCurrency();
      setupFooter();
      window.addEventListener('hashchange', function () { route(); });
      route();
    }).catch(function (err) {
      if (window.console) console.error(err);
      main.innerHTML = viewError();
      var b = document.getElementById('retry');
      if (b) b.addEventListener('click', function () { location.reload(); });
    });
  }

  init();
})();
