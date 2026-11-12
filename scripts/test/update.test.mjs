// اختبارات سكربت التحديث: node --test scripts/test
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAmount, detectCurrency, baseTitle, titleKey, decodeEntities } from '../lib/util.mjs';
import { parseAppleIaps, labelFrom, packageKey } from '../sources/apple.mjs';
import { parsePsPlusPage, pickPsPrice, scaledValue, headerLocale } from '../sources/playstation.mjs';
import { pickXboxPrice } from '../sources/xbox.mjs';
import { main, mergeServices, editionLabel } from '../update.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('parseAmount: كل صيغ كتابة الأسعار', () => {
  const cases = {
    '4.999,00 TL': 4999, 'UAH 4 299,00': 4299, 'Rs 7,499': 7499, 'R$549,90': 549.9, '429,00 zl': 429,
    '263.86 SAR': 263.86, 'HK$708.00': 708, '¥12,280': 12280, 'US$99.99': 99.99, '$69.99': 69.99,
    '29.000đ': 29000, '119.000đ': 119000, 'Rp 16ribu': 16000, '₺1.149,99': 1149.99, '0,99 USD': 0.99,
    'R 1,109.00': 1109, '₦ 2,300.00': 2300, '499.00₸': 499, 'R$ 5,00': 5, '₹ 99': 99, 'EGP 49.99': 49.99,
    'UAH 1 299,00': 1299, 'Rs 5,139': 5139, '£4.99': 4.99, 'Free': null, '': null
  };
  for (const [s, v] of Object.entries(cases)) assert.equal(parseAmount(s), v, s);
});

test('detectCurrency: الرموز الواضحة بس', () => {
  assert.equal(detectCurrency('4.999,00 TL'), 'TRY');
  assert.equal(detectCurrency('US$8.99'), 'USD');
  assert.equal(detectCurrency('R$49,90'), 'BRL');
  assert.equal(detectCurrency('41,00 zl'), 'PLN');
  assert.equal(detectCurrency('Rp 16ribu'), 'IDR');
  assert.equal(detectCurrency('$8.99'), null);
  assert.equal(detectCurrency('Rs 649'), null);
  assert.equal(detectCurrency('R 149.00'), null);
});

test('baseTitle/titleKey: نفس اللعبة بين المنصات', () => {
  assert.equal(baseTitle('Grand Theft Auto VI: Ultimate Edition'), 'Grand Theft Auto VI');
  assert.equal(baseTitle('Call of Duty®: Modern Warfare® 4 - Vault Edition (Windows)'), 'Call of Duty: Modern Warfare 4');
  assert.equal(baseTitle('Grand Theft Auto V (PlayStation®5)'), 'Grand Theft Auto V');
  assert.equal(baseTitle('Forza Horizon 6 Standard Edition'), 'Forza Horizon 6');
  assert.equal(baseTitle('EA SPORTS FC™ 27 Standard Edition PS4 & PS5'), 'EA SPORTS FC 27');
  assert.equal(titleKey('Marvel’s Spider-Man Remastered'), titleKey("Marvel's Spider-Man Remastered"));
  assert.equal(titleKey('ELDEN RING'), titleKey('Elden Ring'));
  assert.notEqual(titleKey('Minecraft'), titleKey('Minecraft Legends'));
  assert.equal(editionLabel('Grand Theft Auto VI: Ultimate Edition', 'Grand Theft Auto VI'), 'Ultimate Edition');
  assert.equal(editionLabel('Cyberpunk 2077', 'Cyberpunk 2077'), 'النسخة العادية');
  const cases = {
    'Grand Theft Auto V (Xbox One & Xbox Series X|S)': 'Grand Theft Auto V',
    'FINAL FANTASY XIV Online - Starter Edition': 'FINAL FANTASY XIV Online',
    'Rust Console Edition': 'Rust',
    'The Elder Scrolls V: Skyrim Special Edition - PS5 & PS4': 'The Elder Scrolls V: Skyrim',
    'Call of Duty®: Black Ops III - Zombies Chronicles Edition': 'Call of Duty: Black Ops III',
    'Sea of Thieves: 2026 Edition': 'Sea of Thieves',
    'Dying Light 2 Stay Human: Reloaded Edition': 'Dying Light 2 Stay Human',
    'Sekiro™: Shadows Die Twice - GOTY Edition': 'Sekiro: Shadows Die Twice',
    "Ghost of Tsushima DIRECTOR'S CUT": 'Ghost of Tsushima',
    'Grand Theft Auto VI Ultimate Edition': 'Grand Theft Auto VI',
    'Minecraft: Bedrock Edition': 'Minecraft',
    'Marvel’s Spider-Man Remastered': "Marvel's Spider-Man Remastered",
    'Clair Obscur: Expedition 33': 'Clair Obscur: Expedition 33',
    'Call of Duty®: Modern Warfare® 4 for PS5': 'Call of Duty: Modern Warfare 4'
  };
  for (const [a, b] of Object.entries(cases)) assert.equal(baseTitle(a), b, a);
  assert.equal(editionLabel('EA SPORTS FC™ 27 Standard Edition PS4 & PS5', 'EA SPORTS FC 27'), 'Standard Edition');
  assert.equal(editionLabel('Grand Theft Auto V (PlayStation®5)', 'Grand Theft Auto V'), 'النسخة العادية');
});

test('App Store: قراءة قائمة المشتريات وتوحيد الأرقام', () => {
  const html = '<ul><li class="svelte-1gyt6l2"><div class="text-pair svelte-1gyt6l2"><span>Snapchat+ Monthly Plan</span> <span>29.000đ</span> </div> </li>' +
    '<li class="svelte-1gyt6l2"><div class="text-pair svelte-1gyt6l2"><span>Movies &amp; Shows</span> <span>$3.99</span></div></li>' +
    '<li><div class="text-pair x"><span>1,000 Diamonds</span><span>₺1.119,99</span></div></li></ul>';
  const items = parseAppleIaps(html);
  assert.deepEqual(items, [
    { name: 'Snapchat+ Monthly Plan', price: '29.000đ' },
    { name: 'Movies & Shows', price: '$3.99' },
    { name: '1,000 Diamonds', price: '₺1.119,99' }
  ]);
  const m = '1,000 Diamonds'.match(/^([\d,]+) Diamonds$/);
  assert.deepEqual(labelFrom('{1} جوهرة', m), { label: '1,000 جوهرة', num: 1000, word: null });
  assert.equal(packageKey({ id: 'diamonds' }, 0, { num: 1000 }), 'diamonds-1000');
  assert.equal(packageKey({ id: 'cp' }, 0, labelFrom('{1} Pack', 'COD Points - Extra Small Pack'.match(/- (Extra Small|Medium) Pack$/))), 'cp-extra-small');
  assert.equal(packageKey({}, 2, { num: null, word: null }), 'i2');
  assert.equal(decodeEntities('A &amp; B &#39;x&#39;'), "A & B 'x'");
});

test('PS Plus: قراءة الأسعار من صفحة playstation.com', () => {
  const raw = 'x"Product:IP9102-PPSA06902_00-PLUS1T01M0000000":{"id":"IP9102-PPSA06902_00-PLUS1T01M0000000","__typename":"Product","name":"PlayStation Plus Essential: 1 Month Subscription","price":{"basePrice":"400,00 TL","discountedPrice":"400,00 TL","isExclusive":false}},' +
    '"Product:IP9102-PPSA06902_00-PLUS3T12M0000000":{"id":"z","name":"PlayStation Plus Deluxe: 12 Month Subscription","price":{"basePrice":"5.560,00 TL","discountedPrice":"4.448,00 TL"}}';
  const out = parsePsPlusPage(raw);
  assert.equal(out['essential-1m'].base, '400,00 TL');
  assert.equal(out['premium-12m'].disc, '4.448,00 TL');
  assert.equal(headerLocale('en-tr'), 'en-TR');
});

test('PlayStation: السعر العام مش سعر أعضاء بلس، والقيمة بالسنتات أو كاملة', () => {
  assert.equal(scaledValue(6999, '$69.99'), 69.99);
  assert.equal(scaledValue(5999, 'Rs 5,999'), 5999);
  assert.equal(scaledValue(499900, '4.999,00 TL'), 4999);
  const p = pickPsPrice([
    { type: 'DOWNLOAD_TRIAL', price: { basePriceValue: 0, currencyCode: 'USD', basePrice: 'Free', isFree: true } },
    { type: 'UPSELL_PS_PLUS_DISCOUNT', price: { basePriceValue: 6999, discountedValue: 4999, currencyCode: 'USD', basePrice: '$69.99', discountedPrice: '$49.99', isExclusive: true } },
    { type: 'ADD_TO_CART', price: { basePriceValue: 6999, discountedValue: 5999, currencyCode: 'USD', basePrice: '$69.99', discountedPrice: '$59.99', isExclusive: false } }
  ]);
  assert.deepEqual(p, { amount: 59.99, currency: 'USD', original: 69.99 });
});

test('Xbox: سعر الشهر العادي مش عرض الدولار ولا سعر الأعضاء', () => {
  const prod = {
    DisplaySkuAvailabilities: [
      { Sku: { SkuId: '0014', LocalizedProperties: [{ SkuTitle: '14 Day Trial Recurs Monthly' }] }, Availabilities: [{ Actions: ['Purchase'], OrderManagementData: { Price: { ListPrice: 1, MSRP: 22.99, CurrencyCode: 'USD' } } }] },
      { Sku: { SkuId: '0007', LocalizedProperties: [{ SkuTitle: 'Xbox Game Pass Ultimate 1 Month' }] }, Availabilities: [
        { Actions: ['Purchase'], OrderManagementData: { Price: { ListPrice: 22.99, MSRP: 22.99, CurrencyCode: 'USD' } } },
        { Actions: ['Purchase'], Remediations: [{ Type: 'Standard' }], OrderManagementData: { Price: { ListPrice: 15.99, MSRP: 22.99, CurrencyCode: 'USD' } } }
      ] }
    ]
  };
  assert.deepEqual(pickXboxPrice(prod, '1 month'), { amount: 22.99, currency: 'USD', original: 0, sku: 'Xbox Game Pass Ultimate 1 Month' });
  assert.equal(pickXboxPrice(prod, '12 month'), null);
});

test('الدمج: السعر القديم بينحفظ 10 أيام وبعدها بينشال', () => {
  const now = new Date('2026-11-20T03:00:00Z');
  const prev = [{ id: 'a', type: 'sub', name: 'A', offers: { psn: { packages: [{ id: 'p', label: 'P', prices: { US: [1, 'USD', 0, '2026-11-15'], TR: [2, 'TRY', 0, '2026-11-01'] } }] } } }];
  const next = [{ id: 'a', type: 'sub', name: 'A', offers: { psn: { packages: [{ id: 'p', label: 'P', prices: { BR: [3, 'BRL', 0, '2026-11-20'] } }] } } }];
  const out = mergeServices(prev, next, now);
  assert.deepEqual(Object.keys(out[0].offers.psn.packages[0].prices).sort(), ['BR', 'US']);
  const gone = mergeServices([{ id: 'old', type: 'game', name: 'Old', offers: { steam: { packages: [{ id: 'base', label: 'x', prices: { US: [1, 'USD', 0, '2026-10-01'] } }] } } }], [], now);
  assert.equal(gone.length, 0);
});

/* ===== تشغيل كامل بمصادر وهمية ===== */
function mockFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push(url);
    for (const [re, handler] of routes) {
      if (re.test(url)) {
        const r = await handler(url, init);
        if (r && r.status) return { ok: r.status < 400, status: r.status, json: async () => r.body, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body)) };
        return { ok: true, status: 200, json: async () => r, text: async () => (typeof r === 'string' ? r : JSON.stringify(r)) };
      }
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  fn.calls = calls;
  return fn;
}

async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), 'wa-'));
  await mkdir(path.join(dir, 'data'));
  for (const f of ['regions.json', 'sources.json']) await copyFile(path.join(ROOT, 'data', f), path.join(dir, 'data', f));
  return dir;
}

const xbState = (obj) => `<html><script>window.__PRELOADED_STATE__ = ${JSON.stringify(obj)};</script></html>`;

test('تشغيل كامل: كل المصادر بتنجمع بملف واحد', async () => {
  const dir = await sandbox();
  const rates = { result: 'success', rates: Object.fromEntries(['USD', 'TRY', 'INR', 'BRL', 'PLN', 'UAH', 'SAR', 'AED', 'EGP', 'VND', 'PKR', 'NGN', 'IDR', 'KZT', 'HKD', 'JPY', 'ZAR', 'MXN', 'GBP', 'KWD', 'JOD'].concat(Array.from({ length: 40 }, (_, i) => 'X' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26)))).map((c, i) => [c, c === 'USD' ? 1 : 2 + i])) };
  const conceptName = 'Grand Theft Auto VI: Ultimate Edition';
  const fetchImpl = mockFetch([
    [/open\.er-api/, () => rates],
    [/featuredcategories/, () => ({ top_sellers: { items: [{ id: 1245620, type: 0, name: 'ELDEN RING' }] } })],
    [/appdetails\?appids=\d+&cc=us&l=english&filters=basic/, (u) => { const id = u.match(/appids=(\d+)/)[1]; return { [id]: { success: true, data: { name: 'Game ' + id } } }; }],
    [/appdetails\?appids=.*filters=price_overview/, (u) => {
      const ids = u.match(/appids=([\d,]+)/)[1].split(',');
      const cc = u.match(/cc=(\w+)/)[1];
      if (cc !== 'us' && cc !== 'tr') return {};
      return Object.fromEntries(ids.map((id) => [id, { success: true, data: { price_overview: { final: cc === 'us' ? 5999 : 3999, initial: 5999, currency: 'USD' } } }]));
    }],
    [/categoryGridRetrieve/, () => ({ data: { categoryGridRetrieve: { pageInfo: { isLast: true }, concepts: [{ id: '10000730', name: 'Grand Theft Auto VI', price: { isFree: false } }, { id: '228748', name: 'Fortnite', price: { isFree: true } }] } } })],
    [/conceptRetrieveForCtasWithPrice/, (u, init) => {
      const loc = init.headers['x-psn-store-locale-override'];
      const map = { 'en-US': [9999, 'USD', '$99.99', 'UP1004-PPSA01547_00-GTAVIULTIMATE001'], 'en-TR': [499900, 'TRY', '4.999,00 TL', 'EP1004-PPSA01547_00-GTAVIULTIMATE001'], 'en-IN': [5999, 'INR', 'Rs 5,999', 'EP1004-PPSA01547_00-GTAVISTANDARD001'] };
      const v = map[loc];
      if (!v) return { data: { conceptRetrieve: null } };
      return { data: { conceptRetrieve: { defaultProduct: { id: v[3], name: conceptName, webctas: [{ type: 'ADD_TO_CART', price: { basePriceValue: v[0], discountedValue: v[0], currencyCode: v[1], basePrice: v[2], discountedPrice: v[2] } }] } } } };
    }],
    [/playstation\.com\/en-us\/ps-plus/, () => '"Product:IP9101-PPSA06916_00-PLUS1T01M0000000":{"name":"PlayStation Plus Essential: 1 Month Subscription","price":{"basePrice":"$10.99","discountedPrice":"$10.99"}}'],
    [/playstation\.com\/uk-ua\/ps-plus/, () => '"Product:IP9102-PPSA06902_00-PLUS1T01M0000000":{"name":"x","price":{"basePrice":"UAH 209,00","discountedPrice":"UAH 209,00"}}'],
    [/playstation\.com\/.*ps-plus/, () => ({ status: 403, body: 'blocked' })],
    [/xbox\.com\/en-US\/games\/browse/, () => xbState({ core2: { channels: { channelData: { 'BROWSE_CHANNELID=_FILTERS=ORDERBY=BESTSELLING': { data: { products: [{ productId: 'GTA6U' }, { productId: 'GTA6' }, { productId: 'FN' }], encodedCT: null } } } }, products: { productSummaries: {
      GTA6U: { productId: 'GTA6U', title: 'Grand Theft Auto VI: Ultimate Edition', productKind: 'Game', availableOn: ['XboxSeriesX'], specificPrices: { purchaseable: [{ listPrice: 99.99 }] } },
      GTA6: { productId: 'GTA6', title: 'Grand Theft Auto VI', productKind: 'Game', availableOn: ['XboxSeriesX'], specificPrices: { purchaseable: [{ listPrice: 79.99 }] } },
      FN: { productId: 'FN', title: 'Fortnite', productKind: 'Game', availableOn: ['XboxSeriesX'], specificPrices: { purchaseable: [{ listPrice: 0 }] } }
    } } } })],
    [/xbox\.com\/en-US\/games\/store\/x\/BT5P2X999VH2/, () => xbState({ core2: { channels: { channelData: { PRODUCTADDONS_BT5P2X999VH2: { data: { products: [{ productId: 'VB800' }, { productId: 'PACK' }] } } } }, products: { productSummaries: {
      VB800: { productId: 'VB800', title: 'Fortnite - 800 V-Bucks', specificPrices: { purchaseable: [{ listPrice: 8.99 }] } },
      PACK: { productId: 'PACK', title: 'Fortnite - Some Pack', specificPrices: { purchaseable: [{ listPrice: 4.99 }] } }
    } } } })],
    [/xbox\.com\/en-US\/games\/store\/x\//, () => ({ status: 404, body: '' })],
    [/displaycatalog/, (u) => {
      const ids = u.match(/bigIds=([^&]+)/)[1].split(',');
      const market = u.match(/market=(\w+)/)[1];
      if (!['US', 'TR'].includes(market)) return { Products: [] };
      const cur = market === 'US' ? 'USD' : 'TRY';
      const price = { GTA6: [79.99, 2999], VB800: [8.99, 249], CFQ7TTC0KHS0: [22.99, 529] };
      return { Products: ids.filter((id) => price[id]).map((id) => ({ ProductId: id, LocalizedProperties: [{ ProductTitle: id }], DisplaySkuAvailabilities: [{ Sku: { SkuId: '0010', LocalizedProperties: [{ SkuTitle: id === 'CFQ7TTC0KHS0' ? 'Xbox Game Pass Ultimate 1 Month' : 'Full' }] }, Availabilities: [{ Actions: ['Purchase'], OrderManagementData: { Price: { ListPrice: price[id][market === 'US' ? 0 : 1], MSRP: price[id][market === 'US' ? 0 : 1], CurrencyCode: cur } } }] }] })) };
    }],
    [/apps\.apple\.com\/vn\/app\/id447188370/, () => '<div class="text-pair a"><span>Snapchat+ (Monthly Plan)</span> <span>29.000đ</span></div><div class="text-pair a"><span>Snapchat+ Monthly Plan</span> <span>49.000đ</span></div>'],
    [/apps\.apple\.com\/tr\/app\/id1330123889/, () => '<div class="text-pair a"><span>60 Unknown Cash</span> <span>₺45,99</span></div><div class="text-pair a"><span>ig.yiyuan1</span> <span>₺11,99</span></div>'],
    [/apps\.apple\.com\/us\/app\/id1330123889/, () => '<div class="text-pair a"><span>60 Unknown Cash</span> <span>$0.99</span></div>'],
    [/apps\.apple\.com/, () => ({ status: 404, body: '' })]
  ]);
  const { status, list } = await main({ fetchImpl, wait: async () => {}, now: new Date('2026-11-12T03:17:00Z'), root: dir, limits: { ps: 5, xbox: 5 }, quiet: true });
  const byId = Object.fromEntries(list.map((s) => [s.id, s]));

  // PS Plus: أوكرانيا 209 (مش 299)، والدولة اللي انحجبت ما إلها سعر
  const plus = byId['ps-plus'].offers.psn;
  const ess = plus.packages.find((p) => p.id === 'essential-1m');
  assert.deepEqual(ess.prices.UA, [209, 'UAH', 0, '2026-11-12']);
  assert.deepEqual(ess.prices.US, [10.99, 'USD', 0, '2026-11-12']);
  assert.equal(plus.def, 'essential-1m');
  assert.equal(status.sources.psplus.ok, false);

  // GTA VI: بلايستيشن (Ultimate، والهند انشالت لأن نسختها مختلفة) + إكس بوكس (أرخص نسخة)
  const gta = byId['grand-theft-auto-vi'];
  assert.ok(gta, 'لعبة GTA VI موجودة');
  assert.equal(gta.type, 'game');
  assert.deepEqual(Object.keys(gta.offers.psn.packages[0].prices).sort(), ['TR', 'US']);
  assert.equal(gta.offers.psn.packages[0].label, 'Ultimate Edition');
  assert.equal(gta.offers.psn.packages[0].ref, '10000730');
  assert.deepEqual(gta.offers.psn.packages[0].prices.TR, [4999, 'TRY', 0, '2026-11-12']);
  assert.equal(status.sources['ps-games'].mismatched, 1);
  assert.equal(gta.offers.xbox.packages[0].ref, 'GTA6');
  assert.deepEqual(gta.offers.xbox.packages[0].prices.TR, [2999, 'TRY', 0, '2026-11-12']);

  // V-Bucks من إضافات فورتنايت، والحزمة اللي مش V-Bucks ما بتنحسب
  const vb = byId['fortnite-vbucks'].offers.xbox.packages;
  assert.equal(vb.length, 1);
  assert.equal(vb[0].label, '800 V-Bucks');
  assert.equal(vb[0].id, 'vbucks-800');
  assert.equal(vb[0].num, 800);
  assert.deepEqual(vb[0].prices.US, [8.99, 'USD', 0, '2026-11-12']);

  // Game Pass
  assert.deepEqual(byId['game-pass'].offers.xbox.packages.find((p) => p.id === 'ultimate-1m').prices.TR, [529, 'TRY', 0, '2026-11-12']);

  // آبل: أرخص سعر لنفس الباقة، والشدات بالليرة والدولار
  const snap = byId['snapchat-plus'].offers.apple;
  assert.equal(snap.def, 'monthly');
  assert.deepEqual(snap.packages.find((p) => p.id === 'monthly').prices.VN, [29000, 'VND', 0, '2026-11-12']);
  const uc = byId['pubg-uc'].offers.apple.packages.find((p) => p.id === 'uc-60');
  assert.equal(byId['pubg-uc'].offers.apple.def, 'uc-60');
  assert.deepEqual(uc.prices.TR, [45.99, 'TRY', 0, '2026-11-12']);
  assert.deepEqual(uc.prices.US, [0.99, 'USD', 0, '2026-11-12']);

  // ستيم: الأكثر مبيعاً + القائمة الثابتة
  const er = byId['elden-ring'];
  assert.deepEqual(er.offers.steam.packages[0].prices.TR, [39.99, 'USD', 59.99, '2026-11-12']);

  // الملفات انكتبت
  const saved = JSON.parse(await readFile(path.join(dir, 'data', 'prices.json'), 'utf8'));
  assert.equal(saved.services.length, list.length);
  assert.ok(saved.platforms.psn && saved.types.game);
  const ratesSaved = JSON.parse(await readFile(path.join(dir, 'data', 'rates.json'), 'utf8'));
  assert.equal(ratesSaved.rates.USD, 1);
  const cache = JSON.parse(await readFile(path.join(dir, 'data', 'cache.json'), 'utf8'));
  assert.equal(cache.steamNames['553850'], 'Game 553850');

  assert.equal(saved.format, 2);

  // تشغيل تاني والمصادر كلها واقعة: الأسعار بتضل
  const down = mockFetch([[/./, () => ({ status: 503, body: '' })]]);
  const again = await main({ fetchImpl: down, wait: async () => {}, now: new Date('2026-11-13T03:17:00Z'), root: dir, quiet: true });
  assert.equal(again.list.length, list.length);
  const saved2 = JSON.parse(await readFile(path.join(dir, 'data', 'prices.json'), 'utf8'));
  assert.equal(saved2.updated, saved.updated);

  // ملف بصيغة قديمة (معرّفات باقات قديمة) ما بينخلط مع الجديد
  const old = { updated: '2026-11-12T00:00:00Z', services: [{ id: 'pubg-uc', type: 'currency', name: 'PUBG MOBILE UC', offers: { apple: { packages: [{ id: '60-uc', label: '60 UC', prices: { US: [0.99, 'USD', 0, '2026-11-12'] } }] } } }] };
  await writeFile(path.join(dir, 'data', 'prices.json'), JSON.stringify(old));
  const third = await main({ fetchImpl: down, wait: async () => {}, now: new Date('2026-11-13T03:17:00Z'), root: dir, quiet: true });
  assert.equal(third.list.length, 0);
});
