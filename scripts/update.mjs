#!/usr/bin/env node
// بيجمع الأسعار من المتاجر الرسمية (بلايستيشن، إكس بوكس، ستيم، آبل) وبيكتب data/prices.json.
// بيشتغل يومياً على GitHub Actions. أي مصدر بيفشل ما بيمسح الأسعار القديمة (لحد 10 أيام).
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sleep, todayISO, titleKey, baseTitle, slug, request } from './lib/util.mjs';
import { fetchRates } from './sources/rates.mjs';
import { fetchSteamTopSellers, fetchSteamPrices } from './sources/steam.mjs';
import { fetchXboxPrices, fetchXboxBestSellers, fetchXboxAddons } from './sources/xbox.mjs';
import { fetchPsBestSellers, fetchPsConceptPrices, fetchPsPlus } from './sources/playstation.mjs';
import { fetchApple, labelFrom } from './sources/apple.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STALE_DAYS = 10;
const TYPE_ORDER = { sub: 0, currency: 1, app: 2, game: 3 };

async function readJSON(root, p, fallback) {
  try {
    return JSON.parse(await readFile(path.join(root, p), 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
const writeJSON = (root, p, data, pretty) => writeFile(path.join(root, p), JSON.stringify(data, null, pretty ? 2 : 0) + '\n');

const round = (n) => Math.round(n * 100) / 100;
const tuple = (p, date) => [round(p.amount), p.currency, p.original > p.amount ? round(p.original) : 0, date];

/** «Grand Theft Auto VI: Ultimate Edition» → «Ultimate Edition» */
export function editionLabel(full, base) {
  const f = String(full || '').replace(/[™®©]/g, '').trim();
  const b = String(base || '').trim();
  let rest = f.toLowerCase().startsWith(b.toLowerCase()) ? f.slice(b.length) : '';
  rest = rest.replace(/^[\s:–—-]+/, '').replace(/^\((.*)\)$/, '$1').trim();
  return rest || 'النسخة العادية';
}

function keywords(name, extra, aliases) {
  const k = titleKey(name);
  const parts = [name, extra || ''];
  for (const [key, words] of Object.entries(aliases || {})) if (k.includes(key)) parts.push(words);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/* ===== الدمج مع الأسعار القديمة ===== */
function prunePkg(pkg, cutoff) {
  const prices = {};
  for (const [code, t] of Object.entries(pkg.prices || {})) if (t && t[3] >= cutoff) prices[code] = t;
  return Object.keys(prices).length ? { ...pkg, prices } : null;
}
function pruneOffer(off, cutoff) {
  const packages = (off.packages || []).map((p) => prunePkg(p, cutoff)).filter(Boolean);
  return packages.length ? { ...off, packages } : null;
}
function pruneService(svc, cutoff) {
  const offers = {};
  for (const [pl, off] of Object.entries(svc.offers || {})) {
    const o = pruneOffer(off, cutoff);
    if (o) offers[pl] = o;
  }
  return Object.keys(offers).length ? { ...svc, offers } : null;
}

/** الأسعار الجديدة أولوية. اللي ما انجاب اليوم بنحتفظ فيه إذا عمره أقل من STALE_DAYS */
export function mergeServices(prevList, nextList, now = new Date()) {
  const cutoff = todayISO(new Date(now.getTime() - STALE_DAYS * 86400000));
  const out = new Map();
  for (const s of nextList) out.set(s.id, s);
  for (const old of prevList || []) {
    const cur = out.get(old.id);
    if (!cur) {
      const kept = pruneService(old, cutoff);
      if (kept) out.set(old.id, kept);
      continue;
    }
    for (const [pl, off] of Object.entries(old.offers || {})) {
      if (!cur.offers[pl]) {
        const kept = pruneOffer(off, cutoff);
        if (kept) cur.offers[pl] = kept;
        continue;
      }
      for (const pkg of off.packages || []) {
        const cp = cur.offers[pl].packages.find((x) => x.id === pkg.id);
        if (!cp) {
          const kept = prunePkg(pkg, cutoff);
          if (kept) cur.offers[pl].packages.push(kept);
          continue;
        }
        for (const [code, t] of Object.entries(pkg.prices || {})) {
          if (!cp.prices[code] && t && t[3] >= cutoff) cp.prices[code] = t;
        }
      }
    }
  }
  // تنظيف: باقات فاضية، وعروض فاضية، وخدمات بدون أي سعر
  const list = [];
  for (const s of out.values()) {
    const clean = pruneService(s, cutoff);
    if (clean) list.push(clean);
  }
  return list;
}

/** ترتيب الباقات والباقة الافتراضية لكل عرض. hints: ترتيب ثابت من الإعدادات (زي PS Plus) */
export function finalize(list, rates, defaults = {}, hints = {}) {
  const usd = (t) => (t[1] === 'USD' ? t[0] : rates && rates[t[1]] ? t[0] / rates[t[1]] : null);
  const median = (pkg) => {
    const v = Object.values(pkg.prices).map(usd).filter((x) => x != null).sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)] : Infinity;
  };
  for (const s of list) {
    for (const [pl, off] of Object.entries(s.offers)) {
      const allNum = off.packages.every((p) => typeof p.num === 'number');
      const hint = hints[s.id + '|' + pl];
      const pos = (p) => (hint && hint.includes(p.id) ? hint.indexOf(p.id) : 999);
      off.packages.sort((a, b) => (hint ? pos(a) - pos(b) : 0) || (allNum ? a.num - b.num : median(a) - median(b)));
      const want = defaults[s.id + '|' + pl];
      if (want && off.packages.some((p) => p.id === want)) off.def = want;
      else {
        // الباقة المتوفرة بأكثر مناطق، وإذا تساوت الأرخص
        const best = off.packages
          .slice()
          .sort((a, b) => Object.keys(b.prices).length - Object.keys(a.prices).length || median(a) - median(b))[0];
        off.def = best.id;
      }
    }
  }
  return list.sort((a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9) || (a.rank ?? 9999) - (b.rank ?? 9999) || a.name.localeCompare(b.name));
}

/* ===== التشغيل ===== */
export async function main(opts = {}) {
  const { fetchImpl = fetch, wait = sleep, now = new Date(), limits = {}, root = ROOT, quiet = false } = opts;
  const net = { fetchImpl, wait };
  const today = todayISO(now);
  const regions = await readJSON(root, 'data/regions.json');
  const cfg = await readJSON(root, 'data/sources.json');
  const prev = await readJSON(root, 'data/prices.json', { services: [] });
  const cache = await readJSON(root, 'data/cache.json', { steamNames: {} });
  const prevRates = await readJSON(root, 'data/rates.json', { rates: {} });
  const status = { updated: now.toISOString(), sources: {} };
  const services = new Map();
  const defaults = {};
  const hints = {};

  const svcOf = (id, base) => {
    if (!services.has(id)) {
      services.set(id, { id, type: base.type, name: base.name, ar: base.ar || '', kw: base.kw || '', rank: base.rank ?? 9999, offers: {} });
    }
    return services.get(id);
  };
  const pkgOf = (svc, platform, p) => {
    const off = (svc.offers[platform] = svc.offers[platform] || { packages: [] });
    let pkg = off.packages.find((x) => x.id === p.id);
    if (!pkg) {
      pkg = { id: p.id, label: p.label, prices: {} };
      if (typeof p.num === 'number') pkg.num = p.num;
      if (p.ref != null) pkg.ref = p.ref;
      off.packages.push(pkg);
    }
    return pkg;
  };
  const fill = (pkg, regs) => {
    for (const [code, p] of Object.entries(regs || {})) if (p && p.amount > 0) pkg.prices[code] = tuple(p, today);
  };
  const safe = async (name, fn) => {
    try {
      return await fn();
    } catch (e) {
      status.sources[name] = { ok: false, error: String((e && e.message) || e) };
      return null;
    }
  };

  // ===== أسعار الصرف =====
  const ratesTask = safe('rates', async () => {
    const fx = await fetchRates({ ...net, now });
    await writeJSON(root, 'data/rates.json', fx, true);
    status.sources.rates = { ok: true, count: Object.keys(fx.rates).length };
    return fx.rates;
  });

  // ===== الخدمات المحددة بالإعدادات =====
  const curated = cfg.services || [];
  const xboxItems = [];
  const appleSpecs = [];
  let needPsPlus = false;

  const xboxTask = safe('xbox-services', async () => {
    for (const s of curated) {
      const off = s.offers && s.offers.xbox;
      if (!off) continue;
      if (off.source === 'xbox') {
        for (const p of off.packages) xboxItems.push({ key: s.id + '|' + p.id, bigId: p.bigId, match: p.match, svc: s, pkg: { id: p.id, label: p.label, ref: p.bigId } });
        if (off.default) defaults[s.id + '|xbox'] = off.default;
        hints[s.id + '|xbox'] = off.packages.map((p) => p.id);
      } else if (off.source === 'xbox-addons') {
        try {
          const addons = await fetchXboxAddons(off.parent, net);
          for (const a of addons) {
            for (const it of off.items) {
              const m = String(a.title || '').match(new RegExp(it.match, 'i'));
              if (!m) continue;
              const { label, num } = labelFrom(it.label, m);
              const id = slug(label);
              xboxItems.push({ key: s.id + '|' + id, bigId: a.productId, match: null, svc: s, pkg: { id, label, num, ref: a.productId } });
            }
          }
        } catch (e) {
          (status.sources['xbox-addons'] = status.sources['xbox-addons'] || {})[s.id] = 'خطأ: ' + (e.message || e);
        }
      }
    }
    if (!xboxItems.length) return null;
    const res = await fetchXboxPrices(xboxItems, regions, net);
    status.sources['xbox-services'] = res.log;
    return res;
  });

  for (const s of curated) {
    const off = s.offers || {};
    if (off.psn && off.psn.source === 'psplus') {
      needPsPlus = true;
      if (off.psn.default) defaults[s.id + '|psn'] = off.psn.default;
      hints[s.id + '|psn'] = off.psn.packages.map((p) => p[0]);
    }
    if (off.apple && off.apple.source === 'apple') appleSpecs.push({ service: s.id, app: off.apple.app, items: off.apple.items });
  }

  const psPlusTask = needPsPlus ? safe('psplus', async () => {
    const res = await fetchPsPlus(regions, net);
    status.sources.psplus = res.log;
    return res;
  }) : Promise.resolve(null);

  const appleTask = appleSpecs.length ? safe('apple', async () => {
    const res = await fetchApple(appleSpecs, regions, net);
    status.sources.apple = res.log;
    return res;
  }) : Promise.resolve(null);

  // ===== ألعاب بلايستيشن =====
  const psGamesTask = limits.ps === 0 ? Promise.resolve(null) : safe('ps-games', async () => {
    const best = await fetchPsBestSellers({ count: limits.ps ?? 150, ...net });
    const res = await fetchPsConceptPrices(best, regions, net);
    status.sources['ps-games'] = { ...res.log, concepts: best.length };
    return { best, ...res };
  });

  // ===== ألعاب إكس بوكس =====
  const xbGamesTask = limits.xbox === 0 ? Promise.resolve(null) : safe('xbox-games', async () => {
    const best = await fetchXboxBestSellers({ count: limits.xbox ?? 150, ...net });
    const groups = new Map();
    best.forEach((p, i) => {
      const consoleGame = p.kind === 'Game' && p.availableOn.some((x) => /^Xbox/.test(x));
      if (!consoleGame || !(p.usPrice > 0)) return;
      const key = titleKey(p.title);
      if (!key) return;
      const g = groups.get(key);
      if (!g || p.usPrice < g.usPrice) groups.set(key, { ...p, rank: Math.min(i + 1, g ? g.rank : Infinity) });
      else g.rank = Math.min(g.rank, i + 1);
    });
    const items = [...groups.values()].map((p) => ({ key: 'game|' + p.productId, bigId: p.productId, match: null, game: p }));
    const res = await fetchXboxPrices(items, regions, net);
    status.sources['xbox-games'] = { ...res.log, products: items.length };
    return { items, ...res };
  });

  // ===== ألعاب ستيم =====
  const steamTask = limits.steam === 0 ? Promise.resolve(null) : safe('steam', async () => {
    const names = { ...(cache.steamNames || {}) };
    const list = [];
    const seen = new Set();
    let top = [];
    try {
      top = await fetchSteamTopSellers(net);
    } catch (e) {
      status.sources['steam-top'] = { ok: false, error: String(e.message || e) };
    }
    top.forEach((t, i) => {
      if (seen.has(t.appid)) return;
      seen.add(t.appid);
      names[t.appid] = names[t.appid] || t.name;
      list.push({ appid: t.appid, rank: 20 + i });
    });
    (cfg.steam || []).forEach(([appid, name], i) => {
      if (seen.has(appid)) return;
      seen.add(appid);
      if (name && !names[appid]) names[appid] = name;
      list.push({ appid, rank: 400 + i });
    });
    // أسماء رسمية للألعاب الجديدة اللي ما إلها اسم محفوظ
    for (const it of list) {
      if (names[it.appid]) continue;
      try {
        const j = await request(`https://store.steampowered.com/api/appdetails?appids=${it.appid}&cc=us&l=english&filters=basic`, net);
        const d = j && j[it.appid];
        if (d && d.success && d.data && d.data.name) names[it.appid] = d.data.name;
      } catch {}
      await wait(1200);
    }
    const ok = list.filter((it) => names[it.appid]);
    const res = await fetchSteamPrices(ok.map((it) => it.appid), regions, net);
    cache.steamNames = names;
    status.sources.steam = { ...res.log, games: ok.length };
    return { list: ok, names, ...res };
  });

  const [rates, xb, psPlus, apple, psGames, xbGames, steam] = await Promise.all([
    ratesTask, xboxTask, psPlusTask, appleTask, psGamesTask, xbGamesTask, steamTask
  ]);

  // ===== تجميع الخدمات المحددة =====
  curated.forEach((s, i) => {
    const base = { type: s.type, name: s.name, ar: s.ar, kw: keywords(s.name, (s.ar || '') + ' ' + (s.kw || ''), cfg.aliases), rank: i };
    const off = s.offers || {};
    if (off.psn && off.psn.source === 'psplus' && psPlus) {
      const svc = svcOf(s.id, base);
      for (const [id, label] of off.psn.packages) fill(pkgOf(svc, 'psn', { id, label, ref: 'psplus' }), psPlus.prices[id]);
    }
    if (off.apple && apple) {
      const pk = apple.packages[s.id] || {};
      const pr = apple.prices[s.id] || {};
      const keys = Object.keys(pr);
      if (keys.length) {
        const svc = svcOf(s.id, base);
        for (const key of keys) fill(pkgOf(svc, 'apple', { id: key, label: pk[key].label, num: pk[key].num ?? undefined, ref: off.apple.app }), pr[key]);
      }
    }
  });
  if (xb) {
    for (const it of xboxItems) {
      const regs = xb.prices[it.key];
      if (!regs) continue;
      const s = it.svc;
      const idx = curated.indexOf(s);
      const svc = svcOf(s.id, { type: s.type, name: s.name, ar: s.ar, kw: keywords(s.name, (s.ar || '') + ' ' + (s.kw || ''), cfg.aliases), rank: idx });
      fill(pkgOf(svc, 'xbox', it.pkg), regs);
    }
  }

  // ===== تجميع الألعاب من المنصات الثلاث حسب اسم اللعبة =====
  const games = new Map();
  const gameOf = (name, rank) => {
    const key = titleKey(name);
    if (!key) return null;
    let g = games.get(key);
    if (!g) {
      g = { key, names: {}, rank: Infinity, offers: {} };
      games.set(key, g);
    }
    g.rank = Math.min(g.rank, rank);
    return g;
  };
  if (psGames) {
    for (const c of psGames.best) {
      const info = psGames.info[c.conceptId];
      const regs = psGames.prices[c.conceptId];
      if (!info || !regs) continue;
      const g = gameOf(info.name, c.rank);
      if (!g) continue;
      g.names.psn = baseTitle(info.name);
      g.offers.psn = { label: editionLabel(info.name, baseTitle(info.name)), ref: c.conceptId, regs };
    }
  }
  if (xbGames) {
    for (const it of xbGames.items) {
      const regs = xbGames.prices[it.key];
      if (!regs) continue;
      const title = it.game.title;
      const g = gameOf(title, it.game.rank);
      if (!g) continue;
      g.names.xbox = baseTitle(title);
      g.offers.xbox = { label: editionLabel(title, baseTitle(title)), ref: it.bigId, regs };
    }
  }
  if (steam) {
    for (const it of steam.list) {
      const regs = steam.prices[it.appid];
      if (!regs) continue;
      const name = steam.names[it.appid];
      const g = gameOf(name, it.rank);
      if (!g) continue;
      g.names.steam = baseTitle(name);
      g.offers.steam = { label: editionLabel(name, baseTitle(name)), ref: it.appid, regs };
    }
  }
  for (const g of games.values()) {
    const name = g.names.steam || g.names.xbox || g.names.psn;
    let id = slug(baseTitle(name));
    if (services.has(id)) id = id + '-game';
    const svc = svcOf(id, { type: 'game', name, kw: keywords(name, '', cfg.aliases), rank: g.rank });
    for (const [pl, o] of Object.entries(g.offers)) fill(pkgOf(svc, pl, { id: 'base', label: o.label, ref: o.ref }), o.regs);
  }

  // ===== الدمج والكتابة =====
  const fresh = [...services.values()].filter((s) => Object.values(s.offers).some((o) => o.packages.some((p) => Object.keys(p.prices).length)));
  const merged = mergeServices(prev.services, fresh, now);
  const list = finalize(merged, rates || prevRates.rates, defaults, hints);
  const gotAny = fresh.length > 0;
  await writeJSON(root, 'data/prices.json', {
    updated: gotAny ? now.toISOString() : prev.updated || null,
    platforms: cfg.platforms,
    types: cfg.types,
    services: list
  });
  await writeJSON(root, 'data/cache.json', cache, true);
  const count = list.reduce((n, s) => n + Object.values(s.offers).reduce((m, o) => m + o.packages.reduce((k, p) => k + Object.keys(p.prices).length, 0), 0), 0);
  status.summary = {
    services: list.length,
    prices: count,
    byType: list.reduce((acc, s) => ((acc[s.type] = (acc[s.type] || 0) + 1), acc), {})
  };
  await writeJSON(root, 'data/status.json', status, true);
  if (!quiet) {
    console.log(`تم: ${list.length} خدمة، ${count} سعر.`);
    console.log(JSON.stringify(status, null, 2));
  }
  return { status, list };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
