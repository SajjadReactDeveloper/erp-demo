import { Tx } from '@erp/db';
import { D, getSetting, num, r2 } from '../core/base';

export interface RuleCtx { tier?: string | null; categoryId?: string | null; brandId?: string | null; supplierId?: string | null; urgency?: string | null; date?: Date }

/** MDM-06: most specific active rule wins; ties -> latest effective_from. Specificity = 16*tier + 8*supplier + 4*brand + 2*category + 1*urgency */
export async function selectRule(tx: Tx, companyId: string, c: RuleCtx) {
  const date = c.date ?? new Date();
  const rules = await tx.priceRule.findMany({ where: { companyId, isActive: true } });
  let best: any = null, bestScore = -1;
  for (const r of rules) {
    if (r.effectiveFrom && r.effectiveFrom > date) continue;
    if (r.effectiveTo && r.effectiveTo < date) continue;
    if (r.customerTier && r.customerTier !== c.tier) continue;
    if (r.supplierId && r.supplierId !== c.supplierId) continue;
    if (r.brandId && r.brandId !== c.brandId) continue;
    if (r.categoryId && r.categoryId !== c.categoryId) continue;
    if (r.urgency && r.urgency !== 'any' && r.urgency !== c.urgency) continue;
    const score = (r.customerTier ? 16 : 0) + (r.supplierId ? 8 : 0) + (r.brandId ? 4 : 0) + (r.categoryId ? 2 : 0) + (r.urgency && r.urgency !== 'any' ? 1 : 0);
    const eff = r.effectiveFrom?.getTime() ?? 0;
    if (score > bestScore || (score === bestScore && eff > (best?.effectiveFrom?.getTime() ?? 0))) { best = r; bestScore = score; }
  }
  return best as null | { id: string; targetMarginPct: any; minMarginPct: any; maxMarginPct: any };
}

/** margin on selling price: price = cost / (1 - margin) */
export const priceFromCost = (cost: any, margin: any) => r2(D(cost).div(D(1).minus(D(margin))));
export const marginOf = (price: any, cost: any) => (D(price).isZero() ? D(0) : D(price).minus(D(cost)).div(D(price)));

/** BR-4: min-max normalised weighted score. quotes: [{id, price, leadDays, rating, warrantyMonths, available}] */
export async function bestValue(companyId: string, quotes: { id: string; price: number; leadDays: number; rating: number; warrantyMonths?: number }[]) {
  const w = await getSetting<any>(companyId, 'bestvalue.weights', { price: 0.5, lead: 0.25, rating: 0.15, warranty: 0.1 });
  const mm = (vals: number[]) => { const min = Math.min(...vals), max = Math.max(...vals); return (v: number) => (max === min ? 0 : (v - min) / (max - min)); };
  const np = mm(quotes.map((q) => q.price)), nl = mm(quotes.map((q) => q.leadDays)), nr = mm(quotes.map((q) => q.rating)), nw = mm(quotes.map((q) => q.warrantyMonths ?? 0));
  const scored = quotes.map((q) => {
    const parts = { price: 1 - np(q.price), lead: 1 - nl(q.leadDays), rating: nr(q.rating), warranty: nw(q.warrantyMonths ?? 0) };
    const score = w.price * parts.price + w.lead * parts.lead + w.rating * parts.rating + w.warranty * parts.warranty;
    return { ...q, score: Math.round(score * 10000) / 10000, parts };
  });
  // ties -> lower price -> shorter lead time
  scored.sort((a, b) => b.score - a.score || a.price - b.price || a.leadDays - b.leadDays);
  return scored;
}

export const lineTotals = (qty: any, unitPrice: any, discountPct: any, vatPct: any) => {
  const gross = D(qty).mul(D(unitPrice));
  const net = gross.mul(D(1).minus(D(discountPct ?? 0).div(100)));
  const vat = net.mul(D(vatPct ?? 0).div(100));
  return { net: r2(net), vat: r2(vat), total: r2(net.plus(vat)) };
};

export const warrantyMonths = (s?: string | null) => { const m = /(\d+)\s*(month|m|year|y|شهر|سنة)/i.exec(s ?? ''); if (!m) return 0; return /y|سنة/i.test(m[2]) ? Number(m[1]) * 12 : Number(m[1]); };
export { num };
