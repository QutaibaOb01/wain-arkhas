// أسعار الصرف لكل عملات العالم مقابل الدولار.
import { request } from '../lib/util.mjs';

export async function fetchRates({ fetchImpl, wait, now = new Date() } = {}) {
  const fx = await request('https://open.er-api.com/v6/latest/USD', { fetchImpl, wait });
  if (fx.result !== 'success' || !fx.rates) throw new Error('رد غير متوقع من مزوّد أسعار الصرف');
  const rates = {};
  for (const [code, v] of Object.entries(fx.rates)) {
    if (/^[A-Z]{3}$/.test(code) && typeof v === 'number' && v > 0) rates[code] = v;
  }
  rates.USD = 1;
  if (Object.keys(rates).length < 50) throw new Error('عدد العملات قليل بشكل غريب');
  return { base: 'USD', updated: now.toISOString(), provider: 'open.er-api.com', approximate: false, rates };
}
