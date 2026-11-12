// App Store: أسعار المشتريات داخل التطبيقات (شدات، جواهر، اشتراكات) من صفحة التطبيق بكل دولة.
import { request, pool, parseAmount, detectCurrency, decodeEntities, slug, sleep } from '../lib/util.mjs';

/** بيرجع [{ name, price }] من قسم «In-App Purchases» بصفحة التطبيق */
export function parseAppleIaps(raw) {
  const out = [];
  const re = /<div class="text-pair[^"]*">\s*<span[^>]*>([^<]+)<\/span>\s*<span[^>]*>([^<]+)<\/span>/g;
  let m;
  while ((m = re.exec(raw))) {
    const name = decodeEntities(m[1]).replace(/\s+/g, ' ').trim();
    const price = decodeEntities(m[2]).replace(/\s+/g, ' ').trim();
    if (name && price && /\d/.test(price)) out.push({ name, price });
  }
  return out;
}

const fmtInt = (n) => n.toLocaleString('en-US');

/** بيطبّق القالب "{1} UC" على المجموعات الملتقطة، وبيوحّد الأرقام (1,000 = 1000) */
export function labelFrom(template, groups) {
  let num = null;
  let word = null;
  const label = template.replace(/\{(\d)\}/g, (_, i) => {
    const g = groups[Number(i)] || '';
    if (/^[\d.,\s]+$/.test(g)) {
      const n = parseInt(g.replace(/[^\d]/g, ''), 10);
      if (num == null) num = n;
      return fmtInt(n);
    }
    if (word == null) word = g.trim();
    return g.trim();
  });
  return { label, num, word };
}

/** معرّف ثابت للباقة: معرّف البند بالإعدادات + الرقم أو الكلمة الملتقطة (uc-60، cp-medium) */
export function packageKey(item, idx, parts) {
  const base = item.id || 'i' + idx;
  if (parts.num != null) return base + '-' + parts.num;
  if (parts.word) return base + '-' + slug(parts.word);
  return base;
}

/**
 * specs: [{ service, app, items: [{ match, label }] }]
 * بيرجع prices[service][pkgKey][REGION] و packages[service][pkgKey] = { label, num }
 */
export async function fetchApple(specs, regions, { fetchImpl, wait = sleep, concurrency = 2, gap = 500 } = {}) {
  const apps = [...new Set(specs.map((s) => s.app))];
  const tasks = [];
  for (const app of apps) for (const r of regions) if (r.apple) tasks.push([app, r]);
  const pages = new Map();
  const log = { ok: true, apps: {}, errors: 0 };
  let firstErr = null;
  await pool(tasks, concurrency, async ([app, r]) => {
    try {
      const raw = await request(`https://apps.apple.com/${r.apple}/app/id${app}?l=en`, { fetchImpl, wait, as: 'text' });
      pages.set(app + '|' + r.code, parseAppleIaps(raw));
    } catch (e) {
      if (e.status === 404) return; // التطبيق مش متوفر بهالدولة
      log.errors++;
      firstErr = firstErr || `${app}/${r.code}: ${e.message || e}`;
    }
  }, { gap, wait });

  const prices = {};
  const packages = {};
  for (const spec of specs) {
    const svc = (prices[spec.service] = prices[spec.service] || {});
    const pk = (packages[spec.service] = packages[spec.service] || {});
    let count = 0;
    for (const r of regions) {
      const list = pages.get(spec.app + '|' + r.code);
      if (!list) continue;
      for (const [idx, item] of spec.items.entries()) {
        const re = new RegExp(item.match, 'i');
        for (const iap of list) {
          const m = iap.name.match(re);
          if (!m) continue;
          const amount = parseAmount(iap.price);
          if (!(amount > 0)) continue;
          const clear = detectCurrency(iap.price);
          if (clear && r.appleCurrency && clear !== r.appleCurrency) continue;
          const parts = labelFrom(item.label, m);
          const key = packageKey(item, idx, parts);
          pk[key] = pk[key] || { label: parts.label, num: parts.num };
          const regs = (svc[key] = svc[key] || {});
          // نفس الباقة بأكثر من سعر (خطط قديمة أو سنوية بنفس الاسم): بناخذ الأقل
          if (!regs[r.code] || amount < regs[r.code].amount) {
            if (!regs[r.code]) count++;
            regs[r.code] = { amount, currency: r.appleCurrency || clear, original: 0 };
          }
        }
      }
    }
    log.apps[spec.service] = count;
  }
  if (firstErr) log.firstError = firstErr;
  if (!Object.values(log.apps).some((n) => n > 0)) log.ok = false;
  return { prices, packages, log };
}

/* ===== iCloud+ من صفحة دعم آبل (جدول فيه كل الدول) ===== */
const ICLOUD_COLS = ['50gb', '200gb', '2tb', '6tb', '12tb'];
const NAME_ALIASES = { 'türkiye': 'TR', turkiye: 'TR', turkey: 'TR', 'viet nam': 'VN', uae: 'AE', uk: 'GB', usa: 'US' };

const cellText = (html) =>
  decodeEntities(String(html).replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, '').replace(/<[^>]+>/g, ' '))
    .replace(/&[a-z0-9#]+;/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

export function parseICloudTable(raw, regions) {
  const byName = {};
  for (const r of regions) byName[String(r.en).toLowerCase()] = r.code;
  Object.assign(byName, NAME_ALIASES);
  const out = {};
  const rows = String(raw).match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const row of rows) {
    const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(cellText);
    if (cells.length < 6) continue;
    const cur = (cells[0].match(/\(([A-Z]{3})\)/) || [])[1];
    if (!cur) continue;
    const name = cells[0].replace(/\(.*?\)/g, '').replace(/[\d¹²³⁴⁵⁶⁷⁸⁹*†]/g, '').trim().toLowerCase();
    const code = byName[name];
    if (!code) continue;
    ICLOUD_COLS.forEach((col, i) => {
      const amount = parseAmount(cells[i + 1]);
      if (amount > 0) (out[col] = out[col] || {})[code] = { amount, currency: cur, original: 0 };
    });
  }
  return out;
}

export async function fetchICloud(regions, { fetchImpl, wait = sleep } = {}) {
  const raw = await request('https://support.apple.com/en-us/108047', { fetchImpl, wait, as: 'text' });
  const prices = parseICloudTable(raw, regions);
  const n = Object.values(prices).reduce((a, regs) => a + Object.keys(regs).length, 0);
  if (!n) throw new Error('ما لقينا جدول أسعار iCloud+');
  return { prices, log: { ok: true, prices: n } };
}
