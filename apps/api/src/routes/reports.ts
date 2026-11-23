import type { FastifyInstance } from 'fastify';
import ExcelJS from 'exceljs';
import Papa from 'papaparse';
import { prisma } from '@erp/db';
import { can } from '@erp/shared';
import { Ctx, forbidden, bad, getSetting, notFound, addDays, today } from '../core/base';
import { authenticate } from '../core/auth-plugin';
import { runForecast } from '../services/forecast';
import { exposure } from '../services/credit';

const q = <T = any>(sql: string, ...p: any[]) => prisma.$queryRawUnsafe(sql, ...p) as Promise<T[]>;
const need = (ctx: Ctx, mod: string, slug: string) => { if (ctx.kind !== 'staff' || !can(ctx.perms, { mod, slug }, 'read')) throw forbidden('You do not have access to this report'); };
const iso = (d: any, def: Date) => (d ? new Date(String(d)) : def);
const f = (x: any) => Math.round(Number(x ?? 0) * 100) / 100;
const ISSUED = `i.status NOT IN ('draft','rejected','cancelled')`;
const SIGNED = `CASE WHEN i."invoiceType" = 'credit_note' THEN -1 ELSE 1 END`;

export interface TableReport { title: string; columns: { key: string; label: string; num?: boolean }[]; rows: Record<string, any>[]; totals?: Record<string, any>; note?: string }

async function balances(companyId: string, asOf: Date, from?: Date, branchId?: string | null) {
  return q<any>(
    `SELECT a.id, a.code, a.name, a."nameAr", a.type, a."controlType", COALESCE(SUM(jl.debit),0)::float d, COALESCE(SUM(jl.credit),0)::float c
     FROM account a LEFT JOIN (SELECT jl.* FROM journal_line jl JOIN journal_entry je ON je.id = jl."entryId" WHERE je."companyId" = $1 AND je."entryDate" <= $2 ${from ? `AND je."entryDate" >= $4` : ''} AND ($3::text IS NULL OR je."branchId" = $3)) jl ON jl."accountId" = a.id
     WHERE a."companyId" = $1 GROUP BY a.id ORDER BY a.code`, ...[companyId, asOf, branchId ?? null, ...(from ? [from] : [])]);
}

export const TABLES: Record<string, { need: [string, string]; run: (ctx: Ctx, qs: any) => Promise<TableReport> }> = {
  'trial-balance': { need: ['finance', 'journal-entry'], run: async (ctx, qs) => {
    const asOf = iso(qs.asOf, today()); const rows = (await balances(ctx.companyId, asOf, undefined, qs.branchId)).filter((r) => r.d || r.c);
    const out = rows.map((r) => ({ code: r.code, name: r.name, debit: f(Math.max(0, r.d - r.c)), credit: f(Math.max(0, r.c - r.d)) }));
    const td = out.reduce((s, r) => s + r.debit, 0), tc = out.reduce((s, r) => s + r.credit, 0);
    return { title: `Trial balance as of ${asOf.toISOString().slice(0, 10)}`, columns: [{ key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'debit', label: 'Debit', num: true }, { key: 'credit', label: 'Credit', num: true }], rows: out, totals: { name: 'Total', debit: f(td), credit: f(tc) }, note: Math.abs(td - tc) < 0.01 ? 'Balanced' : `OUT OF BALANCE by ${f(td - tc)}` };
  } },
  pnl: { need: ['finance', 'journal-entry'], run: async (ctx, qs) => {
    const to = iso(qs.to, today()), from = iso(qs.from, new Date(Date.UTC(to.getUTCFullYear(), 0, 1)));
    const rows = (await balances(ctx.companyId, to, from, qs.branchId)).filter((r) => ['revenue', 'cogs', 'expense'].includes(r.type) && (r.d || r.c));
    const val = (r: any) => (r.type === 'revenue' ? r.c - r.d : r.d - r.c);
    const sec = (t: string, label: string) => ({ label, rows: rows.filter((r) => r.type === t).map((r) => ({ section: label, code: r.code, name: r.name, amount: f(val(r)) })) });
    const rev = sec('revenue', 'Revenue'), cogs = sec('cogs', 'Cost of goods sold'), exp = sec('expense', 'Operating expenses');
    const sum = (s: any) => s.rows.reduce((a: number, r: any) => a + r.amount, 0);
    const gross = sum(rev) - sum(cogs.rows.length ? cogs : { rows: [] }), net = gross - sum(exp);
    return { title: `Profit & loss ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, columns: [{ key: 'section', label: 'Section' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Amount (SAR)', num: true }],
      rows: [...rev.rows, { section: 'Revenue', name: 'Total revenue', amount: f(sum(rev)) }, ...cogs.rows, { section: 'COGS', name: 'Gross profit', amount: f(gross) }, ...exp.rows, { section: 'Result', name: 'Net profit', amount: f(net) }], totals: { name: 'Net profit', amount: f(net) } };
  } },
  'balance-sheet': { need: ['finance', 'journal-entry'], run: async (ctx, qs) => {
    const asOf = iso(qs.asOf, today()); const rows = (await balances(ctx.companyId, asOf, undefined, qs.branchId)).filter((r) => r.d || r.c);
    const mk = (types: string[], sec: string, sign: 1 | -1) => rows.filter((r) => types.includes(r.type)).map((r) => ({ section: sec, code: r.code, name: r.name, amount: f(sign * (r.d - r.c)) }));
    const assets = mk(['asset'], 'Assets', 1), liab = mk(['liability'], 'Liabilities', -1), eq = mk(['equity'], 'Equity', -1);
    const earn = rows.filter((r) => ['revenue', 'cogs', 'expense'].includes(r.type)).reduce((s, r) => s + (r.c - r.d), 0);
    const A = assets.reduce((s, r) => s + r.amount, 0), L = liab.reduce((s, r) => s + r.amount, 0), E = eq.reduce((s, r) => s + r.amount, 0) + earn;
    return { title: `Balance sheet as of ${asOf.toISOString().slice(0, 10)}`, columns: [{ key: 'section', label: 'Section' }, { key: 'code', label: 'Code' }, { key: 'name', label: 'Account' }, { key: 'amount', label: 'Amount (SAR)', num: true }],
      rows: [...assets, { section: 'Assets', name: 'Total assets', amount: f(A) }, ...liab, { section: 'Liabilities', name: 'Total liabilities', amount: f(L) }, ...eq, { section: 'Equity', name: 'Current earnings', amount: f(earn) }, { section: 'Equity', name: 'Total equity', amount: f(E) }, { section: 'Check', name: 'Liabilities + equity', amount: f(L + E) }], totals: { name: 'Assets − (Liabilities + Equity)', amount: f(A - L - E) }, note: Math.abs(A - L - E) < 0.01 ? 'Balanced' : 'OUT OF BALANCE' };
  } },
  'cash-flow': { need: ['finance', 'journal-entry'], run: async (ctx, qs) => {
    const to = iso(qs.to, today()), from = iso(qs.from, new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)));
    const open = (await q<any>(`SELECT COALESCE(SUM(jl.debit - jl.credit),0)::float v FROM journal_line jl JOIN journal_entry je ON je.id = jl."entryId" JOIN account a ON a.id = jl."accountId" WHERE je."companyId" = $1 AND a."controlType" IN ('bank','cash') AND je."entryDate" < $2`, ctx.companyId, from))[0].v;
    const mv = await q<any>(`SELECT je."sourceType" src, COALESCE(SUM(jl.debit),0)::float inflow, COALESCE(SUM(jl.credit),0)::float outflow FROM journal_line jl JOIN journal_entry je ON je.id = jl."entryId" JOIN account a ON a.id = jl."accountId" WHERE je."companyId" = $1 AND a."controlType" IN ('bank','cash') AND je."entryDate" BETWEEN $2 AND $3 GROUP BY je."sourceType" ORDER BY src`, ctx.companyId, from, to);
    const label: Record<string, string> = { Receipt: 'Customer receipts', Payment: 'Supplier payments', Expense: 'Operating expenses', Invoice: 'POS / cash sales', PosShift: 'Cash variance', manual: 'Manual entries', opening: 'Opening balances' };
    const rows = mv.map((r) => ({ activity: label[r.src] ?? r.src, inflow: f(r.inflow), outflow: f(r.outflow), net: f(r.inflow - r.outflow) }));
    const net = rows.reduce((s, r) => s + r.net, 0);
    return { title: `Cash flow ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, columns: [{ key: 'activity', label: 'Activity' }, { key: 'inflow', label: 'Inflow', num: true }, { key: 'outflow', label: 'Outflow', num: true }, { key: 'net', label: 'Net', num: true }], rows: [{ activity: 'Opening cash', net: f(open) }, ...rows, { activity: 'Closing cash', net: f(open + net) }], totals: { activity: 'Net change', net: f(net) } };
  } },
  vat: { need: ['finance', 'invoice'], run: async (ctx, qs) => {
    const to = iso(qs.to, today()), from = iso(qs.from, new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1)));
    const s = (await q<any>(`SELECT COALESCE(SUM(${SIGNED} * i.subtotal),0)::float net, COALESCE(SUM(${SIGNED} * i."vatAmount"),0)::float vat FROM invoice i WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3`, ctx.companyId, from, to))[0];
    const p = (await q<any>(`SELECT COALESCE(SUM(CASE WHEN b."docType"='debit_note' THEN -1 ELSE 1 END * b.subtotal),0)::float net, COALESCE(SUM(CASE WHEN b."docType"='debit_note' THEN -1 ELSE 1 END * b."vatAmount"),0)::float vat FROM supplier_bill b WHERE b."companyId" = $1 AND b.status IN ('posted','paid') AND b."billDate" BETWEEN $2 AND $3`, ctx.companyId, from, to))[0];
    const e = (await q<any>(`SELECT COALESCE(SUM(e."amount" - e."vatAmount"),0)::float net, COALESCE(SUM(e."vatAmount"),0)::float vat FROM expense e WHERE e."companyId" = $1 AND e.status = 'posted' AND e."expenseDate" BETWEEN $2 AND $3`, ctx.companyId, from, to))[0];
    const ledger = await balances(ctx.companyId, to, from);
    const lo = ledger.filter((r) => r.controlType === 'vat_out').reduce((a, r) => a + (r.c - r.d), 0), li = ledger.filter((r) => r.controlType === 'vat_in').reduce((a, r) => a + (r.d - r.c), 0);
    const outV = s.vat, inV = p.vat + e.vat;
    return { title: `VAT return support ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, columns: [{ key: 'line', label: 'Line' }, { key: 'net', label: 'Net amount', num: true }, { key: 'vat', label: 'VAT', num: true }],
      rows: [{ line: 'Standard-rated sales (net of credit notes)', net: f(s.net), vat: f(s.vat) }, { line: 'Purchases from suppliers', net: f(p.net), vat: f(p.vat) }, { line: 'Expenses with input VAT', net: f(e.net), vat: f(e.vat) }, { line: 'Net VAT due to ZATCA (output − input)', vat: f(outV - inV) }, { line: 'Ledger check: VAT output account', vat: f(lo) }, { line: 'Ledger check: VAT input account', vat: f(li) }],
      totals: { line: 'Net VAT payable', vat: f(outV - inV) }, note: Math.abs(lo - outV) < 0.05 && Math.abs(li - inV) < 0.05 ? 'Reconciles to the ledger' : `Differs from ledger (output ${f(lo)} vs ${f(outV)}, input ${f(li)} vs ${f(inV)})` };
  } },
  ageing: { need: ['credit', 'credit-profile'], run: async (ctx, qs) => {
    const asOf = iso(qs.asOf, today()); const by = ['customer', 'rep', 'branch'].includes(qs.groupBy) ? qs.groupBy : 'customer';
    const bk = (await getSetting<number[]>(ctx.companyId, 'ageing.buckets', [30, 60, 90])).map((x) => Math.trunc(Number(x))); const [b1, b2, b3] = bk.length === 3 && bk.every((x, i) => Number.isFinite(x) && x > 0 && (i === 0 || x > bk[i - 1])) ? bk : [30, 60, 90];
    const grp = by === 'rep' ? `COALESCE(u.name,'Unassigned')` : by === 'branch' ? `COALESCE(br.name,'No branch')` : `cu.name`;
    const rows = await q<any>(`SELECT ${grp} grp,
        SUM(CASE WHEN i."dueDate" >= $2 THEN i.balance ELSE 0 END)::float cur,
        SUM(CASE WHEN $2::date - i."dueDate" BETWEEN 1 AND ${b1} THEN i.balance ELSE 0 END)::float b1,
        SUM(CASE WHEN $2::date - i."dueDate" BETWEEN ${b1 + 1} AND ${b2} THEN i.balance ELSE 0 END)::float b2,
        SUM(CASE WHEN $2::date - i."dueDate" BETWEEN ${b2 + 1} AND ${b3} THEN i.balance ELSE 0 END)::float b3,
        SUM(CASE WHEN $2::date - i."dueDate" > ${b3} THEN i.balance ELSE 0 END)::float b4, SUM(i.balance)::float total
      FROM invoice i JOIN customer cu ON cu.id = i."customerId" LEFT JOIN "user" u ON u.id = cu."salesRepId" LEFT JOIN branch br ON br.id = i."branchId"
      WHERE i."companyId" = $1 AND i.balance > 0 AND i.status IN ('cleared','reported','partially_paid') AND i."invoiceType" IN ('standard','simplified','debit_note') AND i."issueDate" <= $2 GROUP BY grp ORDER BY total DESC`, ctx.companyId, asOf);
    const out = rows.map((r) => ({ name: r.grp, current: f(r.cur), b1: f(r.b1), b2: f(r.b2), b3: f(r.b3), b4: f(r.b4), total: f(r.total) }));
    const t = (k: string) => f(out.reduce((s, r: any) => s + r[k], 0));
    const ar = (await balances(ctx.companyId, asOf)).filter((r) => r.controlType === 'ar').reduce((s, r) => s + (r.d - r.c), 0);
    return { title: `Receivables ageing by ${by} as of ${asOf.toISOString().slice(0, 10)}`, columns: [{ key: 'name', label: by }, { key: 'current', label: 'Current', num: true }, { key: 'b1', label: `1–${b1}`, num: true }, { key: 'b2', label: `${b1 + 1}–${b2}`, num: true }, { key: 'b3', label: `${b2 + 1}–${b3}`, num: true }, { key: 'b4', label: `${b3}+`, num: true }, { key: 'total', label: 'Total', num: true }], rows: out, totals: { name: 'Total', current: t('current'), b1: t('b1'), b2: t('b2'), b3: t('b3'), b4: t('b4'), total: t('total') }, note: Math.abs(ar - t('total')) < 0.05 ? 'Ties to the AR control account' : `AR control account is ${f(ar)} (difference ${f(ar - t('total'))})` };
  } },
  statement: { need: ['credit', 'credit-profile'], run: async (ctx, qs) => {
    if (!qs.customerId) throw bad('customerId is required');
    const cust = await prisma.customer.findFirst({ where: { id: qs.customerId, companyId: ctx.companyId } });
    if (!cust) throw notFound('Customer');
    return customerStatement(ctx.companyId, cust, qs);
  } },
  'supplier-performance': { need: ['procurement', 'supplier'], run: async (ctx) => {
    const rows = await q<any>(`SELECT DISTINCT ON (s.id) s.name, ss."onTimePct"::float on_time, ss."priceScore"::float price, ss."defectRate"::float defect, ss."responseHours"::float resp, ss.overall::float overall FROM supplier_score ss JOIN supplier s ON s.id = ss."supplierId" WHERE ss."companyId" = $1 ORDER BY s.id, ss."createdAt" DESC`, ctx.companyId);
    return { title: 'Supplier performance (last 90 days)', columns: [{ key: 'name', label: 'Supplier' }, { key: 'onTime', label: 'On-time %', num: true }, { key: 'price', label: 'Price score', num: true }, { key: 'defect', label: 'Defect %', num: true }, { key: 'resp', label: 'Response (h)', num: true }, { key: 'overall', label: 'Overall', num: true }], rows: rows.map((r) => ({ name: r.name, onTime: f(r.on_time), price: f(r.price), defect: f(r.defect), resp: f(r.resp), overall: f(r.overall) })).sort((a, b) => b.overall - a.overall) };
  } },
};

export async function customerStatement(companyId: string, cust: any, qs: any): Promise<TableReport & { customer: any; opening: number; closing: number }> {
  const to = iso(qs.to, today()), from = iso(qs.from, addDays(to, -90));
  const invs = await prisma.invoice.findMany({ where: { companyId, customerId: cust.id, status: { notIn: ['draft', 'rejected', 'cancelled'] }, issueDate: { lte: to } }, orderBy: { issueDate: 'asc' } });
  const rcs = await prisma.receipt.findMany({ where: { companyId, customerId: cust.id, status: 'posted', receiptDate: { lte: to } }, orderBy: { receiptDate: 'asc' } });
  const tx: { date: Date; ref: string; type: string; debit: number; credit: number; due?: Date | null }[] = [
    ...invs.map((i) => ({ date: i.issueDate!, ref: i.number ?? '', type: i.invoiceType === 'credit_note' ? 'Credit note' : 'Invoice', debit: i.invoiceType === 'credit_note' ? 0 : Number(i.total), credit: i.invoiceType === 'credit_note' ? Number(i.total) : 0, due: i.dueDate })),
    ...rcs.map((r) => ({ date: r.receiptDate!, ref: r.number ?? '', type: 'Receipt', debit: 0, credit: Number(r.amount), due: null })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  const opening = tx.filter((t) => t.date < from).reduce((s, t) => s + t.debit - t.credit, 0);
  let run = opening;
  const rows = tx.filter((t) => t.date >= from).map((t) => { run += t.debit - t.credit; return { date: t.date.toISOString().slice(0, 10), ref: t.ref, type: t.type, due: t.due?.toISOString().slice(0, 10) ?? '', debit: f(t.debit), credit: f(t.credit), balance: f(run) }; });
  return { customer: { id: cust.id, name: cust.name, code: cust.code, vatNumber: cust.vatNumber }, opening: f(opening), closing: f(run), title: `Statement of account — ${cust.name}`, columns: [{ key: 'date', label: 'Date' }, { key: 'ref', label: 'Document' }, { key: 'type', label: 'Type' }, { key: 'due', label: 'Due' }, { key: 'debit', label: 'Debit', num: true }, { key: 'credit', label: 'Credit', num: true }, { key: 'balance', label: 'Balance', num: true }], rows: [{ date: from.toISOString().slice(0, 10), type: 'Opening balance', balance: f(opening) }, ...rows], totals: { type: 'Closing balance', balance: f(run) } };
}

const escH = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
const toHtml = (t: TableReport, lang: 'ar' | 'en') => `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${escH(t.title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;margin:24px;color:#111}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px 8px;font-size:13px}th{background:#f3f4f6}td.n,th.n{text-align:end;font-variant-numeric:tabular-nums}h1{font-size:18px}@media print{button{display:none}}</style></head><body><button onclick="print()">Print / Save PDF</button><h1>${escH(t.title)}</h1><table><thead><tr>${t.columns.map((c) => `<th class="${c.num ? 'n' : ''}">${escH(c.label)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${t.columns.map((c) => `<td class="${c.num ? 'n' : ''}">${escH(r[c.key])}</td>`).join('')}</tr>`).join('')}${t.totals ? `<tr style="font-weight:700">${t.columns.map((c) => `<td class="${c.num ? 'n' : ''}">${escH(t.totals![c.key])}</td>`).join('')}</tr>` : ''}</tbody></table>${t.note ? `<p>${escH(t.note)}</p>` : ''}</body></html>`;

export async function tableToFile(t: TableReport, format: string) {
  const data = [...t.rows, ...(t.totals ? [t.totals] : [])].map((r) => Object.fromEntries(t.columns.map((c) => [c.label, r[c.key] ?? ''])));
  if (format === 'xlsx') { const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(t.title.slice(0, 30)); ws.columns = t.columns.map((c) => ({ header: c.label, key: c.label, width: 20 })); ws.addRows(data); ws.getRow(1).font = { bold: true }; return { buf: Buffer.from(await wb.xlsx.writeBuffer()), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' }; }
  return { buf: Buffer.from('﻿' + Papa.unparse(data)), mime: 'text/csv; charset=utf-8', ext: 'csv' };
}

// ---------- dashboards ----------
async function ledgerMonthly(companyId: string, months: number) {
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - months + 1, 1));
  const rows = await q<any>(`SELECT to_char(date_trunc('month', je."entryDate"),'YYYY-MM') m, a.type, SUM(jl.credit - jl.debit)::float net FROM journal_line jl JOIN journal_entry je ON je.id = jl."entryId" JOIN account a ON a.id = jl."accountId" WHERE je."companyId" = $1 AND je."entryDate" >= $2 AND a.type IN ('revenue','cogs','expense') GROUP BY m, a.type`, companyId, start);
  const keys: string[] = []; for (let i = months - 1; i >= 0; i--) keys.push(new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return keys.map((m) => { const g = (t: string) => rows.find((r) => r.m === m && r.type === t)?.net ?? 0; const revenue = g('revenue'), cogs = -g('cogs'), exp = -g('expense'); return { month: m, revenue: f(revenue), cogs: f(cogs), grossProfit: f(revenue - cogs), expenses: f(exp), netProfit: f(revenue - cogs - exp) }; });
}
const salesSum = (companyId: string, from: Date, to: Date, extra = '', ...p: any[]) => q<any>(`SELECT COALESCE(SUM(${SIGNED} * i.subtotal),0)::float v FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 ${extra}`, companyId, from, to, ...p).then((r) => r[0].v as number);

export function registerReportRoutes(app: FastifyInstance) {
  const lim = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };

  app.get('/api/v1/dashboards/executive', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const c = ctx.companyId, now = new Date(), ms = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), pms = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)), pme = new Date(ms.getTime() - 86400000), yms = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)), yme = new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth() + 1, 0));
    const [mtd, prev, yoy, series, cash, ar, ap, top, rtq, arM, rtqM] = await Promise.all([
      salesSum(c, ms, now), salesSum(c, pms, pme), salesSum(c, yms, yme), ledgerMonthly(c, 12),
      q<any>(`SELECT COALESCE(SUM(jl.debit - jl.credit),0)::float v FROM journal_line jl JOIN journal_entry je ON je.id = jl."entryId" JOIN account a ON a.id = jl."accountId" WHERE je."companyId" = $1 AND a."controlType" IN ('bank','cash')`, c).then((r) => r[0].v),
      q<any>(`SELECT COALESCE(SUM(balance),0)::float v, COALESCE(SUM(CASE WHEN "dueDate" < CURRENT_DATE THEN balance END),0)::float od FROM invoice WHERE "companyId" = $1 AND balance > 0 AND status IN ('cleared','reported','partially_paid')`, c).then((r) => r[0]),
      q<any>(`SELECT COALESCE(SUM(total - "paidAmount"),0)::float v FROM supplier_bill WHERE "companyId" = $1 AND status = 'posted' AND "docType" = 'bill'`, c).then((r) => r[0].v),
      q<any>(`SELECT cu.name, SUM(${SIGNED} * i.subtotal)::float v FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" >= $2 GROUP BY cu.name ORDER BY v DESC LIMIT 5`, c, ms),
      q<any>(`SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (qt."sentAt" - r."createdAt"))/3600),0)::float h FROM quotation qt JOIN request r ON r.id = qt."requestId" WHERE qt."companyId" = $1 AND qt."sentAt" IS NOT NULL AND qt."sentAt" > now() - interval '30 days'`, c).then((r) => r[0].h),
      q<any>(`SELECT to_char(date_trunc('month', "issueDate"),'YYYY-MM') m, SUM(balance)::float v FROM invoice WHERE "companyId" = $1 AND balance > 0 AND status IN ('cleared','reported','partially_paid') GROUP BY m`, c),
      q<any>(`SELECT to_char(date_trunc('month', r."createdAt"),'YYYY-MM') m, AVG(EXTRACT(EPOCH FROM (qt."sentAt" - r."createdAt"))/3600)::float v FROM quotation qt JOIN request r ON r.id = qt."requestId" WHERE qt."companyId" = $1 AND qt."sentAt" IS NOT NULL GROUP BY m`, c),
    ]);
    // 12 month-aligned trend lines for the KPI sparklines
    const trend = (rows: any[]) => series.map((x) => f(rows.find((r) => r.m === x.month)?.v ?? 0));
    const cur = series[series.length - 1], last = series[series.length - 2];
    return { kpis: { salesMtd: f(mtd), salesPrev: f(prev), salesYoy: f(yoy), grossMargin: f(cur.grossProfit), grossMarginPct: cur.revenue ? f((cur.grossProfit / cur.revenue) * 100) : 0, netProfit: f(cur.netProfit), netProfitPrev: f(last?.netProfit ?? 0), cash: f(cash), receivables: f(ar.v), overdue: f(ar.od), payables: f(ap), requestToQuoteHours: f(rtq) }, series, topCustomers: top.map((t) => ({ name: t.name, value: f(t.v) })), trends: { receivables: trend(arM), requestToQuote: trend(rtqM) } };
  });

  app.get('/api/v1/dashboards/sales', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'sales', 'quotation');
    const c = ctx.companyId, qs = req.query as any, from = iso(qs.from, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))), to = iso(qs.to, today());
    const own = ctx.role === 'sales' ? `AND cu."salesRepId" = '${ctx.userId}'` : '';
    const base = (sel: string, join: string, grp: string) => q<any>(`SELECT ${sel} k, SUM(${SIGNED} * il."lineTotal" - ${SIGNED} * il."vatAmount")::float v FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" JOIN customer cu ON cu.id = i."customerId" ${join} WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 ${own} GROUP BY ${grp} ORDER BY v DESC LIMIT 10`, c, from, to);
    const [byCustomer, byRep, byCategory, byBrand, byMake, conv, lost] = await Promise.all([
      base('cu.name', '', 'cu.name'), base(`COALESCE(u.name,'Unassigned')`, `LEFT JOIN "user" u ON u.id = cu."salesRepId"`, 'u.name'),
      base(`COALESCE(cat.name,'Other')`, `LEFT JOIN part p ON p.id = il."partId" LEFT JOIN category cat ON cat.id = p."categoryId"`, 'cat.name'), base(`COALESCE(b.name,'Other')`, `LEFT JOIN part p ON p.id = il."partId" LEFT JOIN brand b ON b.id = p."brandId"`, 'b.name'),
      base(`COALESCE(v.make,'Unknown')`, `LEFT JOIN request r ON r.id = i."requestId" LEFT JOIN vehicle v ON v.id = r."vehicleId"`, 'v.make'),
      q<any>(`SELECT COUNT(*) FILTER (WHERE q.status NOT IN ('draft','pending_margin_approval','approved_internal'))::int sent, COUNT(*) FILTER (WHERE q.status IN ('approved_full','approved_partial'))::int approved, COUNT(*) FILTER (WHERE q.status IN ('rejected','expired'))::int lost FROM quotation q JOIN customer cu ON cu.id = q."customerId" WHERE q."companyId" = $1 AND q."createdAt" BETWEEN $2 AND $3 ${own}`, c, from, addDays(to, 1)).then((r) => r[0]),
      q<any>(`SELECT COALESCE(lr.name,'No reason given') reason, COUNT(*)::int n FROM request_line rl LEFT JOIN lost_reason lr ON lr.id = rl."lostReasonId" WHERE rl."companyId" = $1 AND rl.status = 'lost' AND rl."updatedAt" BETWEEN $2 AND $3 GROUP BY lr.name ORDER BY n DESC`, c, from, addDays(to, 1)),
    ]);
    // CRM-04: achievement against sales targets overlapping the period
    const tg = await prisma.salesTarget.findMany({ where: { companyId: c, periodStart: { lte: to }, periodEnd: { gte: from } }, include: { user: { select: { name: true } }, customer: { select: { name: true } }, category: { select: { name: true } } } });
    const targets: any[] = [];
    for (const t of tg) {
      const where = t.scope === 'rep' ? 'cu."salesRepId" = $4' : t.scope === 'customer' ? 'cu.id = $4' : 'p."categoryId" = $4';
      const id = t.scope === 'rep' ? t.userId : t.scope === 'customer' ? t.customerId : t.categoryId;
      const r = (await q<any>(`SELECT COALESCE(SUM(${SIGNED} * (il."lineTotal" - il."vatAmount")),0)::float v FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" JOIN customer cu ON cu.id = i."customerId" LEFT JOIN part p ON p.id = il."partId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 AND ${where}`, c, t.periodStart, t.periodEnd, id))[0].v;
      targets.push({ scope: t.scope, name: t.user?.name ?? t.customer?.name ?? t.category?.name ?? '', target: f(t.targetAmount), achieved: f(r), pct: Number(t.targetAmount) ? f((r / Number(t.targetAmount)) * 100) : 0, periodStart: t.periodStart, periodEnd: t.periodEnd });
    }
    const m = (r: any[]) => r.map((x) => ({ name: x.k, value: f(x.v) }));
    return { period: { from, to }, targets, byCustomer: m(byCustomer), byRep: m(byRep), byCategory: m(byCategory), byBrand: m(byBrand), byMake: m(byMake), conversion: { ...conv, rate: conv.sent ? f((conv.approved / conv.sent) * 100) : 0 }, lostReasons: lost.map((l) => ({ name: l.reason, value: l.n })) };
  });

  app.get('/api/v1/dashboards/profitability', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const c = ctx.companyId, qs = req.query as any, from = iso(qs.from, new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1))), to = iso(qs.to, today());
    const g = (sel: string, join: string, grp: string) => q<any>(`SELECT ${sel} k, SUM(${SIGNED} * (il."lineTotal" - il."vatAmount"))::float rev, SUM(${SIGNED} * il.cost * il.qty)::float cost FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" ${join} WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 GROUP BY ${grp} ORDER BY rev DESC LIMIT 10`, c, from, to);
    const [byOrder, byCustomer, bySupplier, byCategory, trend, below] = await Promise.all([
      g(`COALESCE(so.number,'POS / direct')`, 'LEFT JOIN sales_order so ON so.id = i."salesOrderId"', 'so.number'), g('cu.name', 'JOIN customer cu ON cu.id = i."customerId"', 'cu.name'),
      g(`COALESCE(s.name,'Unknown')`, 'LEFT JOIN sales_order_line sol ON sol.id = il."salesOrderLineId" LEFT JOIN supplier s ON s.id = sol."supplierId"', 's.name'), g(`COALESCE(cat.name,'Other')`, 'LEFT JOIN part p ON p.id = il."partId" LEFT JOIN category cat ON cat.id = p."categoryId"', 'cat.name'),
      q<any>(`SELECT to_char(date_trunc('month', i."issueDate"),'YYYY-MM') m, SUM(${SIGNED} * (il."lineTotal" - il."vatAmount"))::float rev, SUM(${SIGNED} * il.cost * il.qty)::float cost FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" >= $2 GROUP BY m ORDER BY m`, c, new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1))),
      q<any>(`SELECT q.number, cu.name customer, ql."marginPct"::float margin, (ql."unitPrice" * ql.qty)::float value, q.status FROM quotation_line ql JOIN quotation q ON q.id = ql."quotationId" JOIN customer cu ON cu.id = q."customerId" WHERE ql."companyId" = $1 AND ql."belowMin" = true AND ql.status IN ('approved','pending') AND q."createdAt" BETWEEN $2 AND $3 ORDER BY q."createdAt" DESC LIMIT 20`, c, from, addDays(to, 1)),
    ]);
    const m = (r: any[]) => r.map((x) => ({ name: x.k, revenue: f(x.rev), cost: f(x.cost), marginPct: x.rev ? f(((x.rev - x.cost) / x.rev) * 100) : 0 }));
    return { period: { from, to }, byOrder: m(byOrder), byCustomer: m(byCustomer), bySupplier: m(bySupplier), byCategory: m(byCategory), trend: trend.map((t) => ({ month: t.m, revenue: f(t.rev), marginPct: t.rev ? f(((t.rev - t.cost) / t.rev) * 100) : 0 })), belowTarget: below.map((b) => ({ ...b, margin: f(b.margin * 100), value: f(b.value) })) };
  });

  app.get('/api/v1/dashboards/expenses', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'expense');
    const c = ctx.companyId, qs = req.query as any, from = iso(qs.from, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))), to = iso(qs.to, today());
    const [cats, ccs, budgets, trend] = await Promise.all([
      q<any>(`SELECT ec.name k, SUM(e.amount)::float v FROM expense e JOIN expense_category ec ON ec.id = e."categoryId" WHERE e."companyId" = $1 AND e.status = 'posted' AND e."expenseDate" BETWEEN $2 AND $3 GROUP BY ec.name ORDER BY v DESC`, c, from, to),
      q<any>(`SELECT COALESCE(cc.name,'Unassigned') k, SUM(e.amount)::float v FROM expense e LEFT JOIN cost_center cc ON cc.id = e."costCenterId" WHERE e."companyId" = $1 AND e.status = 'posted' AND e."expenseDate" BETWEEN $2 AND $3 GROUP BY cc.name ORDER BY v DESC`, c, from, to),
      q<any>(`SELECT ec.name k, SUM(b.amount)::float budget, COALESCE((SELECT SUM(e.amount) FROM expense e WHERE e."categoryId" = b."categoryId" AND e.status = 'posted' AND e."expenseDate" BETWEEN $2 AND $3),0)::float spent FROM budget b JOIN expense_category ec ON ec.id = b."categoryId" WHERE b."companyId" = $1 AND b."periodStart" <= $3 AND b."periodEnd" >= $2 GROUP BY ec.name, b."categoryId"`, c, from, to),
      q<any>(`SELECT to_char(date_trunc('month', "expenseDate"),'YYYY-MM') m, SUM(amount)::float v FROM expense WHERE "companyId" = $1 AND status = 'posted' AND "expenseDate" >= $2 GROUP BY m ORDER BY m`, c, new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1))),
    ]);
    return { period: { from, to }, byCategory: cats.map((x) => ({ name: x.k, value: f(x.v) })), byCostCenter: ccs.map((x) => ({ name: x.k, value: f(x.v) })), budgetVsActual: budgets.map((b) => ({ name: b.k, budget: f(b.budget), spent: f(b.spent), overrun: b.spent > b.budget })), trend: trend.map((t) => ({ month: t.m, value: f(t.v) })) };
  });

  app.get('/api/v1/dashboards/receivables', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'credit', 'credit-profile');
    const c = ctx.companyId;
    const ageing = await TABLES.ageing.run(ctx, {});
    const [over, dso, eff, util] = await Promise.all([
      q<any>(`SELECT cu.name, SUM(i.balance)::float v, MAX(CURRENT_DATE - i."dueDate")::int days FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND i.balance > 0 AND i."dueDate" < CURRENT_DATE AND i.status IN ('cleared','reported','partially_paid') GROUP BY cu.name ORDER BY v DESC LIMIT 10`, c),
      q<any>(`SELECT COALESCE(SUM(balance),0)::float ar, (SELECT COALESCE(SUM(subtotal),0)::float FROM invoice WHERE "companyId" = $1 AND status NOT IN ('draft','rejected','cancelled') AND "invoiceType" IN ('standard','simplified') AND "issueDate" > CURRENT_DATE - 90) s FROM invoice WHERE "companyId" = $1 AND balance > 0 AND status IN ('cleared','reported','partially_paid')`, c).then((r) => r[0]),
      q<any>(`SELECT COALESCE((SELECT SUM(amount) FROM receipt WHERE "companyId" = $1 AND status = 'posted' AND "receiptDate" > CURRENT_DATE - 30),0)::float collected, COALESCE((SELECT SUM(total) FROM invoice WHERE "companyId" = $1 AND status NOT IN ('draft','rejected','cancelled') AND "invoiceType" IN ('standard','simplified') AND "issueDate" > CURRENT_DATE - 30),0)::float billed, COALESCE((SELECT SUM(balance) FROM invoice WHERE "companyId" = $1 AND balance > 0 AND status IN ('cleared','reported','partially_paid') AND "issueDate" <= CURRENT_DATE - 30),0)::float opening`, c).then((r) => r[0]),
      q<any>(`SELECT cu.name, cp."limitAmount"::float lim, cp.exposure::float exp FROM credit_profile cp JOIN customer cu ON cu.id = cp."customerId" WHERE cp."companyId" = $1 AND cp."limitAmount" > 0 ORDER BY cp.exposure / NULLIF(cp."limitAmount",0) DESC LIMIT 10`, c),
    ]);
    return { ageing: ageing.rows.length ? { rows: ageing.rows, totals: ageing.totals } : { rows: [], totals: {} }, overdueByCustomer: over.map((o) => ({ name: o.name, value: f(o.v), days: o.days })), dso: dso.s ? f((dso.ar / dso.s) * 90) : 0, collectionEffectiveness: eff.opening + eff.billed ? f((eff.collected / (eff.opening + eff.billed)) * 100) : 0, creditUtilisation: util.map((u) => ({ name: u.name, limit: f(u.lim), exposure: f(u.exp), pct: u.lim ? f((u.exp / u.lim) * 100) : 0 })) };
  });

  app.get('/api/v1/dashboards/procurement', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'procurement', 'purchase-order');
    const c = ctx.companyId;
    const [spend, trend, resp, onTime, open] = await Promise.all([
      q<any>(`SELECT s.name k, SUM(po.total)::float v FROM purchase_order po JOIN supplier s ON s.id = po."supplierId" WHERE po."companyId" = $1 AND po.status NOT IN ('draft','cancelled') AND po."orderDate" >= CURRENT_DATE - 90 GROUP BY s.name ORDER BY v DESC LIMIT 10`, c),
      q<any>(`SELECT p."partNumber" part, to_char(date_trunc('month', ph."recordedAt"),'YYYY-MM') m, AVG(ph.price)::float v FROM price_history ph JOIN part p ON p.id = ph."partId" WHERE ph."companyId" = $1 AND ph.kind = 'supplier' AND ph."recordedAt" > now() - interval '12 months' AND ph."partId" IN (SELECT "partId" FROM price_history WHERE "companyId" = $1 AND kind = 'supplier' GROUP BY "partId" ORDER BY COUNT(*) DESC LIMIT 5) GROUP BY p."partNumber", m ORDER BY m`, c),
      q<any>(`SELECT s.name k, AVG(EXTRACT(EPOCH FROM (rs."respondedAt" - rs."sentAt"))/3600)::float h, COUNT(*) FILTER (WHERE rs.status = 'quoted')::float / NULLIF(COUNT(*),0) rate FROM rfq_supplier rs JOIN supplier s ON s.id = rs."supplierId" WHERE rs."companyId" = $1 AND rs."sentAt" > now() - interval '90 days' GROUP BY s.name`, c),
      q<any>(`SELECT s.name k, COUNT(*) FILTER (WHERE gr."receivedAt" <= po."expectedDate" + interval '1 day')::float / NULLIF(COUNT(*),0) rate FROM goods_receipt gr JOIN purchase_order po ON po.id = gr."poId" JOIN supplier s ON s.id = gr."supplierId" WHERE gr."companyId" = $1 AND gr.status = 'confirmed' AND gr."receivedAt" > now() - interval '90 days' GROUP BY s.name`, c),
      q<any>(`SELECT COUNT(*) FILTER (WHERE status IN ('sent','confirmed','partially_received'))::int awaiting, COUNT(*) FILTER (WHERE status IN ('sent','confirmed','partially_received') AND "expectedDate" < CURRENT_DATE)::int late, COUNT(*) FILTER (WHERE status = 'pending_approval')::int pending FROM purchase_order WHERE "companyId" = $1`, c).then((r) => r[0]),
    ]);
    return { spendBySupplier: spend.map((x) => ({ name: x.k, value: f(x.v) })), priceTrends: trend.map((t) => ({ part: t.part, month: t.m, price: f(t.v) })), responseTimes: resp.map((r) => ({ name: r.k, hours: f(r.h), responseRate: f((r.rate ?? 0) * 100) })), onTimeRates: onTime.map((r) => ({ name: r.k, pct: f((r.rate ?? 0) * 100) })), pos: open };
  });

  app.get('/api/v1/dashboards/operations', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'staff') throw forbidden();
    const c = ctx.companyId;
    const [reqs, quotes, deliveries, partials, sla, holds, approvals, grs] = await Promise.all([
      q<any>(`SELECT status k, COUNT(*)::int n FROM request WHERE "companyId" = $1 AND status NOT IN ('cancelled','ordered','lost','expired') GROUP BY status`, c),
      q<any>(`SELECT COUNT(*) FILTER (WHERE status IN ('sent','viewed'))::int awaiting_customer, COUNT(*) FILTER (WHERE status IN ('draft','pending_margin_approval'))::int in_progress FROM quotation WHERE "companyId" = $1`, c).then((r) => r[0]),
      q<any>(`SELECT COUNT(*) FILTER (WHERE "plannedDate" = CURRENT_DATE AND status IN ('planned','assigned','out_for_delivery'))::int today, COUNT(*) FILTER (WHERE "plannedDate" = CURRENT_DATE + 1 AND status IN ('planned','assigned'))::int tomorrow, COUNT(*) FILTER (WHERE "plannedDate" < CURRENT_DATE AND status IN ('planned','assigned','out_for_delivery'))::int late FROM delivery_note WHERE "companyId" = $1`, c).then((r) => r[0]),
      q<any>(`SELECT COUNT(*)::int n FROM sales_order_line WHERE "companyId" = $1 AND "backorderQty" > 0 AND "deliveredQty" > 0 AND status <> 'cancelled'`, c).then((r) => r[0].n),
      q<any>(`SELECT r.number, r."slaDueAt", cu.name customer FROM request r JOIN customer cu ON cu.id = r."customerId" WHERE r."companyId" = $1 AND r.status IN ('submitted','in_sourcing') AND r."slaDueAt" < now() ORDER BY r."slaDueAt" LIMIT 10`, c),
      q<any>(`SELECT COUNT(*)::int n FROM credit_hold WHERE "companyId" = $1 AND status = 'held'`, c).then((r) => r[0].n),
      q<any>(`SELECT COUNT(*)::int n FROM approval_request WHERE "companyId" = $1 AND status IN ('pending','escalated')`, c).then((r) => r[0].n),
      q<any>(`SELECT COUNT(*)::int n FROM purchase_order WHERE "companyId" = $1 AND status IN ('sent','confirmed','partially_received') AND "expectedDate" <= CURRENT_DATE + 1`, c).then((r) => r[0].n),
    ]);
    return { requestsByStatus: reqs.map((r) => ({ name: r.k, value: r.n })), quotations: quotes, deliveries, partialDeliveries: partials, slaBreaches: sla, creditHolds: holds, pendingApprovals: approvals, receivingDue: grs };
  });

  app.get('/api/v1/dashboards/branch', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'pos', 'pos-sale');
    const c = ctx.companyId, from = iso((req.query as any).from, new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1))), to = iso((req.query as any).to, today());
    const [byBranch, byTerminal, shifts, stock, svc, mix] = await Promise.all([
      q<any>(`SELECT COALESCE(b.name,'Head office / no branch') k, SUM(${SIGNED} * i.subtotal)::float v FROM invoice i LEFT JOIN branch b ON b.id = i."branchId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 GROUP BY b.name ORDER BY v DESC`, c, from, to),
      q<any>(`SELECT t.name k, SUM(s.total)::float v, COUNT(*)::int n FROM pos_sale s JOIN pos_terminal t ON t.id = s."terminalId" WHERE s."companyId" = $1 AND s.status = 'paid' AND s."soldAt" BETWEEN $2 AND $3 GROUP BY t.name`, c, from, addDays(to, 1)),
      q<any>(`SELECT sh.id, t.name terminal, u.name cashier, sh."openedAt", sh."closedAt", sh.variance::float variance, sh.status FROM pos_shift sh JOIN pos_terminal t ON t.id = sh."terminalId" LEFT JOIN "user" u ON u.id = sh."cashierId" WHERE sh."companyId" = $1 ORDER BY sh."openedAt" DESC LIMIT 10`, c),
      q<any>(`SELECT w.name wh, COUNT(DISTINCT sm."partId")::int parts, COALESCE(SUM(sm.qty * sm."unitCost"),0)::float value FROM stock_movement sm JOIN warehouse w ON w.id = sm."warehouseId" WHERE sm."companyId" = $1 GROUP BY w.name`, c),
      q<any>(`SELECT COUNT(*) FILTER (WHERE status IN ('completed','invoiced'))::int done, COUNT(*)::int total, COALESCE(SUM(total) FILTER (WHERE status = 'invoiced'),0)::float revenue, (SELECT COALESCE(AVG(minutes),0)::float FROM technician_time WHERE "companyId" = $1) avg_minutes FROM job_card WHERE "companyId" = $1 AND "createdAt" BETWEEN $2 AND $3`, c, from, addDays(to, 1)).then((r) => r[0]),
      q<any>(`SELECT COALESCE(cat.name,'Other') k, SUM(sl."lineTotal")::float v FROM pos_sale_line sl JOIN pos_sale s ON s.id = sl."posSaleId" LEFT JOIN part p ON p.id = sl."partId" LEFT JOIN category cat ON cat.id = p."categoryId" WHERE s."companyId" = $1 AND s.status = 'paid' AND s."soldAt" BETWEEN $2 AND $3 GROUP BY cat.name ORDER BY v DESC`, c, from, addDays(to, 1)),
    ]);
    return { period: { from, to }, salesByBranch: byBranch.map((x) => ({ name: x.k, value: f(x.v) })), posByTerminal: byTerminal.map((x) => ({ name: x.k, value: f(x.v), sales: x.n })), shifts, stock: stock.map((s) => ({ warehouse: s.wh, parts: s.parts, value: f(s.value) })), service: { ...svc, revenue: f(svc.revenue), avgMinutes: f(svc.avg_minutes) }, categoryMix: mix.map((m) => ({ name: m.k, value: f(m.v) })) };
  });

  // historical analysis with drill-down (RPT-08)
  app.get('/api/v1/reports/history', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const qs = req.query as any, group = ['month', 'quarter', 'year'].includes(qs.group) ? qs.group : 'month';
    const years = Math.min(10, Math.max(1, Number(qs.years) || 3)), from = new Date(Date.UTC(new Date().getUTCFullYear() - years + 1, 0, 1));
    const metric = ['sales', 'margin', 'collections', 'purchases'].includes(qs.metric) ? qs.metric : 'sales';
    const fmt = group === 'year' ? 'YYYY' : group === 'quarter' ? `YYYY-"Q"Q` : 'YYYY-MM';
    let rows: any[];
    if (metric === 'sales') rows = await q(`SELECT to_char(date_trunc('${group}', i."issueDate"), '${fmt}') p, SUM(${SIGNED} * i.subtotal)::float v, COUNT(*)::int n FROM invoice i WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" >= $2 GROUP BY p ORDER BY p`, ctx.companyId, from);
    else if (metric === 'margin') rows = await q(`SELECT to_char(date_trunc('${group}', i."issueDate"), '${fmt}') p, SUM(${SIGNED} * (il."lineTotal" - il."vatAmount" - il.cost * il.qty))::float v, COUNT(DISTINCT i.id)::int n FROM invoice_line il JOIN invoice i ON i.id = il."invoiceId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" >= $2 GROUP BY p ORDER BY p`, ctx.companyId, from);
    else if (metric === 'collections') rows = await q(`SELECT to_char(date_trunc('${group}', "receiptDate"), '${fmt}') p, SUM(amount)::float v, COUNT(*)::int n FROM receipt WHERE "companyId" = $1 AND status = 'posted' AND "receiptDate" >= $2 GROUP BY p ORDER BY p`, ctx.companyId, from);
    else rows = await q(`SELECT to_char(date_trunc('${group}', "orderDate"), '${fmt}') p, SUM(total)::float v, COUNT(*)::int n FROM purchase_order WHERE "companyId" = $1 AND status NOT IN ('draft','cancelled') AND "orderDate" >= $2 GROUP BY p ORDER BY p`, ctx.companyId, from);
    return { metric, group, series: rows.map((r) => ({ period: r.p, value: f(r.v), count: r.n })) };
  });
  app.get('/api/v1/reports/history/drill', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const qs = req.query as any, p = String(qs.period ?? ''), metric = qs.metric ?? 'sales';
    const m = /^(\d{4})(?:-(\d{2})|-Q(\d))?$/.exec(p); if (!m) throw bad('Invalid period');
    const y = Number(m[1]); const from = m[2] ? new Date(Date.UTC(y, Number(m[2]) - 1, 1)) : m[3] ? new Date(Date.UTC(y, (Number(m[3]) - 1) * 3, 1)) : new Date(Date.UTC(y, 0, 1));
    const to = m[2] ? new Date(Date.UTC(y, Number(m[2]), 0)) : m[3] ? new Date(Date.UTC(y, Number(m[3]) * 3, 0)) : new Date(Date.UTC(y, 11, 31));
    if (metric === 'collections') return { slug: 'receipt', rows: await q(`SELECT r.id, r.number label, cu.name sub, r.amount::float value, r."receiptDate" date FROM receipt r JOIN customer cu ON cu.id = r."customerId" WHERE r."companyId" = $1 AND r.status = 'posted' AND r."receiptDate" BETWEEN $2 AND $3 ORDER BY r."receiptDate" DESC LIMIT 200`, ctx.companyId, from, to) };
    if (metric === 'purchases') return { slug: 'purchase-order', rows: await q(`SELECT po.id, po.number label, s.name sub, po.total::float value, po."orderDate" date FROM purchase_order po JOIN supplier s ON s.id = po."supplierId" WHERE po."companyId" = $1 AND po.status NOT IN ('draft','cancelled') AND po."orderDate" BETWEEN $2 AND $3 ORDER BY po."orderDate" DESC LIMIT 200`, ctx.companyId, from, to) };
    return { slug: 'invoice', rows: await q(`SELECT i.id, i.number label, cu.name sub, (${SIGNED} * i.total)::float value, i."issueDate" date FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $2 AND $3 ORDER BY i."issueDate" DESC LIMIT 200`, ctx.companyId, from, to) };
  });

  // ---------- table reports (+ export, scheduling) ----------
  app.get('/api/v1/reports/:name', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; const r = TABLES[req.params.name]; if (!r) throw notFound('Report');
    need(ctx, ...r.need);
    return { data: await r.run(ctx, req.query) };
  });
  app.get('/api/v1/reports/:name/export', { preHandler: authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx; const r = TABLES[req.params.name]; if (!r) throw notFound('Report');
    need(ctx, ...r.need);
    const t = await r.run(ctx, req.query); const fmt = String((req.query as any).format ?? 'xlsx');
    if (fmt === 'pdf' || fmt === 'html') { reply.header('Content-Type', 'text/html; charset=utf-8').header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data: https:; font-src data:; base-uri 'none'; form-action 'none'"); return reply.send(toHtml(t, ((req.query as any).lang as any) === 'en' ? 'en' : ctx.locale)); }
    const file = await tableToFile(t, fmt);
    reply.header('Content-Type', file.mime).header('Content-Disposition', `attachment; filename="${req.params.name}.${file.ext}"`);
    return reply.send(file.buf);
  });

  // ---------- vehicle dashboards (VEH-01..03, CPT-08) ----------
  app.get('/api/v1/vehicles/:id/dashboard', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const v = await prisma.vehicle.findFirst({ where: { id: req.params.id, companyId: ctx.companyId, ...(ctx.kind === 'customer' ? { customerId: ctx.customerId } : {}) } });
    if (!v) throw notFound('Vehicle');
    if (ctx.kind === 'staff') need(ctx, 'masterdata', 'vehicle');
    if (ctx.kind === 'supplier') throw forbidden();
    return { data: await vehicleDashboard(ctx.companyId, [v.id], qsOf(req.query)) };
  });
  app.get('/api/v1/customers/:id/vehicle-dashboard', { preHandler: authenticate, ...lim }, async (req: any) => {
    const ctx: Ctx = req.ctx; const cid = ctx.kind === 'customer' ? ctx.customerId! : req.params.id;
    if (ctx.kind === 'staff') need(ctx, 'masterdata', 'customer'); if (ctx.kind === 'supplier') throw forbidden();
    const vs = await prisma.vehicle.findMany({ where: { companyId: ctx.companyId, customerId: cid }, select: { id: true } });
    return { data: await vehicleDashboard(ctx.companyId, vs.map((x) => x.id), qsOf(req.query)) };
  });

  // ---------- forecasting (RPT-11 / AI-4) ----------
  app.get('/api/v1/reports/forecast/latest', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'marketplace', 'forecast');
    const rows = await q<any>(`SELECT DISTINCT ON (f."partId") f.*, p."partNumber", p.name FROM forecast f JOIN part p ON p.id = f."partId" WHERE f."companyId" = $1 ORDER BY f."partId", f."createdAt" DESC`, ctx.companyId);
    return { data: rows.map((r) => ({ partId: r.partId, part: `${r.partNumber} — ${r.name}`, segment: r.segment, predictedQty: f(r.predictedQty), predictedPrice: f(r.predictedPrice), mape: r.mape == null ? null : f(r.mape), model: r.model, periodStart: r.periodStart })).sort((a, b) => b.predictedQty - a.predictedQty) };
  });
  app.post('/api/v1/reports/forecast/run', { preHandler: authenticate, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'marketplace', 'forecast');
    return { count: await runForecast(ctx.companyId), message: 'Forecasts refreshed' };
  });
  void exposure;
}
const qsOf = (x: any) => ({ from: x?.from, to: x?.to });

async function vehicleDashboard(companyId: string, vehicleIds: string[], qs: { from?: string; to?: string }) {
  if (!vehicleIds.length) return { totals: { spend: 0, vehicles: 0 }, byCategory: [], byMonth: [], byVehicle: [], history: [], upcoming: [] };
  const to = iso(qs.to, today()), from = iso(qs.from, new Date(Date.UTC(new Date().getUTCFullYear() - 1, new Date().getUTCMonth(), 1)));
  // invoices linked to a vehicle via request, job card or POS sale
  const inv = `(SELECT i.id, v.vid FROM invoice i JOIN request r ON r.id = i."requestId" JOIN (SELECT unnest($2::text[]) vid) v ON v.vid = r."vehicleId"
      UNION SELECT i.id, jc."vehicleId" FROM invoice i JOIN job_card jc ON jc."invoiceId" = i.id WHERE jc."vehicleId" = ANY($2::text[])
      UNION SELECT i.id, ps."vehicleId" FROM invoice i JOIN pos_sale ps ON ps."invoiceId" = i.id WHERE ps."vehicleId" = ANY($2::text[]))`;
  const lines = await q<any>(`SELECT x.vid, i.id inv_id, i.number, i."issueDate" d, il.description, il.qty::float qty, (${SIGNED} * il."lineTotal")::float total, COALESCE(cat.name, CASE WHEN p.id IS NULL THEN 'Service & labour' ELSE 'Other parts' END) category FROM ${inv} x JOIN invoice i ON i.id = x.id JOIN invoice_line il ON il."invoiceId" = i.id LEFT JOIN part p ON p.id = il."partId" LEFT JOIN category cat ON cat.id = p."categoryId" WHERE i."companyId" = $1 AND ${ISSUED} AND i."issueDate" BETWEEN $3 AND $4 ORDER BY i."issueDate" DESC`, companyId, vehicleIds, from, to);
  const sum = (key: (l: any) => string) => { const m = new Map<string, number>(); for (const l of lines) m.set(key(l), (m.get(key(l)) ?? 0) + l.total); return [...m].map(([name, value]) => ({ name, value: f(value) })); };
  const vs = await prisma.vehicle.findMany({ where: { id: { in: vehicleIds } } });
  const vName = (id: string) => { const v = vs.find((x) => x.id === id); return v ? `${v.make ?? ''} ${v.model ?? ''} ${v.plate ?? v.vin}`.trim() : id; };
  const rem = await prisma.vehicleReminder.findMany({ where: { vehicleId: { in: vehicleIds }, status: { in: ['upcoming', 'sent'] } }, orderBy: { dueDate: 'asc' } });
  return {
    totals: { spend: f(lines.reduce((s, l) => s + l.total, 0)), vehicles: vehicleIds.length },
    byCategory: sum((l) => l.category).sort((a, b) => b.value - a.value), byMonth: sum((l) => new Date(l.d).toISOString().slice(0, 7)).sort((a, b) => a.name.localeCompare(b.name)),
    byVehicle: sum((l) => vName(l.vid)).sort((a, b) => b.value - a.value),
    history: lines.slice(0, 200).map((l) => ({ date: new Date(l.d).toISOString().slice(0, 10), vehicle: vName(l.vid), invoice: l.number, description: l.description, qty: l.qty, amount: f(l.total), category: l.category, invoiceId: l.inv_id })),
    upcoming: rem.map((r) => ({ id: r.id, vehicle: vName(r.vehicleId), service: r.serviceName, dueDate: r.dueDate, dueMileage: r.dueMileage, status: r.status })),
  };
}
