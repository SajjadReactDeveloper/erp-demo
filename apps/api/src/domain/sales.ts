import { BY_KEY } from '@erp/shared';
import { Tx } from '@erp/db';
import { A, Ctx, D, H, addDays, approvalCallbacks, bad, canApprove, conflict, emit, forbidden, getSetting, notFound, notifyRole, notifyUsers, num, r2, sys, today, audit } from '../core/base';
import { createRow } from '../core/crud';
import { needsApproval, requestApproval } from '../core/approvals';
import { checkCredit, placeHold, recomputeProfile, resumers } from '../services/credit';
import { lineTotals, marginOf, priceFromCost, selectRule } from '../services/pricing';
import { matchRequestLines } from '../services/ai';
import { recordPrice } from '../services/catalogue';
import { sendMessage } from '../adapters';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
const PORTAL_BLOCKED = ['partId', 'matchStatus', 'matchConfidence', 'status', 'lostReasonId'];

// ================= REQUESTS (SAL-01, SAL-02, CPT-01) =================
H('Request', {
  beforeCreate: async ({ ctx, data }) => {
    if (ctx.kind === 'customer') data.channel = 'portal';
    data.channel ??= 'phone';
    data.requiredDate ??= addDays(today(), 3);
  },
});
H('RequestLine', {
  beforeCreate: ({ ctx, data }) => {
    if (ctx.kind === 'customer') for (const k of PORTAL_BLOCKED) delete data[k];
    if (Number(data.qty) <= 0) throw bad('Quantity must be greater than zero');
    if (data.partId && !data.matchStatus) data.matchStatus = 'confirmed';
  },
  beforeUpdate: ({ ctx, data, row }) => {
    if (ctx.kind === 'customer') for (const k of PORTAL_BLOCKED) delete data[k];
    if (data.qty != null && Number(data.qty) <= 0) throw bad('Quantity must be greater than zero');
    if (data.partId && data.partId !== row.partId && !data.matchStatus) { data.matchStatus = 'confirmed'; data.matchConfidence = 1; }
    if (data.matchStatus === 'confirmed' && !(data.partId ?? row.partId)) throw bad('Choose a part before confirming the match');
  },
});

async function pickAssignee(tx: Tx, ctx: Ctx, customerId: string) {
  const cust = await tx.customer.findUnique({ where: { id: customerId } });
  if (cust?.salesRepId) return cust.salesRepId;
  const reps = await tx.user.findMany({ where: { companyId: ctx.companyId, isActive: true, kind: 'staff', role: { name: 'sales' } }, select: { id: true } });
  if (!reps.length) return null;
  const load = await Promise.all(reps.map(async (r) => ({ id: r.id, n: await tx.request.count({ where: { assignedToId: r.id, status: { in: ['submitted', 'in_sourcing', 'quoted'] } } }) })));
  return load.sort((a, b) => a.n - b.n)[0].id;
}

A('Request.submit', async ({ ctx, tx, row }) => {
  const lines = await tx.requestLine.count({ where: { requestId: row.id } });
  if (!lines) throw bad('Add at least one part line before submitting');
  const hours = await getSetting<number>(ctx.companyId, 'sla.request_hours', 4);
  const assignedToId = row.assignedToId ?? (await pickAssignee(tx, ctx, row.customerId));
  const holds = await tx.creditHold.count({ where: { companyId: ctx.companyId, customerId: row.customerId, status: 'held' } });
  await tx.request.update({ where: { id: row.id }, data: { slaDueAt: new Date(Date.now() + hours * 3600000), assignedToId } });
  const ai = await matchRequestLines(tx, ctx, row.id);
  if (assignedToId) await notifyUsers(tx, ctx.companyId, [assignedToId], { title: `New request ${row.number}`, body: `${lines} line(s) · AI matched ${ai.matched}/${ai.total}`, link: `/app/request/${row.id}`, severity: 'info', type: 'request' });
  return { data: { ai, creditHold: holds > 0 }, message: holds ? 'Submitted. Note: the customer currently has a credit hold.' : 'Request submitted' };
});
A('Request.match', async ({ ctx, tx, row }) => {
  const r = await matchRequestLines(tx, ctx, row.id);
  return { skip: true, data: r, message: `AI suggested ${r.matched} of ${r.total} lines. Review and confirm each one.` };
});
A('Request.assign', async ({ ctx, tx, row, body }) => {
  if (!body?.userId) throw bad('Choose a user');
  await notifyUsers(tx, ctx.companyId, [body.userId], { title: `Request ${row.number} assigned to you`, link: `/app/request/${row.id}`, type: 'request' });
  return { set: { assignedToId: body.userId }, skip: true };
});
A('Request.create_rfq', async ({ ctx, tx, row }) => {
  const lines = await tx.requestLine.findMany({ where: { requestId: row.id, status: { not: 'lost' } }, include: { part: { include: { brand: true, category: true } } }, orderBy: { lineNo: 'asc' } });
  if (!lines.length) throw bad('No open lines');
  const unmatched = lines.filter((l) => !l.partId || l.matchStatus === 'unmatched');
  if (unmatched.length) throw conflict(`${unmatched.length} line(s) have no matched part: ${unmatched.map((l) => `#${l.lineNo}`).join(', ')}. Run AI matching or pick the part manually.`, 'unmatched_lines');
  const unconfirmed = lines.filter((l) => l.matchStatus === 'suggested');
  if (unconfirmed.length) throw conflict(`Confirm the AI-suggested part on line(s) ${unconfirmed.map((l) => `#${l.lineNo}`).join(', ')} first.`, 'unconfirmed_matches');
  const existing = await tx.rfq.findFirst({ where: { requestId: row.id, status: { notIn: ['cancelled'] } } });
  if (existing) throw conflict(`RFQ ${existing.number} already exists for this request`, 'duplicate');
  const hours = await getSetting<number>(ctx.companyId, 'rfq.default_deadline_hours', 48);
  const rfq = await createRow(tx, ctx, BY_KEY.Rfq, { requestId: row.id, status: 'draft', deadline: new Date(Date.now() + hours * 3600000), notes: `For request ${row.number}`,
    children: { RfqLine: lines.map((l) => ({ requestLineId: l.id, partId: l.partId, qty: l.qty, uomId: l.uomId })) } }, { trusted: true });
  // auto-select suppliers by brand / category
  const suppliers = await tx.supplier.findMany({ where: { companyId: ctx.companyId, status: 'active' }, include: { SupplierContact_supplierId: true } as any });
  const brands = new Set(lines.map((l: any) => l.part?.brand?.name?.replace(/ \(OEM\)$/, '')).filter(Boolean));
  const cats = new Set(lines.map((l: any) => l.part?.category?.name).filter(Boolean));
  const chosen = suppliers.filter((s: any) => ((s.brands as any[]) ?? []).some((b) => brands.has(b)) || ((s.categories as any[]) ?? []).some((c) => cats.has(c)));
  for (const s of chosen) await tx.rfqSupplier.create({ data: { companyId: ctx.companyId, rfqId: rfq.id, supplierId: s.id, channel: s.whatsapp ? 'whatsapp' : s.email ? 'email' : 'portal', accessToken: crypto.randomUUID() } });
  return { data: { rfqId: rfq.id, number: rfq.number, suppliers: chosen.length }, message: `RFQ ${rfq.number} created with ${chosen.length} suggested supplier(s). Review and send it.` };
});

// ================= QUOTATIONS (SAL-03..06, CPT-03) =================
export async function recalcQuotation(tx: Tx, quotationId: string, excludeLineId?: string) {
  const q = await tx.quotation.findUnique({ where: { id: quotationId } });
  if (!q) return;
  const lines = await tx.quotationLine.findMany({ where: { quotationId, isAlternative: false, ...(excludeLineId ? { id: { not: excludeLineId } } : {}), status: { not: 'rejected' } } });
  let sub = D(0), vat = D(0), cost = D(0), breached = false;
  for (const l of lines) {
    const t = lineTotals(l.qty, l.unitPrice, l.discountPct, l.vatPct);
    sub = sub.plus(t.net); vat = vat.plus(t.vat); cost = cost.plus(D(l.unitCost).mul(l.qty));
    if (l.belowMin) breached = true;
  }
  await tx.quotation.update({ where: { id: quotationId }, data: { subtotal: sub, vatAmount: vat, total: sub.plus(vat), marginPct: sub.isZero() ? 0 : sub.minus(cost).div(sub), minMarginBreached: breached } });
}

async function priceLine(tx: Tx, ctx: Ctx, qt: any, l: any, partRow?: any) {
  const part = partRow ?? (await tx.part.findUnique({ where: { id: l.partId } }));
  const cust = await tx.customer.findUnique({ where: { id: qt.customerId } });
  const req = qt.requestId ? await tx.request.findUnique({ where: { id: qt.requestId } }) : null;
  const rule = await selectRule(tx, ctx.companyId, { tier: cust?.priceTier, categoryId: part?.categoryId, brandId: part?.brandId, supplierId: l.supplierId, urgency: req?.urgency });
  return { rule, part };
}

const quoteLineGuard = async ({ ctx, tx, data, row }: any) => {
  const merged = { ...(row ?? {}), ...data };
  const qt = await tx.quotation.findUnique({ where: { id: merged.quotationId } });
  if (!qt) throw notFound('Quotation');
  if (!['draft', 'pending_margin_approval'].includes(qt.status) && !ctx.internal) throw conflict('This quotation has already been sent and can no longer be edited. Create a revision instead.', 'invalid_state');
  const { rule, part } = await priceLine(tx, ctx, qt, merged);
  if (data.unitPrice == null && row == null) {
    if (merged.unitCost == null) throw bad('Enter the unit cost or the unit price');
    data.unitPrice = priceFromCost(merged.unitCost, rule?.targetMarginPct ?? (await getSetting(ctx.companyId, 'margin.default_target_pct', 0.25)));
  }
  if (data.vatPct == null && merged.vatPct == null) data.vatPct = await getSetting(ctx.companyId, 'vat.default_pct', 15);
  if (!ctx.internal && !canApprove(ctx)) {
    if (row && ((data.discountPct != null && num(data.discountPct) > num(row.discountPct)) || (data.unitPrice != null && !D(data.unitPrice).equals(D(row.unitPrice))))) throw forbidden('Discounts and price overrides need approval. Create a Discount request instead.');
    if (!row && data.discountPct && num(data.discountPct) > 0) throw forbidden('Discounts need approval. Create a Discount request after saving.');
  }
  const price = D(data.unitPrice ?? merged.unitPrice), disc = D(data.discountPct ?? merged.discountPct ?? 0);
  const eff = price.mul(D(1).minus(disc.div(100)));
  const mg = marginOf(eff, merged.unitCost ?? 0);
  data.marginPct = mg;
  const min = rule?.minMarginPct ?? (await getSetting(ctx.companyId, 'margin.default_min_pct', 0.1));
  data.belowMin = mg.lt(D(min));
  data.ruleId = rule?.id ?? undefined;
  data.lineTotal = lineTotals(merged.qty, price, disc, data.vatPct ?? merged.vatPct).total;
  void part;
};
H('QuotationLine', {
  beforeCreate: quoteLineGuard,
  beforeUpdate: quoteLineGuard,
  afterCreate: ({ tx, row }) => recalcQuotation(tx, row.quotationId),
  afterUpdate: ({ tx, row }) => recalcQuotation(tx, row.quotationId),
  beforeDelete: async ({ tx, row, ctx }) => { const qt = await tx.quotation.findUnique({ where: { id: row.quotationId } }); if (qt && !['draft', 'pending_margin_approval'].includes(qt.status) && !ctx.internal) throw conflict('Sent quotations cannot be edited', 'invalid_state'); await recalcQuotation(tx, row.quotationId, row.id); },
});
H('Quotation', {
  beforeCreate: async ({ ctx, data }) => {
    data.validUntil ??= addDays(today(), await getSetting<number>(ctx.companyId, 'quotation.validity_days', 7));
    data.currency ??= 'SAR';
  },
  beforeUpdate: ({ ctx, row, data }) => { if (!['draft', 'pending_margin_approval'].includes(row.status) && !ctx.internal && Object.keys(data).some((k) => !['notes', 'validUntil', 'channel'].includes(k))) throw conflict('Sent quotations cannot be edited', 'invalid_state'); },
});

A('Quotation.build', async ({ ctx, tx, row }) => {
  if (!row.requestId) throw bad('This quotation is not linked to a request');
  const award = await tx.award.findFirst({ where: { companyId: ctx.companyId, status: 'confirmed', rfq: { requestId: row.requestId } }, orderBy: { createdAt: 'desc' }, include: { AwardLine_awardId: true } as any });
  if (!award) throw conflict('Award the RFQ first: no confirmed award exists for this request', 'no_award');
  const aLines: any[] = (award as any).AwardLine_awardId;
  await tx.quotationLine.deleteMany({ where: { quotationId: row.id } });
  const sctx = sys(ctx);
  let n = 0;
  for (const al of aLines) {
    const rfqLine = await tx.rfqLine.findUnique({ where: { id: al.rfqLineId } });
    const sql = al.supplierQuoteLineId ? await tx.supplierQuoteLine.findUnique({ where: { id: al.supplierQuoteLineId } }) : null;
    const sq = sql ? await tx.supplierQuote.findUnique({ where: { id: sql.supplierQuoteId } }) : null;
    const main = await createRow(tx, sctx, BY_KEY.QuotationLine, { quotationId: row.id, requestId: row.requestId, requestLineId: rfqLine?.requestLineId, partId: al.partId ?? rfqLine?.partId, supplierId: al.supplierId, qty: al.qty, unitCost: al.unitCost, leadTimeDays: sql?.leadTimeDays ?? sq?.leadTimeDays, warranty: sql?.warranty, status: 'pending', isAlternative: false }, { trusted: true });
    n++;
    // up to two alternatives: other suppliers' / aftermarket quotes for the same RFQ line
    const alts = await tx.supplierQuoteLine.findMany({ where: { rfqLineId: al.rfqLineId, id: { not: al.supplierQuoteLineId ?? undefined }, supplierQuote: { status: { in: ['submitted', 'confirmed'] } }, partId: { not: null }, availability: { not: 'unavailable' } }, orderBy: { unitPrice: 'asc' }, take: 6, include: { supplierQuote: true } });
    const seen = new Set<string>([al.partId ?? '']);
    let k = 0;
    for (const a of alts) {
      if (k >= 2 || !a.partId || seen.has(a.partId)) continue;
      seen.add(a.partId); k++;
      await createRow(tx, sctx, BY_KEY.QuotationLine, { quotationId: row.id, requestId: row.requestId, requestLineId: rfqLine?.requestLineId, partId: a.partId, supplierId: a.supplierQuote.supplierId, qty: al.qty, unitCost: a.unitPrice, leadTimeDays: a.leadTimeDays, warranty: a.warranty, status: 'pending', isAlternative: true, alternativeOfId: main.id }, { trusted: true });
    }
  }
  await recalcQuotation(tx, row.id);
  const q = await tx.quotation.findUnique({ where: { id: row.id } });
  return { skip: true, data: { lines: n, total: q!.total, marginPct: q!.marginPct, minMarginBreached: q!.minMarginBreached }, message: q!.minMarginBreached ? 'Quotation built. Some lines are below the minimum margin and need approval before sending.' : 'Quotation built from the awarded supplier quotes.' };
});
A('Quotation.recalc', async ({ tx, row }) => {
  const lines = await tx.quotationLine.findMany({ where: { quotationId: row.id } });
  for (const l of lines) await tx.quotationLine.update({ where: { id: l.id }, data: {} });
  await recalcQuotation(tx, row.id);
  return { skip: true, message: 'Recalculated' };
});
A('Quotation.submit_margin', async ({ ctx, tx, row }) => {
  await recalcQuotation(tx, row.id);
  const q = await tx.quotation.findUnique({ where: { id: row.id } });
  if (!q!.minMarginBreached) throw conflict('All lines meet the minimum margin; no approval is needed', 'not_needed');
  const below = await tx.quotationLine.count({ where: { quotationId: row.id, belowMin: true, isAlternative: false } });
  const appr = await requestApproval(tx, ctx, { type: 'margin', refType: 'Quotation', refId: row.id, amount: q!.total, reason: `${q!.number}: ${below} line(s) below minimum margin (overall ${(num(q!.marginPct) * 100).toFixed(1)}%)` });
  return { set: { approvalId: appr.id }, message: 'Sent to the manager for margin approval' };
});
approvalCallbacks['margin'] = async ({ tx, ctx, approval, approved }) => {
  const q = await tx.quotation.findFirst({ where: { id: approval.refId } });
  if (!q || q.status !== 'pending_margin_approval') return;
  await tx.quotation.update({ where: { id: q.id }, data: { status: approved ? 'approved_internal' : 'draft' } });
  await notifyUsers(tx, ctx.companyId, [approval.requestedById!].filter(Boolean), { title: `Margin ${approved ? 'approved' : 'rejected'}: ${q.number}`, body: approval.decisionNote ?? undefined, link: `/app/quotation/${q.id}`, severity: approved ? 'info' : 'warning', type: 'quotation' });
};

A('Quotation.send', async ({ ctx, tx, row, body }) => {
  await recalcQuotation(tx, row.id);
  const q = (await tx.quotation.findUnique({ where: { id: row.id } }))!;
  const lines = await tx.quotationLine.count({ where: { quotationId: row.id } });
  if (!lines) throw bad('The quotation has no lines');
  if (q.minMarginBreached && row.status !== 'approved_internal') throw conflict('Some lines are below the minimum margin. Request margin approval before sending.', 'margin_approval_required');
  const channel = body?.channel ?? row.channel ?? 'portal';
  const cust = await tx.customer.findUnique({ where: { id: q.customerId } });
  const link = `${WEB}/portal/quotations/${q.id}`;
  const portalUsers = await tx.user.findMany({ where: { customerId: q.customerId, kind: 'customer', isActive: true }, select: { id: true } });
  await notifyUsers(tx, ctx.companyId, portalUsers.map((u) => u.id), { title: `New quotation ${q.number}`, body: `SAR ${num(q.total).toFixed(2)}`, link: `/portal/quotations/${q.id}`, type: 'quotation' });
  const lang = 'ar' as const;
  if (channel === 'whatsapp') await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: cust?.phone, template: 'quotation_sent', lang, vars: { number: q.number, total: num(q.total).toFixed(2), link } });
  if (channel === 'email') await sendMessage(tx, ctx.companyId, { channel: 'email', to: cust?.email, template: 'quotation_sent', lang, subject: `Quotation ${q.number}`, vars: { number: q.number, total: num(q.total).toFixed(2), link } });
  if (q.requestId) await tx.request.update({ where: { id: q.requestId }, data: { status: 'quoted' } });
  return { set: { sentAt: new Date(), channel, validUntil: q.validUntil ?? addDays(today(), 7) }, message: `Sent via ${channel}` };
});

/** Finalise customer decision once credit allows it. */
export async function finalizeQuotation(tx: Tx, ctx: Ctx, quotationId: string) {
  const q = (await tx.quotation.findUnique({ where: { id: quotationId } }))!;
  const primaries = await tx.quotationLine.findMany({ where: { quotationId, isAlternative: false } });
  const alts = await tx.quotationLine.findMany({ where: { quotationId, isAlternative: true } });
  const approvedIds = new Set([...primaries, ...alts].filter((l) => l.status === 'approved').map((l) => l.alternativeOfId ?? l.id));
  const approvedLines = [...primaries, ...alts].filter((l) => l.status === 'approved');
  const status = !approvedLines.length ? 'rejected' : primaries.every((p) => approvedIds.has(p.id)) ? 'approved_full' : 'approved_partial';
  await tx.quotation.update({ where: { id: quotationId }, data: { status, approvedAt: new Date() } });
  // total reflects approved lines only
  let sub = D(0), vat = D(0);
  for (const l of approvedLines) { const t = lineTotals(l.qty, l.unitPrice, l.discountPct, l.vatPct); sub = sub.plus(t.net); vat = vat.plus(t.vat); }
  await tx.quotation.update({ where: { id: quotationId }, data: { subtotal: sub, vatAmount: vat, total: sub.plus(vat) } });
  const lost = await tx.lostReason.findFirst({ where: { companyId: ctx.companyId, code: 'COMP' } });
  for (const p of primaries) {
    const chosen = approvedLines.find((l) => (l.alternativeOfId ?? l.id) === p.id);
    if (p.requestLineId) await tx.requestLine.update({ where: { id: p.requestLineId }, data: chosen ? { status: 'approved', ...(chosen.id !== p.id ? { partId: chosen.partId } : {}) } : { status: 'lost', lostReasonId: p.lostReasonId ?? lost?.id } });
    if (chosen) await recordPrice(tx, ctx.companyId, { partId: chosen.partId, kind: 'selling', price: chosen.unitPrice, customerId: q.customerId, supplierId: chosen.supplierId, source: q.number });
  }
  if (q.requestId) await tx.request.update({ where: { id: q.requestId }, data: { status: status === 'approved_full' ? 'approved' : status === 'approved_partial' ? 'partially_approved' : 'lost' } });
  const rep = q.requestId ? (await tx.request.findUnique({ where: { id: q.requestId } }))?.assignedToId : null;
  await notifyUsers(tx, ctx.companyId, [rep ?? ''].filter(Boolean), { title: `Quotation ${q.number} ${status.replace('_', ' ')}`, link: `/app/quotation/${q.id}`, type: 'quotation' });
  await emit(tx, ctx.companyId, `Quotation.${status}`, { id: quotationId });
}
resumers['Quotation'] = (tx, ctx, id) => finalizeQuotation(tx, ctx, id);

A('Quotation.approve', async ({ ctx, tx, row, body }) => {
  if (new Date(row.validUntil ?? addDays(today(), 1)) < today()) { await tx.quotation.update({ where: { id: row.id }, data: { status: 'expired' } }); throw conflict('This quotation has expired. Ask your sales representative for a new one.', 'expired'); }
  const all = await tx.quotationLine.findMany({ where: { quotationId: row.id } });
  const primaries = all.filter((l) => !l.isAlternative);
  const selected: Set<string> = new Set(body?.lineIds?.length ? body.lineIds : primaries.map((p) => p.id));
  const reasons: Record<string, string> = body?.reasons ?? {};
  let approvedVal = D(0);
  for (const p of primaries) {
    const alt = all.find((a) => a.isAlternative && a.alternativeOfId === p.id && selected.has(a.id));
    const chosen = alt ?? (selected.has(p.id) ? p : null);
    for (const l of [p, ...all.filter((a) => a.alternativeOfId === p.id)]) {
      const isChosen = chosen?.id === l.id;
      await tx.quotationLine.update({ where: { id: l.id }, data: { status: isChosen ? 'approved' : 'rejected', lostReasonId: !isChosen && !l.isAlternative ? reasons[l.id] ?? undefined : undefined } });
    }
    if (chosen) approvedVal = approvedVal.plus(lineTotals(chosen.qty, chosen.unitPrice, chosen.discountPct, chosen.vatPct).total);
  }
  if (approvedVal.isZero()) { await finalizeQuotation(tx, ctx, row.id); return { skip: true, message: 'No lines approved' }; }
  const verdict = await checkCredit(tx, ctx.companyId, row.customerId, approvedVal, { excludeQuotationId: row.id });
  if (!verdict.ok) {
    const hold = await placeHold(tx, sys(ctx), { customerId: row.customerId, reason: verdict.reason, refType: 'Quotation', refId: row.id, amount: approvedVal, exposure: verdict.exposure.total, message: verdict.message });
    return { skip: true, data: { held: true, holdId: hold.id, reason: verdict.reason }, message: `Your approval is recorded but needs a credit review (${verdict.message}). We will confirm shortly.` };
  }
  await finalizeQuotation(tx, ctx, row.id);
  return { skip: true, message: 'Quotation approved' };
});
A('Quotation.reject', async ({ ctx, tx, row, body }) => {
  await tx.quotationLine.updateMany({ where: { quotationId: row.id }, data: { status: 'rejected', lostReasonId: body?.reasonId ?? undefined } });
  const pl = await tx.quotationLine.findMany({ where: { quotationId: row.id, isAlternative: false } });
  for (const p of pl) if (p.requestLineId) await tx.requestLine.update({ where: { id: p.requestLineId }, data: { status: 'lost', lostReasonId: body?.reasonId ?? undefined } });
  if (row.requestId) await tx.request.update({ where: { id: row.requestId }, data: { status: 'lost' } });
  return { message: 'Quotation rejected' };
});

A('Quotation.create_order', async ({ ctx, tx, row, body }) => {
  const dup = await tx.salesOrder.findFirst({ where: { quotationId: row.id, status: { not: 'cancelled' } } });
  if (dup) throw conflict(`Sales order ${dup.number} already exists for this quotation`, 'duplicate');
  const lines = await tx.quotationLine.findMany({ where: { quotationId: row.id, status: 'approved' } });
  if (!lines.length) throw bad('No approved lines');
  const addr = await tx.customerAddress.findFirst({ where: { customerId: row.customerId }, orderBy: { isDefault: 'desc' } });
  const so = await createRow(tx, sys(ctx), BY_KEY.SalesOrder, { quotationId: row.id, requestId: row.requestId, customerId: row.customerId, status: 'draft', orderDate: today(), deliveryAddressId: body?.deliveryAddressId ?? addr?.id, poNumber: body?.poNumber,
    children: { SalesOrderLine: lines.map((l) => ({ requestLineId: l.requestLineId, quotationLineId: l.id, partId: l.partId, supplierId: l.supplierId, qty: l.qty, unitPrice: D(l.unitPrice).mul(D(1).minus(D(l.discountPct ?? 0).div(100))), unitCost: l.unitCost, vatPct: l.vatPct ?? 15, status: 'open' })) } }, { trusted: true });
  return { skip: true, data: { salesOrderId: so.id, number: so.number }, message: `Sales order ${so.number} created. Confirm it to run the credit check.` };
});

// ================= SALES ORDERS (SAL-07, SAL-08) =================
export async function recalcOrder(tx: Tx, orderId: string) {
  const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: orderId, status: { not: 'cancelled' } } });
  const total = lines.reduce((s, l) => s.plus(D(l.lineTotal)), D(0));
  await tx.salesOrder.update({ where: { id: orderId }, data: { total } });
}
const soLine = ({ data, row }: any) => {
  const m = { ...(row ?? {}), ...data };
  data.lineTotal = lineTotals(m.qty, m.unitPrice, 0, m.vatPct ?? 15).total;
  data.backorderQty = r2(D(m.qty).minus(D(m.deliveredQty ?? 0)));
};
H('SalesOrderLine', {
  beforeCreate: soLine, beforeUpdate: soLine,
  afterCreate: ({ tx, row }) => recalcOrder(tx, row.salesOrderId), afterUpdate: ({ tx, row }) => recalcOrder(tx, row.salesOrderId),
});
async function confirmOrderNow(tx: Tx, ctx: Ctx, so: any) {
  await tx.salesOrder.update({ where: { id: so.id }, data: { status: 'confirmed', holdId: null } });
  if (so.requestId) await tx.request.update({ where: { id: so.requestId }, data: { status: 'ordered' } });
  await recomputeProfile(tx, ctx.companyId, so.customerId);
  await notifyRole(tx, ctx.companyId, 'purchasing', { title: `Sales order ${so.number} confirmed`, body: 'Create the purchase orders', link: `/app/sales-order/${so.id}`, type: 'order' });
  await emit(tx, ctx.companyId, 'SalesOrder.confirmed', { id: so.id });
}
resumers['SalesOrder'] = async (tx, ctx, id) => { const so = await tx.salesOrder.findUnique({ where: { id } }); if (so && so.status === 'on_hold') await confirmOrderNow(tx, ctx, so); };

A('SalesOrder.confirm', async ({ ctx, tx, row }) => {
  await recalcOrder(tx, row.id);
  const so = (await tx.salesOrder.findUnique({ where: { id: row.id } }))!;
  if (!(await tx.salesOrderLine.count({ where: { salesOrderId: so.id } }))) throw bad('The order has no lines');
  const verdict = await checkCredit(tx, ctx.companyId, so.customerId, so.total, { excludeQuotationId: so.quotationId ?? undefined });
  if (!verdict.ok) {
    const hold = await placeHold(tx, sys(ctx), { customerId: so.customerId, reason: verdict.reason, refType: 'SalesOrder', refId: so.id, amount: so.total, exposure: verdict.exposure.total, message: verdict.message });
    return { status: 'on_hold', set: { holdId: hold.id }, data: { held: true, reason: verdict.reason }, message: `Order is on credit hold: ${verdict.message}` };
  }
  await confirmOrderNow(tx, ctx, so);
  return { skip: true, message: 'Order confirmed. Credit check passed.' };
});
A('SalesOrder.create_pos', async ({ ctx, tx, row }) => {
  const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: row.id, status: { not: 'cancelled' } } });
  const covered = await tx.poLine.findMany({ where: { salesOrderLineId: { in: lines.map((l) => l.id) }, poId: { not: undefined }, po: { status: { not: 'cancelled' } } }, select: { salesOrderLineId: true } });
  const coveredSet = new Set(covered.map((c) => c.salesOrderLineId));
  const todo = lines.filter((l) => !coveredSet.has(l.id));
  if (!todo.length) throw conflict('Purchase orders already exist for all lines', 'duplicate');
  const missing = todo.filter((l) => !l.supplierId);
  if (missing.length) throw bad('Some lines have no supplier. Award the RFQ first.');
  const bySupplier = new Map<string, typeof todo>();
  for (const l of todo) bySupplier.set(l.supplierId!, [...(bySupplier.get(l.supplierId!) ?? []), l]);
  const out: any[] = [];
  const lead = 0;
  void lead;
  for (const [supplierId, ls] of bySupplier) {
    const sup = await tx.supplier.findUnique({ where: { id: supplierId } });
    const po = await createRow(tx, sys(ctx), BY_KEY.PurchaseOrder, { requestId: row.requestId, salesOrderId: row.id, supplierId, status: 'draft', orderDate: today(), expectedDate: addDays(today(), sup?.leadTimeDays ?? 3), currency: 'SAR',
      children: { PoLine: ls.map((l) => ({ salesOrderLineId: l.id, requestLineId: l.requestLineId, partId: l.partId, qty: l.qty, unitCost: l.unitCost ?? 0, vatPct: l.vatPct ?? 15 })) } }, { trusted: true });
    out.push({ id: po.id, number: po.number, supplier: sup?.name });
  }
  return { skip: true, data: { purchaseOrders: out }, message: `${out.length} purchase order(s) created in draft` };
});
A('SalesOrder.plan_delivery', async ({ ctx, tx, row, body }) => {
  const lines = await tx.salesOrderLine.findMany({ where: { salesOrderId: row.id, status: { not: 'cancelled' } } });
  const todo: { l: any; qty: any }[] = [];
  for (const l of lines) {
    const received = (await tx.poLine.aggregate({ where: { salesOrderLineId: l.id, po: { status: { not: 'cancelled' } } }, _sum: { receivedQty: true } }))._sum.receivedQty ?? D(0);
    const dls = await tx.deliveryLine.findMany({ where: { salesOrderLineId: l.id, status: { in: ['pending', 'delivered', 'partial'] } } });
    const planned = dls.reduce((s, d) => s.plus(d.status === 'pending' ? D(d.qty) : D(d.deliveredQty ?? 0)), D(0));
    const free = D(received).minus(D(planned));
    if (free.gt(0)) todo.push({ l, qty: free });
  }
  if (!todo.length) throw conflict('Nothing is ready to deliver yet. Receive the goods from the supplier first.', 'nothing_to_deliver');
  const dn = await createRow(tx, sys(ctx), BY_KEY.DeliveryNote, { salesOrderId: row.id, requestId: row.requestId, customerId: row.customerId, addressId: row.deliveryAddressId, status: 'planned', plannedDate: body?.plannedDate ? new Date(body.plannedDate) : addDays(today(), 1),
    routeArea: (row.deliveryAddressId ? (await tx.customerAddress.findUnique({ where: { id: row.deliveryAddressId } }))?.area : undefined) ?? undefined,
    children: { DeliveryLine: todo.map((t) => ({ salesOrderLineId: t.l.id, partId: t.l.partId, qty: t.qty, status: 'pending' })) } }, { trusted: true });
  return { skip: true, data: { deliveryNoteId: dn.id, number: dn.number }, message: `Delivery note ${dn.number} planned for ${todo.length} line(s)` };
});
A('SalesOrder.cancel', async ({ ctx, tx, row }) => {
  if (await tx.deliveryNote.count({ where: { salesOrderId: row.id, status: { in: ['delivered', 'partially_delivered', 'out_for_delivery'] } } })) throw conflict('Deliveries already started; cancel is not possible. Use a return instead.', 'invalid_state');
  const pos = await tx.purchaseOrder.count({ where: { salesOrderId: row.id, status: { in: ['sent', 'confirmed', 'partially_received', 'received', 'billed'] } } });
  if (pos) throw conflict('Purchase orders were already sent to suppliers. Cancel them first.', 'invalid_state');
  await tx.salesOrderLine.updateMany({ where: { salesOrderId: row.id }, data: { status: 'cancelled' } });
  await tx.creditHold.updateMany({ where: { refType: 'SalesOrder', refId: row.id, status: 'held' }, data: { status: 'released', releasedAt: new Date(), releaseReason: 'Order cancelled', releasedById: ctx.userId } });
  await recomputeProfile(tx, ctx.companyId, row.customerId);
});

// ================= RETURNS (SAL-09, CPT-07) =================
H('ReturnAuth', {
  beforeCreate: async ({ ctx, tx, data }) => {
    if (data.invoiceId) {
      const inv = await tx.invoice.findFirst({ where: { id: data.invoiceId, companyId: ctx.companyId } });
      if (!inv) throw bad('Invoice not found');
      if (ctx.kind === 'customer' && inv.customerId !== ctx.customerId) throw forbidden();
      data.customerId = inv.customerId; data.salesOrderId ??= inv.salesOrderId;
      if (!['cleared', 'reported', 'partially_paid', 'paid'].includes(inv.status)) throw conflict('Only issued invoices can be returned');
    }
    data.requestedVia = ctx.kind === 'customer' ? 'portal' : 'staff';
  },
});
H('ReturnLine', {
  beforeCreate: async ({ tx, data, ctx }) => {
    const il = await tx.invoiceLine.findUnique({ where: { id: data.invoiceLineId } });
    if (!il) throw bad('Choose an invoice line');
    const prior = await tx.returnLine.aggregate({ where: { invoiceLineId: il.id, returnAuth: { status: { notIn: ['rejected'] } } }, _sum: { qty: true } });
    if (D(data.qty).plus(D(prior._sum.qty ?? 0)).gt(D(il.qty))) throw bad(`Return quantity exceeds the invoiced quantity (${il.qty}, already returned ${prior._sum.qty ?? 0})`);
    data.partId ??= il.partId ?? undefined;
    void ctx;
  },
});
async function returnValue(tx: Tx, id: string) {
  const ls = await tx.returnLine.findMany({ where: { returnAuthId: id }, include: { invoiceLine: true } });
  return ls.reduce((s, l) => s.plus(D(l.qty).mul(D(l.invoiceLine?.unitPrice ?? 0))), D(0));
}
A('ReturnAuth.approve', async ({ ctx, tx, row }) => {
  if (!(await tx.returnLine.count({ where: { returnAuthId: row.id } }))) throw bad('Add the returned lines first');
  const val = await returnValue(tx, row.id);
  if (!canApprove(ctx) && (await needsApproval(tx, ctx.companyId, 'return', val))) {
    await requestApproval(tx, ctx, { type: 'return', refType: 'ReturnAuth', refId: row.id, amount: val, reason: `Return ${row.number} (SAR ${val.toFixed(2)})` });
    return { skip: true, message: 'Sent to the manager for approval' };
  }
});
approvalCallbacks['return'] = async ({ tx, approval, approved }) => { await tx.returnAuth.update({ where: { id: approval.refId }, data: { status: approved ? 'approved' : 'rejected' } }); };
A('ReturnAuth.credit', async ({ ctx, tx, row }) => {
  const { createCreditNote } = await import('./finance');
  const lines = await tx.returnLine.findMany({ where: { returnAuthId: row.id } });
  if (!row.invoiceId) throw bad('No invoice linked');
  const cn = await createCreditNote(tx, ctx, row.invoiceId, lines.map((l) => ({ invoiceLineId: l.invoiceLineId!, qty: num(l.qty) })), `Return ${row.number}`);
  return { set: { creditNoteId: cn.id }, data: { creditNoteId: cn.id }, message: `Credit note ${cn.number} issued` };
});
A('ReturnAuth.supplier_return', async ({ ctx, tx, row }) => {
  const lines = await tx.returnLine.findMany({ where: { returnAuthId: row.id }, include: { invoiceLine: true } });
  let n = 0;
  for (const l of lines) {
    const sol = l.invoiceLine?.salesOrderLineId ? await tx.salesOrderLine.findUnique({ where: { id: l.invoiceLine.salesOrderLineId } }) : null;
    if (!sol?.supplierId) continue;
    await createRow(tx, sys(ctx), BY_KEY.SupplierClaim, { supplierId: sol.supplierId, partId: l.partId, qty: l.qty, unitCost: sol.unitCost ?? 0, kind: l.condition === 'damaged' ? 'damaged' : 'wrong_item', amount: D(l.qty).mul(D(sol.unitCost ?? 0)), notes: `Customer return ${row.number}`, status: 'open' }, { trusted: true });
    n++;
  }
  return { message: `${n} supplier claim(s) created` };
});

// ================= DISCOUNTS / OVERRIDES (SAL-10) =================
H('DiscountRequest', {
  beforeCreate: ({ data }) => { if (!data.pct && !data.amount) throw bad('Enter a discount % or a new unit price'); },
});
A('DiscountRequest.submit', async ({ ctx, tx, row }) => {
  const ql = row.quotationLineId ? await tx.quotationLine.findUnique({ where: { id: row.quotationLineId } }) : null;
  if (!ql) throw bad('Choose the quotation line');
  const impact = row.pct ? D(ql.unitPrice).mul(ql.qty).mul(D(row.pct).div(100)) : D(ql.unitPrice).minus(D(row.amount ?? 0)).mul(ql.qty);
  const appr = await requestApproval(tx, ctx, { type: row.type === 'override' ? 'price_override' : 'discount', refType: 'DiscountRequest', refId: row.id, amount: impact, reason: row.reason });
  return { set: { approvalId: appr.id }, skip: false, status: 'pending', message: 'Sent for approval' };
});
const discountDone = async ({ tx, ctx, approval, approved }: any) => {
  const d = await tx.discountRequest.findUnique({ where: { id: approval.refId } });
  if (!d) return;
  await tx.discountRequest.update({ where: { id: d.id }, data: { status: approved ? 'approved' : 'rejected' } });
  if (approved && d.quotationLineId) {
    const ql = await tx.quotationLine.findUnique({ where: { id: d.quotationLineId } });
    if (ql) {
      const data: any = {};
      if (d.pct) data.discountPct = d.pct; if (d.amount) data.unitPrice = d.amount;
      await createUpdate(tx, ctx, ql.id, data);
    }
  }
};
async function createUpdate(tx: Tx, ctx: Ctx, lineId: string, data: any) {
  const { updateRow } = await import('../core/crud');
  await updateRow(tx, sys(ctx), BY_KEY.QuotationLine, lineId, data, { trusted: false });
}
approvalCallbacks['discount'] = discountDone;
approvalCallbacks['price_override'] = discountDone;
void audit;
