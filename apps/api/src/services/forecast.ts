// AI-4 demand/price forecasting and AI-5 reorder suggestions. Statistical (exponential smoothing + seasonal-naive baseline),
// back-tested on a hold-out window; MAPE is stored with every forecast so users can judge reliability.
import { prisma } from '@erp/db';
import { addDays, num, today } from '../core/base';

const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
function ses(series: number[], alpha = 0.4) { let l = series[0] ?? 0; for (const x of series.slice(1)) l = alpha * x + (1 - alpha) * l; return l; }
function mape(actual: number[], pred: number[]) { const pairs = actual.map((a, i) => [a, pred[i]]).filter(([a]) => a > 0); return pairs.length ? (pairs.reduce((s, [a, p]) => s + Math.abs(a - p) / a, 0) / pairs.length) * 100 : 0; }

export function forecastSeries(series: number[]) {
  const holdout = Math.min(3, Math.floor(series.length / 3));
  const train = series.slice(0, series.length - holdout), test = series.slice(series.length - holdout);
  const sesPred = test.map((_, i) => ses(series.slice(0, train.length + i)));
  const naivePred = test.map((_, i) => series[train.length + i - 1] ?? 0);
  const m1 = mape(test, sesPred), m2 = mape(test, naivePred);
  const useSes = holdout === 0 || m1 <= m2;
  return { next: Math.max(0, useSes ? ses(series) : series[series.length - 1] ?? 0), mape: holdout ? (useSes ? m1 : m2) : null, model: useSes ? 'ses' : 'naive', baselineMape: m2 };
}

export async function runForecast(companyId: string, months = 12) {
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - months, 1));
  const rows: any[] = await prisma.$queryRawUnsafe(
    `SELECT il."partId" part, date_trunc('month', i."issueDate") m, SUM(il.qty)::float qty, AVG(il."unitPrice")::float price
     FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" WHERE i."companyId" = $1 AND i."invoiceType" IN ('standard','simplified') AND i.status NOT IN ('draft','rejected','cancelled') AND i."issueDate" >= $2 AND il."partId" IS NOT NULL GROUP BY il."partId", m ORDER BY m`, companyId, start);
  const byPart = new Map<string, { qty: Record<string, number>; price: number[] }>();
  for (const r of rows) { const e = byPart.get(r.part) ?? { qty: {}, price: [] }; e.qty[new Date(r.m).toISOString().slice(0, 7)] = r.qty; e.price.push(r.price); byPart.set(r.part, e); }
  const keys: string[] = []; for (let i = months - 1; i >= 0; i--) { const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1)); keys.push(d.toISOString().slice(0, 7)); }
  const next = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));
  let n = 0;
  for (const [partId, e] of byPart) {
    const series = keys.map((k) => e.qty[k] ?? 0);
    if (series.filter((x) => x > 0).length < 2) continue;
    const f = forecastSeries(series);
    const part = await prisma.part.findUnique({ where: { id: partId }, include: { brand: true, category: true } });
    const slope = e.price.length > 1 ? (e.price[e.price.length - 1] - e.price[0]) / (e.price.length - 1) : 0;
    await prisma.forecast.create({ data: { companyId, partId, brandId: part?.brandId, segment: part?.category?.name ?? 'General', periodStart: next, horizon: 'month', predictedQty: f.next, predictedPrice: Math.max(0, mean(e.price) + slope), mape: f.mape ?? undefined, model: f.model } });
    n++;
  }
  return n;
}

/** AI-5: reorder point = demand over lead time + safety stock (z=1.65 -> ~95% service level) */
export async function suggestReorders(companyId: string) {
  const rules = await prisma.reorderRule.findMany({ where: { companyId, isActive: true } });
  let n = 0;
  for (const r of rules) {
    const sums: any[] = await prisma.$queryRawUnsafe(`SELECT COALESCE(SUM(qty),0)::float q FROM stock_movement WHERE "companyId"=$1 AND "partId"=$2 AND ($3::text IS NULL OR "warehouseId"=$3)`, companyId, r.partId, r.warehouseId);
    const onHand = sums[0].q;
    const hist: any[] = await prisma.$queryRawUnsafe(`SELECT date_trunc('week', "movedAt") w, SUM(-qty)::float q FROM stock_movement WHERE "companyId"=$1 AND "partId"=$2 AND kind IN ('sale','issue') AND "movedAt" > now() - interval '26 weeks' GROUP BY w ORDER BY w`, companyId, r.partId);
    const weekly = hist.map((h) => h.q);
    const avg = mean(weekly), sd = Math.sqrt(mean(weekly.map((x) => (x - avg) ** 2)));
    const lead = Math.max(1, (r.leadTimeDays ?? 7) / 7);
    const rop = Math.ceil(avg * lead + 1.65 * sd * Math.sqrt(lead));
    if (r.source === 'ai' && weekly.length >= 2) await prisma.reorderRule.update({ where: { id: r.id }, data: { minQty: rop, maxQty: Math.max(num(r.maxQty), rop * 2) } });
    const min = r.source === 'ai' ? rop : num(r.minQty);
    if (onHand <= min) {
      const exists = await prisma.reorderSuggestion.findFirst({ where: { companyId, partId: r.partId, warehouseId: r.warehouseId, status: 'open' } });
      if (!exists) { await prisma.reorderSuggestion.create({ data: { companyId, partId: r.partId, warehouseId: r.warehouseId, suggestedQty: Math.max(1, num(r.reorderQty) || num(r.maxQty) - onHand), reason: `On hand ${onHand} ≤ reorder point ${min}${weekly.length ? ` (avg ${avg.toFixed(1)}/wk)` : ''}`, aiModel: r.source === 'ai' ? 'rop-ss' : 'rule' } }); n++; }
    }
  }
  return n;
}

/** VEH-03: service reminders from standard intervals (mileage / time) */
export async function generateVehicleReminders(companyId: string) {
  const vehicles = await prisma.vehicle.findMany({ where: { companyId, customerId: { not: null } } });
  const intervals = await prisma.serviceInterval.findMany({ where: { companyId } });
  let n = 0;
  for (const v of vehicles) {
    for (const it of intervals) {
      if (it.make && it.make.toLowerCase() !== (v.make ?? '').toLowerCase()) continue;
      if (it.model && it.model.toLowerCase() !== (v.model ?? '').toLowerCase()) continue;
      const last = await prisma.jobCard.findFirst({ where: { vehicleId: v.id, status: 'invoiced', JobCardLine_jobCardId: { some: { description: { contains: it.serviceName.split(' ')[0], mode: 'insensitive' } } } } as any, orderBy: { createdAt: 'desc' } });
      const lastDate = last?.createdAt ?? v.createdAt;
      const lastKm = last?.mileageIn ?? 0;
      const dueDate = it.everyMonths ? addDays(lastDate, it.everyMonths * 30) : null;
      const dueMileage = it.everyKm ? lastKm + it.everyKm : null;
      const byTime = dueDate && dueDate <= addDays(today(), 30);
      const byKm = dueMileage && (v.mileage ?? 0) >= dueMileage - 1000;
      if (!byTime && !byKm) continue;
      const exists = await prisma.vehicleReminder.findFirst({ where: { vehicleId: v.id, serviceName: it.serviceName, status: { in: ['upcoming', 'sent'] } } });
      if (exists) continue;
      await prisma.vehicleReminder.create({ data: { companyId, vehicleId: v.id, customerId: v.customerId, serviceName: it.serviceName, dueDate: dueDate ?? undefined, dueMileage: dueMileage ?? undefined } });
      n++;
    }
  }
  return n;
}
