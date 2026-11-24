import QRCode from 'qrcode';
import type { FastifyInstance } from 'fastify';
import Papa from 'papaparse';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@erp/db';
import { BY_KEY, can } from '@erp/shared';
import { Ctx, D, HttpError, addDays, audit, bad, conflict, forbidden, getSetting, notFound, notifyRole, num, sys, today } from '../core/base';
import { authenticate } from '../core/auth-plugin';
import { authorize, createRow, runAction, scopeWhere } from '../core/crud';
import { askAssistant, decodeVinFull, suggestParts } from '../services/ai';
import { exposure } from '../services/credit';
import { comparison, recomputeSupplierScores } from '../domain/procurement';
import { verifyScan } from '../domain/logistics';
import { postReceipt } from '../domain/finance';
import { createCheckout, PAYMENT_SECRET, sendMessage, signPayload } from '../adapters';
import { customerStatement } from './reports';
import { searchParts } from '../services/catalogue';
import { runForecast, suggestReorders, generateVehicleReminders } from '../services/forecast';
import { runReminders } from '../worker';

const staff = (ctx: Ctx) => { if (ctx.kind !== 'staff') throw forbidden(); };
const need = (ctx: Ctx, mod: string, slug: string, verb = 'read') => { staff(ctx); if (!can(ctx.perms, { mod, slug }, verb)) throw forbidden('You do not have permission for this'); };
const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
const sysCtx = (companyId: string, userId?: string | null): Ctx => ({ userId: userId ?? '', companyId, role: 'system', perms: ['*'], kind: 'staff', locale: 'ar', internal: true });

/** Online payment confirmed by the gateway: idempotent (gatewayTxnId), creates + posts + allocates the receipt. */
export async function applyOnlinePayment(p: { txnId: string; invoiceId: string; amount: number }) {
  const inv = await prisma.invoice.findUnique({ where: { id: p.invoiceId } });
  if (!inv || !inv.customerId) throw notFound('Invoice');
  const dup = await prisma.receipt.findFirst({ where: { companyId: inv.companyId, gatewayTxnId: p.txnId } });
  if (dup) return { duplicate: true, receiptId: dup.id };
  if (p.amount <= 0 || D(p.amount).gt(D(inv.balance))) throw bad(`Payment amount ${p.amount} exceeds the invoice balance ${inv.balance}`);
  const ctx = sysCtx(inv.companyId, inv.createdById);
  const bank = await prisma.bankAccount.findFirst({ where: { companyId: inv.companyId, type: 'bank' } });
  const rc = await prisma.$transaction(async (tx) => {
    const r = await createRow(tx, ctx, BY_KEY.Receipt, { customerId: inv.customerId, method: 'online', amount: p.amount, receiptDate: today(), bankAccountId: bank?.id, reference: p.txnId, gatewayTxnId: p.txnId, status: 'draft' }, { trusted: true });
    await tx.receiptAllocation.create({ data: { companyId: inv.companyId, receiptId: r.id, invoiceId: inv.id, amount: p.amount } });
    await postReceipt(tx, ctx, r);
    await tx.receipt.update({ where: { id: r.id }, data: { status: 'posted' } });
    await audit(tx, ctx, 'Receipt', r.id, 'create', undefined, { online: true, txnId: p.txnId });
    return r;
  });
  return { duplicate: false, receiptId: rc.id };
}

export function registerOpsRoutes(app: FastifyInstance) {
  // ---------- public ----------
  app.get('/api/v1/public/config', async () => {
    const c = await prisma.company.findFirst();
    return { name: c?.name, nameAr: c?.nameAr, primaryColor: c?.primaryColor, defaultLocale: c?.defaultLocale ?? 'ar', logoUrl: c?.logoUrl };
  });

  // ---------- AI (AI-1 / AI-3) ----------
  app.post('/api/v1/ai/vin-decode', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind === 'supplier') throw forbidden();
    return { data: await prisma.$transaction((tx) => decodeVinFull(tx, ctx.companyId, req.body?.vin)) };
  });
  app.post('/api/v1/ai/suggest-parts', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx);
    const text = String(req.body?.text ?? '').trim(); if (text.length < 2) throw bad('Type at least 2 characters');
    return { data: await prisma.$transaction((tx) => suggestParts(tx, ctx, text, req.body?.vehicle, 8)) };
  });
  app.post('/api/v1/ai/assistant', { preHandler: authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx);
    if (!req.body?.question) throw bad('Ask a question');
    return askAssistant(ctx, req.body.question);
  });
  app.get('/api/v1/marketplace/search', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'marketplace', 'catalogue-item');
    const qs = req.query as any; const text = String(qs.q ?? '').trim(); if (text.length < 2) return { data: [] };
    const parts = await prisma.$transaction((tx) => searchParts(tx, ctx.companyId, text, { make: qs.make, model: qs.model, year: qs.year ? Number(qs.year) : null }, 10));
    const items = await prisma.catalogueItem.findMany({ where: { companyId: ctx.companyId, isActive: true, OR: [{ partId: { in: parts.map((p) => p.id) } }, { supplierPartNo: { contains: text, mode: 'insensitive' } }, { description: { contains: text, mode: 'insensitive' } }] }, include: { supplier: true, part: true }, take: 50, orderBy: { price: 'asc' } });
    return { data: items.map((i) => ({ id: i.id, supplier: i.supplier!.name, supplierId: i.supplierId, supplierPartNo: i.supplierPartNo, description: i.description, price: i.price, availability: i.availability, leadTimeDays: i.leadTimeDays, part: i.part ? `${i.part.partNumber} — ${i.part.name}` : null, matchStatus: i.matchStatus })) };
  });

  // ---------- RFQ comparison (PRC-03) ----------
  app.get('/api/v1/rfqs/:id/comparison', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'procurement', 'rfq');
    const rfq = await prisma.rfq.findFirst({ where: { id: req.params.id, companyId: ctx.companyId } }); if (!rfq) throw notFound('RFQ');
    return { data: await prisma.$transaction((tx) => comparison(tx, ctx.companyId, rfq.id)) };
  });

  // ---------- logistics (LOG-02, LOG-09) ----------
  app.post('/api/v1/logistics/verify', { preHandler: authenticate, config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx);
    const b = req.body ?? {}; if (!b.barcode) throw bad('barcode is required');
    return { data: await prisma.$transaction((tx) => verifyScan(tx, ctx, { kind: b.kind ?? 'receive', barcode: String(b.barcode), qty: Number(b.qty ?? 1), poId: b.poId, deliveryNoteId: b.deliveryNoteId, poLineId: b.poLineId, deliveryLineId: b.deliveryLineId })) };
  });
  app.get('/api/v1/sync/pull', { preHandler: authenticate, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx);
    const pos = await prisma.purchaseOrder.findMany({ where: { companyId: ctx.companyId, status: { in: ['sent', 'confirmed', 'partially_received'] } }, orderBy: { expectedDate: 'asc' }, take: 100, include: { supplier: { select: { name: true } } } });
    const poLines = await prisma.poLine.findMany({ where: { poId: { in: pos.map((p) => p.id) }, status: { in: ['open', 'partially_received'] } }, include: { part: { include: { PartXref_partId: true } as any } } });
    const isDriver = ctx.role === 'driver';
    const dns = await prisma.deliveryNote.findMany({ where: { companyId: ctx.companyId, status: { in: ['assigned', 'out_for_delivery', ...(isDriver ? [] : ['planned'])] }, ...(isDriver ? { driverId: ctx.userId } : {}) }, orderBy: [{ plannedDate: 'asc' }, { routeSeq: 'asc' }], take: 100 });
    const dls = await prisma.deliveryLine.findMany({ where: { deliveryNoteId: { in: dns.map((d) => d.id) } }, include: { part: { include: { PartXref_partId: true } as any } } });
    const custs = await prisma.customer.findMany({ where: { id: { in: dns.map((d) => d.customerId!).filter(Boolean) } }, select: { id: true, name: true, phone: true } });
    const addrs = await prisma.customerAddress.findMany({ where: { id: { in: dns.map((d) => d.addressId!).filter(Boolean) } } });
    const codes = (p: any) => [p.partNumber, ...(p.PartXref_partId ?? []).map((x: any) => x.xrefNumber)];
    return { cursor: new Date().toISOString(),
      purchaseOrders: pos.map((p) => ({ id: p.id, number: p.number, supplier: p.supplier?.name, expectedDate: p.expectedDate, status: p.status, lines: poLines.filter((l) => l.poId === p.id).map((l: any) => ({ id: l.id, partId: l.partId, partNumber: l.part?.partNumber, name: l.part?.name, codes: codes(l.part), qty: num(l.qty), received: num(l.receivedQty) })) })),
      deliveries: dns.map((d) => ({ id: d.id, number: d.number, status: d.status, plannedDate: d.plannedDate, routeArea: d.routeArea, routeSeq: d.routeSeq, customer: custs.find((c) => c.id === d.customerId), address: addrs.find((a) => a.id === d.addressId) ?? null, lines: dls.filter((l) => l.deliveryNoteId === d.id).map((l: any) => ({ id: l.id, partId: l.partId, partNumber: l.part?.partNumber, name: l.part?.name, codes: codes(l.part), qty: num(l.qty), delivered: num(l.deliveredQty) })) })) };
  });
  app.post('/api/v1/sync/push', { preHandler: authenticate, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx);
    const events: any[] = Array.isArray(req.body?.events) ? req.body.events.slice(0, 200) : [];
    if (!events.length) throw bad('No events');
    events.sort((a, b) => String(a.at ?? '').localeCompare(String(b.at ?? '')));
    // The phone/PWA invents its own device id; register it on first sync so scan/POD rows can reference it (FK), and never accept one that belongs to another company.
    for (const did of new Set(events.map((e) => e.deviceId).filter((d) => typeof d === 'string' && /^[0-9a-f-]{36}$/i.test(d)))) {
      const known = await prisma.device.findUnique({ where: { id: did }, select: { companyId: true } });
      if (!known) await prisma.device.create({ data: { id: did, companyId: ctx.companyId, name: 'Mobile app', kind: 'pwa', userId: ctx.userId, createdById: ctx.userId, lastSeenAt: new Date() } });
      else if (known.companyId !== ctx.companyId) for (const e of events) if (e.deviceId === did) e.deviceId = undefined;
    }
    for (const e of events) if (e.deviceId && !/^[0-9a-f-]{36}$/i.test(String(e.deviceId))) e.deviceId = undefined;
    const results: any[] = [];
    for (const e of events) {
      const id = String(e.clientEventId ?? ''); if (!id) { results.push({ clientEventId: id, status: 'error', message: 'clientEventId is required' }); continue; }
      const seen = await prisma.integrationMessage.findFirst({ where: { companyId: ctx.companyId, provider: 'sync', idempotencyKey: id } });
      if (seen) { results.push({ clientEventId: id, status: 'duplicate', result: seen.responseBody }); continue; }
      let status: 'ok' | 'error' = 'ok', out: any = null, message: string | undefined, code: string | undefined;
      try {
        const p = e.payload ?? {};
        if (e.type === 'scan') { out = await prisma.$transaction((tx) => createRow(tx, ctx, BY_KEY.ScanEvent, { ...p, clientEventId: id, deviceId: e.deviceId ?? p.deviceId, scannedAt: e.at ?? p.scannedAt })); out = { id: out.id, result: out.result }; }
        else if (e.type === 'receipt') {
          authorize(ctx, BY_KEY.GoodsReceipt, 'create');
          const gr = await prisma.$transaction((tx) => createRow(tx, ctx, BY_KEY.GoodsReceipt, { poId: p.poId, deliveryRef: p.deliveryRef ?? id, notes: p.notes, status: 'draft', children: { GrLine: p.lines } }));
          const r: any = await runAction(ctx, BY_KEY.GoodsReceipt, gr.id, 'confirm', {}); out = { id: gr.id, status: r.data.status };
        }
        else if (['dispatch', 'pod', 'fail'].includes(e.type)) { const act = e.type === 'pod' ? 'deliver' : e.type; const r: any = await runAction(ctx, BY_KEY.DeliveryNote, p.deliveryNoteId, act, { ...p, capturedAt: e.at, deviceId: e.deviceId }, { ...scopeWhere(BY_KEY.DeliveryNote, ctx), ...(ctx.role === 'driver' ? { driverId: ctx.userId } : {}) }); out = { status: r.data.status, invoiceId: r.result?.invoiceId }; }
        else throw bad(`Unknown event type ${e.type}`);
      } catch (err: any) { status = 'error'; message = err.message; code = err.code; if (err.code === 'invalid_state') status = 'ok', out = { note: 'already applied', message }; }
      await prisma.integrationMessage.create({ data: { companyId: ctx.companyId, provider: 'sync', direction: 'in', endpoint: e.type, requestBody: e as any, responseBody: out ?? { message, code }, status: status === 'ok' ? 'ok' : 'error', error: message, idempotencyKey: id } });
      results.push({ clientEventId: id, status, code, message, result: out });
    }
    if (e0(events)) await prisma.device.updateMany({ where: { companyId: ctx.companyId, id: events[0].deviceId }, data: { lastSeenAt: new Date() } });
    return { results, summary: { ok: results.filter((r) => r.status === 'ok').length, duplicate: results.filter((r) => r.status === 'duplicate').length, error: results.filter((r) => r.status === 'error').length } };
  });

  // ---------- customer portal (CPT-04/05/06) ----------
  app.get('/api/v1/portal/customer/dashboard', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'customer') throw forbidden(); const cid = ctx.customerId!;
    const [reqs, quotes, orders, invs, cust, exp, due] = await Promise.all([
      prisma.request.count({ where: { customerId: cid, status: { in: ['submitted', 'in_sourcing'] } } }), prisma.quotation.count({ where: { customerId: cid, status: { in: ['sent', 'viewed'] } } }),
      prisma.salesOrder.count({ where: { customerId: cid, status: { in: ['confirmed', 'partially_delivered', 'on_hold'] } } }), prisma.invoice.count({ where: { customerId: cid, balance: { gt: 0 }, status: { in: ['cleared', 'reported', 'partially_paid'] } } }),
      prisma.customer.findUnique({ where: { id: cid } }), exposure(prisma, ctx.companyId, cid),
      prisma.invoice.findMany({ where: { customerId: cid, balance: { gt: 0 }, status: { in: ['cleared', 'reported', 'partially_paid'] } }, orderBy: { dueDate: 'asc' }, take: 5, select: { id: true, number: true, dueDate: true, balance: true } }),
    ]);
    return { customer: { name: cust?.name, code: cust?.code }, openRequests: reqs, quotationsToReview: quotes, activeOrders: orders, unpaidInvoices: invs, credit: { limit: exp.limit, balance: exp.invoices, exposure: exp.total, available: exp.available, overdue: exp.overdue }, nextDue: due };
  });
  app.post('/api/v1/portal/quotations/:id/viewed', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'customer') throw forbidden();
    const r = await prisma.quotation.updateMany({ where: { id: req.params.id, customerId: ctx.customerId!, status: 'sent' }, data: { status: 'viewed', viewedAt: new Date() } });
    return { updated: r.count };
  });
  app.post('/api/v1/portal/invoices/:id/pay', { preHandler: authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'customer') throw forbidden();
    const inv = await prisma.invoice.findFirst({ where: { id: req.params.id, customerId: ctx.customerId!, balance: { gt: 0 }, status: { in: ['cleared', 'reported', 'partially_paid'] } } });
    if (!inv) throw notFound('Unpaid invoice');
    const amount = req.body?.amount ? Number(req.body.amount) : num(inv.balance);
    if (!(amount > 0) || amount > num(inv.balance)) throw bad(`Enter an amount up to ${num(inv.balance).toFixed(2)}`);
    return { data: await createCheckout(prisma, ctx.companyId, { invoiceId: inv.id, invoiceNumber: inv.number ?? '', amount, customerId: ctx.customerId! }) };
  });
  app.get('/api/v1/portal/customer/statement', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'customer') throw forbidden();
    const c = await prisma.customer.findUnique({ where: { id: ctx.customerId! } });
    return { data: await customerStatement(ctx.companyId, c, req.query) };
  });

  // ---------- supplier portal (SUP-01..03) ----------
  app.get('/api/v1/portal/supplier/dashboard', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'supplier') throw forbidden(); const sid = ctx.supplierId!;
    const [rfqs, pos, bills, claims, quotes] = await Promise.all([
      prisma.rfqSupplier.count({ where: { supplierId: sid, status: { in: ['invited', 'viewed'] }, rfq: { status: { in: ['sent', 'collecting'] } } } }), prisma.purchaseOrder.count({ where: { supplierId: sid, status: 'sent' } }),
      prisma.supplierBill.aggregate({ where: { supplierId: sid, status: 'posted', docType: 'bill' }, _sum: { total: true, paidAmount: true } }), prisma.supplierClaim.count({ where: { supplierId: sid, status: { in: ['open', 'submitted'] } } }), prisma.supplierQuote.count({ where: { supplierId: sid, status: 'draft' } }),
    ]);
    return { openRfqs: rfqs, posToConfirm: pos, draftQuotes: quotes, openClaims: claims, unpaid: num(bills._sum.total) - num(bills._sum.paidAmount) };
  });
  app.get('/api/v1/portal/supplier/rfqs', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'supplier') throw forbidden();
    const page = Math.max(1, Number((req.query as any).page) || 1), limit = Math.min(50, Number((req.query as any).limit) || 20);
    const where = { supplierId: ctx.supplierId!, rfq: { status: { not: 'draft' } } };
    const [total, rows] = await Promise.all([prisma.rfqSupplier.count({ where }), prisma.rfqSupplier.findMany({ where, include: { rfq: true }, orderBy: { sentAt: 'desc' }, skip: (page - 1) * limit, take: limit })]);
    const quotes = await prisma.supplierQuote.findMany({ where: { supplierId: ctx.supplierId!, rfqId: { in: rows.map((r) => r.rfqId) } }, select: { id: true, rfqId: true, status: true } });
    return { data: rows.map((r) => ({ id: r.rfqId, number: r.rfq.number, status: r.rfq.status, invitation: r.status, deadline: r.rfq.deadline, sentAt: r.sentAt, quote: quotes.find((q) => q.rfqId === r.rfqId) ?? null })), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  });
  app.get('/api/v1/portal/supplier/rfqs/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'supplier') throw forbidden();
    const inv = await prisma.rfqSupplier.findFirst({ where: { rfqId: req.params.id, supplierId: ctx.supplierId! }, include: { rfq: true } });
    if (!inv) throw notFound('RFQ');
    if (inv.status === 'invited') await prisma.rfqSupplier.update({ where: { id: inv.id }, data: { status: 'viewed' } });
    const lines = await prisma.rfqLine.findMany({ where: { rfqId: inv.rfqId }, include: { part: { include: { brand: true } } } });
    const quote = await prisma.supplierQuote.findFirst({ where: { rfqId: inv.rfqId, supplierId: ctx.supplierId! }, include: { SupplierQuoteLine_supplierQuoteId: true } as any });
    return { data: { id: inv.rfqId, number: inv.rfq.number, status: inv.rfq.status, deadline: inv.rfq.deadline, open: ['sent', 'collecting'].includes(inv.rfq.status) && (!inv.rfq.deadline || inv.rfq.deadline > new Date()), notes: inv.rfq.notes, lines: lines.map((l: any) => ({ id: l.id, partNumber: l.part?.partNumber, name: l.part?.name, brand: l.part?.brand?.name, qty: num(l.qty) })), quote } };
  });


  // ---------- supplier catalogue bulk upload (SUP-05) ----------
  app.post('/api/v1/portal/supplier/catalogue/import', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; if (ctx.kind !== 'supplier') throw forbidden();
    let buf: Buffer | null = null, filename = '';
    for await (const part of req.parts()) if (part.type === 'file') { const cs: Buffer[] = []; for await (const x of part.file) cs.push(x); buf = Buffer.concat(cs); filename = part.filename; }
    if (!buf) throw bad('Choose a CSV file');
    const p = Papa.parse<Record<string, string>>(buf.toString('utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    if (p.data.length > 5000) throw bad('Limited to 5,000 rows per upload');
    const errors: { row: number; message: string }[] = []; let created = 0, updated = 0;
    await prisma.$transaction(async (tx) => {
      let i = 1;
      for (const r of p.data) {
        i++;
        const no = String(r['supplierpartno'] ?? r['part'] ?? r['partno'] ?? '').trim(); const price = Number(r['price'] ?? r['unitprice'] ?? NaN);
        if (!no) { errors.push({ row: i, message: 'Missing supplierPartNo' }); continue; } if (!(price >= 0)) { errors.push({ row: i, message: 'Invalid price' }); continue; }
        const availability = ['in_stock', 'on_order', 'unavailable'].includes(String(r['availability'])) ? String(r['availability']) : 'in_stock';
        const ex = await tx.catalogueItem.findFirst({ where: { supplierId: ctx.supplierId!, supplierPartNo: no } });
        const data: any = { description: r['description'], price, availability, leadTimeDays: r['leadtimedays'] ? Number(r['leadtimedays']) : undefined };
        if (ex) { await tx.catalogueItem.update({ where: { id: ex.id }, data }); updated++; } else { await createRow(tx, { ...ctx, internal: true }, BY_KEY.CatalogueItem, { ...data, supplierId: ctx.supplierId, supplierPartNo: no }, { trusted: true }); created++; }
      }
      if (errors.length) throw new HttpError(422, 'import_rollback', 'rollback');
    }, { timeout: 120000 }).catch((e) => { if (!(e instanceof HttpError && e.code === 'import_rollback')) throw e; });
    return { status: errors.length ? 'failed' : 'completed', created: errors.length ? 0 : created, updated: errors.length ? 0 : updated, errors: errors.slice(0, 100), file: filename, message: errors.length ? 'Nothing was imported. Fix the errors and upload again.' : `Imported ${created} new and updated ${updated} existing item(s).` };
  });

  // ---------- credit & collections extras ----------
  app.get('/api/v1/credit/exposure/:customerId', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'credit', 'credit-profile');
    return { data: await exposure(prisma, ctx.companyId, req.params.customerId) };
  });
  app.get('/api/v1/credit/worklist', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'credit', 'promise-to-pay');
    const grace = await getSetting<number>(ctx.companyId, 'credit.grace_days', 5);
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT cu.id, cu.name, cu.phone, SUM(i.balance)::float overdue, COUNT(*)::int invoices, MAX(CURRENT_DATE - i."dueDate")::int oldest FROM invoice i JOIN customer cu ON cu.id = i."customerId" WHERE i."companyId" = $1 AND i.balance > 0 AND i."dueDate" < CURRENT_DATE - $2::int AND i.status IN ('cleared','reported','partially_paid') GROUP BY cu.id ORDER BY overdue DESC LIMIT 200`, ctx.companyId, grace);
    const ids = rows.map((r) => r.id);
    const [promises, acts] = await Promise.all([prisma.promiseToPay.findMany({ where: { customerId: { in: ids }, status: 'open' } }), prisma.collectionActivity.findMany({ where: { customerId: { in: ids } }, orderBy: { createdAt: 'desc' }, take: 500 })]);
    const list = rows.map((r) => {
      const ps = promises.filter((p) => p.customerId === r.id), last = acts.find((a) => a.customerId === r.id);
      const broken = ps.some((p) => p.promisedDate < today());
      const next = last?.nextActionDate ?? null;
      const priority = Math.round(r.overdue * (1 + Math.min(r.oldest, 120) / 30) * (broken ? 1.5 : 1));
      return { customerId: r.id, name: r.name, phone: r.phone, overdue: r.overdue, invoices: r.invoices, oldestDays: r.oldest, promises: ps.map((p) => ({ id: p.id, date: p.promisedDate, amount: num(p.amount) })), brokenPromise: broken, lastActivity: last ? { kind: last.kind, outcome: last.outcome, at: last.createdAt } : null, nextActionDate: next, dueToday: !!next && next <= today(), priority };
    }).sort((a, b) => b.priority - a.priority);
    return { data: list, summary: { customers: list.length, totalOverdue: list.reduce((s, l) => s + l.overdue, 0), dueToday: list.filter((l) => l.dueToday || l.promises.some((p) => p.date <= today())).length } };
  });
  app.post('/api/v1/credit/statements/send', { preHandler: authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'credit', 'credit-profile');
    const c = await prisma.customer.findFirst({ where: { id: req.body?.customerId, companyId: ctx.companyId } }); if (!c) throw notFound('Customer');
    const link = `${WEB}/portal/statement`;
    const r = await sendMessage(prisma, ctx.companyId, { channel: req.body?.channel === 'email' ? 'email' : 'whatsapp', to: req.body?.channel === 'email' ? c.email : c.phone, template: 'overdue', lang: 'ar', vars: { number: 'statement', balance: '', days: '', link } });
    return { ok: r.ok, skipped: (r as any).skipped };
  });
  app.get('/api/v1/customers/:id/360', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'masterdata', 'customer');
    const id = req.params.id; const c = ctx.companyId;
    const cust = await prisma.customer.findFirst({ where: { id, companyId: c }, include: { CustomerContact_customerId: true, CustomerAddress_customerId: true } as any });
    if (!cust) throw notFound('Customer');
    const take = 8, sel = { orderBy: { createdAt: 'desc' as const }, take };
    const [requests, quotes, orders, deliveries, invoices, receipts, vehicles, activities, profile, holds, alerts, exp, counts] = await Promise.all([
      prisma.request.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, status: true, createdAt: true } }), prisma.quotation.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, status: true, total: true, createdAt: true } }),
      prisma.salesOrder.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, status: true, total: true, createdAt: true } }), prisma.deliveryNote.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, status: true, plannedDate: true } }),
      prisma.invoice.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, status: true, total: true, balance: true, dueDate: true, invoiceType: true } }), prisma.receipt.findMany({ where: { customerId: id }, ...sel, select: { id: true, number: true, amount: true, status: true, receiptDate: true } }),
      prisma.vehicle.findMany({ where: { customerId: id }, take: 20, select: { id: true, vin: true, make: true, model: true, year: true, plate: true } }), prisma.activity.findMany({ where: { customerId: id }, ...sel, select: { id: true, kind: true, subject: true, status: true, dueAt: true, notes: true } }),
      prisma.creditProfile.findFirst({ where: { customerId: id } }), prisma.creditHold.findMany({ where: { customerId: id, status: 'held' } }), prisma.creditAlert.findMany({ where: { customerId: id, status: { in: ['open', 'ack'] } } }), exposure(prisma, c, id),
      Promise.all([prisma.request.count({ where: { customerId: id } }), prisma.quotation.count({ where: { customerId: id } }), prisma.salesOrder.count({ where: { customerId: id } }), prisma.invoice.count({ where: { customerId: id } })]),
    ]);
    return { data: { customer: cust, requests, quotations: quotes, orders, deliveries, invoices, receipts, vehicles, activities, credit: { profile, exposure: exp, holds, alerts }, counts: { requests: counts[0], quotations: counts[1], orders: counts[2], invoices: counts[3] } } };
  });

  // ---------- finance extras ----------
  app.post('/api/v1/bank-statements/import', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'bank-statement', 'create');
    let buf: Buffer | null = null, filename = 'statement.csv', bankAccountId = '';
    for await (const part of req.parts()) { if (part.type === 'file') { const cs: Buffer[] = []; for await (const x of part.file) cs.push(x); buf = Buffer.concat(cs); filename = part.filename; } else if (part.fieldname === 'bankAccountId') bankAccountId = String(part.value); }
    if (!buf) throw bad('Choose a CSV file'); if (!bankAccountId) throw bad('Choose the bank account');
    const ba = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId: ctx.companyId } }); if (!ba) throw notFound('Bank account');
    const p = Papa.parse<Record<string, string>>(buf.toString('utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
    const pick = (r: any, ...keys: string[]) => { for (const k of keys) if (r[k] != null && r[k] !== '') return r[k]; return ''; };
    const lines = p.data.map((r, i) => { const date = new Date(pick(r, 'date', 'txn date', 'transaction date', 'التاريخ')); if (isNaN(date.getTime())) throw bad(`Row ${i + 2}: invalid date`); const n = (x: any) => Number(String(x || 0).replace(/[^\d.\-]/g, '')) || 0; return { txnDate: date, description: pick(r, 'description', 'details', 'narrative', 'البيان'), reference: pick(r, 'reference', 'ref', 'المرجع'), debit: n(pick(r, 'debit', 'withdrawal', 'مدين')), credit: n(pick(r, 'credit', 'deposit', 'دائن')), balance: pick(r, 'balance', 'الرصيد') ? n(pick(r, 'balance', 'الرصيد')) : undefined }; });
    if (!lines.length) throw bad('No rows found');
    const dates = lines.map((l) => l.txnDate.getTime());
    const st = await prisma.$transaction((tx) => createRow(tx, ctx, BY_KEY.BankStatement, { bankAccountId, fileName: filename, periodStart: new Date(Math.min(...dates)).toISOString(), periodEnd: new Date(Math.max(...dates)).toISOString(), lineCount: lines.length, children: { BankStatementLine: lines.map((l) => ({ ...l, txnDate: l.txnDate.toISOString(), matchStatus: 'unmatched' })) } }, { trusted: true }));
    return { data: { id: st.id, lines: lines.length }, message: `${lines.length} line(s) imported. Run auto-match next.` };
  });
  app.get('/api/v1/finance/zatca-qr/:invoiceId', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const inv = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, companyId: ctx.companyId }, select: { zatcaQr: true } }); if (!inv) throw notFound('Invoice');
    return { data: { svg: inv.zatcaQr ? await QRCode.toString(inv.zatcaQr, { type: 'svg', margin: 1, width: 180 }) : null } };
  });
  app.get('/api/v1/finance/lineage/:invoiceId', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'invoice');
    const inv = await prisma.invoice.findFirst({ where: { id: req.params.invoiceId, companyId: ctx.companyId } }); if (!inv) throw notFound('Invoice');
    const ils = await prisma.invoiceLine.findMany({ where: { invoiceId: inv.id }, include: { part: true } });
    const out: any[] = [];
    for (const il of ils) {
      const dl = il.deliveryLineId ? await prisma.deliveryLine.findUnique({ where: { id: il.deliveryLineId }, include: { deliveryNote: true } }) : null;
      const sol = il.salesOrderLineId ? await prisma.salesOrderLine.findUnique({ where: { id: il.salesOrderLineId }, include: { salesOrder: true } }) : null;
      const ql = sol?.quotationLineId ? await prisma.quotationLine.findUnique({ where: { id: sol.quotationLineId }, include: { quotation: true } }) : null;
      const al = ql?.requestLineId ? await prisma.awardLine.findFirst({ where: { rfqLine: { requestLineId: ql.requestLineId } }, include: { award: true } }) : null;
      const sql = al?.supplierQuoteLineId ? await prisma.supplierQuoteLine.findUnique({ where: { id: al.supplierQuoteLineId }, include: { supplierQuote: true } }) : null;
      const rl = ql?.requestLineId ? await prisma.requestLine.findUnique({ where: { id: ql.requestLineId }, include: { request: true } }) : null;
      const chain = [['Request', rl?.request?.number, rl?.requestId], ['Supplier quote', sql?.supplierQuote?.number, sql?.supplierQuoteId], ['Award', al?.award?.number, al?.awardId], ['Quotation', ql?.quotation?.number, ql?.quotationId], ['Sales order', sol?.salesOrder?.number, sol?.salesOrderId], ['Delivery', dl?.deliveryNote?.number, dl?.deliveryNoteId], ['Invoice', inv.number, inv.id]].map(([stage, number, id]) => ({ stage, number, id, ok: !!number }));
      out.push({ invoiceLineId: il.id, description: il.description, chain, complete: chain.every((c) => c.ok) || (!inv.salesOrderId && !il.deliveryLineId) });
    }
    return { data: { invoice: inv.number, requestId: inv.requestId, lines: out, singleEntry: out.every((l) => l.complete) } };
  });
  app.get('/api/v1/finance/daftra/reconciliation', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; need(ctx, 'finance', 'daftra-sync-log');
    const [invoices, synced, errors, mode] = await Promise.all([prisma.invoice.count({ where: { companyId: ctx.companyId, status: { in: ['cleared', 'reported', 'paid', 'partially_paid'] } } }), prisma.daftraSyncLog.count({ where: { companyId: ctx.companyId, entity: 'invoice', status: 'ok' } }), prisma.daftraSyncLog.count({ where: { companyId: ctx.companyId, status: 'error' } }), getSetting(ctx.companyId, 'daftra.mode', 'push')]);
    const tb = (await prisma.$queryRawUnsafe<any[]>(`SELECT COALESCE(SUM(debit),0)::float d, COALESCE(SUM(credit),0)::float c FROM journal_line WHERE "companyId" = $1`, ctx.companyId))[0];
    return { data: { mode, issuedInvoices: invoices, syncedInvoices: synced, syncErrors: errors, unsynced: Math.max(0, invoices - synced), trialBalance: { debit: tb.d, credit: tb.c, balanced: Math.abs(tb.d - tb.c) < 0.01 }, readyForCutover: mode === 'push' && errors === 0 && invoices - synced <= 0 && Math.abs(tb.d - tb.c) < 0.01 } };
  });
  app.post('/api/v1/finance/daftra/cutover', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; authorize(ctx, BY_KEY.Setting, 'update'); if (!ctx.perms.includes('*') && ctx.role !== 'finance') throw forbidden('Only finance or admin can cut over from Daftra');
    if (!req.body?.confirm) throw bad('Confirm the cut-over: Daftra becomes read-only and no more data is pushed to it.');
    await prisma.$transaction(async (tx) => { const s = await tx.setting.findFirst({ where: { companyId: ctx.companyId, key: 'daftra.mode' } }); await tx.setting.update({ where: { id: s!.id }, data: { value: { v: 'readonly' }, version: { increment: 1 } } }); await audit(tx, ctx, 'Setting', s!.id, 'action', s!.value, { v: 'readonly', cutover: true }); await notifyRole(tx, ctx.companyId, 'admin', { title: 'Daftra cut-over completed', body: 'The ERP is now the book of record.', severity: 'info', type: 'finance' }); });
    (await import('../core/base')).clearSettingCache();
    return { ok: true, message: 'Cut-over done. Daftra is now read-only.' };
  });

  // ---------- admin: run background jobs on demand ----------
  app.post('/api/v1/admin/jobs/:name', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; staff(ctx); if (!ctx.perms.includes('*') && !['finance', 'manager'].includes(ctx.role)) throw forbidden();
    const jobs: Record<string, () => Promise<any>> = {
      reminders: () => runReminders(ctx.companyId), 'supplier-scores': () => recomputeSupplierScores(ctx.companyId), forecast: () => runForecast(ctx.companyId), reorder: () => suggestReorders(ctx.companyId), 'vehicle-reminders': () => generateVehicleReminders(ctx.companyId),
      'credit-sweep': async () => (await import('../services/credit')).creditSweep(), 'zatca-retry': async () => (await import('../services/zatca')).zatcaRetrySweep(),
    };
    const j = jobs[req.params.name]; if (!j) throw notFound('Job');
    return { result: await j() };
  });

  // ---------- webhooks ----------
  app.post('/api/v1/webhooks/payment', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: any) => {
    const raw = JSON.stringify(req.body ?? {}); const sig = String(req.headers['x-signature'] ?? '');
    const expected = signPayload(raw);
    if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new HttpError(401, 'bad_signature', 'Invalid signature');
    const b = req.body; if (b.status !== 'paid') return { ok: true, ignored: true };
    const r = await applyOnlinePayment({ txnId: String(b.txnId), invoiceId: String(b.invoiceId), amount: Number(b.amount) });
    return { ok: true, ...r };
  });
  // dev-only fake gateway: the web /pay page calls this, which signs and applies the payment like a real gateway webhook
  app.post('/api/v1/public/fake-gateway/:id/complete', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any) => {
    if (process.env.NODE_ENV === 'production' || process.env.PAYMENT_GATEWAY_URL || process.env.ENABLE_FAKE_GATEWAY === '0') throw notFound('Route'); // development stand-in only
    const { invoiceId, amount } = req.body ?? {}; if (!invoiceId || !(Number(amount) > 0)) throw bad('invoiceId and amount are required');
    const r = await applyOnlinePayment({ txnId: String(req.params.id), invoiceId, amount: Number(amount) });
    return { ok: true, ...r };
  });
  app.post('/api/v1/webhooks/whatsapp', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req: any) => {
    const secret = process.env.WHATSAPP_WEBHOOK_SECRET; if (secret) { const sig = createHmac('sha256', secret).update(JSON.stringify(req.body ?? {})).digest('hex'); if (sig !== req.headers['x-signature']) throw new HttpError(401, 'bad_signature', 'Invalid signature'); }
    const company = await prisma.company.findFirst(); if (!company) return { ok: true };
    const body = req.body ?? {};
    if (/stop|إلغاء|توقف/i.test(String(body.text ?? ''))) { const list = await getSetting<string[]>(company.id, 'messaging.optout', []); if (body.from && !list.includes(body.from)) { const s = await prisma.setting.findFirst({ where: { companyId: company.id, key: 'messaging.optout' } }); if (s) await prisma.setting.update({ where: { id: s.id }, data: { value: { v: [...list, body.from] } } }); else await prisma.setting.create({ data: { companyId: company.id, key: 'messaging.optout', value: { v: [body.from] } } }); (await import('../core/base')).clearSettingCache(); } }
    await prisma.integrationMessage.create({ data: { companyId: company.id, provider: 'whatsapp', direction: 'in', endpoint: 'webhook', requestBody: body, status: 'ok' } });
    return { ok: true };
  });
  void PAYMENT_SECRET; void sys; void conflict; void addDays; void scopeWhere;
}
const e0 = (events: any[]) => !!events[0]?.deviceId;
