// AI-1 VIN decode + part matching, AI-2 quotation capture, AI-3 business assistant.
// Deterministic-first; an LLM (LLM_BASE_URL / LLM_API_KEY) is used only to re-rank / extract when configured. Humans confirm every suggestion.
import { prisma, Tx } from '@erp/db';
import { can } from '@erp/shared';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { Ctx, getSetting, num } from '../core/base';
import { llm } from '../adapters';
import { findPart, normPN, searchParts } from './catalogue';

// ---------------- AI-1: VIN ----------------
const WMI: Record<string, string> = { JTN: 'Toyota', JT2: 'Toyota', JTD: 'Toyota', JTM: 'Toyota', JTE: 'Toyota', '4T1': 'Toyota', '5TD': 'Toyota', '2T1': 'Toyota', KMH: 'Hyundai', '5NP': 'Hyundai', KNA: 'Kia', KND: 'Kia', '1N4': 'Nissan', JN1: 'Nissan', '3N1': 'Nissan', JN8: 'Nissan', JHM: 'Honda', '1HG': 'Honda', '2HG': 'Honda', '1FA': 'Ford', '1FT': 'Ford', '1FM': 'Ford', '1G1': 'Chevrolet', '1GC': 'Chevrolet', WBA: 'BMW', WDB: 'Mercedes-Benz', WDD: 'Mercedes-Benz', WVW: 'Volkswagen', WAU: 'Audi', JM1: 'Mazda', JS3: 'Suzuki', JMB: 'Mitsubishi', SAL: 'Land Rover', JTH: 'Lexus', JTJ: 'Lexus' };
const YEARS = 'ABCDEFGHJKLMNPRSTVWXY123456789';
const TRANS: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function isVinFormat(vin: string) { return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin); }
export function decodeVin(raw: string) {
  const vin = String(raw ?? '').toUpperCase().trim();
  if (!isVinFormat(vin)) return { valid: false as const, vin, error: 'VIN must be 17 characters (letters except I, O, Q, and digits)' };
  const make = WMI[vin.slice(0, 3)] ?? null;
  const yc = vin[9];
  const idx = YEARS.indexOf(yc);
  let year: number | null = null;
  if (idx >= 0) { year = 2010 + idx; if (/[1-9]/.test(yc)) year = 2001 + Number(yc) - 1; if (year > new Date().getFullYear() + 1) year -= 30; }
  let checksumOk: boolean | null = null;
  if (/^[1-5]/.test(vin)) {
    const sum = [...vin].reduce((s, ch, i) => s + (/\d/.test(ch) ? Number(ch) : TRANS[ch] ?? 0) * WEIGHTS[i], 0);
    const cd = sum % 11 === 10 ? 'X' : String(sum % 11);
    checksumOk = vin[8] === cd;
  }
  return { valid: true as const, vin, make, year, wmi: vin.slice(0, 3), checksumOk, region: /^[1-5]/.test(vin) ? 'North America' : /^[J]/.test(vin) ? 'Japan' : /^[K]/.test(vin) ? 'Korea' : /^[S-Z]/.test(vin) ? 'Europe' : 'Other' };
}

/** Full decode: deterministic + the company's own vehicle register; optional external provider if VIN_PROVIDER_URL is set. */
export async function decodeVinFull(tx: Tx, companyId: string, rawVin: string) {
  const d: any = decodeVin(rawVin);
  if (!d.valid) return d;
  const known = await tx.vehicle.findFirst({ where: { companyId, vin: d.vin } });
  if (known) { d.make = known.make ?? d.make; d.model = known.model; d.year = known.year ?? d.year; d.engine = known.engine; d.source = 'register'; }
  else if (process.env.VIN_PROVIDER_URL) {
    try {
      const j: any = await (await fetch(`${process.env.VIN_PROVIDER_URL}/${d.vin}`, { signal: AbortSignal.timeout(4000) })).json();
      d.make = j.make ?? d.make; d.model = j.model ?? null; d.year = j.year ?? d.year; d.engine = j.engine ?? null; d.source = 'provider';
    } catch { d.source = 'wmi'; }
  } else d.source = 'wmi';
  return d;
}

// ---------------- AI-1: part matching ----------------
export async function suggestParts(tx: Tx, ctx: Ctx, text: string, vehicle?: { make?: string | null; model?: string | null; year?: number | null }, limit = 5) {
  const t0 = Date.now();
  const exact = await findPart(tx, ctx.companyId, text, { fuzzy: 0.95 });
  let cands = await searchParts(tx, ctx.companyId, text, vehicle, limit);
  if (exact && !cands.some((c) => c.id === exact.id)) cands = [{ id: exact.id, score: 1 } as any, ...cands];
  const hasVeh = !!(vehicle?.make || vehicle?.model);
  const scored = cands.map((c) => {
    let conf = Math.min(0.99, c.score + (c.fitBoost ? 0.08 : 0) - (hasVeh && !c.fits ? 0.12 : 0));
    return { ...c, confidence: Math.max(0.05, Math.round(conf * 100) / 100) };
  }).sort((a, b) => b.confidence - a.confidence);
  if (scored.length > 1 && scored[0].confidence - scored[1].confidence < 0.05) scored[0].confidence = Math.max(0.05, Math.round((scored[0].confidence - 0.15) * 100) / 100);
  let reason = scored[0] ? (scored[0].score >= 0.99 ? 'Exact part-number match' : scored[0].fits ? 'Similar description, fits the vehicle' : 'Similar description / number') : 'No candidate found';
  if (scored.length > 1 && llm.enabled()) {
    const r = await llm.json('You re-rank auto-part candidates. Return {"order":[ids...],"reason":"..."} using only the given ids.', JSON.stringify({ request: text, vehicle, candidates: scored.map((s) => ({ id: s.id, partNumber: s.partNumber, name: s.name })) }));
    if (r?.data?.order?.length) { const ord: string[] = r.data.order; scored.sort((a, b) => ord.indexOf(a.id) - ord.indexOf(b.id)); reason = r.data.reason ?? reason; }
  }
  await tx.aiLog.create({ data: { companyId: ctx.companyId, feature: 'part_match', userId: ctx.userId, input: { text, vehicle } as any, output: { top: scored.slice(0, 3).map((s) => ({ id: s.id, c: s.confidence })) } as any, confidence: scored[0]?.confidence ?? 0, latencyMs: Date.now() - t0, model: llm.enabled() ? 'llm+trgm' : 'trgm', promptVersion: 'v1' } });
  return { candidates: scored, reason };
}

/** SAL-02: suggests (never confirms) a part for every unmatched request line. */
export async function matchRequestLines(tx: Tx, ctx: Ctx, requestId: string) {
  const req = await tx.request.findFirst({ where: { id: requestId, companyId: ctx.companyId } });
  if (!req) return { matched: 0, total: 0 };
  let veh: any = req.vehicleId ? await tx.vehicle.findUnique({ where: { id: req.vehicleId } }) : null;
  if (!veh && req.vin) { const d: any = await decodeVinFull(tx, ctx.companyId, req.vin); if (d.valid) veh = { make: d.make, model: d.model, year: d.year }; }
  const minConf = await getSetting<number>(ctx.companyId, 'ai.min_confidence', 0.6);
  const lines = await tx.requestLine.findMany({ where: { requestId, matchStatus: { in: ['unmatched', 'suggested'] } } });
  let matched = 0;
  const out: any[] = [];
  for (const l of lines) {
    const text = l.partNumberText || l.customerText;
    const r = await suggestParts(tx, ctx, text, veh, 3);
    const top = r.candidates[0];
    if (top && top.confidence >= minConf) {
      await tx.requestLine.update({ where: { id: l.id }, data: { partId: top.id, matchStatus: 'suggested', matchConfidence: top.confidence } });
      matched++;
    } else await tx.requestLine.update({ where: { id: l.id }, data: { matchConfidence: top?.confidence ?? 0 } });
    out.push({ lineId: l.id, text, top: top ? { partId: top.id, confidence: top.confidence } : null, alternatives: r.candidates.slice(1).map((c) => ({ partId: c.id, confidence: c.confidence })), lowConfidence: !top || top.confidence < minConf });
  }
  return { matched, total: lines.length, lines: out, vehicle: veh ? { make: veh.make, model: veh.model, year: veh.year } : null };
}

// ---------------- AI-2: quotation capture ----------------
export interface CapturedLine { supplierPartNo: string; description: string; qty: number; unitPrice: number; leadTimeDays?: number; availability?: string; confidence: number; issues: string[] }
const HDR: Record<string, RegExp> = {
  supplierPartNo: /^(part|p\/?n|item|sku|code|number|no\.?|رقم|كود|الصنف|رمز)/i,
  description: /(desc|name|details|البيان|الوصف|الاسم|الصنف)/i,
  qty: /(qty|quantity|الكمية|كمية|عدد)/i,
  unitPrice: /(unit\s*price|price|rate|السعر|سعر)/i,
  leadTimeDays: /(lead|delivery|days|مدة|توريد)/i,
  availability: /(avail|stock|التوفر|متوفر)/i,
};
const toNum = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.\-]/g, '')); return isFinite(n) ? n : NaN; };
function mapRows(rows: any[][]): CapturedLine[] {
  const hi = rows.findIndex((r) => r.filter((c) => c != null && String(c).trim()).length >= 3 && r.some((c) => HDR.unitPrice.test(String(c))));
  if (hi < 0) return [];
  const hdr = rows[hi].map((c) => String(c ?? '').trim());
  const col: Record<string, number> = {};
  for (const [k, re] of Object.entries(HDR)) { const i = hdr.findIndex((h, ix) => re.test(h) && !Object.values(col).includes(ix)); if (i >= 0) col[k] = i; }
  if (col.unitPrice == null) return [];
  const out: CapturedLine[] = [];
  for (const r of rows.slice(hi + 1)) {
    const price = toNum(r[col.unitPrice]);
    const pn = String(r[col.supplierPartNo ?? 0] ?? '').trim();
    if (!isFinite(price) || price <= 0 || !pn) continue;
    const issues: string[] = [];
    const qty = col.qty != null ? toNum(r[col.qty]) : 1;
    if (!isFinite(qty) || qty <= 0) issues.push('Quantity missing or invalid');
    out.push({ supplierPartNo: pn, description: String(r[col.description ?? 1] ?? '').trim(), qty: isFinite(qty) && qty > 0 ? qty : 1, unitPrice: price, leadTimeDays: col.leadTimeDays != null && isFinite(toNum(r[col.leadTimeDays])) ? toNum(r[col.leadTimeDays]) : undefined, availability: col.availability != null ? (/no|out|غير/i.test(String(r[col.availability])) ? 'unavailable' : 'in_stock') : undefined, confidence: issues.length ? 0.7 : 0.95, issues });
  }
  return out;
}
function parseText(text: string): CapturedLine[] {
  const out: CapturedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(\S*\d\S*)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:[.,]\d+)?)\s*(?:SAR|SR|ريال)?\s*(?:\d+(?:[.,]\d+)?)?\s*$/i.exec(raw);
    if (!m) continue;
    const price = toNum(m[4].replace(',', '.'));
    if (price > 0) out.push({ supplierPartNo: m[1], description: m[2].trim(), qty: Number(m[3]), unitPrice: price, confidence: 0.6, issues: ['Extracted from PDF text; please verify'] });
  }
  return out;
}

export async function extractQuote(file: { buffer: Buffer; filename: string; mime: string }): Promise<{ lines: CapturedLine[]; confidence: number; issues: string[]; method: string }> {
  const ext = file.filename.toLowerCase().split('.').pop() ?? '';
  const issues: string[] = [];
  let lines: CapturedLine[] = [], method = '';
  try {
    if (['xlsx', 'xls'].includes(ext)) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(file.buffer as any);
      const ws = wb.worksheets[0];
      const rows: any[][] = []; ws.eachRow({ includeEmpty: false }, (row) => rows.push((row.values as any[]).slice(1).map((v: any) => (v && typeof v === 'object' && 'result' in v ? v.result : v && typeof v === 'object' && 'text' in v ? v.text : v))));
      lines = mapRows(rows); method = 'excel-table';
    } else if (['csv', 'tsv', 'txt'].includes(ext) && ext !== 'txt') {
      const p = Papa.parse<string[]>(file.buffer.toString('utf8'), { skipEmptyLines: true });
      lines = mapRows(p.data as any); method = 'csv-table';
    } else if (ext === 'pdf') {
      const pdf = (await import('pdf-parse')).default;
      const text = (await pdf(file.buffer)).text;
      lines = parseText(text); method = 'pdf-text';
      if (!lines.length && llm.enabled()) { const r = await llm.json('Extract supplier quotation lines. Return {"lines":[{"supplierPartNo","description","qty","unitPrice","leadTimeDays","availability"}]}', text.slice(0, 12000)); lines = (r?.data?.lines ?? []).map((l: any) => ({ ...l, confidence: 0.8, issues: [] })); method = 'pdf-llm'; }
      if (!lines.length) issues.push('No table recognised in this PDF. If it is a scan, enter the lines manually or upload Excel/CSV.');
    } else if (['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
      method = 'image';
      if (llm.enabled()) issues.push('Image extraction needs a vision-capable model; not available in this build'); else issues.push('Photo/scan quotations need OCR, which is not enabled. Upload Excel/CSV/PDF, or enter lines manually.');
    } else issues.push(`Unsupported file type .${ext}`);
  } catch (e: any) { issues.push(`Could not read the file: ${e.message}`); }
  const confidence = lines.length ? Math.round((lines.reduce((s, l) => s + l.confidence, 0) / lines.length) * 100) / 100 : 0;
  return { lines, confidence, issues, method };
}

// ---------------- AI-3: business assistant (semantic-layer intents, read-only, permission-aware) ----------------
type Result = { title: string; columns: string[]; rows: any[][]; chart?: 'bar' | 'line' | 'pie'; query: string; note?: string };
interface Intent { id: string; match: RegExp; need: { mod: string; slug: string }; run: (companyId: string, n: number, q: string) => Promise<Result> }
const topN = (q: string, d = 10) => { const m = /(?:top|first|أعلى|اكبر|أكبر|اكثر|أكثر)\s*(\d+)|(\d+)\s*(?:customers|suppliers|عملاء|موردين|عميل|مورد)/i.exec(q); return Math.min(50, Number(m?.[1] ?? m?.[2] ?? d)); };
const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)); };
const INTENTS: Intent[] = [
  { id: 'overdue_customers', match: /(overdue|late|متأخر|متاخر)/i, need: { mod: 'finance', slug: 'invoice' }, run: async (c, n) => {
    const sql = `SELECT cu.name, COUNT(*)::int invoices, SUM(i.balance)::float overdue, MAX(CURRENT_DATE - i."dueDate")::int days FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND i.balance > 0 AND i."dueDate" < CURRENT_DATE AND i.status IN ('cleared','reported','partially_paid') GROUP BY cu.name ORDER BY overdue DESC LIMIT ${n}`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: `Top ${n} overdue customers`, columns: ['Customer', 'Invoices', 'Overdue (SAR)', 'Max days late'], rows: r.map((x) => [x.name, x.invoices, x.overdue, x.days]), chart: 'bar', query: sql }; } },
  { id: 'sales_by_customer', match: /(sales|revenue|مبيعات|إيراد).*(customer|عميل|عملاء)|(customer|عملاء).*(sales|مبيعات)/i, need: { mod: 'finance', slug: 'invoice' }, run: async (c, n) => {
    const sql = `SELECT cu.name, SUM(i.total)::float sales FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND i."invoiceType" IN ('standard','simplified') AND i.status NOT IN ('draft','rejected','cancelled') AND i."issueDate" >= date_trunc('month', CURRENT_DATE) GROUP BY cu.name ORDER BY sales DESC LIMIT ${n}`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: `Top ${n} customers by sales this month`, columns: ['Customer', 'Sales (SAR)'], rows: r.map((x) => [x.name, x.sales]), chart: 'bar', query: sql }; } },
  { id: 'sales_month', match: /(sales|revenue|مبيعات|إيرادات).*(month|شهر)|(this month|هذا الشهر)/i, need: { mod: 'finance', slug: 'invoice' }, run: async (c) => {
    const sql = `SELECT to_char(i."issueDate", 'YYYY-MM-DD') d, SUM(i.total)::float sales FROM invoice i WHERE i."companyId" = $1 AND i."invoiceType" IN ('standard','simplified') AND i.status NOT IN ('draft','rejected','cancelled') AND i."issueDate" >= date_trunc('month', CURRENT_DATE) GROUP BY d ORDER BY d`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: 'Daily sales this month', columns: ['Date', 'Sales (SAR)'], rows: r.map((x) => [x.d, x.sales]), chart: 'line', query: sql }; } },
  { id: 'margin_category', match: /(margin|profit|هامش|ربح)/i, need: { mod: 'finance', slug: 'invoice' }, run: async (c) => {
    const sql = `SELECT COALESCE(cat.name,'Uncategorised') category, SUM((il."lineTotal" - il."vatAmount"))::float revenue, SUM(il.cost * il.qty)::float cost FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" LEFT JOIN part p ON p.id = il."partId" LEFT JOIN category cat ON cat.id = p."categoryId" WHERE i."companyId" = $1 AND i."invoiceType" IN ('standard','simplified') AND i.status NOT IN ('draft','rejected','cancelled') GROUP BY cat.name ORDER BY revenue DESC`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: 'Gross margin by category', columns: ['Category', 'Revenue', 'Cost', 'Margin %'], rows: r.map((x) => [x.category, x.revenue, x.cost, x.revenue ? Math.round(((x.revenue - x.cost) / x.revenue) * 1000) / 10 : 0]), chart: 'bar', query: sql }; } },
  { id: 'supplier_spend', match: /(supplier|vendor|مورد).*(spend|purchas|مشتريات|إنفاق)|(spend|purchas).*(supplier)/i, need: { mod: 'procurement', slug: 'purchase-order' }, run: async (c, n) => {
    const sql = `SELECT s.name, SUM(po.total)::float spend, COUNT(*)::int orders FROM purchase_order po JOIN supplier s ON s.id = po."supplierId" WHERE po."companyId" = $1 AND po.status NOT IN ('draft','cancelled') GROUP BY s.name ORDER BY spend DESC LIMIT ${n}`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: `Top ${n} suppliers by spend`, columns: ['Supplier', 'Spend (SAR)', 'Orders'], rows: r.map((x) => [x.name, x.spend, x.orders]), chart: 'bar', query: sql }; } },
  { id: 'receivables', match: /(receivable|ageing|aging|ذمم|أعمار|اعمار)/i, need: { mod: 'credit', slug: 'credit-profile' }, run: async (c) => {
    const sql = `SELECT CASE WHEN "dueDate" >= CURRENT_DATE THEN 'Current' WHEN CURRENT_DATE - "dueDate" <= 30 THEN '1-30' WHEN CURRENT_DATE - "dueDate" <= 60 THEN '31-60' WHEN CURRENT_DATE - "dueDate" <= 90 THEN '61-90' ELSE '90+' END bucket, SUM(balance)::float amount FROM invoice WHERE "companyId" = $1 AND balance > 0 AND status IN ('cleared','reported','partially_paid') GROUP BY bucket ORDER BY bucket`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: 'Receivables ageing', columns: ['Bucket', 'Amount (SAR)'], rows: r.map((x) => [x.bucket, x.amount]), chart: 'pie', query: sql }; } },
  { id: 'open_requests', match: /(open|pending|مفتوح|معلق).*(request|طلب)|(request|طلبات)/i, need: { mod: 'sales', slug: 'request' }, run: async (c) => {
    const sql = `SELECT status, COUNT(*)::int n FROM request WHERE "companyId" = $1 AND status NOT IN ('cancelled','closed') GROUP BY status ORDER BY n DESC`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: 'Customer requests by status', columns: ['Status', 'Count'], rows: r.map((x) => [x.status, x.n]), chart: 'bar', query: sql }; } },
  { id: 'expenses', match: /(expense|مصروف|مصاريف)/i, need: { mod: 'finance', slug: 'expense' }, run: async (c) => {
    const sql = `SELECT cat.name category, SUM(e.amount)::float amount FROM expense e JOIN expense_category cat ON cat.id = e."categoryId" WHERE e."companyId" = $1 AND e.status IN ('approved','posted') AND e."expenseDate" >= date_trunc('month', CURRENT_DATE) GROUP BY cat.name ORDER BY amount DESC`;
    const r: any[] = await prisma.$queryRawUnsafe(sql, c); return { title: 'Expenses this month by category', columns: ['Category', 'Amount (SAR)'], rows: r.map((x) => [x.category, x.amount]), chart: 'pie', query: sql }; } },
];

export async function askAssistant(ctx: Ctx, question: string) {
  const t0 = Date.now();
  const q = String(question ?? '').slice(0, 500);
  if (/\b(delete|drop|update|insert|truncate|alter)\b|احذف|حذف|عدّل|عدل/i.test(q)) {
    return { ok: false, answer: 'I can only read data and answer questions; I cannot change anything.', suggestions: suggestions() };
  }
  const intent = INTENTS.find((i) => i.match.test(q));
  if (!intent) return { ok: false, answer: 'I could not map that question to a report I am allowed to run. Try one of these:', suggestions: suggestions() };
  if (!can(ctx.perms, { mod: intent.need.mod, slug: intent.need.slug }, 'read')) return { ok: false, answer: 'You do not have access to the data needed for this question.', suggestions: [] };
  const res = await intent.run(ctx.companyId, topN(q), q);
  await prisma.aiLog.create({ data: { companyId: ctx.companyId, feature: 'assistant', userId: ctx.userId, input: { q } as any, output: { intent: intent.id, rows: res.rows.length } as any, latencyMs: Date.now() - t0, model: 'semantic-intents', promptVersion: 'v1' } });
  return { ok: true, intent: intent.id, result: res };
}
const suggestions = () => ['Top 10 overdue customers', 'Sales this month', 'Sales by customer', 'Gross margin by category', 'Top suppliers by spend', 'Receivables ageing', 'Open requests', 'Expenses this month'];
export { num, normPN };
