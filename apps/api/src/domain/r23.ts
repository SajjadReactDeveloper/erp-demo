// R2 (marketplace, vehicle services) and R3 (inventory, POS, workshop, loyalty) domain logic.
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { BY_KEY } from '@erp/shared';
import { Tx } from '@erp/db';
import { A, Ctx, D, H, addDays, bad, canApprove, conflict, forbidden, notifyRole, notifyUsers, num, r2, sys, today } from '../core/base';
import { createRow } from '../core/crud';
import { findPart, recordPrice, searchParts } from '../services/catalogue';
import { postJournal } from '../services/posting';
import { sendMessage } from '../adapters';
import { createCreditNote, issueInvoice, recalcInvoice } from './finance';

import dns from 'node:dns';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
// Every non-public range: loopback, private, link-local, CGNAT, documentation, multicast, reserved, 6to4/Teredo, ULA.
const blocked = new BlockList();
for (const [a, p] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]] as [string, number][]) blocked.addSubnet(a, p, 'ipv4');
for (const [a, p] of [['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001::', 32], ['2001:db8::', 32], ['2002::', 16], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as [string, number][]) blocked.addSubnet(a, p, 'ipv6');
/** IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:7f00:1) is checked as the IPv4 address it really is. */
function unmap(ip: string) {
  const m = ip.toLowerCase().match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/); if (!m) return ip; if (m[1]) return m[1];
  const hi = parseInt(m[2], 16), lo = parseInt(m[3], 16); return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}
const privateIp = (ip: string) => { const a = unmap(ip); const f = isIP(a); return !f || blocked.check(a, f === 4 ? 'ipv4' : 'ipv6'); };
const blockedErr = (m: string) => Object.assign(new Error(m), { code: 'BLOCKED_URL' });
/** DNS lookup used by the socket itself, so the address that is checked is the address that is connected to (no rebinding gap). */
const safeLookup = ((host: string, opts: any, cb: any) => dns.lookup(host, opts, (err, address: any, family) => {
  if (err) return cb(err, address, family);
  const list: string[] = Array.isArray(address) ? address.map((x: any) => x.address) : [address];
  if (list.some(privateIp)) return cb(blockedErr('Feed URL must point to a public host'), address, family);
  cb(null, address, family);
})) as any;
/** GET a public https JSON document: no redirects, 8s timeout, 5 MB cap, connection pinned to a validated public address. */
function fetchPublicJson(raw: string): Promise<any> {
  let u: URL; try { u = new URL(raw); } catch { throw blockedErr('Feed URL is not valid'); }
  if (u.protocol !== 'https:') throw blockedErr('Feed URL must use https');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && privateIp(host)) throw blockedErr('Feed URL must point to a public host');
  return new Promise((resolve, reject) => {
    const req = https.request(u, { method: 'GET', lookup: safeLookup, headers: { accept: 'application/json' }, timeout: 8000 }, (res) => {
      if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      const chunks: Buffer[] = []; let size = 0;
      res.on('data', (c: Buffer) => { size += c.length; if (size > 5 * 1024 * 1024) { req.destroy(new Error('Feed is too large')); } else chunks.push(c); });
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error('Feed must be JSON')); } });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Feed timed out'))); req.on('error', reject); req.end();
  });
}
// ================= MARKETPLACE (SUP-04..08) =================
A('VendorApplication.approve', async ({ ctx, tx, row }) => {
  if (await tx.supplier.findFirst({ where: { companyId: ctx.companyId, OR: [{ email: row.email }, ...(row.vatNumber ? [{ vatNumber: row.vatNumber }] : [])] } })) throw conflict('A supplier with this email or VAT number already exists');
  const sup = await createRow(tx, ctx, BY_KEY.Supplier, { name: row.companyName, email: row.email, phone: row.phone, vatNumber: row.vatNumber, brands: row.brands ?? [], categories: row.categories ?? [], status: 'active', paymentTermsDays: 30 }, { trusted: true });
  const role = await tx.role.findFirst({ where: { companyId: ctx.companyId, name: 'sales' } });
  const temp = randomBytes(6).toString('base64url');
  if (!(await tx.user.findFirst({ where: { email: row.email } }))) await tx.user.create({ data: { companyId: ctx.companyId, email: row.email, name: row.contactName, kind: 'supplier', supplierId: sup.id, roleId: role!.id, passwordHash: await bcrypt.hash(temp, 10), locale: 'ar' } });
  return { set: { supplierId: sup.id }, data: { supplierId: sup.id, tempPassword: temp }, message: `Supplier created. Temporary portal password: ${temp}` };
});

async function autoMatch(tx: Tx, ctx: Ctx, item: any) {
  const hit = await findPart(tx, ctx.companyId, item.supplierPartNo);
  if (hit) {
    await tx.catalogueItem.update({ where: { id: item.id }, data: { partId: hit.id, matchStatus: hit.exact ? 'matched' : 'suggested', matchConfidence: hit.exact ? 1 : 0.85 } });
    if (!hit.exact) await tx.catalogueMatch.create({ data: { companyId: ctx.companyId, catalogueItemId: item.id, candidatePartId: hit.id, score: 0.85 } });
    else if (item.price) await recordPrice(tx, ctx.companyId, { partId: hit.id, kind: 'supplier', price: item.price, supplierId: item.supplierId, source: 'catalogue' });
    return;
  }
  if (item.description) {
    const c = await searchParts(tx, ctx.companyId, item.description, undefined, 3);
    for (const x of c.filter((y) => y.score >= 0.5)) await tx.catalogueMatch.create({ data: { companyId: ctx.companyId, catalogueItemId: item.id, candidatePartId: x.id, score: x.score } });
    if (c.some((y) => y.score >= 0.5)) await tx.catalogueItem.update({ where: { id: item.id }, data: { matchStatus: 'suggested', matchConfidence: c[0].score } });
  }
}
H('CatalogueItem', {
  beforeCreate: ({ data }) => { if (data.price != null && Number(data.price) < 0) throw bad('Price cannot be negative'); },
  afterCreate: ({ tx, ctx, row }) => autoMatch(tx, ctx, row),
});
A('CatalogueMatch.accept', async ({ tx, row }) => { await tx.catalogueItem.update({ where: { id: row.catalogueItemId }, data: { partId: row.candidatePartId, matchStatus: 'matched', matchConfidence: row.score } }); await tx.catalogueMatch.updateMany({ where: { catalogueItemId: row.catalogueItemId, id: { not: row.id }, status: 'pending' }, data: { status: 'rejected' } }); });
A('CatalogueMatch.reject', async ({ tx, row }) => { if (!(await tx.catalogueMatch.count({ where: { catalogueItemId: row.catalogueItemId, status: 'pending', id: { not: row.id } } }))) await tx.catalogueItem.update({ where: { id: row.catalogueItemId }, data: { matchStatus: 'unmatched' } }); });
A('AvailabilityFeed.run', async ({ ctx, tx, row }) => {
  if (!row.url) throw bad('Add the feed URL first. File feeds are uploaded from the catalogue screen.');
  let items: any[] = [];
  try { items = await fetchPublicJson(row.url); if (!Array.isArray(items)) throw new Error('Feed must be a JSON array'); }
  catch (e: any) { const m = e?.code === 'BLOCKED_URL' ? e.message : 'The feed could not be fetched'; return { status: 'error', set: { lastError: m, lastRunAt: new Date() }, message: `Feed failed: ${m}` }; }
  let n = 0;
  for (const it of items.slice(0, 5000)) {
    const ex = await tx.catalogueItem.findFirst({ where: { supplierId: row.supplierId, supplierPartNo: String(it.supplierPartNo ?? it.partNo ?? '') } });
    if (!ex) continue;
    await tx.catalogueItem.update({ where: { id: ex.id }, data: { price: it.price ?? ex.price, availability: it.availability ?? ex.availability, leadTimeDays: it.leadTimeDays ?? ex.leadTimeDays } });
    n++;
  }
  return { status: 'active', set: { lastRunAt: new Date(), lastError: null, itemsProcessed: n }, message: `${n} item(s) updated` };
});

// ================= VEHICLE REMINDERS (VEH-03) =================
A('VehicleReminder.send', async ({ ctx, tx, row }) => {
  const v = await tx.vehicle.findUnique({ where: { id: row.vehicleId } });
  const c = row.customerId ? await tx.customer.findUnique({ where: { id: row.customerId } }) : null;
  await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: c?.phone, template: 'vehicle_service', lang: 'ar', vars: { vehicle: `${v?.make ?? ''} ${v?.model ?? ''} ${v?.plate ?? ''}`.trim(), service: row.serviceName, due: row.dueDate?.toISOString().slice(0, 10) ?? `${row.dueMileage} km` } });
  const portal = await tx.user.findMany({ where: { customerId: row.customerId, kind: 'customer' }, select: { id: true } });
  await notifyUsers(tx, ctx.companyId, portal.map((u) => u.id), { title: `Service due: ${row.serviceName}`, body: `${v?.make ?? ''} ${v?.model ?? ''}`, link: '/portal/vehicles', type: 'vehicle' });
  return { set: { sentAt: new Date() } };
});
A('VehicleReminder.done', async () => ({}));

// ================= INVENTORY (INV-01..06, FIN-11) =================
export async function onHand(tx: Tx, companyId: string, partId: string, warehouseId?: string | null) {
  const r: any[] = await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(qty),0)::float q FROM stock_movement WHERE "companyId"=$1 AND "partId"=$2 AND ($3::text IS NULL OR "warehouseId"=$3)`, companyId, partId, warehouseId ?? null);
  return r[0].q as number;
}
/** moving-average unit cost */
export async function avgCost(tx: Tx, companyId: string, partId: string, warehouseId?: string | null) {
  const r: any[] = await tx.$queryRawUnsafe(`SELECT COALESCE(SUM(qty*"unitCost") FILTER (WHERE qty > 0),0)::float v, COALESCE(SUM(qty) FILTER (WHERE qty > 0),0)::float q FROM stock_movement WHERE "companyId"=$1 AND "partId"=$2 AND ($3::text IS NULL OR "warehouseId"=$3)`, companyId, partId, warehouseId ?? null);
  return r[0].q > 0 ? r[0].v / r[0].q : 0;
}
export async function moveStock(tx: Tx, ctx: Ctx, m: { partId: string; warehouseId: string; kind: string; qty: number; unitCost?: number; refType?: string; refId?: string; binId?: string | null; batchId?: string | null; serialId?: string | null; notes?: string }) {
  if (m.qty < 0) { const have = await onHand(tx, ctx.companyId, m.partId, m.warehouseId); if (have + m.qty < 0) { const p = await tx.part.findUnique({ where: { id: m.partId } }); throw conflict(`Not enough stock of ${p?.partNumber}: ${have} on hand, ${-m.qty} needed`, 'insufficient_stock'); } }
  const cost = m.unitCost ?? (await avgCost(tx, ctx.companyId, m.partId, m.warehouseId));
  return tx.stockMovement.create({ data: { companyId: ctx.companyId, partId: m.partId, warehouseId: m.warehouseId, binId: m.binId ?? undefined, kind: m.kind, qty: m.qty, unitCost: cost, refType: m.refType, refId: m.refId, batchId: m.batchId ?? undefined, serialId: m.serialId ?? undefined, movedAt: new Date(), notes: m.notes } });
}
H('StockMovement', {
  beforeCreate: async ({ ctx, tx, data }) => {
    if (!['adjustment', 'receipt'].includes(data.kind)) throw forbidden('Only adjustments and receipts can be entered manually; other movements come from transfers, sales and counts');
    const q = Number(data.qty);
    if (!q) throw bad('Quantity cannot be zero');
    if (q < 0) { const have = await onHand(tx, ctx.companyId, data.partId, data.warehouseId); if (have + q < 0) throw conflict(`Not enough stock: ${have} on hand`, 'insufficient_stock'); }
    data.unitCost ??= await avgCost(tx, ctx.companyId, data.partId, data.warehouseId); data.movedAt ??= new Date();
  },
  afterCreate: async ({ ctx, tx, row }) => {
    if (row.kind !== 'adjustment') return;
    const amt = D(row.qty).abs().mul(D(row.unitCost));
    if (amt.gt(0)) await postJournal(tx, ctx, { event: D(row.qty).gt(0) ? 'stock_adjust_gain' : 'stock_adjust_loss', amounts: { amount: amt }, sourceType: 'StockMovement', sourceId: row.id, memo: `Stock adjustment ${row.notes ?? ''}` });
  },
});
H('Serial', { beforeCreate: async ({ ctx, tx, data }) => { if (await tx.serial.findFirst({ where: { companyId: ctx.companyId, partId: data.partId, serialNo: data.serialNo } })) throw conflict('This serial number already exists for the part', 'duplicate'); } });
H('ReorderRule', { beforeCreate: ({ data }) => { if (Number(data.minQty) > Number(data.maxQty)) throw bad('Minimum cannot exceed maximum'); } });

A('StockCount.generate', async ({ ctx, tx, row }) => {
  const rows: any[] = await tx.$queryRawUnsafe(`SELECT "partId", COALESCE("binId",'') bin, SUM(qty)::float q FROM stock_movement WHERE "companyId"=$1 AND "warehouseId"=$2 GROUP BY "partId", "binId" HAVING SUM(qty) <> 0`, ctx.companyId, row.warehouseId);
  await tx.stockCountLine.deleteMany({ where: { stockCountId: row.id } });
  for (const r of rows) await tx.stockCountLine.create({ data: { companyId: ctx.companyId, stockCountId: row.id, partId: r.partId, binId: r.bin || undefined, expectedQty: r.q } });
  return { status: 'counting', set: { startedAt: new Date() }, message: `Count sheet generated with ${rows.length} line(s)` };
});
H('StockCountLine', { beforeUpdate: ({ data, row }) => { if (data.countedQty != null) data.variance = D(data.countedQty).minus(D(row.expectedQty ?? 0)); } });
A('StockCount.review', async ({ tx, row }) => { const open = await tx.stockCountLine.count({ where: { stockCountId: row.id, countedQty: null } }); if (open) throw conflict(`${open} line(s) have not been counted`, 'incomplete'); });
A('StockCount.approve', async ({ ctx, tx, row }) => {
  if (!canApprove(ctx)) throw forbidden('Only an approver can post count adjustments');
  const lines = await tx.stockCountLine.findMany({ where: { stockCountId: row.id } });
  let n = 0;
  for (const l of lines) {
    const v = D(l.countedQty ?? 0).minus(D(l.expectedQty ?? 0));
    if (v.isZero()) continue;
    const m = await moveStock(tx, ctx, { partId: l.partId, warehouseId: row.warehouseId, kind: 'count_adjust', qty: v.toNumber(), binId: l.binId, refType: 'StockCount', refId: row.id, notes: `Count ${row.number}` });
    const amt = v.abs().mul(D(m.unitCost));
    if (amt.gt(0)) await postJournal(tx, ctx, { event: v.gt(0) ? 'stock_adjust_gain' : 'stock_adjust_loss', amounts: { amount: amt }, sourceType: 'StockCount', sourceId: row.id, memo: `Count ${row.number}` });
    n++;
  }
  return { set: { approvedById: ctx.userId }, message: `${n} adjustment(s) posted` };
});
A('ReorderSuggestion.accept', async ({ ctx, tx, row }) => {
  const part = await tx.part.findUnique({ where: { id: row.partId }, include: { brand: true, category: true } });
  const rfq = await createRow(tx, sys(ctx), BY_KEY.Rfq, { status: 'draft', deadline: new Date(Date.now() + 48 * 3600000), notes: `Replenishment: ${row.reason}`, children: { RfqLine: [{ partId: row.partId, qty: row.suggestedQty }] } }, { trusted: true });
  const sups = await tx.supplier.findMany({ where: { companyId: ctx.companyId, status: 'active' } });
  const brand = part?.brand?.name?.replace(/ \(OEM\)$/, ''), cat = part?.category?.name;
  for (const s of sups.filter((s) => ((s.brands as any[]) ?? []).includes(brand) || ((s.categories as any[]) ?? []).includes(cat))) await tx.rfqSupplier.create({ data: { companyId: ctx.companyId, rfqId: rfq.id, supplierId: s.id, channel: s.whatsapp ? 'whatsapp' : 'email', accessToken: crypto.randomUUID() } });
  return { set: { rfqId: rfq.id }, data: { rfqId: rfq.id }, message: `RFQ ${rfq.number} created` };
});
A('ReorderSuggestion.dismiss', async () => ({}));

// ================= TRANSFERS (LOG-12, FIN-12) =================
A('Transfer.ship', async ({ ctx, tx, row }) => {
  const lines = await tx.transferLine.findMany({ where: { transferId: row.id } });
  if (!lines.length) throw bad('Add at least one line');
  if (row.fromWarehouseId === row.toWarehouseId) throw bad('Source and destination must differ');
  for (const l of lines) await moveStock(tx, ctx, { partId: l.partId, warehouseId: row.fromWarehouseId, kind: 'transfer_out', qty: -num(l.qty), refType: 'Transfer', refId: row.id, batchId: l.batchId, serialId: l.serialId });
  return { set: { shippedAt: new Date() } };
});
A('Transfer.receive', async ({ ctx, tx, row, body }) => {
  const lines = await tx.transferLine.findMany({ where: { transferId: row.id } });
  const [a, b] = await Promise.all([tx.warehouse.findUnique({ where: { id: row.fromWarehouseId } }), tx.warehouse.findUnique({ where: { id: row.toWarehouseId } })]);
  let value = D(0);
  for (const l of lines) {
    const rq = body?.lines?.find((x: any) => x.id === l.id)?.receivedQty ?? num(l.qty);
    const out = await tx.stockMovement.findFirst({ where: { refType: 'Transfer', refId: row.id, partId: l.partId, kind: 'transfer_out' } });
    await moveStock(tx, ctx, { partId: l.partId, warehouseId: row.toWarehouseId, kind: 'transfer_in', qty: rq, unitCost: num(out?.unitCost), refType: 'Transfer', refId: row.id, batchId: l.batchId, serialId: l.serialId });
    await tx.transferLine.update({ where: { id: l.id }, data: { receivedQty: rq } });
    value = value.plus(D(rq).mul(D(out?.unitCost ?? 0)));
    if (num(rq) < num(l.qty)) await notifyRole(tx, ctx.companyId, 'finance', { title: `Transfer ${row.number}: short receipt`, body: `${num(l.qty) - num(rq)} missing`, link: `/app/transfer/${row.id}`, severity: 'warning', type: 'transfer' });
  }
  if (a?.branchId && b?.branchId && a.branchId !== b.branchId && value.gt(0)) {
    await postJournal(tx, ctx, { event: 'branch_transfer_out', amounts: { amount: value }, sourceType: 'Transfer', sourceId: row.id, memo: `Transfer ${row.number} out`, branchId: a.branchId });
    await postJournal(tx, ctx, { event: 'branch_transfer_in', amounts: { amount: value }, sourceType: 'Transfer', sourceId: row.id, memo: `Transfer ${row.number} in`, branchId: b.branchId });
  }
  return { set: { receivedAt: new Date() } };
});

// ================= POS (POS-01..06, CRM-07) =================
H('PosShift', {
  beforeCreate: async ({ ctx, tx, data }) => {
    if (await tx.posShift.findFirst({ where: { terminalId: data.terminalId, status: 'open' } })) throw conflict('This terminal already has an open shift. Close it first.', 'duplicate');
    data.cashierId ??= ctx.userId; data.openedAt ??= new Date();
  },
});
A('PosShift.close', async ({ ctx, tx, row, body }) => {
  if (body?.countedCash == null) throw bad('Enter the counted cash');
  const pays = await tx.posPayment.aggregate({ where: { method: 'cash', posSale: { shiftId: row.id, status: { in: ['paid', 'refunded'] } } }, _sum: { amount: true } });
  const refunds = await tx.posPayment.aggregate({ where: { method: 'cash', status: 'refunded', posSale: { shiftId: row.id } }, _sum: { amount: true } });
  const expected = D(row.openingCash).plus(D(pays._sum.amount ?? 0)).minus(D(refunds._sum.amount ?? 0).mul(2));
  const variance = D(body.countedCash).minus(expected);
  return { status: variance.isZero() ? 'closed' : 'variance_pending', set: { closedAt: new Date(), expectedCash: expected, countedCash: body.countedCash, variance }, message: variance.isZero() ? 'Shift closed. Cash matches.' : `Shift closed with a variance of SAR ${variance.toFixed(2)} awaiting approval` };
});
A('PosShift.approve_variance', async ({ ctx, tx, row }) => {
  const v = D(row.variance);
  if (!v.isZero()) await postJournal(tx, ctx, { event: v.lt(0) ? 'cash_variance_short' : 'cash_variance_over', amounts: { amount: v.abs() }, sourceType: 'PosShift', sourceId: row.id, memo: 'POS cash variance' });
  return { set: { approvedById: ctx.userId } };
});
export async function recalcSale(tx: Tx, id: string, excl?: string) {
  const ls = await tx.posSaleLine.findMany({ where: { posSaleId: id, ...(excl ? { id: { not: excl } } : {}) } });
  const total = ls.reduce((s, l) => s.plus(D(l.lineTotal)), D(0));
  const vat = ls.reduce((s, l) => s.plus(D(l.lineTotal).minus(D(l.lineTotal).div(D(1).plus(D(l.vatPct ?? 15).div(100))))), D(0));
  await tx.posSale.update({ where: { id }, data: { total: r2(total), vatAmount: r2(vat), subtotal: r2(total.minus(vat)) } });
}
const saleLine = async ({ tx, ctx, data, row }: any) => {
  const m = { ...(row ?? {}), ...data };
  if (m.partId && m.unitPrice == null) throw bad('Enter the price');
  if (Number(m.qty) <= 0) throw bad('Quantity must be greater than zero');
  data.vatPct ??= 15;
  data.lineTotal = r2(D(m.qty).mul(D(m.unitPrice)).mul(D(1).plus(D(data.vatPct ?? m.vatPct ?? 15).div(100))));
  if (m.partId && !m.description) { const p = await tx.part.findUnique({ where: { id: m.partId } }); data.description = `${p?.partNumber} — ${p?.name}`; }
  void ctx;
};
H('PosSaleLine', { beforeCreate: saleLine, beforeUpdate: saleLine, afterCreate: ({ tx, row }) => recalcSale(tx, row.posSaleId), afterUpdate: ({ tx, row }) => recalcSale(tx, row.posSaleId), beforeDelete: ({ tx, row }) => recalcSale(tx, row.posSaleId, row.id) });
H('PosSale', { beforeCreate: async ({ ctx, tx, data }) => { data.soldAt ??= new Date(); if (data.terminalId) { const shift = await tx.posShift.findFirst({ where: { terminalId: data.terminalId, status: 'open' } }); if (!shift) throw conflict('Open a shift on this terminal before selling', 'no_shift'); data.shiftId = shift.id; } } });
A('PosSale.pay', async ({ ctx, tx, row }) => {
  await recalcSale(tx, row.id);
  const sale = (await tx.posSale.findUnique({ where: { id: row.id } }))!;
  const lines = await tx.posSaleLine.findMany({ where: { posSaleId: row.id } });
  if (!lines.length) throw bad('The sale has no lines');
  const pays = await tx.posPayment.findMany({ where: { posSaleId: row.id, status: 'ok' } });
  const paid = pays.reduce((s, p) => s.plus(D(p.amount)), D(0));
  if (paid.lt(D(sale.total))) throw bad(`Payments (${paid.toFixed(2)}) are less than the total (${D(sale.total).toFixed(2)})`);
  const term = sale.terminalId ? await tx.posTerminal.findUnique({ where: { id: sale.terminalId } }) : null;
  const wh = term?.warehouseId ?? (await tx.warehouse.findFirst({ where: { companyId: ctx.companyId } }))?.id;
  const invLines: any[] = [];
  for (const l of lines) {
    let cost = 0;
    if (l.partId && wh) {
      const have = await onHand(tx, ctx.companyId, l.partId, wh);
      if (have > 0) { const m = await moveStock(tx, ctx, { partId: l.partId, warehouseId: wh, kind: 'sale', qty: -num(l.qty), refType: 'PosSale', refId: sale.id, serialId: l.serialId, batchId: l.batchId }); cost = num(m.unitCost); }
      if (l.serialId) await tx.serial.update({ where: { id: l.serialId }, data: { status: 'sold', soldAt: today(), customerId: sale.customerId } });
    }
    invLines.push({ partId: l.partId, description: l.description ?? 'Item', qty: l.qty, unitPrice: D(l.unitPrice), vatPct: l.vatPct ?? 15, cost });
  }
  // redeem vouchers / points
  for (const p of pays.filter((x) => ['voucher', 'points'].includes(x.method))) {
    if (p.method === 'voucher') { const v = await tx.voucher.findFirst({ where: { companyId: ctx.companyId, code: p.reference ?? '__', isActive: true } }); if (!v || (v.maxUses && v.usedCount >= v.maxUses)) throw bad('Voucher is invalid or used up'); await tx.voucher.update({ where: { id: v.id }, data: { usedCount: { increment: 1 } } }); }
    if (p.method === 'points' && sale.customerId) await adjustPoints(tx, ctx, sale.customerId, -Math.round(num(p.amount) * 10), 'redeem', sale.id);
  }
  const inv = await createRow(tx, sys(ctx), BY_KEY.Invoice, { invoiceType: sale.customerId ? 'standard' : 'simplified', customerId: sale.customerId, posSaleId: sale.id, status: 'draft', issueDate: today(), branchId: term?.branchId, children: { InvoiceLine: invLines } }, { trusted: true });
  await tx.invoice.update({ where: { id: inv.id }, data: { dueDate: today(), paidAmount: sale.total, balance: 0 } });
  const r = await issueInvoice(tx, ctx, inv.id);
  await tx.invoice.updateMany({ where: { id: inv.id, status: { in: ['cleared', 'reported'] } }, data: { status: 'paid', balance: 0, paidAmount: sale.total } });
  if (sale.customerId) await adjustPoints(tx, ctx, sale.customerId, Math.floor(num(sale.total) / 10), 'earn', sale.id);
  return { set: { paidAmount: paid, invoiceId: inv.id }, data: { invoiceId: inv.id, change: paid.minus(D(sale.total)).toNumber(), zatca: r.status }, message: `Paid. Change SAR ${paid.minus(D(sale.total)).toFixed(2)}` };
});
A('PosSale.void', async () => ({}));
A('PosSale.refund', async ({ ctx, tx, row, body }) => {
  if (!row.invoiceId) throw conflict('No invoice for this sale');
  const ils = await tx.invoiceLine.findMany({ where: { invoiceId: row.invoiceId } });
  const cn = await createCreditNote(tx, ctx, row.invoiceId, ils.map((l) => ({ invoiceLineId: l.id, qty: num(l.qty) })), body?.reason ?? 'POS refund');
  const term = row.terminalId ? await tx.posTerminal.findUnique({ where: { id: row.terminalId } }) : null;
  const sls = await tx.posSaleLine.findMany({ where: { posSaleId: row.id } });
  for (const l of sls) if (l.partId && term?.warehouseId) { const out = await tx.stockMovement.findFirst({ where: { refType: 'PosSale', refId: row.id, partId: l.partId } }); if (out) await moveStock(tx, ctx, { partId: l.partId, warehouseId: term.warehouseId, kind: 'return', qty: num(l.qty), unitCost: num(out.unitCost), refType: 'PosSale', refId: row.id }); }
  await tx.posPayment.updateMany({ where: { posSaleId: row.id }, data: { status: 'refunded' } });
  if (row.customerId) await adjustPoints(tx, ctx, row.customerId, -Math.floor(num(row.total) / 10), 'adjust', row.id);
  return { data: { creditNoteId: cn.id }, message: `Refunded. Credit note ${cn.number}` };
});
H('PosPayment', { beforeCreate: ({ data }) => { if (D(data.amount).lte(0)) throw bad('Amount must be greater than zero'); } });

async function adjustPoints(tx: Tx, ctx: Ctx, customerId: string, points: number, kind: 'earn' | 'redeem' | 'adjust', refId: string) {
  if (!points) return;
  let acc = await tx.loyaltyAccount.findFirst({ where: { customerId } });
  if (!acc) acc = await tx.loyaltyAccount.create({ data: { companyId: ctx.companyId, customerId, points: 0, tier: 'Silver' } });
  const np = acc.points + points;
  if (np < 0) throw conflict('Not enough loyalty points', 'insufficient_points');
  await tx.loyaltyAccount.update({ where: { id: acc.id }, data: { points: np, tier: np >= 5000 ? 'Platinum' : np >= 1500 ? 'Gold' : 'Silver' } });
  await tx.loyaltyTxn.create({ data: { companyId: ctx.companyId, accountId: acc.id, kind, points, refType: 'PosSale', refId } });
}
A('BatteryUnit.register_warranty', async ({ tx, row, body }) => {
  const soldAt = body?.soldAt ? new Date(body.soldAt) : today();
  const until = new Date(soldAt); until.setMonth(until.getMonth() + (row.warrantyMonths ?? 12));
  return { set: { soldAt, warrantyUntil: until, ...(body?.customerId ? { soldToCustomerId: body.customerId } : {}), ...(body?.vehicleId ? { vehicleId: body.vehicleId } : {}) }, message: `Warranty registered until ${until.toISOString().slice(0, 10)}` };
});
H('WarrantyClaim', { beforeCreate: async ({ tx, data }) => { const b = await tx.batteryUnit.findUnique({ where: { id: data.batteryUnitId } }); if (!b?.warrantyUntil || b.warrantyUntil < today()) throw conflict('The warranty on this battery has expired or was never registered', 'warranty_expired'); } });
A('WarrantyClaim.approve', async ({ tx, row }) => { await tx.batteryUnit.update({ where: { id: row.batteryUnitId }, data: { status: 'claimed' } }); });
A('WarrantyClaim.reject', async () => ({}));

// ================= WORKSHOP (WSH-01..05) =================
H('ServiceBooking', {
  beforeCreate: async ({ ctx, tx, data }) => {
    const st = await tx.serviceType.findUnique({ where: { id: data.serviceTypeId } });
    if (!st) throw bad('Choose a service');
    const start = new Date(data.startAt); data.endAt = data.endAt ? new Date(data.endAt) : new Date(start.getTime() + st.durationMin * 60000);
    if (start < new Date(Date.now() - 3600000)) throw bad('The booking time is in the past');
    data.source ??= ctx.kind === 'customer' ? 'online' : 'counter';
    if (!data.bayId) {
      const bays = await tx.bay.findMany({ where: { companyId: ctx.companyId, isActive: true } });
      for (const b of bays) { const clash = await tx.serviceBooking.count({ where: { bayId: b.id, status: { in: ['booked', 'checked_in', 'in_progress'] }, startAt: { lt: data.endAt }, endAt: { gt: start } } }); if (!clash) { data.bayId = b.id; break; } }
      if (!data.bayId) throw conflict('No bay is free at that time. Choose another slot.', 'no_bay');
    }
  },
});
A('ServiceBooking.check_in', async ({ ctx, tx, row, body }) => {
  const jc = await createRow(tx, sys(ctx), BY_KEY.JobCard, { bookingId: row.id, customerId: row.customerId, vehicleId: row.vehicleId, mileageIn: body?.mileageIn, status: 'checked_in' }, { trusted: true });
  if (body?.mileageIn && row.vehicleId) await tx.vehicle.update({ where: { id: row.vehicleId }, data: { mileage: body.mileageIn } });
  return { data: { jobCardId: jc.id }, message: `Job card ${jc.number} opened` };
});
async function recalcJob(tx: Tx, id: string, excl?: string) {
  const ls = await tx.jobCardLine.findMany({ where: { jobCardId: id, ...(excl ? { id: { not: excl } } : {}) } });
  const parts = ls.filter((l) => l.kind === 'part').reduce((s, l) => s.plus(D(l.lineTotal)), D(0));
  const lab = ls.filter((l) => l.kind === 'labour').reduce((s, l) => s.plus(D(l.lineTotal)), D(0));
  await tx.jobCard.update({ where: { id }, data: { totalParts: parts, totalLabour: lab, total: parts.plus(lab) } });
}
const jobLine = async ({ tx, data, row }: any) => {
  const m = { ...(row ?? {}), ...data };
  const qty = m.kind === 'labour' && m.hours ? D(m.hours) : D(m.qty ?? 1);
  data.vatPct ??= 15;
  data.lineTotal = r2(qty.mul(D(m.unitPrice)).mul(D(1).plus(D(data.vatPct ?? m.vatPct ?? 15).div(100))));
  if (m.kind === 'part' && m.partId && !m.description) { const p = await tx.part.findUnique({ where: { id: m.partId } }); data.description = `${p?.partNumber} — ${p?.name}`; }
};
H('JobCardLine', { beforeCreate: jobLine, beforeUpdate: jobLine, afterCreate: ({ tx, row }) => recalcJob(tx, row.jobCardId), afterUpdate: ({ tx, row }) => recalcJob(tx, row.jobCardId), beforeDelete: ({ tx, row }) => recalcJob(tx, row.jobCardId, row.id) });
A('JobCard.request_approval', async ({ ctx, tx, row }) => {
  const portal = await tx.user.findMany({ where: { customerId: row.customerId, kind: 'customer' }, select: { id: true } });
  await notifyUsers(tx, ctx.companyId, portal.map((u) => u.id), { title: `Approve work on job ${row.number}`, body: `SAR ${num(row.total).toFixed(2)}`, link: `/portal/vehicles`, severity: 'warning', type: 'workshop' });
});
A('JobCard.approve', async () => ({ set: { customerApprovedAt: new Date() } }));
A('JobCard.start', async ({ ctx, tx, row }) => { if (row.technicianId) await tx.technicianTime.create({ data: { companyId: ctx.companyId, jobCardId: row.id, technicianId: row.technicianId, startedAt: new Date() } }); });
A('JobCard.complete', async ({ tx, row }) => {
  const open = await tx.technicianTime.findMany({ where: { jobCardId: row.id, endedAt: null } });
  for (const t of open) await tx.technicianTime.update({ where: { id: t.id }, data: { endedAt: new Date(), minutes: Math.max(1, Math.round((Date.now() - t.startedAt.getTime()) / 60000)) } });
});
H('TechnicianTime', { beforeUpdate: ({ data, row }) => { if (data.endedAt) data.minutes = Math.max(1, Math.round((new Date(data.endedAt).getTime() - row.startedAt.getTime()) / 60000)); } });
A('JobCard.invoice', async ({ ctx, tx, row }) => {
  await recalcJob(tx, row.id);
  const lines = await tx.jobCardLine.findMany({ where: { jobCardId: row.id } });
  if (!lines.length) throw bad('The job card has no lines');
  const wh = (await tx.warehouse.findFirst({ where: { companyId: ctx.companyId } }))?.id;
  const items: any[] = [];
  for (const l of lines) {
    let cost = 0;
    if (l.kind === 'part' && l.partId && wh && (await onHand(tx, ctx.companyId, l.partId, wh)) >= num(l.qty ?? 1)) { const m = await moveStock(tx, ctx, { partId: l.partId, warehouseId: wh, kind: 'issue', qty: -num(l.qty ?? 1), refType: 'JobCard', refId: row.id }); cost = num(m.unitCost); }
    items.push({ partId: l.partId, description: l.description, qty: l.kind === 'labour' && l.hours ? l.hours : l.qty ?? 1, unitPrice: l.unitPrice, vatPct: l.vatPct ?? 15, cost });
  }
  const cust = await tx.customer.findUnique({ where: { id: row.customerId } });
  const inv = await createRow(tx, sys(ctx), BY_KEY.Invoice, { invoiceType: cust?.vatNumber ? 'standard' : 'simplified', customerId: row.customerId, status: 'draft', issueDate: today(), children: { InvoiceLine: items } }, { trusted: true });
  const r = await issueInvoice(tx, ctx, inv.id);
  return { set: { invoiceId: inv.id }, data: { invoiceId: inv.id, zatca: r.status }, message: `Invoice ${r.number} issued for parts and labour` };
});
void notifyRole; void recalcInvoice; void canApprove; void addDays;
