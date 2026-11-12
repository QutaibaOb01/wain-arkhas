// متجر Xbox (Microsoft Store): الأكثر مبيعاً، الإضافات (V-Bucks وRobux)، وأسعار أي منتج بكل الأسواق.
import { request, chunk, extractJSONAfter, sleep } from '../lib/util.mjs';

/** بيختار سعر المنتج من بيانات الكتالوج: السعر العام (مش سعر الأعضاء)، وللمدة المطلوبة إذا في match */
export function pickXboxPrice(product, match) {
  const cands = [];
  for (const dsa of product.DisplaySkuAvailabilities || []) {
    const lp = dsa.Sku && dsa.Sku.LocalizedProperties && dsa.Sku.LocalizedProperties[0];
    const title = (lp && lp.SkuTitle) || '';
    const skuId = (dsa.Sku && dsa.Sku.SkuId) || '';
    for (const av of dsa.Availabilities || []) {
      if (!(av.Actions || []).includes('Purchase')) continue;
      const pr = av.OrderManagementData && av.OrderManagementData.Price;
      if (!pr || !(pr.ListPrice > 0) || !pr.CurrencyCode) continue;
      cands.push({
        title,
        skuId,
        list: pr.ListPrice,
        msrp: pr.MSRP > 0 ? pr.MSRP : pr.ListPrice,
        currency: pr.CurrencyCode,
        member: Array.isArray(av.Remediations) && av.Remediations.length > 0
      });
    }
  }
  if (!cands.length) return null;
  const pub = cands.filter((c) => !c.member);
  let pool = pub.length ? pub : cands;
  const want = String(match || '').toLowerCase();
  if (want) {
    pool = pool.filter((c) => c.title.toLowerCase().includes(want));
    // إذا ما لقينا المدة المطلوبة بالاسم، أحسن ما نعرض سعر مدة ثانية بالغلط
    if (!pool.length) return null;
  }
  // الـ SKU صاحب أعلى سعر رسمي (مش عرض الشهر الأول بدولار)، وبعدين أرخص سعر حالي إله (خصم عام)
  const top = pool.slice().sort((a, b) => b.msrp - a.msrp)[0];
  const same = pool.filter((c) => c.skuId === top.skuId && c.msrp === top.msrp);
  const best = same.sort((a, b) => a.list - b.list)[0];
  return {
    amount: best.list,
    currency: best.currency,
    original: best.msrp > best.list ? best.msrp : 0,
    sku: best.title
  };
}

/**
 * items: [{ key, bigId, match }] — بيرجع prices[key][REGION] و names[bigId]
 */
export async function fetchXboxPrices(items, regions, { fetchImpl, wait = sleep, gap = 400 } = {}) {
  const prices = {};
  const names = {};
  const log = { ok: true, markets: {} };
  const byId = new Map();
  for (const it of items) {
    if (!byId.has(it.bigId)) byId.set(it.bigId, []);
    byId.get(it.bigId).push(it);
  }
  const groups = chunk([...byId.keys()], 20);
  for (const r of regions) {
    if (!r.xbox) continue;
    let n = 0;
    try {
      for (const ids of groups) {
        let j;
        try {
          j = await request(
            `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${ids.join(',')}&market=${r.xbox}&languages=en-us`,
            { fetchImpl, wait }
          );
        } catch (e) {
          if (e.fatal) { log.markets[r.code] = 'السوق مش مدعوم'; n = -1; break; }
          throw e;
        }
        for (const prod of (j && j.Products) || []) {
          const id = prod.ProductId;
          const its = byId.get(id);
          if (!its) continue;
          const lp = prod.LocalizedProperties && prod.LocalizedProperties[0];
          if (lp && lp.ProductTitle && !names[id]) names[id] = lp.ProductTitle;
          for (const it of its) {
            const pick = pickXboxPrice(prod, it.match);
            if (!pick) continue;
            (prices[it.key] = prices[it.key] || {})[r.code] = pick;
            n++;
          }
        }
        await wait(gap);
      }
      if (n >= 0) log.markets[r.code] = n;
    } catch (e) {
      log.markets[r.code] = 'خطأ: ' + (e.message || e);
      log.ok = false;
    }
  }
  return { prices, names, log };
}

function stateOf(raw) {
  const st = extractJSONAfter(raw, '__PRELOADED_STATE__');
  if (!st || !st.core2) throw new Error('ما لقينا بيانات الصفحة بمتجر Xbox');
  return st.core2;
}

const summary = (p) => {
  const pur = (p.specificPrices && p.specificPrices.purchaseable) || [];
  return {
    productId: p.productId,
    title: p.title,
    kind: p.productKind,
    availableOn: p.availableOn || [],
    usPrice: pur.length ? pur[0].listPrice : null
  };
};

/** أول count لعبة من «الأكثر مبيعاً» بمتجر Xbox الأمريكي */
export async function fetchXboxBestSellers({ count = 150, fetchImpl, wait = sleep } = {}) {
  const raw = await request('https://www.xbox.com/en-US/games/browse?orderby=BestSelling', { fetchImpl, wait, as: 'text' });
  const core = stateOf(raw);
  const chans = core.channels && core.channels.channelData;
  const key = chans && Object.keys(chans).find((k) => k.startsWith('BROWSE'));
  if (!key) throw new Error('ما لقينا قائمة الأكثر مبيعاً');
  const ps = (core.products && core.products.productSummaries) || {};
  const out = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || !p.productId || seen.has(p.productId)) return;
    seen.add(p.productId);
    out.push(summary(p));
  };
  for (const p of chans[key].data.products || []) add(ps[p.productId]);
  let token = chans[key].data.encodedCT;
  const filters = Buffer.from(JSON.stringify({ orderby: { id: 'orderby', choices: [{ id: 'BestSelling' }] } })).toString('base64');
  let guard = 0;
  while (token && out.length < count && guard++ < 20) {
    const j = await request('https://emerald.xboxservices.com/xboxcomfd/browse?locale=en-US', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-ms-api-version': '1.1', 'ms-cv': 'wainarkhas00000' + guard + '.1' },
      body: JSON.stringify({ Filters: filters, ReturnFilters: false, ChannelKeyToBeUsedInResponse: key, EncodedCT: token, ChannelId: '' }),
      fetchImpl,
      wait
    });
    const before = out.length;
    for (const p of j.productSummaries || []) add(p);
    const ch = j.channels && j.channels[key];
    const nextToken = ch && (ch.encodedCT || (ch.data && ch.data.encodedCT));
    if (!nextToken || nextToken === token || out.length === before) break;
    token = nextToken;
    await wait(500);
  }
  return out.slice(0, count);
}

/** إضافات لعبة (زي V-Bucks لفورتنايت أو Robux لروبلوكس) من صفحة اللعبة بمتجر Xbox */
export async function fetchXboxAddons(parentId, { fetchImpl, wait = sleep } = {}) {
  const raw = await request(`https://www.xbox.com/en-US/games/store/x/${parentId}`, { fetchImpl, wait, as: 'text' });
  const core = stateOf(raw);
  const chans = (core.channels && core.channels.channelData) || {};
  const key = Object.keys(chans).find((k) => k.startsWith('PRODUCTADDONS_'));
  const ps = (core.products && core.products.productSummaries) || {};
  if (!key || !chans[key].data) return [];
  return (chans[key].data.products || [])
    .map((p) => ps[p.productId])
    .filter(Boolean)
    .map(summary);
}
