// أدوات مشتركة لسكربت تحديث الأسعار: طلبات الشبكة، تحليل الأسعار المكتوبة كنص، وتوحيد أسماء الألعاب.

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/**
 * طلب HTTP مع إعادة المحاولة. أخطاء 4xx (غير 429) نهائية وما بنعيدها.
 * as: 'json' | 'text'
 */
export async function request(url, opts = {}) {
  const {
    method = 'GET',
    headers = {},
    body,
    tries = 3,
    timeout = 30000,
    fetchImpl = fetch,
    wait = sleep,
    as = 'json'
  } = opts;
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const res = await fetchImpl(url, {
        method,
        headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9', ...headers },
        body,
        signal: ctrl ? ctrl.signal : undefined
      });
      if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
      if (!res.ok) {
        const err = new Error('HTTP ' + res.status);
        err.fatal = true;
        err.status = res.status;
        throw err;
      }
      return as === 'text' ? await res.text() : await res.json();
    } catch (e) {
      lastErr = e;
      if (e.fatal || i === tries) break;
      await wait(1500 * i);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  throw lastErr;
}

/** ينفّذ fn على كل عنصر، بحد أقصى n بنفس الوقت، ومع مهلة بين الطلبات لكل عامل. */
export async function pool(items, n, fn, { gap = 0, wait = sleep } = {}) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(n, items.length)) }, async () => {
    while (next < items.length) {
      const k = next++;
      out[k] = await fn(items[k], k);
      if (gap) await wait(gap);
    }
  });
  await Promise.all(workers);
  return out;
}

export const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

export const todayISO = (now = new Date()) => now.toISOString().slice(0, 10);

/**
 * بيحوّل سعر مكتوب كنص لرقم، بغض النظر عن طريقة الكتابة بكل بلد:
 * "4.999,00 TL" ، "UAH 4 299,00" ، "Rs 7,499" ، "29.000đ" ، "R$ 5,00" ، "Rp 16ribu" ، "US$99.99"
 */
export function parseAmount(text) {
  if (text == null) return null;
  const s = String(text)
    .toLowerCase()
    .replace(/[    ]/g, ' ')
    .replace(/[‎‏؜]/g, '');
  let mult = 1;
  if (/\d\s*(ribu|rb)\b/.test(s)) mult = 1e3;
  else if (/\d\s*(juta|jt)\b/.test(s)) mult = 1e6;
  const m = s.match(/\d[\d.,' ]*/);
  if (!m) return null;
  let num = m[0].replace(/[' ]+/g, '').replace(/[.,]+$/, '');
  const last = Math.max(num.lastIndexOf('.'), num.lastIndexOf(','));
  if (last >= 0) {
    const decimals = num.length - last - 1;
    if (decimals === 3 && /^\d{1,3}([.,]\d{3})+$/.test(num)) {
      num = num.replace(/[.,]/g, '');
    } else {
      num = num.slice(0, last).replace(/[.,]/g, '') + '.' + num.slice(last + 1);
    }
  }
  const v = parseFloat(num);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * mult * 100) / 100;
}

// رموز عملات واضحة (مش محتملة لأكثر من عملة). "$" و"Rs" و"R" مبهمة فما بنعتمد عليها.
const CLEAR_SYMBOLS = [
  ['us$', 'USD'], ['usd', 'USD'], ['hk$', 'HKD'], ['r$', 'BRL'], ['₺', 'TRY'], [' tl', 'TRY'],
  ['₹', 'INR'], ['zł', 'PLN'], [' zl', 'PLN'], ['₴', 'UAH'], ['uah', 'UAH'], ['sar', 'SAR'],
  ['aed', 'AED'], ['egp', 'EGP'], ['kwd', 'KWD'], ['jod', 'JOD'], ['₫', 'VND'], ['₦', 'NGN'],
  ['₸', 'KZT'], ['rp', 'IDR'], ['¥', 'JPY'], ['£', 'GBP'], ['€', 'EUR'], ['mxn', 'MXN'], ['zar', 'ZAR']
];

/** بيرجع رمز العملة إذا كان واضح بالنص، وإلا null */
export function detectCurrency(text) {
  const s = ' ' + String(text || '').toLowerCase() + ' ';
  for (const [sym, code] of CLEAR_SYMBOLS) if (s.includes(sym)) return code;
  return null;
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
export const decodeEntities = (s) =>
  String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** بيلاقي أول object بعد علامة معيّنة بالنص (زي window.__STATE__ = {...}) وبيرجعه كـ JSON */
export function extractJSONAfter(raw, marker, from = 0) {
  const i = raw.indexOf(marker, from);
  if (i < 0) return null;
  const s = raw.indexOf('{', i);
  if (s < 0) return null;
  const end = matchBrace(raw, s);
  if (end < 0) return null;
  try {
    return JSON.parse(raw.slice(s, end + 1));
  } catch {
    return null;
  }
}

/** بيرجع موقع القوس اللي بيسكّر القوس اللي عند start (مع تجاهل النصوص) */
export function matchBrace(raw, start) {
  let depth = 0;
  for (let j = start; j < raw.length; j++) {
    const ch = raw[j];
    if (ch === '"') {
      j++;
      while (j < raw.length && raw[j] !== '"') {
        if (raw[j] === '\\') j++;
        j++;
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return j;
    }
  }
  return -1;
}

const EDITION_WORDS =
  '(standard|deluxe|digital deluxe|ultimate|gold|premium|vault|cross-gen|definitive|complete|enhanced|game of the year|goty|director\'?s cut|special|collector\'?s|launch|legendary|champions|anniversary|day one|super deluxe|digital|ultimate digital)';
const EDITION_RE = new RegExp('\\s*[-–—:]?\\s*\\(?' + EDITION_WORDS + '\\s+(edition|bundle)\\)?\\s*$', 'i');

/** اسم موحّد للعبة لنقارن نفس اللعبة بين بلايستيشن وإكس بوكس وستيم */
export function baseTitle(name) {
  let s = String(name || '')
    .replace(/[™®©]/g, '')
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  s = s.replace(/\s*\((windows|pc|ps4|ps5|ps4 & ps5|ps4 and ps5|playstation ?[45]|playstation ?4 (?:&|and) playstation ?5|xbox series x\|s|xbox one|xbox)\)\s*$/i, '');
  s = s.replace(/\s*(for|-)\s*(xbox series x\|s|xbox one|ps5|ps4)\s*$/i, '');
  s = s.replace(/\s+(ps4\s*(?:&|and)\s*ps5|ps5|ps4)\s*$/i, '');
  for (let k = 0; k < 2; k++) s = s.replace(EDITION_RE, '');
  s = s.replace(/\s*[-–—:]\s*$/, '').trim();
  return s;
}

export function titleKey(name) {
  return baseTitle(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const slug = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'x';
