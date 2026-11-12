#!/usr/bin/env node
// يحدّث أسعار الصرف وأسعار Steam وXbox تلقائياً، وبيكتب النتائج بمجلد data.
// بيشتغل يومياً على GitHub Actions. أي مصدر بيفشل ما بيمسح الأسعار القديمة.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = (p) => path.join(ROOT, p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// العملات اللي بنحتاج سعر صرفها (عملات العرض + عملات المناطق)
export const CURRENCIES = ['USD', 'JOD', 'SAR', 'AED', 'KWD', 'QAR', 'BHD', 'OMR', 'EGP', 'IQD', 'MAD', 'TRY', 'ARS', 'INR', 'BRL', 'PLN', 'UAH', 'VND'];
// أي سعر تلقائي أقدم من هيك بينشال (مثلاً لعبة انسحبت من متجر منطقة)
const STALE_DAYS = 10;

async function readJSON(p, fallback) {
  try {
    return JSON.parse(await readFile(file(p), 'utf8'));
  } catch (e) {
    if (fallback !== undefined) return fallback;
    throw e;
  }
}
const writeJSON = (p, data) => writeFile(file(p), JSON.stringify(data, null, 2) + '\n');

export async function getJSON(url, { tries = 3, fetchImpl = fetch, wait = sleep } = {}) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.fatal = true;
        throw err;
      }
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (e.fatal || i === tries) break;
      await wait(4000 * i);
    }
  }
  throw lastErr;
}

/* ===== أسعار الصرف ===== */
export async function fetchRates({ fetchImpl = fetch, wait = sleep, now = new Date() } = {}) {
  const fx = await getJSON('https://open.er-api.com/v6/latest/USD', { fetchImpl, wait });
  if (fx.result !== 'success' || !fx.rates) throw new Error('رد غير متوقع من مزوّد أسعار الصرف');
  const rates = { USD: 1 };
  const missing = [];
  for (const c of CURRENCIES) {
    if (c === 'USD') continue;
    if (typeof fx.rates[c] === 'number' && fx.rates[c] > 0) rates[c] = fx.rates[c];
    else missing.push(c);
  }
  return {
    file: { base: 'USD', updated: now.toISOString(), provider: 'open.er-api.com', approximate: false, rates },
    missing
  };
}

/* ===== Steam ===== */
export async function fetchSteam(products, regions, prevNames, { fetchImpl = fetch, wait = sleep, now = new Date(), gap = 1300 } = {}) {
  const items = products.filter((p) => p.source && p.source.type === 'steam' && p.source.appid);
  const out = { prices: {}, names: {}, log: { ok: true, names: 0, regions: {}, problems: [] } };
  if (!items.length) return out;

  // الأسماء الرسمية (مرة وحدة لكل لعبة، بتنحفظ للمرات الجاية)
  for (const p of items) {
    if (prevNames[p.id]) { out.names[p.id] = prevNames[p.id]; continue; }
    try {
      const j = await getJSON(`https://store.steampowered.com/api/appdetails?appids=${p.source.appid}&cc=us&l=english&filters=basic`, { fetchImpl, wait });
      const d = j && j[p.source.appid];
      if (d && d.success && d.data && d.data.name) {
        out.names[p.id] = d.data.name;
        out.log.names++;
      } else {
        out.log.problems.push({ id: p.id, problem: 'اللعبة مش موجودة على ستيم بهالرقم' });
      }
    } catch (e) {
      out.log.problems.push({ id: p.id, problem: String(e.message || e) });
    }
    await wait(gap);
  }

  // الأسعار: طلب واحد لكل منطقة فيه كل الألعاب
  const ids = items.map((p) => p.source.appid).join(',');
  for (const r of regions) {
    try {
      const j = await getJSON(`https://store.steampowered.com/api/appdetails?appids=${ids}&cc=${r.code.toLowerCase()}&filters=price_overview`, { fetchImpl, wait });
      let n = 0;
      for (const p of items) {
        const d = j && j[p.source.appid];
        const po = d && d.success && d.data && !Array.isArray(d.data) ? d.data.price_overview : null;
        if (!po || typeof po.final !== 'number' || !po.currency) continue;
        (out.prices[p.id] = out.prices[p.id] || {})[r.code] = {
          amount: po.final / 100,
          currency: po.currency,
          original: typeof po.initial === 'number' ? po.initial / 100 : po.final / 100,
          discount: po.discount_percent || 0,
          checked: now.toISOString(),
          source: `https://store.steampowered.com/app/${p.source.appid}/`
        };
        n++;
      }
      out.log.regions[r.code] = n;
    } catch (e) {
      out.log.regions[r.code] = 'خطأ: ' + (e.message || e);
      out.log.ok = false;
    }
    await wait(gap);
  }
  return out;
}

/* ===== Xbox ===== */
export function pickXboxPrice(product, match) {
  const cands = [];
  for (const dsa of product.DisplaySkuAvailabilities || []) {
    const title = (dsa.Sku && dsa.Sku.LocalizedProperties && dsa.Sku.LocalizedProperties[0] && dsa.Sku.LocalizedProperties[0].SkuTitle) || '';
    for (const av of dsa.Availabilities || []) {
      if (!(av.Actions || []).includes('Purchase')) continue;
      const pr = av.OrderManagementData && av.OrderManagementData.Price;
      if (!pr || !(pr.ListPrice > 0) || !pr.CurrencyCode) continue;
      cands.push({ title, list: pr.ListPrice, msrp: pr.MSRP || pr.ListPrice, currency: pr.CurrencyCode });
    }
  }
  if (!cands.length) return null;
  const want = String(match || '').toLowerCase();
  const pool = want ? cands.filter((c) => c.title.toLowerCase().includes(want)) : cands;
  // إذا ما لقينا المدة المطلوبة بالاسم، أحسن ما نعرض سعر مدة ثانية بالغلط
  if (!pool.length) return null;
  // السعر العادي للمدة المطلوبة، مش عرض الشهر الأول (زي اشتراك بدولار)
  return pool.slice().sort((a, b) => (b.msrp - a.msrp) || (b.list - a.list))[0];
}

export async function fetchXbox(products, regions, { fetchImpl = fetch, wait = sleep, now = new Date(), gap = 700 } = {}) {
  const items = products.filter((p) => p.source && p.source.type === 'xbox' && p.source.bigId);
  const out = { prices: {}, names: {}, log: {} };
  for (const p of items) {
    const log = { ok: true, regions: {} };
    for (const r of regions) {
      try {
        const j = await getJSON(`https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${p.source.bigId}&market=${r.code}&languages=en-us`, { fetchImpl, wait });
        const prod = j && j.Products && j.Products[0];
        if (!prod) { log.regions[r.code] = 'المنتج مش متوفر بهالمنطقة'; continue; }
        const title = prod.LocalizedProperties && prod.LocalizedProperties[0] && prod.LocalizedProperties[0].ProductTitle;
        if (title && !out.names[p.id]) out.names[p.id] = title;
        const pick = pickXboxPrice(prod, p.source.match);
        if (!pick) { log.regions[r.code] = 'ما في سعر'; continue; }
        const discounted = pick.msrp > pick.list;
        (out.prices[p.id] = out.prices[p.id] || {})[r.code] = {
          amount: pick.list,
          currency: pick.currency,
          original: pick.msrp,
          discount: discounted ? Math.round((1 - pick.list / pick.msrp) * 100) : 0,
          checked: now.toISOString(),
          source: `https://www.microsoft.com/store/productId/${p.source.bigId}`,
          sku: pick.title
        };
        log.regions[r.code] = `${pick.title} — ${pick.list} ${pick.currency}`;
      } catch (e) {
        log.regions[r.code] = 'خطأ: ' + (e.message || e);
        log.ok = false;
      }
      await wait(gap);
    }
    out.log[p.id] = log;
  }
  return out;
}

/* ===== الدمج ===== */
export function merge(prev, fresh, validIds, now = new Date()) {
  const cutoff = now.getTime() - STALE_DAYS * 86400 * 1000;
  const products = {};
  for (const [id, regs] of Object.entries((prev && prev.products) || {})) {
    if (!validIds.has(id)) continue;
    for (const [code, e] of Object.entries(regs)) {
      if (e && e.checked && new Date(e.checked).getTime() >= cutoff) (products[id] = products[id] || {})[code] = e;
    }
  }
  for (const part of fresh) {
    for (const [id, regs] of Object.entries(part.prices || {})) {
      products[id] = Object.assign(products[id] || {}, regs);
    }
  }
  const names = {};
  for (const [id, n] of Object.entries((prev && prev.names) || {})) if (validIds.has(id)) names[id] = n;
  for (const part of fresh) Object.assign(names, part.names || {});
  return { products, names };
}

/* ===== التشغيل ===== */
export async function main({ fetchImpl = fetch, wait = sleep, now = new Date(), gap } = {}) {
  const regions = await readJSON('data/regions.json');
  const catalog = await readJSON('data/catalog.json');
  const prev = await readJSON('data/auto-prices.json', { updated: null, products: {}, names: {} });
  const validIds = new Set(catalog.products.map((p) => p.id));
  const status = { updated: now.toISOString(), sources: {} };
  const fresh = [];

  try {
    const fx = await fetchRates({ fetchImpl, wait, now });
    await writeJSON('data/rates.json', fx.file);
    status.sources.rates = { ok: true, count: Object.keys(fx.file.rates).length, missing: fx.missing };
  } catch (e) {
    status.sources.rates = { ok: false, error: String(e.message || e) };
  }

  try {
    const st = await fetchSteam(catalog.products, regions, prev.names || {}, { fetchImpl, wait, now, gap });
    fresh.push(st);
    status.sources.steam = st.log;
  } catch (e) {
    status.sources.steam = { ok: false, error: String(e.message || e) };
  }

  try {
    const xb = await fetchXbox(catalog.products, regions, { fetchImpl, wait, now, gap });
    fresh.push(xb);
    status.sources.xbox = xb.log;
  } catch (e) {
    status.sources.xbox = { ok: false, error: String(e.message || e) };
  }

  const merged = merge(prev, fresh, validIds, now);
  const gotAny = fresh.some((f) => Object.keys(f.prices || {}).length > 0);
  await writeJSON('data/auto-prices.json', {
    updated: gotAny ? now.toISOString() : (prev.updated || null),
    products: merged.products,
    names: merged.names
  });
  await writeJSON('data/status.json', status);

  const count = Object.values(merged.products).reduce((n, regs) => n + Object.keys(regs).length, 0);
  console.log(`تم: ${count} سعر محفوظ. الملخص:`);
  console.log(JSON.stringify(status, null, 2));
  return { status, merged };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
