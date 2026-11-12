/* وين أرخص؟ — اختار الخدمة، والموقع بيختارلك المنصة والمنطقة الأرخص */
(() => {
  'use strict';

  const CFG = window.WA_CONFIG || {};
  const main = document.getElementById('main');
  const curSelect = document.getElementById('currency-select');
  const PLATFORM_ORDER = ['psn', 'xbox', 'steam', 'apple'];
  const TYPE_ORDER = ['game', 'sub', 'currency', 'app'];
  const PAGE = 48;

  /* ===== تخزين بسيط (ممكن يكون مقفول بالمتصفح) ===== */
  const store = {
    get(k, d) { try { const v = localStorage.getItem('wa:' + k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('wa:' + k, v); } catch (e) { /* تجاهل */ } }
  };

  /* ===== أيقونات ===== */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4.2-4.2"/>',
    arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>',
    lock: '<rect x="5" y="11" width="14" height="9"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    alert: '<path d="M12 4 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    card: '<rect x="3" y="6" width="18" height="13"/><path d="M3 10.5h18M7 15h4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18.5 5.5"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l9-11h-6z"/>',
    android: '<rect x="6" y="9" width="12" height="9"/><path d="M8.5 6.5 7 4.5M15.5 6.5 17 4.5M6 9a6 6 0 0 1 12 0M9.5 12h.01M14.5 12h.01"/>'
  };
  const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // نص بلغة مختلطة (إنجليزي وأرقام) بيحافظ على ترتيبه جوّا الصفحة العربية
  const bdi = (s) => `<bdi>${esc(s)}</bdi>`;

  /* ===== العملات ===== */
  const ARAB = ['JOD', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'IQD', 'LBP', 'SYP', 'MAD', 'DZD', 'TND', 'LYD', 'SDG', 'YER'];
  const POPULAR = ['USD', 'EUR', 'GBP', 'TRY'];
  const SYM = {
    USD: ['$', 1], EUR: ['€', 1], GBP: ['£', 1], TRY: ['₺', 1], INR: ['₹', 1], JPY: ['¥', 1], BRL: ['R$', 1],
    JOD: ['د.أ', 0], SAR: ['ر.س', 0], AED: ['د.إ', 0], KWD: ['د.ك', 0], QAR: ['ر.ق', 0], BHD: ['د.ب', 0], OMR: ['ر.ع', 0],
    EGP: ['ج.م', 0], IQD: ['د.ع', 0], LBP: ['ل.ل', 0], SYP: ['ل.س', 0], MAD: ['د.م', 0], DZD: ['د.ج', 0], TND: ['د.ت', 0],
    LYD: ['د.ل', 0], SDG: ['ج.س', 0], YER: ['ر.ي', 0]
  };
  const CC_CURRENCY = { JO: 'JOD', SA: 'SAR', AE: 'AED', KW: 'KWD', QA: 'QAR', BH: 'BHD', OM: 'OMR', EG: 'EGP', IQ: 'IQD', LB: 'USD', SY: 'SYP', MA: 'MAD', DZ: 'DZD', TN: 'TND', LY: 'LYD', SD: 'SDG', YE: 'YER', PS: 'ILS', TR: 'TRY', US: 'USD', GB: 'GBP' };
  let displayNames = null;
  try { displayNames = new Intl.DisplayNames(['ar'], { type: 'currency' }); } catch (e) { /* متصفح قديم */ }
  const curName = (code) => { try { return (displayNames && displayNames.of(code)) || code; } catch (e) { return code; } };
  const decCache = {};
  const decimalsOf = (code) => {
    if (decCache[code] == null) {
      try { decCache[code] = new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions().maximumFractionDigits; } catch (e) { decCache[code] = 2; }
    }
    return decCache[code];
  };
  const fmt = (n, dec) => n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  /** مبلغ بالدولار → نص بعملة العرض */
  function money(usd, code = state.currency) {
    if (usd == null || !isFinite(usd)) return '—';
    const rate = code === 'USD' ? 1 : DB.rates[code];
    if (!rate) return money(usd, 'USD');
    const v = usd * rate;
    let dec = Math.min(decimalsOf(code), 2);
    if (v >= 10000) dec = 0;
    const n = fmt(v, dec);
    const s = SYM[code];
    if (s && s[1]) return `<span class="num" dir="ltr">${s[0]}${n}</span>`;
    if (s) return `<span class="num"><bdi dir="ltr">${n}</bdi> ${s[0]}</span>`;
    return `<span class="num" dir="ltr">${n} ${code}</span>`;
  }
  /** السعر بعملة المتجر نفسه */
  function localPrice(t) {
    const dec = t[0] >= 10000 ? 0 : Math.min(decimalsOf(t[1]), 2);
    return `<span dir="ltr">${t[1]} ${fmt(t[0], dec)}</span>`;
  }
  const pct = (n) => `<bdi dir="ltr">${Math.round(n)}%</bdi>`;

  /* ===== التاريخ ===== */
  function daysAgo(date) {
    const d = new Date(date + 'T12:00:00Z');
    const diff = Math.round((Date.now() - d.getTime()) / 86400000);
    if (!isFinite(diff) || diff <= 0) return 'اليوم';
    if (diff === 1) return 'أمس';
    if (diff === 2) return 'قبل يومين';
    return diff <= 10 ? `قبل ${diff} أيام` : `قبل ${diff} يوم`;
  }
  function timeAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    if (!isFinite(ms)) return '';
    const h = Math.floor(ms / 3600000);
    if (h < 1) { const m = Math.max(1, Math.floor(ms / 60000)); return m <= 2 ? 'قبل دقيقة' : `قبل ${m} دقيقة`; }
    if (h < 24) return h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : `قبل ${h} ساعات`;
    const d = Math.floor(h / 24);
    return d === 1 ? 'أمس' : `قبل ${d} أيام`;
  }
  const fmtDate = (iso) => { try { return new Date(iso).toLocaleDateString('ar-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return iso; } };

  /* ===== البحث العربي ===== */
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[™®©’'`]/g, '').replace(/[^a-z0-9؀-ۿ+]+/g, ' ').trim();

  /* ===== البيانات ===== */
  let DB = null;
  const state = {
    currency: 'USD',
    region: 'SA',
    homeTab: 'game',
    browse: {}
  };

  async function getJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' ' + res.status);
    return res.json();
  }

  async function boot() {
    try {
      const [prices, regions, rates] = await Promise.all([getJSON('data/prices.json'), getJSON('data/regions.json'), getJSON('data/rates.json')]);
      DB = build(prices, regions, rates);
    } catch (e) {
      main.innerHTML = `<div class="container page"><div class="empty">${icon('alert', 'lg')}<h1>ما قدرنا نجيب الأسعار</h1><p>جرّب تحدّث الصفحة بعد شوي.</p><button class="btn btn-primary" type="button" onclick="location.reload()">حدّث الصفحة</button></div></div>`;
      return;
    }
    setupPrefs();
    setupCurrency();
    setupChrome();
    window.addEventListener('hashchange', () => route());
    route();
  }

  function build(prices, regions, rates) {
    const regionByCode = {};
    regions.forEach((r) => { regionByCode[r.code] = r; });
    const services = (prices.services || []).filter((s) => s && s.offers && Object.keys(s.offers).length);
    const byId = {};
    services.forEach((s) => {
      byId[s.id] = s;
      s._search = norm([s.name, s.ar, s.kw].join(' '));
      s.platforms = PLATFORM_ORDER.filter((p) => s.offers[p]);
    });
    const covered = new Set();
    let count = 0;
    services.forEach((s) => Object.values(s.offers).forEach((o) => o.packages.forEach((p) => Object.keys(p.prices).forEach((c) => { covered.add(c); count++; }))));
    return {
      services, byId, regions, regionByCode,
      rates: (rates && rates.rates) || { USD: 1 },
      ratesUpdated: rates && rates.updated,
      platforms: prices.platforms || {},
      types: prices.types || {},
      updated: prices.updated,
      priceCount: count,
      regionCount: covered.size,
      memo: {}
    };
  }

  /* ===== الحسابات ===== */
  const usdOf = (t) => (t[1] === 'USD' ? t[0] : DB.rates[t[1]] ? t[0] / DB.rates[t[1]] : null);

  function rowsOf(pkg) {
    const rows = [];
    for (const [code, t] of Object.entries(pkg.prices || {})) {
      const usd = usdOf(t);
      const region = DB.regionByCode[code];
      if (usd == null || !region) continue;
      rows.push({ code, region, t, usd, origUsd: t[2] ? usdOf([t[2], t[1]]) : null, date: t[3] });
    }
    return rows.sort((a, b) => a.usd - b.usd);
  }

  function pkgOf(s, pl, id) {
    const off = s.offers[pl];
    if (!off) return null;
    return off.packages.find((p) => p.id === id) || off.packages.find((p) => p.id === off.def) || off.packages[0];
  }

  /** ملخص منصة/باقة: الأرخص والأغلى والفرق */
  function summary(s, pl, pkgId) {
    const key = s.id + '|' + pl + '|' + (pkgId || '');
    if (DB.memo[key]) return DB.memo[key];
    const pkg = pkgOf(s, pl, pkgId);
    if (!pkg) return null;
    const rows = rowsOf(pkg);
    if (!rows.length) return null;
    const best = rows[0];
    const worst = rows[rows.length - 1];
    const res = { pl, pkg, rows, best, worst, saving: worst.usd > 0 ? (1 - best.usd / worst.usd) * 100 : 0 };
    DB.memo[key] = res;
    return res;
  }

  /** أرخص منصة للخدمة (حسب الباقة الافتراضية لكل منصة) */
  function bestOf(s) {
    const key = s.id + '|best';
    if (DB.memo[key] !== undefined) return DB.memo[key];
    let best = null;
    for (const pl of s.platforms) {
      const sm = summary(s, pl);
      if (sm && (!best || sm.best.usd < best.best.usd)) best = sm;
    }
    let saving = 0;
    for (const pl of s.platforms) { const sm = summary(s, pl); if (sm && sm.rows.length >= 3) saving = Math.max(saving, sm.saving); }
    DB.memo[key] = best ? { ...best, maxSaving: saving } : null;
    return DB.memo[key];
  }

  /* ===== روابط ===== */
  function storeUrl(s, pl, pkg, code) {
    const r = DB.regionByCode[code] || {};
    const ref = pkg && pkg.ref;
    if (pl === 'psn') {
      if (ref === 'psplus') return `https://www.playstation.com/${r.ps || 'en-us'}/ps-plus/`;
      return `https://store.playstation.com/${r.ps || 'en-us'}/concept/${encodeURIComponent(ref)}`;
    }
    if (pl === 'xbox') return `https://www.xbox.com/en-US/games/store/x/${encodeURIComponent(ref)}`;
    if (pl === 'steam') return `https://store.steampowered.com/app/${encodeURIComponent(ref)}/?cc=${r.steam || 'us'}`;
    if (pl === 'apple' && ref === 'icloud') return 'https://support.apple.com/en-us/108047';
    if (pl === 'apple') return `https://apps.apple.com/${r.apple || 'us'}/app/id${encodeURIComponent(ref)}`;
    return '#/';
  }
  const cardSearchUrl = (pl, code) => {
    const p = DB.platforms[pl] || {};
    const r = DB.regionByCode[code] || {};
    return 'https://www.google.com/search?q=' + encodeURIComponent(`${p.cardEn || ''} ${r.en || code}`);
  };
  const reportUrl = (title) => (CFG.repoUrl ? `${CFG.repoUrl}/issues/new?title=${encodeURIComponent(title)}` : '#/about');
  const svcHref = (s, pl, pkgId) => '#/s/' + encodeURIComponent(s.id) + (pl ? '/' + pl + (pkgId ? '/' + encodeURIComponent(pkgId) : '') : '');

  /* ===== عناصر صغيرة ===== */
  const MONO = {
    'ps-plus': 'P+', 'game-pass': 'GP', 'ea-play': 'EA', 'pubg-uc': 'UC', 'fortnite-vbucks': 'VB', 'roblox-robux': 'RBX', 'free-fire': 'FF',
    'codm-cp': 'CP', 'mlbb-diamonds': 'ML', 'genshin-crystals': 'GI', 'clash-of-clans': 'CC', 'brawl-stars': 'BS', 'tiktok-coins': 'TT',
    'snapchat-plus': 'S+', 'icloud-plus': 'iC', 'youtube-premium': 'YT', netflix: 'NF', 'disney-plus': 'D+', 'discord-nitro': 'DN', 'telegram-premium': 'TG', chatgpt: 'AI'
  };
  function mono(s) {
    if (MONO[s.id]) return MONO[s.id];
    const words = String(s.name).replace(/[^A-Za-z0-9؀-ۿ ]+/g, ' ').split(/\s+/).filter((w) => w && !/^(of|the|and|a|an|de|la)$/i.test(w));
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  const platBadge = (pl) => `<span class="plat p-${pl}" title="${esc((DB.platforms[pl] || {}).name || pl)}">${esc((DB.platforms[pl] || {}).short || pl)}</span>`;
  const typeName = (t) => (DB.types[t] || {}).name || t;
  const typeEn = (t) => (DB.types[t] || {}).en || '';
  const regionName = (code) => (DB.regionByCode[code] || {}).name || code;
  const codeTag = (code) => `<span class="code">${esc(code)}</span>`;

  function svcCard(s) {
    const b = bestOf(s);
    if (!b) return '';
    const save = b.maxSaving >= 5 ? `<span class="save">أرخص بـ ${pct(b.maxSaving)}</span>` : '';
    return `<a class="card svc-card t-${s.type}" href="${svcHref(s)}">
      <div class="svc-top">
        <span class="tile">${esc(mono(s))}</span>
        <div>
          <h3 class="svc-name">${bdi(s.name)}</h3>
          <div class="svc-meta"><span class="svc-kind">${esc(typeEn(s.type))}</span>${s.platforms.map(platBadge).join('')}</div>
        </div>
      </div>
      <div class="svc-bottom">
        <div class="svc-where"><span class="lbl">الأرخص على ${esc((DB.platforms[b.pl] || {}).name || '')}</span><span class="reg">${codeTag(b.best.code)} ${esc(b.best.region.name)}</span></div>
        <div class="svc-price">${money(b.best.usd)}${save}</div>
      </div>
    </a>`;
  }

  /* ===== البحث (combobox) ===== */
  let searchSeq = 0;
  function searchBox(opts = {}) {
    const id = 'sb' + (++searchSeq);
    return `<div class="search" data-search="${id}" ${opts.filter ? 'data-filter="1"' : ''}>
      <label class="sr-only" for="${id}-in">${esc(opts.label || 'ابحث عن لعبة أو اشتراك أو شحن')}</label>
      <div class="search-box">
        ${icon('search')}
        <input id="${id}-in" class="search-input" type="search" autocomplete="off" spellcheck="false"
          placeholder="${esc(opts.placeholder || 'جرّب: GTA VI، بلس بلايستيشن، شدات ببجي، سناب بلس…')}"
          value="${esc(opts.value || '')}"
          ${opts.filter ? '' : `role="combobox" aria-expanded="false" aria-controls="${id}-list" aria-autocomplete="list"`}>
        ${opts.kbd ? '<span class="kbd" aria-hidden="true">/</span>' : ''}
      </div>
      ${opts.filter ? '' : `<ul class="search-list" id="${id}-list" role="listbox" hidden></ul>`}
    </div>`;
  }

  function findServices(q, limit) {
    const nq = norm(q);
    if (!nq) return [];
    const tokens = nq.split(' ');
    const out = [];
    for (const s of DB.services) {
      if (!tokens.every((t) => s._search.includes(t))) continue;
      const n = norm(s.name);
      const score = (n.startsWith(nq) ? 0 : n.includes(nq) ? 1 : 2) * 10000 + (s.rank || 9999);
      out.push([score, s]);
    }
    out.sort((a, b) => a[0] - b[0]);
    return out.slice(0, limit || out.length).map((x) => x[1]);
  }

  function bindSearch(root) {
    root.querySelectorAll('[data-search]:not([data-filter])').forEach((wrap) => {
      const input = wrap.querySelector('input');
      const list = wrap.querySelector('.search-list');
      let items = [];
      let active = -1;
      const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; };
      const paint = () => {
        list.querySelectorAll('.search-opt').forEach((el, i) => el.setAttribute('aria-selected', i === active ? 'true' : 'false'));
        if (active >= 0) input.setAttribute('aria-activedescendant', list.children[active].id);
      };
      const render = () => {
        items = findServices(input.value, 8);
        active = items.length ? 0 : -1;
        if (!input.value.trim()) { close(); return; }
        list.innerHTML = items.length
          ? items.map((s, i) => {
            const b = bestOf(s);
            return `<li class="search-opt" role="option" id="${wrap.dataset.search}-o${i}" data-id="${esc(s.id)}">
              <span class="tile t-${s.type}" style="width:36px;height:36px;font-size:12px">${esc(mono(s))}</span>
              <span class="grow"><span class="name">${bdi(s.name)}</span><span class="sub">${esc(typeName(s.type))}${b ? ' · الأرخص: ' + esc(b.best.region.name) : ''}</span></span>
              ${b ? money(b.best.usd) : ''}
            </li>`;
          }).join('')
          : '<li class="search-empty" role="option" aria-disabled="true">ما لقينا شي بهالاسم. جرّب اسم ثاني أو تصفّح الأقسام.</li>';
        list.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        paint();
      };
      const go = (i) => { const s = items[i]; if (s) { close(); location.hash = svcHref(s); } };
      input.addEventListener('input', render);
      input.addEventListener('focus', () => { if (input.value.trim()) render(); });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); active = (active + 1) % items.length; paint(); }
        else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); active = (active - 1 + items.length) % items.length; paint(); }
        else if (e.key === 'Enter') { if (active >= 0) { e.preventDefault(); go(active); } }
        else if (e.key === 'Escape') { close(); }
      });
      list.addEventListener('mousedown', (e) => { const li = e.target.closest('.search-opt[data-id]'); if (li) { e.preventDefault(); go([...list.children].indexOf(li)); } });
      input.addEventListener('blur', () => setTimeout(close, 120));
    });
  }

  /* ===== الصفحة الرئيسية ===== */
  function heroCard(n, s, pl, pkgId, kicker, kickClass) {
    if (!s) return '';
    const sm = summary(s, pl, pkgId);
    if (!sm) return '';
    const rows = sm.rows.slice(0, 4);
    return `<a class="card hero-card hero-card-${n}" href="${svcHref(s, pl, sm.pkg.id)}">
      <div class="hc-head"><span class="eyebrow ${kickClass}">${esc(kicker)}</span>${platBadge(pl)}</div>
      <div class="hc-title">${bdi(s.name)} <span class="muted" style="font-size:.85rem;font-weight:600">· ${bdi(sm.pkg.label)}</span></div>
      <ul class="hc-rows">${rows.map((r) => `<li class="hc-row">${codeTag(r.code)}<span class="grow">${esc(r.region.name)}</span>${money(r.usd)}</li>`).join('')}</ul>
      <span class="link" style="font-size:14px">شوف كل المناطق (${sm.rows.length}) ←</span>
    </a>`;
  }

  function findByKey(q) { return findServices(q, 1)[0]; }

  function viewHome() {
    const S = DB.byId;
    const gta = DB.services.find((s) => s.type === 'game' && /^grand theft auto vi$/i.test(s.name)) || null;
    const quick = [
      gta && [gta, 'GTA VI'],
      S['ps-plus'] && [S['ps-plus'], 'بلس بلايستيشن'],
      S['game-pass'] && [S['game-pass'], 'Game Pass'],
      S['pubg-uc'] && [S['pubg-uc'], 'شدات ببجي'],
      S['fortnite-vbucks'] && [S['fortnite-vbucks'], 'V-Bucks'],
      S['roblox-robux'] && [S['roblox-robux'], 'روبوكس'],
      S['snapchat-plus'] && [S['snapchat-plus'], 'سناب بلس']
    ].filter(Boolean);
    const counts = {};
    DB.services.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const tab = state.homeTab;
    const tabList = DB.services.filter((s) => s.type === tab && bestOf(s)).sort((a, b) => (a.rank || 9999) - (b.rank || 9999)).slice(0, 8);
    const gaps = DB.services.map((s) => ({ s, b: bestOf(s) })).filter((x) => x.b && x.b.rows.length >= 6)
      .sort((a, b) => b.b.saving - a.b.saving).slice(0, 10);

    return `
    <section class="hero bg-grid">
      <div class="hero-glow" aria-hidden="true"></div>
      <div class="container hero-row">
        <div class="hero-copy">
          <span class="live-pill"><span class="live-dot" aria-hidden="true"></span><span class="eyebrow">LIVE · PRICE RADAR</span><span>${esc(DB.priceCount.toLocaleString('en-US'))} سعر من ${DB.regionCount} منطقة</span></span>
          <h1 class="hero-title"><span>نفس الشي،</span><span class="volt">بأرخص منطقة.</span></h1>
          <p class="hero-lead">اختار اللعبة أو الاشتراك أو الشحن، وإحنا بنختارلك المنصة الأرخص وبنرتّبلك كل المناطق بعملتك، مع البطاقة اللي بتلزمك.</p>
          ${searchBox({ kbd: true })}
          ${quick.length ? `<div class="quick"><span class="quick-label">الأكثر بحثاً:</span>${quick.map(([s, l]) => `<a class="chip" href="${svcHref(s)}">${esc(l)}</a>`).join('')}</div>` : ''}
          <dl class="hero-stats">
            <div><dt class="num">${DB.services.length}</dt><dd>خدمة ولعبة</dd></div>
            <div><dt class="num">${DB.regionCount}</dt><dd>منطقة حول العالم</dd></div>
            <div><dt class="num">24h</dt><dd>تحديث تلقائي من المتاجر</dd></div>
          </dl>
        </div>
        <div class="hero-cards">
          ${heroCard(1, S['ps-plus'], 'psn', 'essential-1m', 'PS PLUS · ESSENTIAL', 'sky')}
          ${heroCard(2, S['pubg-uc'], 'apple', null, 'UC · PUBG MOBILE', 'orange')}
          ${heroCard(3, S['game-pass'], 'xbox', 'ultimate-1m', 'GAME PASS · ULTIMATE', '')}
        </div>
      </div>
    </section>

    <section class="container section" aria-labelledby="how-h">
      <div class="section-head"><div class="head-copy"><span class="eyebrow">HOW IT WORKS</span><h2 id="how-h">3 خطوات وبتوفّر</h2></div></div>
      <ol class="steps">
        <li class="card step cut"><span class="step-n">01</span><h3>اختار الخدمة</h3><p>لعبة، اشتراك، شحن شدات أو جواهر، أو اشتراك تطبيق. ابحث بالعربي أو بالإنجليزي.</p></li>
        <li class="card step cut"><span class="step-n">02</span><h3>بنختارلك المنصة</h3><p>بلايستيشن، إكس بوكس، ستيم أو آبل: بنفتحلك المنصة الأرخص تلقائياً، وبتقدر تغيّرها بكبسة.</p></li>
        <li class="card step cut"><span class="step-n">03</span><h3>خذ أرخص منطقة</h3><p>كل المناطق مرتبة بعملتك، مع البطاقة اللي بتلزمك وتنبيه قفل المنطقة قبل ما تشتري.</p></li>
      </ol>
    </section>

    <section class="container section" aria-labelledby="browse-h">
      <div class="section-head">
        <div class="head-copy"><span class="eyebrow">BROWSE</span><h2 id="browse-h">تصفّح حسب النوع</h2></div>
        <a class="link" href="#/c/${tab}">كل ${esc(typeName(tab))} ←</a>
      </div>
      <div class="tabs" role="tablist" aria-label="أنواع الخدمات">
        ${TYPE_ORDER.filter((t) => counts[t]).map((t) => `<button class="tab" type="button" role="tab" data-tab="${t}" aria-selected="${t === tab}">${esc(typeName(t))} <span class="count">${counts[t]}</span></button>`).join('')}
      </div>
      <div class="grid-cards" role="tabpanel">${tabList.map(svcCard).join('')}</div>
    </section>

    ${gaps.length ? `<section class="container section" aria-labelledby="gaps-h">
      <div class="section-head"><div class="head-copy"><span class="eyebrow live">BIGGEST GAPS</span><h2 id="gaps-h">أكبر فروقات اليوم</h2><p>الفرق بين أرخص منطقة وأغلى منطقة لنفس الشي، محسوب بعملتك.</p></div></div>
      <ol class="gaps">
        ${gaps.map(({ s, b }, i) => `<li><a class="gap-row" href="${svcHref(s, b.pl, b.pkg.id)}">
          <span class="gap-rank">${String(i + 1).padStart(2, '0')}</span>
          <span class="gap-name"><b>${bdi(s.name)}</b><span>${platBadge(b.pl)} ${bdi(b.pkg.label)}</span></span>
          <span class="gap-cell cheap"><span>${esc(b.best.region.name)}</span>${money(b.best.usd)}</span>
          <span class="gap-cell"><span>${esc(b.worst.region.name)}</span>${money(b.worst.usd)}</span>
          <span class="save">وفّر ${pct(b.saving)}</span>
        </a></li>`).join('')}
      </ol>
    </section>` : ''}

    <section class="container section">
      <div class="card note plasma cut">${icon('android', 'lg')}<div><h3>وين جوجل بلاي؟</h3><p>جوجل ما بتنشر أسعار المشتريات داخل التطبيقات لكل دولة على الويب، فما في مصدر رسمي نسحب منه أرقام مضمونة. أسعار الشحن والتطبيقات عندنا من App Store، وغالباً قريبة من أسعار جوجل بنفس الدولة بس مش دايماً. <a class="link" href="#/about">اعرف أكثر</a></p></div></div>
    </section>`;
  }

  function bindHome() {
    main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      state.homeTab = b.dataset.tab;
      rerender(() => { const t = main.querySelector(`[data-tab="${state.homeTab}"]`); if (t) t.focus(); });
    }));
  }

  /* ===== التصفّح ===== */
  function viewBrowse(type) {
    const all = type === 'all';
    if (!all && !DB.types[type]) return null;
    const st = state.browse[type] || (state.browse[type] = { q: '', pl: '', sort: 'rank', limit: PAGE });
    const pls = PLATFORM_ORDER.filter((pl) => DB.services.some((s) => (all || s.type === type) && s.offers[pl]));
    return `<div class="container page">
      <div class="page-head">
        <ol class="crumbs"><li><a href="#/">الرئيسية</a></li><li>${esc(all ? 'كل الخدمات' : typeName(type))}</li></ol>
        <span class="eyebrow">${esc(all ? 'EVERYTHING' : typeEn(type))}</span>
        <h1>${esc(all ? 'كل الخدمات' : typeName(type))}</h1>
        <p>${esc(all ? 'كل الألعاب والاشتراكات والشحن والتطبيقات اللي بنقارن أسعارها.' : (DB.types[type] || {}).desc || '')}</p>
      </div>
      <div class="toolbar">
        ${searchBox({ filter: true, value: st.q, placeholder: 'فلتر بالاسم…', label: 'فلتر بالاسم' })}
        <div class="quick" role="group" aria-label="المنصة">
          <button class="chip" type="button" data-pl="" aria-pressed="${!st.pl}">الكل</button>
          ${pls.map((pl) => `<button class="chip" type="button" data-pl="${pl}" aria-pressed="${st.pl === pl}">${esc(DB.platforms[pl].name)}</button>`).join('')}
        </div>
        <span class="toolbar-spacer"></span>
        <label class="pill-select"><span class="sr-only">الترتيب</span>
          <select data-sort>
            <option value="rank"${st.sort === 'rank' ? ' selected' : ''}>الأشهر</option>
            <option value="saving"${st.sort === 'saving' ? ' selected' : ''}>أكبر فرق بالسعر</option>
            <option value="cheap"${st.sort === 'cheap' ? ' selected' : ''}>الأرخص</option>
            <option value="az"${st.sort === 'az' ? ' selected' : ''}>أبجدي</option>
          </select>
        </label>
      </div>
      <div data-results></div>
    </div>`;
  }

  function fillBrowse(type) {
    const st = state.browse[type];
    const box = main.querySelector('[data-results]');
    if (!box || !st) return;
    let list = DB.services.filter((s) => (type === 'all' || s.type === type) && bestOf(s));
    if (st.pl) list = list.filter((s) => s.offers[st.pl]);
    if (st.q.trim()) { const ids = new Set(findServices(st.q).map((s) => s.id)); list = list.filter((s) => ids.has(s.id)); }
    const by = {
      rank: (a, b) => (a.rank || 9999) - (b.rank || 9999),
      saving: (a, b) => bestOf(b).maxSaving - bestOf(a).maxSaving,
      cheap: (a, b) => bestOf(a).best.usd - bestOf(b).best.usd,
      az: (a, b) => a.name.localeCompare(b.name)
    }[st.sort] || (() => 0);
    list.sort(by);
    const shown = list.slice(0, st.limit);
    box.innerHTML = list.length
      ? `<p class="result-count" aria-live="polite">${list.length} نتيجة</p>
         <div class="grid-cards">${shown.map(svcCard).join('')}</div>
         ${list.length > shown.length ? `<div class="more-row" style="margin-top:22px"><button class="btn btn-secondary" type="button" data-more>اعرض ${Math.min(PAGE, list.length - shown.length)} كمان</button></div>` : ''}`
      : `<div class="empty" aria-live="polite">${icon('search', 'lg')}<p>ما في نتائج بهالفلتر.</p><button class="btn btn-secondary btn-sm" type="button" data-reset>امسح الفلتر</button></div>`;
    const more = box.querySelector('[data-more]');
    if (more) more.addEventListener('click', () => { st.limit += PAGE; fillBrowse(type); });
    const reset = box.querySelector('[data-reset]');
    if (reset) reset.addEventListener('click', () => { st.q = ''; st.pl = ''; rerender(); });
  }

  function bindBrowse(type) {
    const st = state.browse[type];
    const input = main.querySelector('[data-filter] input');
    if (input) input.addEventListener('input', () => { st.q = input.value; st.limit = PAGE; fillBrowse(type); });
    main.querySelectorAll('[data-pl]').forEach((b) => b.addEventListener('click', () => {
      st.pl = b.dataset.pl; st.limit = PAGE;
      main.querySelectorAll('[data-pl]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      fillBrowse(type);
    }));
    const sort = main.querySelector('[data-sort]');
    if (sort) sort.addEventListener('change', () => { st.sort = sort.value; fillBrowse(type); });
    fillBrowse(type);
  }

  /* ===== صفحة الخدمة ===== */
  const LOCK = {
    psn: (r) => `بطاقات ${r} بتشتغل بس على حساب PlayStation من ${r}. لازم يكون عندك حساب بهالمنطقة (بتقدر تعمل حساب جديد بمنطقة ثانية، بس الألعاب والاشتراكات ما بتنتقل بين الحسابات).`,
    xbox: (r) => `بطاقات Xbox من ${r} بتنشحن بس على حساب Microsoft منطقته ${r}، وتغيير منطقة الحساب إله شروط ومرة كل 3 شهور تقريباً.`,
    steam: (r) => `محفظة ستيم بتاخذ عملة منطقة حسابك، وبطاقات ${r} بتشتغل بس على حساب من ${r}. ستيم بيطلب تكون فعلياً بالمنطقة عشان تغيّرها.`,
    apple: (r) => `بطاقات آبل من ${r} بتشتغل بس على Apple ID من ${r}. تغيير دولة الـ Apple ID بيحتاج تلغي الاشتراكات وتصرف الرصيد الموجود أولاً.`
  };

  function viewService(id, plWanted, pkgWanted) {
    const s = DB.byId[id];
    if (!s) return null;
    const auto = !plWanted || !s.offers[plWanted];
    const pl = auto ? (bestOf(s) || {}).pl || s.platforms[0] : plWanted;
    const sm = summary(s, pl, pkgWanted);
    if (!sm) return null;
    const off = s.offers[pl];
    const pkg = sm.pkg;
    const platSums = s.platforms.map((p) => [p, summary(s, p)]).filter((x) => x[1]);
    const cheapestPl = platSums.slice().sort((a, b) => a[1].best.usd - b[1].best.usd)[0][0];
    const mine = sm.rows.find((r) => r.code === state.region);
    const best = sm.best;
    const worst = sm.worst;
    const platName = (DB.platforms[pl] || {}).name || pl;
    const lastDate = sm.rows.map((r) => r.date).sort().pop();
    const steps = [];
    let n = 1;

    steps.push(`<div class="flow-step">
      <div class="flow-label"><span class="n">${++n}</span>المنصة <span class="hint">${s.platforms.length > 1 ? (auto ? 'اخترنالك الأرخص تلقائياً، وبتقدر تغيّرها' : 'بدّل بين المنصات') : 'متوفر على منصة وحدة'}</span></div>
      <div class="plat-grid" role="list">
        ${platSums.map(([p, ps]) => `<a role="listitem" class="plat-card" href="${svcHref(s, p)}" aria-current="${p === pl}">
          <span class="row1">${platBadge(p)}<span class="pname">${esc(DB.platforms[p].name)}</span>${p === cheapestPl && platSums.length > 1 ? '<span class="tag best">الأرخص</span>' : ''}<span class="check">${icon('check', 'sm')}</span></span>
          <span class="pprice"><span class="pwhere">${bdi(ps.pkg.label)}</span>${money(ps.best.usd)}</span>
          <span class="pwhere">الأرخص في ${esc(ps.best.region.name)} · ${ps.rows.length} منطقة</span>
        </a>`).join('')}
      </div>
    </div>`);

    if (off.packages.length > 1) {
      steps.push(`<div class="flow-step">
        <div class="flow-label"><span class="n">${++n}</span>الباقة <span class="hint">${off.packages.length} خيارات</span></div>
        <div class="pkg-row" role="group" aria-label="الباقة">
          ${off.packages.map((p) => { const r = rowsOf(p)[0]; return `<a class="pkg" href="${svcHref(s, pl, p.id)}" aria-pressed="${p.id === pkg.id}"><span class="pl">${bdi(p.label)}</span>${r ? `<span class="pp">من ${money(r.usd)}</span>` : ''}</a>`; }).join('')}
        </div>
      </div>`);
    }

    const regionOptions = DB.regions.map((r) => `<option value="${r.code}"${r.code === state.region ? ' selected' : ''}>${esc(r.name)}</option>`).join('');
    const mineText = mine
      ? (mine.code === best.code ? '<span class="sub">منطقتك هي الأرخص 👌</span>' : `<span class="sub">أغلى من الأرخص بـ ${pct((mine.usd / best.usd - 1) * 100)}</span>`)
      : '<span class="sub">مش متوفر بمنطقتك على هالمنصة</span>';

    return `<div class="container page">
      <ol class="crumbs"><li><a href="#/">الرئيسية</a></li><li><a href="#/c/${s.type}">${esc(typeName(s.type))}</a></li><li>${bdi(s.name)}</li></ol>
      <div class="svc-head t-${s.type}">
        <span class="tile lg">${esc(mono(s))}</span>
        <div>
          <span class="eyebrow" style="color:var(--tc)">${esc(typeEn(s.type))}</span>
          <h1>${bdi(s.name)}</h1>
          <div class="svc-meta">${s.ar ? `<span class="chip">${esc(s.ar)}</span>` : ''}${s.platforms.map(platBadge).join('')}</div>
        </div>
      </div>

      <div class="flow">
        <div class="flow-label"><span class="n">${icon('check', 'sm')}</span>الخدمة: <b style="color:var(--text)">${bdi(s.name)}</b></div>
        ${steps.join('')}

        <div class="flow-step">
          <div class="flow-label"><span class="n">${++n}</span>أرخص منطقة <span class="hint">${esc(platName)} · ${bdi(pkg.label)}</span></div>
          <div class="result">
            <div class="result-main">
              <section class="card winner cut" aria-labelledby="win-h">
                <div class="stripes stripes-bg" aria-hidden="true"></div>
                <div class="winner-top">
                  <div class="winner-reg"><span class="tile">${esc(best.code)}</span><div><span class="eyebrow">CHEAPEST NOW</span><h2 id="win-h">${esc(best.region.name)}</h2></div></div>
                  ${best.t[2] ? '<span class="tag sale">عليها خصم هلأ</span>' : ''}
                </div>
                <div class="winner-price"><span class="big">${money(best.usd)}</span><span class="local">بسعر المتجر: ${localPrice(best.t)}</span></div>
                <div class="winner-facts">
                  <div class="fact"><span class="lbl">أغلى منطقة</span><span class="val">${money(worst.usd)}</span><span class="sub">${esc(worst.region.name)}</span></div>
                  <div class="fact"><span class="lbl">بتوفّر لحد</span><span class="val volt">${pct(sm.saving)}</span><span class="sub">بين ${sm.rows.length} منطقة</span></div>
                  <div class="fact"><label class="lbl" for="my-region">منطقة حسابك</label><select id="my-region">${regionOptions}</select>${mine ? `<span class="val">${money(mine.usd)}</span>` : ''}${mineText}</div>
                </div>
                <div class="winner-actions">
                  <a class="btn btn-primary" href="${esc(cardSearchUrl(pl, best.code))}" target="_blank" rel="noopener">${icon('card')} دوّر على ${esc((DB.platforms[pl] || {}).card || 'البطاقة')} من ${esc(best.region.name)}</a>
                  <a class="btn btn-secondary" href="${esc(storeUrl(s, pl, pkg, best.code))}" target="_blank" rel="noopener">${icon('ext')} افتح بالمتجر</a>
                </div>
              </section>

              <div class="card note warn">${icon('lock')}<p><strong>قبل ما تشتري:</strong> ${esc(LOCK[pl] ? LOCK[pl](best.region.name) : '')} ما بننصح بتغيير المنطقة بالـ VPN لأنه مخالف لشروط المنصات وممكن يسكّر حسابك.</p></div>

              <section class="card table-card" aria-labelledby="tbl-h">
                <div class="table-head"><div><h2 id="tbl-h">الأسعار بكل المناطق</h2><p>مرتّبة من الأرخص · محسوبة بـ${esc(curName(state.currency))}</p></div></div>
                <table class="ptable">
                  <thead><tr><th scope="col">المنطقة</th><th scope="col">بعملتك</th><th scope="col">سعر المتجر</th><th scope="col">مقارنة بالأرخص</th><th scope="col">المصدر</th></tr></thead>
                  <tbody>
                    ${sm.rows.map((r, i) => `<tr class="${i === 0 ? 'is-best' : ''}${r.code === state.region ? ' is-mine' : ''}">
                      <td class="c-reg"><span class="reg-cell">${codeTag(r.code)}${esc(r.region.name)}${i === 0 ? '<span class="tag best">الأرخص</span>' : ''}${r.code === state.region ? '<span class="tag mine">منطقتك</span>' : ''}${r.t[2] ? '<span class="tag sale">خصم</span>' : ''}</span></td>
                      <td class="c-yours">${money(r.usd)}</td>
                      <td class="c-local">${localPrice(r.t)}</td>
                      <td class="c-diff">${i === 0 ? 'الأرخص' : 'أغلى بـ ' + pct((r.usd / best.usd - 1) * 100)}</td>
                      <td class="c-src"><a href="${esc(storeUrl(s, pl, pkg, r.code))}" target="_blank" rel="noopener">${icon('ext', 'sm')} ${esc(daysAgo(r.date))}</a></td>
                    </tr>`).join('')}
                  </tbody>
                </table>
                <div class="table-foot">
                  <span>الأسعار من ${esc((DB.platforms[pl] || {}).store || platName)} مباشرة، وآخر تحقق ${esc(daysAgo(lastDate))}. التحويل لعملتك بسعر صرف ${esc(DB.ratesUpdated ? fmtDate(DB.ratesUpdated) : 'تقريبي')}.</span>
                  ${pl === 'steam' ? '<span>ستيم بيسعّر بالدولار بمناطق زي تركيا والأرجنتين والشرق الأوسط.</span>' : ''}
                  ${pl === 'psn' && pkg.ref !== 'psplus' ? '<span>بنقارن نفس النسخة بكل المناطق؛ المناطق اللي نسختها الافتراضية مختلفة ما بتظهر.</span>' : ''}
                  <a href="${esc(reportUrl('سعر غلط: ' + s.name + ' (' + platName + ' · ' + pkg.label + ')'))}" target="_blank" rel="noopener">${icon('flag', 'sm')} شفت سعر غلط؟ بلّغنا</a>
                </div>
              </section>
            </div>

            <aside class="result-side">
              <section class="card side-card">
                <h3>البطاقة اللي بتلزمك</h3>
                <div class="card-pick"><span class="tile">${icon('card')}</span><span class="grow"><b>${esc((DB.platforms[pl] || {}).card || '')} · ${esc(best.region.name)}</b><span>بقيمة ${localPrice(best.t)} أو أكثر</span></span></div>
                <ul class="tips">
                  <li>${icon('check', 'sm')}<span>اشتري من موزّع رسمي أو متجر معروف، وتأكد إن البطاقة لنفس منطقة حسابك.</span></li>
                  <li>${icon('check', 'sm')}<span>بعض البطاقات بتيجي بفئات ثابتة، فممكن يلزمك أكثر من وحدة.</span></li>
                  <li class="warn">${icon('alert', 'sm')}<span>البطاقات الأرخص بكثير عند بائعين مجهولين ممكن تطلع مسروقة وتنلغى.</span></li>
                </ul>
                <a class="btn btn-secondary btn-block" href="${esc(cardSearchUrl(pl, best.code))}" target="_blank" rel="noopener">${icon('search')} دوّر على البطاقة</a>
              </section>
              ${s.platforms.length > 1 ? `<section class="card side-card"><h3>نفس الخدمة على منصات ثانية</h3><ul class="tips">${platSums.filter(([p]) => p !== pl).map(([p, ps]) => `<li>${platBadge(p)}<a href="${svcHref(s, p)}" class="text-2">${bdi(ps.pkg.label)}: ${money(ps.best.usd)} في ${esc(ps.best.region.name)}</a></li>`).join('')}</ul></section>` : ''}
            </aside>
          </div>
        </div>
      </div>
    </div>`;
  }

  function bindService(id) {
    const sel = main.querySelector('#my-region');
    if (sel) sel.addEventListener('change', () => {
      state.region = sel.value;
      store.set('region', sel.value);
      rerender(() => { const el = main.querySelector('#my-region'); if (el) el.focus(); });
    });
    return id;
  }

  /* ===== عن الموقع ===== */
  function viewAbout() {
    const st = DB.updated ? `${fmtDate(DB.updated)} (${timeAgo(DB.updated)})` : 'لسا ما صار';
    return `<div class="container page">
      <div class="page-head">
        <ol class="crumbs"><li><a href="#/">الرئيسية</a></li><li>كيف بنشتغل</li></ol>
        <span class="eyebrow">ABOUT</span>
        <h1>كيف بنشتغل؟</h1>
        <p>كل يوم بنسحب الأسعار من المتاجر الرسمية نفسها، بنحوّلها لعملتك، وبنرتّب المناطق من الأرخص. آخر تحديث: ${esc(st)}.</p>
      </div>
      <div class="prose">
        <h2>من وين الأسعار؟</h2>
        <div class="table-scroll"><table class="src-table">
          <thead><tr><th>المصدر</th><th>شو بنجيب منه</th></tr></thead>
          <tbody>
            <tr><td>${platBadge('psn')} PlayStation Store</td><td>الألعاب الأكثر مبيعاً آخر 30 يوم، وأسعار PlayStation Plus بكل مستوياته ومدده من صفحتها الرسمية.</td></tr>
            <tr><td>${platBadge('xbox')} Microsoft Store</td><td>الألعاب الأكثر مبيعاً، Game Pass وEA Play، وV-Bucks وRobux.</td></tr>
            <tr><td>${platBadge('steam')} Steam</td><td>الألعاب الأكثر مبيعاً وقائمة ألعاب ثابتة، مع الخصومات.</td></tr>
            <tr><td>${platBadge('apple')} App Store</td><td>المشتريات داخل التطبيقات: شدات ببجي، جواهر فري فاير، روبوكس، وسناب بلس ويوتيوب بريميوم وغيرها.</td></tr>
            <tr><td>open.er-api.com</td><td>أسعار صرف كل عملات العالم مقابل الدولار.</td></tr>
          </tbody>
        </table></div>
        <p>أي سعر ما قدرنا نتحقق منه آخر 10 أيام بينشال تلقائياً، وكل صف بالجدول فيه رابط للمتجر وتاريخ آخر تحقق.</p>
        <h2>وين جوجل بلاي؟</h2>
        <p>جوجل ما بتعرض أسعار المشتريات داخل التطبيقات لكل دولة على الويب (بس «من كذا لكذا»)، فما في مصدر رسمي نقدر نسحب منه أرقام مضمونة. ما بنحط أرقام تقديرية؛ لما يتوفر مصدر رسمي بنضيفه. بالعادة أسعار جوجل بلاي قريبة من أسعار App Store بنفس الدولة.</p>
        <h2>قبل ما تشتري</h2>
        <p><strong>بطاقات الشحن مقفولة على منطقتها:</strong> بطاقة تركية بتشتغل بس على حساب تركي. وتغيير منطقة الحساب إله شروط بكل منصة، وما بننصح بالـ VPN لأنه مخالف لشروط المنصات وممكن يسكّر حسابك.</p>
        <p><strong>الأسعار ممكن تتغيّر:</strong> المتاجر بتغيّر أسعارها وخصوماتها بأي وقت، فتأكد من السعر بالمتجر قبل ما تشتري البطاقة.</p>
        <p><strong>نفس النسخة:</strong> بألعاب بلايستيشن بنقارن نفس النسخة (مثلاً Ultimate مع Ultimate)، والمنطقة اللي نسختها الافتراضية مختلفة ما بنعرضها.</p>
        <h2>الموقع مجاني ومفتوح</h2>
        <p>الكود كامل على GitHub والتحديث بيصير لحاله كل يوم. شفت سعر غلط أو بدك تضيف خدمة؟ ${CFG.repoUrl ? `<a class="link" href="${esc(CFG.repoUrl)}/issues" target="_blank" rel="noopener">اكتبلنا هون</a>` : 'بلّغنا'}.</p>
      </div>
    </div>`;
  }

  function viewNotFound() {
    return `<div class="container page"><div class="empty">${icon('radar', 'lg')}<h1>ما لقينا هالصفحة</h1><p>ممكن الخدمة انشالت أو الرابط غلط.</p><a class="btn btn-primary" href="#/">ارجع للرئيسية</a></div></div>`;
  }

  /* ===== التوجيه ===== */
  let lastPath = null;
  function route(opts = {}) {
    const raw = location.hash || '#/';
    if (!raw.startsWith('#/')) return; // روابط داخل الصفحة
    const parts = raw.slice(2).split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (e) { return p; } });
    let html = null;
    let after = null;
    let nav = '';
    let title = 'وين أرخص؟ · قارن أسعار الألعاب والاشتراكات والشحن بين دول العالم';
    if (!parts.length) {
      html = viewHome(); after = bindHome; nav = 'home';
    } else if (parts[0] === 'c' && parts[1]) {
      html = viewBrowse(parts[1]);
      if (html) { nav = parts[1]; after = () => bindBrowse(parts[1]); title = `${typeName(parts[1])} · وين أرخص؟`; }
    } else if (parts[0] === 'all') {
      html = viewBrowse('all'); after = () => bindBrowse('all'); title = 'كل الخدمات · وين أرخص؟';
    } else if (parts[0] === 's' && parts[1]) {
      html = viewService(parts[1], parts[2], parts[3]);
      const s = DB.byId[parts[1]];
      if (html && s) { nav = s.type; after = () => bindService(s.id); title = `وين أرخص ${s.name}؟ · قارن السعر بين الدول`; }
    } else if (parts[0] === 'about') {
      html = viewAbout(); title = 'كيف بنشتغل · وين أرخص؟';
    }
    if (html == null) { html = viewNotFound(); after = null; title = 'الصفحة مش موجودة · وين أرخص؟'; }

    const pathKey = parts.slice(0, 2).join('/');
    const y = window.scrollY;
    main.innerHTML = html;
    document.title = title;
    setNav(nav);
    bindSearch(main);
    if (after) after();
    if (opts.keepScroll || (lastPath === pathKey && parts[0] === 's')) {
      window.scrollTo(0, y);
      if (opts.focus) opts.focus();
    } else if (lastPath !== null) {
      window.scrollTo(0, 0);
      const h = main.querySelector('h1');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
    lastPath = pathKey;
  }
  function rerender(focus) { route({ keepScroll: true, focus }); }

  function setNav(nav) {
    document.querySelectorAll('[data-nav]').forEach((a) => {
      if (a.dataset.nav === nav) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  /* ===== الإعدادات العامة ===== */
  function setupPrefs() {
    let cc = null;
    try { for (const l of navigator.languages || [navigator.language]) { const m = String(l).match(/-([A-Za-z]{2})$/); if (m) { cc = m[1].toUpperCase(); break; } } } catch (e) { /* تجاهل */ }
    const defCur = CFG.defaultCurrency || (cc && CC_CURRENCY[cc]) || 'USD';
    const cur = store.get('currency', defCur);
    state.currency = cur === 'USD' || DB.rates[cur] ? cur : 'USD';
    const defReg = CFG.defaultRegion || (cc && DB.regionByCode[cc] ? cc : 'SA');
    const reg = store.get('region', defReg);
    state.region = DB.regionByCode[reg] ? reg : 'SA';
  }

  function setupCurrency() {
    const codes = Object.keys(DB.rates).filter((c) => /^[A-Z]{3}$/.test(c));
    const opt = (c) => `<option value="${c}"${c === state.currency ? ' selected' : ''}>${esc(curName(c))} (${c})</option>`;
    const arab = ARAB.filter((c) => DB.rates[c]);
    const pop = POPULAR.filter((c) => DB.rates[c] || c === 'USD');
    const rest = codes.filter((c) => !arab.includes(c) && !pop.includes(c)).sort((a, b) => curName(a).localeCompare(curName(b), 'ar'));
    curSelect.innerHTML = `<optgroup label="الأكثر استخداماً">${pop.map(opt).join('')}</optgroup><optgroup label="عملات عربية">${arab.map(opt).join('')}</optgroup><optgroup label="كل العملات">${rest.map(opt).join('')}</optgroup>`;
    curSelect.addEventListener('change', () => {
      state.currency = curSelect.value;
      store.set('currency', curSelect.value);
      rerender();
    });
  }

  function setupChrome() {
    const repo = document.getElementById('footer-repo');
    if (repo && CFG.repoUrl) { repo.href = CFG.repoUrl; repo.target = '_blank'; repo.rel = 'noopener'; }
    const bar = document.getElementById('announce');
    const txt = document.getElementById('announce-text');
    const closed = store.get('announce', '') === (DB.updated || '').slice(0, 10);
    if (bar && txt && !closed) {
      txt.textContent = DB.updated
        ? `آخر تحديث للأسعار ${timeAgo(DB.updated)} · ${DB.priceCount.toLocaleString('en-US')} سعر رسمي من ${DB.regionCount} منطقة`
        : 'الأسعار بتنسحب كل يوم من المتاجر الرسمية مباشرة.';
      bar.hidden = false;
      document.getElementById('announce-close').addEventListener('click', () => { bar.hidden = true; store.set('announce', (DB.updated || '').slice(0, 10)); });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const input = main.querySelector('.search-input');
      if (input) { e.preventDefault(); input.focus(); }
    });
  }

  boot();
})();
