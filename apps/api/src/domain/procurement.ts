import { BY_KEY } from '@erp/shared';
import { Tx } from '@erp/db';
import { A, Ctx, D, H, addDays, approvalCallbacks, bad, canApprove, conflict, emit, forbidden, getSetting, notifyRole, notifyUsers, num, r2, sys, today, audit } from '../core/base';
import { createRow } from '../core/crud';
import { needsApproval, requestApproval } from '../core/approvals';
import { bestValue, lineTotals, warrantyMonths } from '../services/pricing';
import { extractQuote, suggestParts } from '../services/ai';
import { ensurePart, findPart, recordPrice } from '../services/catalogue';
import { postJournal } from '../services/posting';
import { sendMessage } from '../adapters';
import { readFile } from 'node:fs/promises';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';

// ================= RFQ (PRC-01) =================
async function supplierUsers(tx: Tx, supplierId: string) { return (await tx.user.findMany({ where: { supplierId, kind: 'supplier', isActive: true }, select: { id: true } })).map((u) => u.id); }

A('Rfq.select_suppliers', async ({ ctx, tx, row, body }) => {
  const ids: string[] = body?.supplierIds ?? [];
  if (!ids.length) throw bad('Choose at least one supplier');
  let added = 0;
  for (const supplierId of ids) {
    const sup = await tx.supplier.findFirst({ where: { id: supplierId, companyId: ctx.companyId, status: 'active' } });
    if (!sup) continue;
    if (await tx.rfqSupplier.findFirst({ where: { rfqId: row.id, supplierId } })) continue;
    await tx.rfqSupplier.create({ data: { companyId: ctx.companyId, rfqId: row.id, supplierId, channel: body?.channel ?? (sup.whatsapp ? 'whatsapp' : 'email'), accessToken: crypto.randomUUID() } });
    added++;
  }
  return { skip: true, message: `${added} supplier(s) added` };
});
A('Rfq.send', async ({ ctx, tx, row }) => {
  const sups = await tx.rfqSupplier.findMany({ where: { rfqId: row.id }, include: { supplier: true } });
  if (!sups.length) throw bad('Select at least one supplier first');
  if (!(await tx.rfqLine.count({ where: { rfqId: row.id } }))) throw bad('The RFQ has no lines');
  const deadline = row.deadline ?? new Date(Date.now() + 48 * 3600000);
  for (const s of sups) {
    const link = `${WEB}/supplier/rfqs/${row.id}?t=${s.accessToken}`;
    if (s.channel === 'portal' || true) await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, s.supplierId), { title: `New RFQ ${row.number}`, body: `Quote before ${deadline.toISOString().slice(0, 16).replace('T', ' ')}`, link: `/supplier/rfqs/${row.id}`, severity: 'warning', type: 'rfq' });
    if (s.channel === 'whatsapp') await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: s.supplier!.whatsapp ?? s.supplier!.phone, template: 'rfq_invite', lang: 'ar', vars: { number: row.number, deadline: deadline.toISOString().slice(0, 16).replace('T', ' '), link } });
    if (s.channel === 'email') await sendMessage(tx, ctx.companyId, { channel: 'email', to: s.supplier!.email, template: 'rfq_invite', lang: 'ar', subject: `RFQ ${row.number}`, vars: { number: row.number, deadline: deadline.toISOString().slice(0, 10), link } });
    await tx.rfqSupplier.update({ where: { id: s.id }, data: { sentAt: new Date(), status: 'invited' } });
  }
  return { set: { sentAt: new Date(), deadline }, message: `RFQ sent to ${sups.length} supplier(s)` };
});
A('Rfq.remind', async ({ ctx, tx, row }) => {
  const sups = await tx.rfqSupplier.findMany({ where: { rfqId: row.id, status: { in: ['invited', 'viewed'] } }, include: { supplier: true } });
  for (const s of sups) {
    await sendMessage(tx, ctx.companyId, { channel: s.channel === 'email' ? 'email' : 'whatsapp', to: s.channel === 'email' ? s.supplier!.email : s.supplier!.whatsapp ?? s.supplier!.phone, template: 'rfq_reminder', lang: 'ar', vars: { number: row.number, deadline: row.deadline?.toISOString().slice(0, 16).replace('T', ' ') ?? '', link: `${WEB}/supplier/rfqs/${row.id}?t=${s.accessToken}` } });
    await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, s.supplierId), { title: `Reminder: RFQ ${row.number}`, link: `/supplier/rfqs/${row.id}`, type: 'rfq' });
    await tx.rfqSupplier.update({ where: { id: s.id }, data: { remindersSent: { increment: 1 } } });
  }
  return { skip: true, message: `Reminded ${sups.length} supplier(s)` };
});
A('Rfq.close', async ({ ctx, tx, row }) => {
  await tx.rfqSupplier.updateMany({ where: { rfqId: row.id, status: { in: ['invited', 'viewed'] } }, data: { status: 'no_response' } });
  await notifyRole(tx, ctx.companyId, 'purchasing', { title: `RFQ ${row.number} closed`, body: 'Compare quotes and award', link: `/app/rfq/${row.id}`, type: 'rfq' });
});

// ================= SUPPLIER QUOTES (PRC-02, SUP-01/02) =================
H('SupplierQuote', {
  beforeCreate: async ({ ctx, tx, data }) => {
    if (ctx.kind === 'supplier') {
      const inv = await tx.rfqSupplier.findFirst({ where: { rfqId: data.rfqId, supplierId: ctx.supplierId! } });
      if (!inv) throw forbidden('You were not invited to this RFQ');
    }
    const rfq = await tx.rfq.findUnique({ where: { id: data.rfqId } });
    if (!rfq || !['sent', 'collecting'].includes(rfq.status)) { if (!ctx.internal && ctx.kind === 'supplier') throw conflict('This RFQ is not open for quotes', 'rfq_closed'); }
    if (rfq?.deadline && rfq.deadline < new Date() && ctx.kind === 'supplier') throw conflict('The deadline for this RFQ has passed', 'deadline_passed');
    data.currency ??= 'SAR';
    data.source ??= ctx.kind === 'supplier' ? 'portal' : 'manual';
  },
});
H('SupplierQuoteLine', {
  beforeCreate: async ({ ctx, tx, data }) => {
    if (Number(data.unitPrice) <= 0 || Number(data.qty) <= 0) throw bad('Price and quantity must be greater than zero');
    if (!data.partId && data.rfqLineId) { const rl = await tx.rfqLine.findUnique({ where: { id: data.rfqLineId } }); data.partId = rl?.partId ?? undefined; }
    if (data.supplierPartNo && !data.partId) { const hit = await findPart(tx, ctx.companyId, data.supplierPartNo); if (hit) data.partId = hit.id; }
  },
  afterCreate: async ({ tx, row }) => { await sumQuote(tx, row.supplierQuoteId); },
  afterUpdate: async ({ tx, row }) => { await sumQuote(tx, row.supplierQuoteId); },
  beforeDelete: async ({ tx, row }) => { await sumQuote(tx, row.supplierQuoteId, row.id); },
});
async function sumQuote(tx: Tx, id: string, excl?: string) {
  const ls = await tx.supplierQuoteLine.findMany({ where: { supplierQuoteId: id, ...(excl ? { id: { not: excl } } : {}) } });
  await tx.supplierQuote.update({ where: { id }, data: { totalAmount: ls.reduce((s, l) => s.plus(D(l.qty).mul(D(l.unitPrice))), D(0)) } });
}
async function acceptQuote(tx: Tx, ctx: Ctx, q: any) {
  const lines = await tx.supplierQuoteLine.findMany({ where: { supplierQuoteId: q.id } });
  if (!lines.length) throw bad('Add at least one line to the quotation');
  for (const l of lines) {
    let partId = l.partId;
    if (!partId && l.supplierPartNo) partId = (await ensurePart(tx, ctx, { partNumber: l.supplierPartNo, name: l.description ?? undefined, brandId: l.brandId, source: 'quotation' })).id; // MDM-02
    if (partId && !l.partId) await tx.supplierQuoteLine.update({ where: { id: l.id }, data: { partId } });
    if (partId) await recordPrice(tx, ctx.companyId, { partId, kind: 'supplier', price: l.unitPrice, supplierId: q.supplierId, source: q.number });
  }
  await tx.supplierQuoteLine.updateMany({ where: { supplierQuoteId: q.id }, data: { needsReview: false } });
  await tx.rfqSupplier.updateMany({ where: { rfqId: q.rfqId, supplierId: q.supplierId }, data: { status: 'quoted', respondedAt: new Date() } });
  await tx.rfq.updateMany({ where: { id: q.rfqId, status: 'sent' }, data: { status: 'collecting' } });
  const rfq = await tx.rfq.findUnique({ where: { id: q.rfqId } });
  await notifyRole(tx, ctx.companyId, 'purchasing', { title: `Quote received for ${rfq?.number}`, body: q.number, link: `/app/rfq/${q.rfqId}`, type: 'rfq' });
  await sumQuote(tx, q.id);
}
A('SupplierQuote.submit', async ({ ctx, tx, row }) => { await acceptQuote(tx, ctx, row); return { message: 'Quotation submitted' }; });
A('SupplierQuote.confirm', async ({ ctx, tx, row }) => { await acceptQuote(tx, ctx, row); return { message: 'Captured lines confirmed' }; });
A('SupplierQuote.reject', async ({ ctx, tx, row }) => { await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, row.supplierId), { title: `Quotation ${row.number} was rejected`, link: `/supplier/quotes/${row.id}` }); });
A('SupplierQuote.capture', async ({ ctx, tx, row, body }) => {
  const att = await tx.attachment.findFirst({ where: { id: body?.attachmentId ?? row.attachmentId, companyId: ctx.companyId } });
  if (!att) throw bad('Upload the supplier file first, then run capture');
  const buffer = await readFile(`uploads/${att.storageKey}`);
  const ex = await extractQuote({ buffer, filename: att.fileName, mime: att.mimeType ?? '' });
  if (!ex.lines.length) return { skip: true, data: ex, message: ex.issues[0] ?? 'No lines could be extracted' };
  const rfqLines = await tx.rfqLine.findMany({ where: { rfqId: row.rfqId }, include: { part: true } });
  await tx.supplierQuoteLine.deleteMany({ where: { supplierQuoteId: row.id } });
  let matched = 0;
  for (const l of ex.lines) {
    const hit = await findPart(tx, ctx.companyId, l.supplierPartNo);
    let partId = hit?.id ?? null;
    let conf = l.confidence;
    if (!partId && l.description) { const s = await suggestParts(tx, ctx, l.description, undefined, 1); if (s.candidates[0] && s.candidates[0].confidence >= 0.6) { partId = s.candidates[0].id; conf = Math.min(conf, s.candidates[0].confidence); } }
    const rl = partId ? rfqLines.find((r) => r.partId === partId) : undefined;
    if (rl) matched++;
    await tx.supplierQuoteLine.create({ data: { companyId: ctx.companyId, supplierQuoteId: row.id, rfqLineId: rl?.id, partId, supplierPartNo: l.supplierPartNo, description: l.description, qty: l.qty, unitPrice: l.unitPrice, leadTimeDays: l.leadTimeDays, availability: l.availability ?? 'in_stock', aiConfidence: conf, needsReview: true } });
  }
  await sumQuote(tx, row.id);
  await tx.aiLog.create({ data: { companyId: ctx.companyId, feature: 'quote_capture', userId: ctx.userId, input: { file: att.fileName, method: ex.method } as any, output: { lines: ex.lines.length, matched } as any, confidence: ex.confidence, model: ex.method, promptVersion: 'v1' } });
  return { set: { aiConfidence: ex.confidence, source: 'ai_capture' }, status: 'captured_review', data: { lines: ex.lines.length, matched, confidence: ex.confidence, method: ex.method }, message: `${ex.lines.length} line(s) extracted (${matched} matched to RFQ lines). Review every line, then confirm.` };
});

// ================= AWARD / COMPARISON (PRC-03, PRC-04) =================
export async function comparison(tx: Tx, companyId: string, rfqId: string) {
  const rfqLines = await tx.rfqLine.findMany({ where: { rfqId }, include: { part: true } });
  const quotes = await tx.supplierQuote.findMany({ where: { rfqId, status: { in: ['submitted', 'confirmed'] } }, include: { supplier: true, SupplierQuoteLine_supplierQuoteId: true } as any });
  const out: any[] = [];
  for (const rl of rfqLines) {
    const options: any[] = [];
    for (const q of quotes as any[]) {
      const l = q.SupplierQuoteLine_supplierQuoteId.find((x: any) => x.rfqLineId === rl.id) ?? q.SupplierQuoteLine_supplierQuoteId.find((x: any) => x.partId === rl.partId && !x.rfqLineId);
      if (!l || l.availability === 'unavailable') continue;
      options.push({ id: l.id, supplierId: q.supplierId, supplier: q.supplier.name, supplierRating: num(q.supplier.rating), price: num(l.unitPrice), leadDays: l.leadTimeDays ?? q.leadTimeDays ?? q.supplier.leadTimeDays ?? 7, warranty: l.warranty, warrantyMonths: warrantyMonths(l.warranty), availability: l.availability, partId: l.partId, quoteId: q.id, quoteNumber: q.number });
    }
    const scored = options.length ? await bestValue(companyId, options.map((o) => ({ id: o.id, price: o.price, leadDays: o.leadDays, rating: o.supplierRating, warrantyMonths: o.warrantyMonths }))) : [];
    const byId = Object.fromEntries(scored.map((s) => [s.id, s]));
    out.push({ rfqLineId: rl.id, partId: rl.partId, part: rl.part ? `${rl.part.partNumber} — ${rl.part.name}` : null, qty: num(rl.qty), options: options.map((o) => ({ ...o, score: byId[o.id].score, parts: byId[o.id].parts })).sort((a, b) => b.score - a.score), recommendedId: scored[0]?.id ?? null });
  }
  return { lines: out, suppliers: (quotes as any[]).map((q) => ({ id: q.supplierId, name: q.supplier.name, quoteId: q.id })) };
}
A('Award.recommend', async ({ ctx, tx, row }) => {
  const cmp = await comparison(tx, ctx.companyId, row.rfqId);
  await tx.awardLine.deleteMany({ where: { awardId: row.id } });
  let n = 0, missing = 0;
  for (const l of cmp.lines) {
    const best = l.options[0];
    if (!best) { missing++; continue; }
    await tx.awardLine.create({ data: { companyId: ctx.companyId, awardId: row.id, rfqLineId: l.rfqLineId, supplierQuoteLineId: best.id, supplierId: best.supplierId, partId: best.partId ?? l.partId, qty: l.qty, unitCost: best.price, reason: `Best value (score ${best.score})`, score: best.score, requestId: row.requestId } });
    n++;
  }
  return { skip: true, data: { awarded: n, missing }, message: `${n} line(s) recommended${missing ? `, ${missing} without any quote` : ''}. Adjust per line if needed, then confirm.` };
});
A('Award.confirm', async ({ ctx, tx, row }) => {
  const lines = await tx.awardLine.findMany({ where: { awardId: row.id } });
  if (!lines.length) throw bad('Nothing awarded yet. Use "Auto-recommend" or add award lines.');
  const winners = new Set(lines.map((l) => l.supplierId));
  const quoted = await tx.rfqSupplier.findMany({ where: { rfqId: row.rfqId, status: 'quoted' } });
  for (const s of quoted) if (!winners.has(s.supplierId)) await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, s.supplierId), { title: 'RFQ result', body: 'Thank you for quoting. This time the order was awarded to another supplier.', link: `/supplier/rfqs/${row.rfqId}`, type: 'rfq' });
  for (const w of winners) await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, w!), { title: 'You were awarded items', link: `/supplier/rfqs/${row.rfqId}`, severity: 'info', type: 'rfq' });
  await tx.rfq.update({ where: { id: row.rfqId }, data: { status: 'awarded' } });
  return { set: { awardedById: ctx.userId }, message: 'Award confirmed. Build the customer quotation next.' };
});
H('AwardLine', {
  beforeCreate: async ({ tx, data }) => { const a = await tx.award.findUnique({ where: { id: data.awardId } }); if (a?.status === 'confirmed') throw conflict('The award is confirmed and cannot be changed', 'invalid_state'); },
  beforeUpdate: async ({ tx, row }) => { const a = await tx.award.findUnique({ where: { id: row.awardId } }); if (a?.status === 'confirmed') throw conflict('The award is confirmed and cannot be changed', 'invalid_state'); },
  beforeDelete: async ({ tx, row }) => { const a = await tx.award.findUnique({ where: { id: row.awardId } }); if (a?.status === 'confirmed') throw conflict('The award is confirmed and cannot be changed', 'invalid_state'); },
});

// ================= PURCHASE ORDERS (PRC-05) =================
export async function recalcPo(tx: Tx, poId: string) {
  const ls = await tx.poLine.findMany({ where: { poId, status: { not: 'cancelled' } } });
  let sub = D(0), vat = D(0);
  for (const l of ls) { const t = lineTotals(l.qty, l.unitCost, 0, l.vatPct); sub = sub.plus(t.net); vat = vat.plus(t.vat); }
  await tx.purchaseOrder.update({ where: { id: poId }, data: { subtotal: sub, vatAmount: vat, total: sub.plus(vat) } });
}
const poLine = ({ data, row }: any) => { const m = { ...(row ?? {}), ...data }; if (Number(m.qty) <= 0) throw bad('Quantity must be greater than zero'); data.lineTotal = lineTotals(m.qty, m.unitCost, 0, m.vatPct ?? 15).total; };
H('PoLine', { beforeCreate: poLine, beforeUpdate: poLine, afterCreate: ({ tx, row }) => recalcPo(tx, row.poId), afterUpdate: ({ tx, row }) => recalcPo(tx, row.poId) });
H('PurchaseOrder', { beforeUpdate: ({ ctx, row, data }) => { if (ctx.kind === 'supplier') for (const k of Object.keys(data)) delete data[k]; if (['sent', 'confirmed'].includes(row.status) && ctx.kind === 'staff' && Object.keys(data).some((k) => !['notes', 'expectedDate'].includes(k))) throw conflict('Use "Revise" to change a sent purchase order', 'invalid_state'); } });
H('PoLine', {});

A('PurchaseOrder.submit', async ({ ctx, tx, row }) => {
  await recalcPo(tx, row.id);
  const po = (await tx.purchaseOrder.findUnique({ where: { id: row.id } }))!;
  if (!(await tx.poLine.count({ where: { poId: po.id } }))) throw bad('The purchase order has no lines');
  if (await needsApproval(tx, ctx.companyId, 'purchase_order', po.total)) {
    const appr = await requestApproval(tx, ctx, { type: 'purchase_order', refType: 'PurchaseOrder', refId: po.id, amount: po.total, reason: `PO ${po.number} (SAR ${num(po.total).toFixed(2)})` });
    return { set: { approvalId: appr.id }, message: 'Sent for approval' };
  }
  return { status: 'approved', message: 'Within the approval limit: approved automatically' };
});
approvalCallbacks['purchase_order'] = async ({ tx, ctx, approval, approved }) => {
  const po = await tx.purchaseOrder.findFirst({ where: { id: approval.refId } });
  if (!po) return;
  await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: approved ? 'approved' : 'draft' } });
  await notifyUsers(tx, ctx.companyId, [approval.requestedById!].filter(Boolean), { title: `PO ${po.number} ${approved ? 'approved' : 'rejected'}`, link: `/app/purchase-order/${po.id}`, type: 'po' });
};
A('PurchaseOrder.send', async ({ ctx, tx, row }) => {
  const sup = await tx.supplier.findUnique({ where: { id: row.supplierId } });
  const link = `${WEB}/supplier/purchase-orders/${row.id}`;
  await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, row.supplierId), { title: `Purchase order ${row.number}`, body: `SAR ${num(row.total).toFixed(2)}`, link: `/supplier/purchase-orders/${row.id}`, severity: 'warning', type: 'po' });
  await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: sup?.whatsapp ?? sup?.phone, template: 'po_sent', lang: 'ar', vars: { number: row.number, total: num(row.total).toFixed(2), link } });
  await sendMessage(tx, ctx.companyId, { channel: 'email', to: sup?.email, template: 'po_sent', lang: 'ar', subject: `PO ${row.number}`, vars: { number: row.number, total: num(row.total).toFixed(2), link } });
  return { set: { sentAt: new Date() } };
});
A('PurchaseOrder.confirm', async ({ ctx, tx, row, body }) => {
  const lines = await tx.poLine.findMany({ where: { poId: row.id } });
  for (const l of lines) {
    const c = body?.lines?.find((x: any) => x.id === l.id);
    await tx.poLine.update({ where: { id: l.id }, data: { supplierConfirmedQty: c?.qty ?? l.qty, confirmedDate: c?.date ? new Date(c.date) : row.expectedDate } });
  }
  await notifyRole(tx, ctx.companyId, 'purchasing', { title: `Supplier confirmed PO ${row.number}`, link: `/app/purchase-order/${row.id}`, type: 'po' });
  return { set: { confirmedAt: new Date() } };
});
A('PurchaseOrder.revise', async ({ ctx, tx, row }) => {
  await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, row.supplierId), { title: `PO ${row.number} revised (rev ${row.revision + 1})`, link: `/supplier/purchase-orders/${row.id}`, severity: 'warning', type: 'po' });
  return { set: { revision: row.revision + 1, confirmedAt: null, sentAt: new Date() }, status: 'sent', message: 'Revision sent to the supplier for re-confirmation' };
});
A('PurchaseOrder.cancel', async ({ tx, row }) => {
  if (await tx.goodsReceipt.count({ where: { poId: row.id, status: 'confirmed' } })) throw conflict('Goods were already received against this PO', 'invalid_state');
  await tx.poLine.updateMany({ where: { poId: row.id }, data: { status: 'cancelled' } });
});

// ================= GOODS RECEIPT (LOG-02/03/04) =================
H('GoodsReceipt', {
  beforeCreate: async ({ ctx, tx, data }) => {
    const po = await tx.purchaseOrder.findFirst({ where: { id: data.poId, companyId: ctx.companyId } });
    if (!po) throw bad('Purchase order not found');
    if (!['sent', 'confirmed', 'partially_received', 'approved'].includes(po.status)) throw conflict(`Cannot receive goods while the PO is "${po.status}"`, 'invalid_state');
    data.supplierId = po.supplierId; data.receivedAt ??= new Date(); data.receivedById = ctx.userId;
  },
});
H('GrLine', {
  beforeCreate: async ({ tx, data }) => {
    const pl = await tx.poLine.findUnique({ where: { id: data.poLineId } });
    if (!pl) throw bad('PO line not found');
    data.partId ??= pl.partId; data.orderedQty = D(pl.qty).minus(D(pl.receivedQty));
    const rcv = D(data.receivedQty), dmg = D(data.damagedQty ?? 0);
    if (rcv.lt(0) || dmg.lt(0) || dmg.gt(rcv)) throw bad('Quantities are invalid (damaged cannot exceed received)');
    data.shortQty = D(data.orderedQty).minus(rcv).gt(0) ? D(data.orderedQty).minus(rcv) : D(0);
    data.excessQty = rcv.minus(D(data.orderedQty)).gt(0) ? rcv.minus(D(data.orderedQty)) : D(0);
  },
});
export async function confirmReceipt(tx: Tx, ctx: Ctx, gr: any) {
  const lines = await tx.grLine.findMany({ where: { goodsReceiptId: gr.id }, include: { poLine: true } });
  if (!lines.length) throw bad('Add received lines first');
  let value = D(0);
  for (const l of lines) {
    const pl = l.poLine!;
    const good = D(l.receivedQty).minus(D(l.damagedQty ?? 0));
    const accepted = l.wrongItem ? D(0) : good;
    const newRcv = D(pl.receivedQty).plus(accepted);
    await tx.poLine.update({ where: { id: pl.id }, data: { receivedQty: newRcv, status: newRcv.gte(D(pl.qty)) ? 'received' : 'partially_received' } });
    value = value.plus(accepted.mul(D(pl.unitCost)));
    // discrepancies -> claims (PRC-07)
    const problems: [string, any][] = [];
    if (D(l.shortQty).gt(0)) problems.push(['short', l.shortQty]);
    if (D(l.damagedQty ?? 0).gt(0)) problems.push(['damaged', l.damagedQty]);
    if (l.wrongItem) problems.push(['wrong_item', l.receivedQty]);
    for (const [kind, qty] of problems) {
      if (kind === 'short' && D(l.receivedQty).isZero() && false) continue;
      await createRow(tx, sys(ctx), BY_KEY.SupplierClaim, { supplierId: gr.supplierId, poId: gr.poId, goodsReceiptId: gr.id, partId: l.partId, qty, unitCost: pl.unitCost, kind, amount: D(qty).mul(D(pl.unitCost)), status: 'open', notes: l.notes ?? undefined }, { trusted: true });
    }
  }
  // PO status
  const all = await tx.poLine.findMany({ where: { poId: gr.poId, status: { not: 'cancelled' } } });
  const full = all.every((l) => D(l.receivedQty).gte(D(l.qty)));
  await tx.purchaseOrder.update({ where: { id: gr.poId }, data: { status: full ? 'received' : 'partially_received' } });
  // GL: goods in transit / GRNI at PO cost
  if (value.gt(0)) await postJournal(tx, ctx, { event: 'goods_receipt', amounts: { amount: value }, sourceType: 'GoodsReceipt', sourceId: gr.id, requestId: gr.requestId, memo: `Goods receipt ${gr.number}`, partnerType: 'supplier', partnerId: gr.supplierId });
  // sales order awareness (sales order updated)
  const po = await tx.purchaseOrder.findUnique({ where: { id: gr.poId } });
  if (po?.salesOrderId) {
    const so = await tx.salesOrder.findUnique({ where: { id: po.salesOrderId } });
    await notifyRole(tx, ctx.companyId, 'warehouse', { title: `Goods received for ${so?.number}`, body: 'Ready to plan delivery', link: `/app/sales-order/${so?.id}`, type: 'logistics' });
    await emit(tx, ctx.companyId, 'SalesOrder.goods_received', { id: po.salesOrderId });
  }
  await emit(tx, ctx.companyId, 'GoodsReceipt.confirmed', { id: gr.id });
}
A('GoodsReceipt.confirm', async ({ ctx, tx, row }) => { await confirmReceipt(tx, ctx, row); return { message: 'Receipt confirmed' }; });

// ================= BILLS & THREE-WAY MATCH (PRC-06) =================
H('SupplierBill', { beforeCreate: async ({ ctx, tx, data }) => { if (ctx.kind === 'supplier') { data.status = 'draft'; } if (data.poId) { const po = await tx.purchaseOrder.findUnique({ where: { id: data.poId } }); if (po) data.supplierId = po.supplierId; } data.dueDate ??= addDays(new Date(data.billDate ?? today()), (await tx.supplier.findUnique({ where: { id: data.supplierId } }))?.paymentTermsDays ?? 30); } });
const billLine = ({ data, row }: any) => { const m = { ...(row ?? {}), ...data }; data.lineTotal = lineTotals(m.qty, m.unitPrice, 0, m.vatPct ?? 15).total; };
async function sumBill(tx: Tx, id: string, excl?: string) {
  const ls = await tx.supplierBillLine.findMany({ where: { billId: id, ...(excl ? { id: { not: excl } } : {}) } });
  let sub = D(0), vat = D(0);
  for (const l of ls) { const t = lineTotals(l.qty, l.unitPrice, 0, l.vatPct); sub = sub.plus(t.net); vat = vat.plus(t.vat); }
  await tx.supplierBill.update({ where: { id }, data: { subtotal: sub, vatAmount: vat, total: sub.plus(vat), matchStatus: 'pending' } });
}
H('SupplierBillLine', { beforeCreate: billLine, beforeUpdate: billLine, afterCreate: ({ tx, row }) => sumBill(tx, row.billId), afterUpdate: ({ tx, row }) => sumBill(tx, row.billId), beforeDelete: ({ tx, row }) => sumBill(tx, row.billId, row.id) });

A('SupplierBill.match', async ({ ctx, tx, row }) => {
  if (row.docType === 'debit_note') return { skip: true, message: 'Debit notes are not matched' };
  const tolQ = await getSetting<number>(ctx.companyId, 'match.tolerance_qty_pct', 2), tolP = await getSetting<number>(ctx.companyId, 'match.tolerance_price_pct', 1);
  const lines = await tx.supplierBillLine.findMany({ where: { billId: row.id }, include: { poLine: true } });
  if (!lines.length) throw bad('The bill has no lines');
  let bad_ = 0;
  for (const l of lines) {
    let variance = D(0), reason: string | null = null;
    const pl = l.poLine ?? (row.poId ? await tx.poLine.findFirst({ where: { poId: row.poId, partId: l.partId } }) : null);
    if (!pl) { reason = 'No matching PO line'; variance = D(l.lineTotal); }
    else {
      const billable = D(pl.receivedQty).minus(D(pl.billedQty));
      const qtyLimit = billable.mul(D(1).plus(D(tolQ).div(100)));
      const priceDiff = D(l.unitPrice).minus(D(pl.unitCost)).abs();
      if (D(l.qty).gt(qtyLimit)) { reason = `Billed ${l.qty} > received & unbilled ${billable}`; variance = D(l.qty).minus(billable).mul(D(l.unitPrice)); }
      else if (priceDiff.gt(D(pl.unitCost).mul(D(tolP).div(100)))) { reason = `Price ${l.unitPrice} differs from PO ${pl.unitCost}`; variance = priceDiff.mul(D(l.qty)); }
      if (!l.poLineId) await tx.supplierBillLine.update({ where: { id: l.id }, data: { poLineId: pl.id } });
    }
    if (reason) bad_++;
    await tx.supplierBillLine.update({ where: { id: l.id }, data: { variance, varianceReason: reason } });
  }
  if (bad_) {
    await notifyRole(tx, ctx.companyId, 'finance', { title: `Bill ${row.number}: ${bad_} variance(s)`, link: `/app/supplier-bill/${row.id}`, severity: 'warning', type: 'bill' });
    return { status: 'variance', set: { matchStatus: 'variance' }, message: `${bad_} line(s) do not match the PO / receipt. Resolve or approve the variance.` };
  }
  return { status: 'draft', set: { matchStatus: 'matched' }, message: 'Matched: PO, receipt and bill agree within tolerance' };
});
A('SupplierBill.approve_variance', async ({ ctx, tx, row }) => {
  if (!canApprove(ctx)) throw forbidden('Only an approver can accept a variance');
  return { set: { matchStatus: 'override' } };
});
export async function postBill(tx: Tx, ctx: Ctx, bill: any) {
  const lines = await tx.supplierBillLine.findMany({ where: { billId: bill.id } });
  const sub = lines.reduce((s, l) => s.plus(D(l.qty).mul(D(l.unitPrice))), D(0));
  const vat = lines.reduce((s, l) => s.plus(lineTotals(l.qty, l.unitPrice, 0, l.vatPct).vat), D(0));
  const entry = await postJournal(tx, ctx, { event: bill.docType === 'debit_note' ? 'debit_note' : 'supplier_bill', date: bill.billDate ?? today(), amounts: { subtotal: sub, vat, total: sub.plus(vat) }, sourceType: 'SupplierBill', sourceId: bill.id, requestId: bill.requestId, memo: `${bill.docType === 'debit_note' ? 'Debit note' : 'Supplier bill'} ${bill.number}`, partnerType: 'supplier', partnerId: bill.supplierId });
  for (const l of lines) if (l.poLineId) await tx.poLine.update({ where: { id: l.poLineId }, data: { billedQty: { increment: l.qty } } });
  if (bill.poId) {
    const pls = await tx.poLine.findMany({ where: { poId: bill.poId, status: { not: 'cancelled' } } });
    if (pls.every((p) => D(p.billedQty).gte(D(p.qty)))) await tx.purchaseOrder.update({ where: { id: bill.poId }, data: { status: 'billed' } });
  }
  return entry;
}
A('SupplierBill.post', async ({ ctx, tx, row }) => {
  if (row.docType === 'bill' && !['matched', 'override'].includes(row.matchStatus)) throw conflict('Run the three-way match first. The bill can only be posted when matched or when the variance is approved.', 'not_matched');
  await sumBill(tx, row.id);
  const fresh = (await tx.supplierBill.findUnique({ where: { id: row.id } }))!;
  const entry = await postBill(tx, ctx, { ...fresh, matchStatus: row.matchStatus });
  return { set: { journalEntryId: entry?.id, matchStatus: row.matchStatus }, message: `Posted to the ledger (${entry?.entryNo})` };
});

// ================= CLAIMS (PRC-07) =================
A('SupplierClaim.submit', async ({ ctx, tx, row }) => {
  const sup = await tx.supplier.findUnique({ where: { id: row.supplierId } });
  await notifyUsers(tx, ctx.companyId, await supplierUsers(tx, row.supplierId), { title: `Claim ${row.number} (${row.kind})`, body: `SAR ${num(row.amount).toFixed(2)}`, link: `/supplier/claims/${row.id}`, severity: 'warning', type: 'claim' });
  await sendMessage(tx, ctx.companyId, { channel: 'email', to: sup?.email, template: 'po_sent', lang: 'en', subject: `Claim ${row.number}`, vars: { number: row.number, total: num(row.amount).toFixed(2), link: '' } });
});
A('SupplierClaim.debit_note', async ({ ctx, tx, row }) => {
  const amount = D(row.amount);
  if (amount.lte(0)) throw bad('Claim amount must be greater than zero');
  const bill = await createRow(tx, sys(ctx), BY_KEY.SupplierBill, { docType: 'debit_note', supplierRef: row.number, poId: row.poId, supplierId: row.supplierId, status: 'draft', billDate: today(), matchStatus: 'matched',
    children: { SupplierBillLine: [{ partId: row.partId, qty: row.qty ?? 1, unitPrice: row.unitCost ?? amount, vatPct: 15, poLineId: undefined }] } }, { trusted: true });
  const fresh = (await tx.supplierBill.findUnique({ where: { id: bill.id } }))!;
  const entry = await postBill(tx, ctx, fresh);
  await tx.supplierBill.update({ where: { id: bill.id }, data: { status: 'posted', journalEntryId: entry?.id } });
  return { set: { debitNoteId: bill.id }, data: { debitNoteId: bill.id }, message: `Debit note ${bill.number} posted` };
});

// ================= SUPPLIER PERFORMANCE (PRC-08) =================
export async function recomputeSupplierScores(companyId?: string) {
  const { prisma } = await import('@erp/db');
  const sups = await prisma.supplier.findMany({ where: { ...(companyId ? { companyId } : {}), status: 'active' } });
  const end = today(), start = addDays(end, -90);
  for (const s of sups) {
    const pos = await prisma.purchaseOrder.findMany({ where: { supplierId: s.id, orderDate: { gte: start }, status: { notIn: ['draft', 'cancelled'] } }, include: { PoLine_poId: true } as any });
    const lines = pos.flatMap((p: any) => p.PoLine_poId);
    const rcpts = await prisma.goodsReceipt.findMany({ where: { supplierId: s.id, status: 'confirmed', receivedAt: { gte: start } }, include: { po: true } });
    const onTime = rcpts.filter((r) => !r.po?.expectedDate || r.receivedAt! <= addDays(r.po.expectedDate, 1)).length;
    const onTimePct = rcpts.length ? (onTime / rcpts.length) * 100 : num(s.onTimePct) || 90;
    const grl = await prisma.grLine.aggregate({ where: { goodsReceipt: { supplierId: s.id, receivedAt: { gte: start }, status: 'confirmed' } }, _sum: { receivedQty: true, damagedQty: true, shortQty: true } });
    const rcv = num(grl._sum.receivedQty), defect = rcv ? ((num(grl._sum.damagedQty) + num(grl._sum.shortQty)) / (rcv + num(grl._sum.shortQty))) * 100 : 0;
    const rq = await prisma.rfqSupplier.findMany({ where: { supplierId: s.id, sentAt: { gte: start }, respondedAt: { not: null } } });
    const resp = rq.length ? rq.reduce((a, r) => a + (r.respondedAt!.getTime() - r.sentAt!.getTime()) / 3600000, 0) / rq.length : 24;
    // price competitiveness: avg ratio of this supplier's quote price to the min price on the same RFQ line
    const ql = await prisma.supplierQuoteLine.findMany({ where: { supplierQuote: { supplierId: s.id, createdAt: { gte: start }, status: { in: ['submitted', 'confirmed'] } }, rfqLineId: { not: null } } });
    let ratio = 0, rn = 0;
    for (const q of ql) { const m = await prisma.supplierQuoteLine.aggregate({ where: { rfqLineId: q.rfqLineId }, _min: { unitPrice: true } }); if (num(m._min.unitPrice) > 0) { ratio += num(m._min.unitPrice) / num(q.unitPrice); rn++; } }
    const priceScore = rn ? (ratio / rn) * 100 : 80;
    const overall = Math.max(0, Math.min(100, 0.4 * onTimePct + 0.3 * priceScore + 0.2 * (100 - defect * 5) + 0.1 * Math.max(0, 100 - resp)));
    await prisma.supplierScore.create({ data: { companyId: s.companyId, supplierId: s.id, periodStart: start, periodEnd: end, onTimePct, priceScore, defectRate: defect, responseHours: resp, overall } });
    await prisma.supplier.update({ where: { id: s.id }, data: { rating: Math.round((overall / 20) * 10) / 10, onTimePct } });
    void lines;
  }
  return sups.length;
}
void r2; void suggestParts; void audit;
