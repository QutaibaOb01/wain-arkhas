// متجر بلايستيشن: الأكثر مبيعاً، سعر كل لعبة بكل منطقة، وأسعار PlayStation Plus من صفحتها الرسمية.
import { request, pool, parseAmount, detectCurrency, matchBrace, sleep } from '../lib/util.mjs';

// معرّفات الاستعلامات اللي بيستخدمها موقع المتجر نفسه (لو سوني غيّرتها بيبين بالـ status.json)
export const PS_HASHES = {
  categoryGridRetrieve: '88c0b9a1273c6d320c51cd73e390924e21ae28bf09f01cde8b84b1034b16cd03',
  conceptRetrieveForCtasWithPrice: 'd7991383f7921f4bb3c570941efd33a2b2f93038627d7ece013158ea3441f456',
  tierSelectorFullRetrieve: '0c939ac95c125db8541e92f2f9dfa2b8a130dda22ccae812e303c3a2f5b5064f'
};
const ALL_GAMES = '28c9c2b2-cecc-415c-9a08-482a605cb104';

/** "en-tr" → "en-TR" (الصيغة اللي بيقبلها الـ API) */
export const headerLocale = (loc) => {
  const [lang, cc] = String(loc).split('-');
  return lang + '-' + String(cc || '').toUpperCase();
};

export async function psOp(locale, name, vars, { fetchImpl, wait } = {}) {
  const ext = { persistedQuery: { version: 1, sha256Hash: PS_HASHES[name] } };
  const url =
    'https://web.np.playstation.com/api/graphql/v1/op?operationName=' + name +
    '&variables=' + encodeURIComponent(JSON.stringify(vars)) +
    '&extensions=' + encodeURIComponent(JSON.stringify(ext));
  const j = await request(url, {
    headers: { 'x-psn-store-locale-override': headerLocale(locale), 'content-type': 'application/json', accept: 'application/json' },
    fetchImpl,
    wait
  });
  if (j && j.errors && !j.data) throw new Error('PS: ' + String((j.errors[0] && j.errors[0].message) || 'خطأ'));
  return j;
}

/** أكثر الألعاب مبيعاً آخر 30 يوم (بدون المجانية) */
export async function fetchPsBestSellers({ count = 150, locale = 'en-us', fetchImpl, wait = sleep } = {}) {
  const out = [];
  const seen = new Set();
  for (let offset = 0; offset < count + 60 && out.length < count; offset += 100) {
    const j = await psOp(
      locale,
      'categoryGridRetrieve',
      { id: ALL_GAMES, pageArgs: { size: 100, offset }, sortBy: { name: 'sales30', isAscending: false }, filterBy: [], facetOptions: [] },
      { fetchImpl, wait }
    );
    const g = j && j.data && j.data.categoryGridRetrieve;
    const list = (g && g.concepts) || [];
    for (const c of list) {
      if (!c || !c.id || seen.has(c.id)) continue;
      seen.add(c.id);
      const pr = c.price || {};
      if (pr.isFree || pr.isTiedToSubscription) continue;
      out.push({ conceptId: String(c.id), name: c.name, rank: seen.size });
      if (out.length >= count) break;
    }
    if (!list.length || (g.pageInfo && g.pageInfo.isLast)) break;
    await wait(800);
  }
  return out;
}

/** قيمة السعر بالـ API أحياناً بالسنتات وأحياناً كاملة (الروبية مثلاً)، فبنقارنها بالنص المكتوب */
export function scaledValue(value, text) {
  if (typeof value !== 'number') return parseAmount(text);
  const parsed = parseAmount(text);
  if (parsed == null) return value / 100;
  if (Math.abs(value / 100 - parsed) < 0.011) return value / 100;
  if (Math.abs(value - parsed) < 0.6) return value;
  return parsed;
}

/** من أزرار الشراء: السعر العام (مش سعر أعضاء بلس ولا التجربة المجانية) */
export function pickPsPrice(webctas) {
  const ok = (webctas || []).filter((w) => {
    const p = w && w.price;
    if (!p || p.isExclusive || p.isTiedToSubscription || p.isFree) return false;
    if (!(p.basePriceValue > 0) || !p.currencyCode) return false;
    return !/TRIAL|UPSELL/i.test(w.type || '');
  });
  if (!ok.length) return null;
  const p = ok.sort((a, b) => (a.price.discountedValue || a.price.basePriceValue) - (b.price.discountedValue || b.price.basePriceValue))[0].price;
  const base = scaledValue(p.basePriceValue, p.basePrice);
  const disc = typeof p.discountedValue === 'number' ? scaledValue(p.discountedValue, p.discountedPrice) : base;
  if (!(disc > 0)) return null;
  return { amount: disc, currency: p.currencyCode, original: base > disc ? base : 0 };
}

/**
 * سعر النسخة الافتراضية لكل لعبة بكل منطقة. بنتأكد إن النسخة نفسها بكل المناطق
 * (مثلاً Ultimate بأمريكا ما بنقارنها بـ Standard بتركيا).
 * بيرجع { info: {conceptId: {name, label}}, prices: {conceptId: {REGION: {...}}}, log }
 */
export async function fetchPsConceptPrices(concepts, regions, { fetchImpl, wait = sleep, concurrency = 6, gap = 150 } = {}) {
  const ref = regions.find((r) => r.code === 'US' && r.ps) || regions.find((r) => r.ps);
  const others = regions.filter((r) => r.ps && r !== ref);
  const info = {};
  const prices = {};
  const log = { ok: true, regions: {}, mismatched: 0, errors: 0 };
  const one = async (cid, r) => {
    const j = await psOp(r.ps, 'conceptRetrieveForCtasWithPrice', { conceptId: cid }, { fetchImpl, wait });
    const c = j && j.data && j.data.conceptRetrieve;
    const d = c && c.defaultProduct;
    if (!d || !d.id) return null;
    return { productId: d.id, label: d.id.split('-').pop(), name: d.invariantName || d.name, price: pickPsPrice(d.webctas) };
  };
  const put = (cid, r, res) => {
    (prices[cid] = prices[cid] || {})[r.code] = res.price;
    log.regions[r.code] = (log.regions[r.code] || 0) + 1;
  };
  let firstErr = null;
  // 1) المنطقة المرجعية (أمريكا): اسم النسخة ورمزها
  await pool(concepts, concurrency, async (c) => {
    try {
      const res = await one(c.conceptId, ref);
      if (!res) return;
      info[c.conceptId] = { name: res.name, label: res.label };
      if (res.price) put(c.conceptId, ref, res);
    } catch (e) {
      log.errors++;
      firstErr = firstErr || String(e.message || e);
    }
  }, { gap, wait });
  // 2) باقي المناطق
  const tasks = [];
  for (const r of others) for (const c of concepts) if (info[c.conceptId]) tasks.push([c.conceptId, r]);
  await pool(tasks, concurrency, async ([cid, r]) => {
    try {
      const res = await one(cid, r);
      if (!res || !res.price) return;
      if (res.label !== info[cid].label) { log.mismatched++; return; }
      put(cid, r, res);
    } catch (e) {
      log.errors++;
      firstErr = firstErr || String(e.message || e);
    }
  }, { gap, wait });
  if (firstErr) log.firstError = firstErr;
  const total = Object.values(log.regions).reduce((a, b) => a + b, 0);
  if (!total) log.ok = false;
  return { info, prices, log };
}

const TIERS = { 1: 'essential', 2: 'extra', 3: 'premium' };

/** يطلع منتجات PS Plus من صفحة playstation.com/{locale}/ps-plus/ */
export function parsePsPlusPage(raw) {
  const out = {};
  const re = /"Product:([A-Z0-9_-]*PLUS(\d)T(\d\d)M[A-Z0-9]*)":\{/g;
  let m;
  while ((m = re.exec(raw))) {
    const start = m.index + m[0].length - 1;
    const end = matchBrace(raw, start);
    if (end < 0) continue;
    let o;
    try { o = JSON.parse(raw.slice(start, end + 1)); } catch { continue; }
    const tier = TIERS[m[2]];
    const months = parseInt(m[3], 10);
    if (!tier || !months || !o.price) continue;
    const key = `${tier}-${months}m`;
    if (out[key]) continue;
    out[key] = { base: o.price.basePrice, disc: o.price.discountedPrice || o.price.basePrice, name: o.name };
  }
  return out;
}

const TIER_LABELS = { TIER_10: 'essential', TIER_20: 'extra', TIER_30: 'premium' };

/** مستويات PS Plus ومددها وأسعارها من استعلام tierSelectorFullRetrieve */
export function parseTierSelector(j) {
  const out = {};
  const comps = (j && j.data && j.data.tierSelectorRetrieve && j.data.tierSelectorRetrieve.components) || [];
  for (const c of comps) {
    const tier = TIER_LABELS[c && c.tierLabel];
    if (!tier) continue;
    for (const p of c.plans || []) {
      const d = p && p.duration;
      const months = d && (d.unit === 'MONTH' ? d.value : d.unit === 'YEAR' ? d.value * 12 : null);
      const pr = p && p.product && p.product.price;
      if (!months || !pr || !pr.currencyCode || pr.isFree) continue;
      const base = scaledValue(pr.basePriceValue, pr.basePrice);
      const disc = typeof pr.discountedValue === 'number' ? scaledValue(pr.discountedValue, pr.discountedPrice) : parseAmount(pr.discountedPrice) || base;
      if (!(disc > 0)) continue;
      out[`${tier}-${months}m`] = { amount: disc, currency: pr.currencyCode, original: base > disc ? base : 0 };
    }
  }
  return out;
}

export async function fetchPsPlus(regions, { fetchImpl, wait = sleep, gap = 600 } = {}) {
  const prices = {};
  const log = { ok: true, regions: {} };
  for (const r of regions) {
    if (!r.ps) continue;
    // 1) نفس الاستعلام اللي بتستخدمه صفحة PS Plus الرسمية
    try {
      const items = parseTierSelector(await psOp(r.ps, 'tierSelectorFullRetrieve', {}, { fetchImpl, wait }));
      const keys = Object.keys(items);
      if (keys.length) {
        for (const k of keys) (prices[k] = prices[k] || {})[r.code] = items[k];
        log.regions[r.code] = keys.length;
        await wait(gap);
        continue;
      }
    } catch (e) {
      log.regions[r.code] = 'API: ' + (e.message || e);
    }
    // 2) احتياطي: الصفحة نفسها
    try {
      const raw = await request(`https://www.playstation.com/${r.ps}/ps-plus/`, { fetchImpl, wait, as: 'text' });
      const items = parsePsPlusPage(raw);
      let n = 0;
      for (const [key, it] of Object.entries(items)) {
        const base = parseAmount(it.base);
        const disc = parseAmount(it.disc);
        if (!(disc > 0)) continue;
        const cur = detectCurrency(it.disc) || r.psCurrency;
        if (r.psCurrency && cur !== r.psCurrency) continue; // رمز عملة غريب: أحسن ما نغلط
        (prices[key] = prices[key] || {})[r.code] = { amount: disc, currency: r.psCurrency || cur, original: base > disc ? base : 0 };
        n++;
      }
      log.regions[r.code] = n;
    } catch (e) {
      log.regions[r.code] = 'خطأ: ' + (e.message || e);
      log.ok = false;
    }
    await wait(gap);
  }
  return { prices, log };
}
