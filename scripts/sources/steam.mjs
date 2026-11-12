// Steam: الأكثر مبيعاً + أسعار كل لعبة بكل منطقة (طلب واحد لكل مجموعة ألعاب بكل منطقة).
import { request, chunk, sleep } from '../lib/util.mjs';

export async function fetchSteamTopSellers({ fetchImpl, wait } = {}) {
  const j = await request('https://store.steampowered.com/api/featuredcategories?cc=us&l=english', { fetchImpl, wait });
  const items = (j && j.top_sellers && j.top_sellers.items) || [];
  const seen = new Set();
  const out = [];
  for (const it of items) {
    if (it.type !== 0 || !it.id || !it.name || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ appid: it.id, name: it.name });
  }
  return out;
}

/** prices[appid][REGION] = { amount, currency, original } */
export async function fetchSteamPrices(appids, regions, { fetchImpl, wait = sleep, gap = 1200 } = {}) {
  const prices = {};
  const log = { ok: true, regions: {} };
  const groups = chunk([...new Set(appids)], 40);
  for (const r of regions) {
    if (!r.steam) continue;
    let n = 0;
    try {
      for (const ids of groups) {
        const j = await request(
          `https://store.steampowered.com/api/appdetails?appids=${ids.join(',')}&cc=${r.steam}&filters=price_overview`,
          { fetchImpl, wait }
        );
        for (const id of ids) {
          const d = j && j[id];
          const po = d && d.success && d.data && !Array.isArray(d.data) ? d.data.price_overview : null;
          if (!po || typeof po.final !== 'number' || !po.currency || po.final <= 0) continue;
          (prices[id] = prices[id] || {})[r.code] = {
            amount: po.final / 100,
            currency: po.currency,
            original: typeof po.initial === 'number' && po.initial > po.final ? po.initial / 100 : 0
          };
          n++;
        }
        await wait(gap);
      }
      log.regions[r.code] = n;
    } catch (e) {
      log.regions[r.code] = 'خطأ: ' + (e.message || e);
      log.ok = false;
    }
  }
  return { prices, log };
}
