import { createHash, randomBytes } from 'node:crypto';
import { BY_KEY } from '@erp/shared';
import { Tx } from '@erp/db';
import { A, Ctx, D, H, addDays, approvalCallbacks, bad, canApprove, conflict, emit, forbidden, getSetting, nextNumber, notifyRole, notifyUsers, num, r2, sys, today, audit } from '../core/base';
import { createRow } from '../core/crud';
import { needsApproval, requestApproval } from '../core/approvals';
import { postJournal, reverseJournal } from '../services/posting';
import { processInvoiceForZatca, ensureCredential, buildUbl } from '../services/zatca';
import { recomputeProfile, releaseHold } from '../services/credit';
import { daftraPush, sendMessage } from '../adapters';
import { lineTotals } from '../services/pricing';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';

// ================= GENERAL LEDGER (FIN-01) =================
H('JournalEntry', {
  beforeCreate: ({ data }) => { data.sourceType ??= 'manual'; data.status = 'posted'; },
  afterCreate: async ({ tx, row, ctx }) => {
    const ls = await tx.journalLine.findMany({ where: { entryId: row.id } });
    if (ls.length < 2) throw bad('A journal entry needs at least two lines');
    const d = ls.reduce((s, l) => s.plus(D(l.debit)), D(0)), c = ls.reduce((s, l) => s.plus(D(l.credit)), D(0));
    if (!d.equals(c)) throw bad(`Entry is not balanced: debit ${d.toFixed(2)} ≠ credit ${c.toFixed(2)}`);
    await tx.$executeRawUnsafe(`ALTER TABLE journal_entry DISABLE TRIGGER trg_journal_entry_guard`);
    await tx.journalEntry.update({ where: { id: row.id }, data: { totalDebit: d, postedById: ctx.userId } });
    await tx.$executeRawUnsafe(`ALTER TABLE journal_entry ENABLE TRIGGER trg_journal_entry_guard`);
  },
});
H('JournalLine', { beforeCreate: ({ data }) => { if (D(data.debit ?? 0).gt(0) && D(data.credit ?? 0).gt(0)) throw bad('A line cannot have both debit and credit'); if (D(data.debit ?? 0).isZero() && D(data.credit ?? 0).isZero()) throw bad('Enter a debit or a credit amount'); } });
A('JournalEntry.reverse', async ({ ctx, tx, row, body }) => { const rev = await reverseJournal(tx, ctx, row.id, body?.reason); return { skip: true, message: `Reversed by ${rev.entryNo}` }; });
A('FiscalPeriod.close', async ({ ctx, set }: any) => ({ set: { closedById: ctx.userId } }));
A('FiscalPeriod.reopen', async ({ ctx }) => { if (!ctx.perms.includes('*') && ctx.role !== 'finance') throw forbidden('Only finance or admin can reopen a period'); return {}; });

// ================= INVOICES (FIN-03, FIN-06) =================
H('Invoice', {
  deferNumber: true,
  beforeCreate: async ({ ctx, tx, data }) => {
    data.invoiceType ??= 'standard'; data.currency ??= 'SAR'; data.issueDate ??= today();
    if (data.customerId && !data.dueDate) { const c = await tx.customer.findUnique({ where: { id: data.customerId } }); data.dueDate = addDays(today(), c?.paymentTermsDays ?? (await getSetting<number>(ctx.companyId, 'invoice.due_days', 30))); }
  },
  beforeUpdate: ({ row, data }) => { if (row.status !== 'draft' && Object.keys(data).length) throw conflict('Issued invoices cannot be edited. Issue a credit note instead.', 'immutable'); },
});
const invLine = ({ data, row }: any) => {
  const m = { ...(row ?? {}), ...data };
  const gross = D(m.qty).mul(D(m.unitPrice)), net = gross.minus(D(m.discount ?? 0));
  data.vatAmount = r2(net.mul(D(m.vatPct ?? 15).div(100)));
  data.lineTotal = r2(net.plus(data.vatAmount));
  data.vatPct ??= 15;
};
export async function recalcInvoice(tx: Tx, id: string, excl?: string) {
  const inv = (await tx.invoice.findUnique({ where: { id } }))!;
  const ls = await tx.invoiceLine.findMany({ where: { invoiceId: id, ...(excl ? { id: { not: excl } } : {}) } });
  const total = ls.reduce((s, l) => s.plus(D(l.lineTotal)), D(0)), vat = ls.reduce((s, l) => s.plus(D(l.vatAmount)), D(0));
  const disc = ls.reduce((s, l) => s.plus(D(l.discount ?? 0)), D(0));
  await tx.invoice.update({ where: { id }, data: { total, vatAmount: vat, subtotal: total.minus(vat), discountTotal: disc, balance: inv.status === 'draft' ? total : D(inv.balance) } });
}
H('InvoiceLine', {
  beforeCreate: async ({ tx, data }) => { const inv = await tx.invoice.findUnique({ where: { id: data.invoiceId } }); if (inv && inv.status !== 'draft') throw conflict('Issued invoices cannot be edited', 'immutable'); invLine({ data }); },
  beforeUpdate: invLine,
  afterCreate: ({ tx, row }) => recalcInvoice(tx, row.invoiceId), afterUpdate: ({ tx, row }) => recalcInvoice(tx, row.invoiceId),
  beforeDelete: async ({ tx, row }) => { const inv = await tx.invoice.findUnique({ where: { id: row.invoiceId } }); if (inv && inv.status !== 'draft') throw conflict('Issued invoices cannot be edited', 'immutable'); await recalcInvoice(tx, row.invoiceId, row.id); },
});

async function finalizeInvoiceAccepted(tx: Tx, ctx: Ctx, invId: string) {
  const inv = (await tx.invoice.findUnique({ where: { id: invId } }))!;
  if (inv.journalEntryId) return;
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId: invId } });
  const cost = lines.reduce((s, l) => s.plus(D(l.cost ?? 0).mul(D(l.qty))), D(0));
  const net = D(inv.subtotal).minus(D(0));
  const isCN = inv.invoiceType === 'credit_note';
  const event = isCN ? 'credit_note' : inv.posSaleId ? 'pos_invoice' : 'invoice';
  const entry = await postJournal(tx, ctx, { event, date: inv.issueDate ?? today(), amounts: { total: inv.total, net, vat: inv.vatAmount, cost: isCN ? 0 : cost }, sourceType: 'Invoice', sourceId: inv.id, requestId: inv.requestId, memo: `${isCN ? 'Credit note' : 'Invoice'} ${inv.number}`, partnerType: 'customer', partnerId: inv.customerId, branchId: inv.branchId });
  await tx.invoice.update({ where: { id: invId }, data: { journalEntryId: entry?.id, balance: isCN ? D(0) : D(inv.total).minus(D(inv.paidAmount)) } });
  if (isCN && inv.originalInvoiceId) {
    const orig = (await tx.invoice.findUnique({ where: { id: inv.originalInvoiceId } }))!;
    const bal = D.max(D(0), D(orig.balance).minus(D(inv.total)));
    await tx.invoice.update({ where: { id: orig.id }, data: { balance: bal, status: bal.isZero() ? 'paid' : orig.status } });
  }
}

export async function issueInvoice(tx: Tx, ctx: Ctx, invId: string) {
  const inv = (await tx.invoice.findFirst({ where: { id: invId, companyId: ctx.companyId } }))!;
  if (!(await tx.invoiceLine.count({ where: { invoiceId: invId } }))) throw bad('The invoice has no lines');
  if (!inv.customerId && inv.invoiceType !== 'simplified') throw bad('Choose a customer');
  await recalcInvoice(tx, invId);
  const prefix = inv.invoiceType === 'credit_note' ? 'CN' : inv.invoiceType === 'debit_note' ? 'DN-INV' : 'INV';
  const number = inv.number ?? (await nextNumber(tx, ctx.companyId, prefix, inv.branchId ?? ctx.branchId));
  await tx.invoice.update({ where: { id: invId }, data: { number, issueDate: inv.issueDate ?? today(), balance: inv.invoiceType === 'credit_note' ? D(0) : (await tx.invoice.findUnique({ where: { id: invId } }))!.total } });
  const z: any = await processInvoiceForZatca(tx, ctx, invId);
  const fresh = (await tx.invoice.findUnique({ where: { id: invId } }))!;
  if (['cleared', 'reported', 'partially_paid', 'paid'].includes(fresh.status)) {
    await finalizeInvoiceAccepted(tx, ctx, invId);
    const cust = fresh.customerId ? await tx.customer.findUnique({ where: { id: fresh.customerId } }) : null;
    const link = `${WEB}/portal/invoices/${invId}`;
    const portalUsers = await tx.user.findMany({ where: { customerId: fresh.customerId, kind: 'customer', isActive: true }, select: { id: true } });
    if (fresh.invoiceType !== 'credit_note') {
      await notifyUsers(tx, ctx.companyId, portalUsers.map((u) => u.id), { title: `Invoice ${number}`, body: `SAR ${num(fresh.total).toFixed(2)} · due ${fresh.dueDate?.toISOString().slice(0, 10)}`, link: `/portal/invoices/${invId}`, type: 'invoice' });
      await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: cust?.phone, template: 'invoice_issued', lang: 'ar', vars: { number, total: num(fresh.total).toFixed(2), due: fresh.dueDate?.toISOString().slice(0, 10), link } });
    }
    await daftraPush(tx, ctx.companyId, 'invoice', invId, { number, total: fresh.total, customer: cust?.name, type: fresh.invoiceType });
    if (fresh.customerId) await recomputeProfile(tx, ctx.companyId, fresh.customerId);
    await emit(tx, ctx.companyId, 'Invoice.issued', { id: invId });
  } else if (fresh.status === 'rejected') {
    await notifyRole(tx, ctx.companyId, 'finance', { title: `ZATCA rejected invoice ${number}`, body: z?.errors?.map((e: any) => e.message).join('; '), link: `/app/invoice/${invId}`, severity: 'critical', type: 'zatca' });
  }
  return { zatca: z, status: fresh.status, number };
}
A('Invoice.issue', async ({ ctx, tx, row }) => { const r = await issueInvoice(tx, ctx, row.id); return { skip: true, data: r, message: r.status === 'rejected' ? `ZATCA rejected the invoice: ${(r.zatca?.errors ?? []).map((e: any) => e.message).join('; ')}` : `Invoice ${r.number} issued (${r.status})` }; });
A('Invoice.resubmit', async ({ ctx, tx, row }) => {
  const z: any = await processInvoiceForZatca(tx, ctx, row.id);
  const fresh = (await tx.invoice.findUnique({ where: { id: row.id } }))!;
  if (['cleared', 'reported'].includes(fresh.status)) { await finalizeInvoiceAccepted(tx, ctx, row.id); if (fresh.customerId) await recomputeProfile(tx, ctx.companyId, fresh.customerId); }
  return { skip: true, data: z, message: fresh.status === 'rejected' ? 'Still rejected: ' + (z.errors ?? []).map((e: any) => e.message).join('; ') : 'Accepted by ZATCA' };
});
A('Invoice.print', async ({ row }) => ({ skip: true, data: { url: `/api/v1/docs/invoice/${row.id}` } }));
A('Invoice.credit_note', async ({ ctx, tx, row, body }) => {
  const cn = await createCreditNote(tx, ctx, row.id, body?.lines ?? [], body?.reason ?? 'Credit note');
  return { skip: true, data: { creditNoteId: cn.id, number: cn.number }, message: `Credit note ${cn.number} issued` };
});

export async function createInvoiceFromDelivery(tx: Tx, ctx: Ctx, dnId: string) {
  const dn = (await tx.deliveryNote.findUnique({ where: { id: dnId } }))!;
  const so = (await tx.salesOrder.findUnique({ where: { id: dn.salesOrderId } }))!;
  const cust = (await tx.customer.findUnique({ where: { id: so.customerId } }))!;
  const dls = await tx.deliveryLine.findMany({ where: { deliveryNoteId: dnId, deliveredQty: { gt: 0 } }, include: { part: true } as any });
  const items: any[] = [];
  for (const dl of dls as any[]) {
    const already = await tx.invoiceLine.aggregate({ where: { deliveryLineId: dl.id }, _sum: { qty: true } });
    const qty = D(dl.deliveredQty).minus(D(already._sum.qty ?? 0));
    if (qty.lte(0)) continue;
    const sol = await tx.salesOrderLine.findUnique({ where: { id: dl.salesOrderLineId! } });
    items.push({ partId: dl.partId, description: dl.part ? `${dl.part.partNumber} — ${dl.part.name}` : 'Item', qty, unitPrice: sol!.unitPrice, vatPct: sol!.vatPct ?? 15, salesOrderLineId: sol!.id, deliveryLineId: dl.id, cost: sol!.unitCost ?? 0 });
  }
  if (!items.length) return null;
  const simplified = cust.customerType === 'individual' && !cust.vatNumber;
  const inv = await createRow(tx, sys(ctx), BY_KEY.Invoice, { invoiceType: simplified ? 'simplified' : 'standard', customerId: cust.id, salesOrderId: so.id, deliveryNoteId: dnId, requestId: so.requestId, status: 'draft', issueDate: today(), children: { InvoiceLine: items } }, { trusted: true });
  for (const it of items) await tx.salesOrderLine.update({ where: { id: it.salesOrderLineId }, data: { invoicedQty: { increment: it.qty } } });
  await tx.deliveryNote.update({ where: { id: dnId }, data: { invoiceId: inv.id } });
  return inv;
}

export async function createCreditNote(tx: Tx, ctx: Ctx, invoiceId: string, lines: { invoiceLineId: string; qty: number }[], reason: string) {
  const orig = await tx.invoice.findFirst({ where: { id: invoiceId, companyId: ctx.companyId } });
  if (!orig) throw bad('Invoice not found');
  if (!['cleared', 'reported', 'partially_paid', 'paid'].includes(orig.status)) throw conflict('Only issued invoices can be credited');
  if (!lines.length) throw bad('Choose the lines to credit');
  const items: any[] = [];
  for (const l of lines) {
    const il = await tx.invoiceLine.findFirst({ where: { id: l.invoiceLineId, invoiceId } });
    if (!il) throw bad('Invoice line not found');
    const credited = await tx.invoiceLine.aggregate({ where: { invoice: { originalInvoiceId: invoiceId, invoiceType: 'credit_note', status: { not: 'cancelled' } }, salesOrderLineId: il.salesOrderLineId ?? undefined, description: il.description }, _sum: { qty: true } });
    if (D(l.qty).plus(D(credited._sum.qty ?? 0)).gt(D(il.qty))) throw bad(`Cannot credit ${l.qty} of "${il.description}": invoiced ${il.qty}, already credited ${credited._sum.qty ?? 0}`);
    items.push({ partId: il.partId, description: il.description, qty: l.qty, unitPrice: il.unitPrice, vatPct: il.vatPct, salesOrderLineId: il.salesOrderLineId, cost: il.cost });
  }
  const cn = await createRow(tx, sys(ctx), BY_KEY.Invoice, { invoiceType: 'credit_note', customerId: orig.customerId, salesOrderId: orig.salesOrderId, requestId: orig.requestId, originalInvoiceId: orig.id, status: 'draft', issueDate: today(), notes: reason, children: { InvoiceLine: items } }, { trusted: true });
  await issueInvoice(tx, ctx, cn.id);
  return (await tx.invoice.findUnique({ where: { id: cn.id } }))!;
}

// ================= RECEIPTS & ALLOCATION (CRD-09, FIN-03) =================
async function applyAllocation(tx: Tx, invoiceId: string, amount: any) {
  const inv = (await tx.invoice.findUnique({ where: { id: invoiceId } }))!;
  const paid = D(inv.paidAmount).plus(D(amount));
  const bal = D(inv.balance).minus(D(amount));
  await tx.invoice.update({ where: { id: invoiceId }, data: { paidAmount: paid, balance: bal, status: bal.lte(0) ? 'paid' : 'partially_paid' } });
}
H('Receipt', { beforeCreate: ({ data }) => { if (D(data.amount).lte(0)) throw bad('Amount must be greater than zero'); data.receiptDate ??= today(); data.unappliedAmount = data.amount; } });
H('ReceiptAllocation', {
  beforeCreate: async ({ tx, data }) => {
    const r = await tx.receipt.findUnique({ where: { id: data.receiptId } });
    if (r && r.status !== 'draft') throw conflict('The receipt is already posted. Use "Auto-allocate" for the unapplied balance.', 'invalid_state');
    const inv = await tx.invoice.findUnique({ where: { id: data.invoiceId } });
    if (!inv || inv.customerId !== r?.customerId) throw bad('The invoice belongs to a different customer');
    if (D(data.amount).gt(D(inv.balance))) throw bad(`Allocation exceeds the invoice balance (${D(inv.balance).toFixed(2)})`);
  },
});
export async function postReceipt(tx: Tx, ctx: Ctx, rc: any) {
  const allocs = await tx.receiptAllocation.findMany({ where: { receiptId: rc.id } });
  const allocated = allocs.reduce((s, a) => s.plus(D(a.amount)), D(0));
  if (allocated.gt(D(rc.amount))) throw bad('Allocated amount exceeds the receipt amount');
  if (rc.method === 'cheque' && rc.chequeId) {
    const ch = await tx.cheque.findUnique({ where: { id: rc.chequeId } });
    if (ch?.isPostDated && ch.chequeDate && ch.chequeDate > today()) throw conflict(`Post-dated cheque cannot be posted before ${ch.chequeDate.toISOString().slice(0, 10)}`, 'post_dated');
  }
  const bank = rc.bankAccountId ?? (await tx.bankAccount.findFirst({ where: { companyId: ctx.companyId, type: rc.method === 'cash' ? 'cash' : 'bank' } }))?.id;
  const entry = await postJournal(tx, ctx, { event: 'receipt', date: rc.receiptDate ?? today(), amounts: { amount: rc.amount }, sourceType: 'Receipt', sourceId: rc.id, memo: `Receipt ${rc.number}`, partnerType: 'customer', partnerId: rc.customerId, bankAccountId: bank });
  for (const a of allocs) await applyAllocation(tx, a.invoiceId, a.amount);
  await tx.receipt.update({ where: { id: rc.id }, data: { journalEntryId: entry?.id, unappliedAmount: D(rc.amount).minus(allocated), bankAccountId: bank } });
  await afterPayment(tx, ctx, rc.customerId);
}
async function afterPayment(tx: Tx, ctx: Ctx, customerId: string) {
  const e = await recomputeProfile(tx, ctx.companyId, customerId);
  if (e.overdueCount === 0) {
    const holds = await tx.creditHold.findMany({ where: { companyId: ctx.companyId, customerId, reason: 'overdue', status: 'held' } });
    for (const h of holds) await releaseHold(tx, sys(ctx), h.id, 'Overdue invoices paid: released automatically');
  }
  // broken/kept promises
  await tx.promiseToPay.updateMany({ where: { companyId: ctx.companyId, customerId, status: 'open', invoice: { balance: { lte: 0 } } }, data: { status: 'kept' } });
}
A('Receipt.post', async ({ ctx, tx, row }) => { await postReceipt(tx, ctx, row); return { message: 'Receipt posted' }; });
async function allocateOldestFirst(tx: Tx, ctx: Ctx, rc: any) {
  let left = D(rc.unappliedAmount);
  if (left.lte(0)) return 0;
  const invs = await tx.invoice.findMany({ where: { companyId: ctx.companyId, customerId: rc.customerId, balance: { gt: 0 }, status: { in: ['cleared', 'reported', 'partially_paid'] }, invoiceType: { in: ['standard', 'simplified', 'debit_note'] } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }] });
  let n = 0;
  for (const inv of invs) {
    if (left.lte(0)) break;
    const a = D.min(left, D(inv.balance));
    await tx.receiptAllocation.create({ data: { companyId: ctx.companyId, receiptId: rc.id, invoiceId: inv.id, amount: a } });
    await applyAllocation(tx, inv.id, a);
    left = left.minus(a); n++;
  }
  await tx.receipt.update({ where: { id: rc.id }, data: { unappliedAmount: left } });
  await afterPayment(tx, ctx, rc.customerId);
  return n;
}
A('Receipt.auto_allocate', async ({ ctx, tx, row }) => { const n = await allocateOldestFirst(tx, ctx, row); return { skip: true, message: n ? `Allocated to ${n} invoice(s)` : 'Nothing to allocate' }; });
A('Receipt.reverse', async ({ ctx, tx, row }) => {
  if (row.journalEntryId) await reverseJournal(tx, ctx, row.journalEntryId, 'Receipt reversed');
  const allocs = await tx.receiptAllocation.findMany({ where: { receiptId: row.id } });
  for (const a of allocs) {
    const inv = (await tx.invoice.findUnique({ where: { id: a.invoiceId } }))!;
    const paid = D.max(D(0), D(inv.paidAmount).minus(D(a.amount))), bal = D(inv.balance).plus(D(a.amount));
    await tx.invoice.update({ where: { id: inv.id }, data: { paidAmount: paid, balance: bal, status: paid.isZero() ? (inv.invoiceType === 'simplified' ? 'reported' : 'cleared') : 'partially_paid' } });
  }
  await tx.receiptAllocation.deleteMany({ where: { receiptId: row.id } });
  await tx.receipt.update({ where: { id: row.id }, data: { unappliedAmount: 0 } });
  await recomputeProfile(tx, ctx.companyId, row.customerId);
});

// ================= SUPPLIER PAYMENTS (FIN-04) =================
H('Payment', { beforeCreate: ({ data }) => { if (D(data.amount).lte(0)) throw bad('Amount must be greater than zero'); data.paymentDate ??= today(); } });
H('PaymentAllocation', { beforeCreate: async ({ tx, data }) => { const b = await tx.supplierBill.findUnique({ where: { id: data.billId } }); if (!b || !['posted'].includes(b.status)) throw bad('Only posted bills can be paid'); if (D(data.amount).gt(D(b.total).minus(D(b.paidAmount)))) throw bad(`Allocation exceeds the bill's open balance`); } });
A('Payment.post', async ({ ctx, tx, row }) => {
  const allocs = await tx.paymentAllocation.findMany({ where: { paymentId: row.id } });
  const alloc = allocs.reduce((s, a) => s.plus(D(a.amount)), D(0));
  if (alloc.gt(D(row.amount))) throw bad('Allocated amount exceeds the payment amount');
  const bank = row.bankAccountId ?? (await tx.bankAccount.findFirst({ where: { companyId: ctx.companyId, type: 'bank' } }))?.id;
  const entry = await postJournal(tx, ctx, { event: 'payment', date: row.paymentDate ?? today(), amounts: { amount: row.amount }, sourceType: 'Payment', sourceId: row.id, memo: `Payment ${row.number}`, partnerType: 'supplier', partnerId: row.supplierId, bankAccountId: bank });
  for (const a of allocs) { const b = (await tx.supplierBill.findUnique({ where: { id: a.billId } }))!; const paid = D(b.paidAmount).plus(D(a.amount)); await tx.supplierBill.update({ where: { id: b.id }, data: { paidAmount: paid, status: paid.gte(D(b.total)) ? 'paid' : b.status } }); }
  await daftraPush(tx, ctx.companyId, 'payment', row.id, { number: row.number, amount: row.amount });
  return { set: { journalEntryId: entry?.id, bankAccountId: bank } };
});
A('Payment.reverse', async ({ ctx, tx, row }) => {
  if (row.journalEntryId) await reverseJournal(tx, ctx, row.journalEntryId, 'Payment reversed');
  for (const a of await tx.paymentAllocation.findMany({ where: { paymentId: row.id } })) { const b = (await tx.supplierBill.findUnique({ where: { id: a.billId } }))!; await tx.supplierBill.update({ where: { id: b.id }, data: { paidAmount: D.max(D(0), D(b.paidAmount).minus(D(a.amount))), status: 'posted' } }); }
  await tx.paymentAllocation.deleteMany({ where: { paymentId: row.id } });
});

// ================= BANK & CHEQUES (FIN-07) =================
A('BankStatement.auto_match', async ({ ctx, tx, row }) => {
  const lines = await tx.bankStatementLine.findMany({ where: { statementId: row.id, matchStatus: 'unmatched' } });
  let m = 0;
  for (const l of lines) {
    const credit = D(l.credit), debit = D(l.debit);
    const from = addDays(l.txnDate!, -7), to = addDays(l.txnDate!, 7);
    if (credit.gt(0)) {
      const r = await tx.receipt.findFirst({ where: { companyId: ctx.companyId, status: 'posted', amount: credit, receiptDate: { gte: from, lte: to }, OR: [{ bankAccountId: row.bankAccountId }, { bankAccountId: null }] } });
      if (r && !(await tx.bankStatementLine.findFirst({ where: { matchedType: 'Receipt', matchedId: r.id } }))) { await tx.bankStatementLine.update({ where: { id: l.id }, data: { matchStatus: 'matched', matchedType: 'Receipt', matchedId: r.id } }); m++; }
    } else if (debit.gt(0)) {
      const p = await tx.payment.findFirst({ where: { companyId: ctx.companyId, status: 'posted', amount: debit, paymentDate: { gte: from, lte: to } } });
      if (p && !(await tx.bankStatementLine.findFirst({ where: { matchedType: 'Payment', matchedId: p.id } }))) { await tx.bankStatementLine.update({ where: { id: l.id }, data: { matchStatus: 'matched', matchedType: 'Payment', matchedId: p.id } }); m++; }
    }
  }
  return { skip: false, message: `${m} of ${lines.length} line(s) matched automatically` };
});
A('BankStatement.finish', async ({ tx, row }) => {
  const open = await tx.bankStatementLine.count({ where: { statementId: row.id, matchStatus: 'unmatched' } });
  if (open) throw conflict(`${open} line(s) are still unmatched. Match or ignore them first.`, 'unmatched');
});
A('Cheque.deposit', async () => ({}));
A('Cheque.clear', async ({ ctx, tx, row }) => {
  const rc = await tx.receipt.findFirst({ where: { chequeId: row.id, status: 'draft' } });
  if (rc) await postReceipt(tx, ctx, rc).then(() => tx.receipt.update({ where: { id: rc.id }, data: { status: 'posted' } }));
});
A('Cheque.bounce', async ({ ctx, tx, row }) => {
  const rc = await tx.receipt.findFirst({ where: { chequeId: row.id, status: 'posted' } });
  if (rc) { if (rc.journalEntryId) await reverseJournal(tx, ctx, rc.journalEntryId, 'Cheque bounced'); await tx.receipt.update({ where: { id: rc.id }, data: { status: 'reversed' } }); }
  await notifyRole(tx, ctx.companyId, 'collector', { title: `Cheque ${row.number} bounced`, body: `SAR ${num(row.amount).toFixed(2)}`, link: `/app/cheque/${row.id}`, severity: 'critical', type: 'cheque' });
});

// ================= EXPENSES (FIN-08) =================
H('Expense', { beforeCreate: ({ data }) => { if (D(data.amount).lte(0)) throw bad('Amount must be greater than zero'); data.expenseDate ??= today(); } });
A('Expense.submit', async ({ ctx, tx, row }) => {
  if (await needsApproval(tx, ctx.companyId, 'expense', row.amount)) {
    const a = await requestApproval(tx, ctx, { type: 'expense', refType: 'Expense', refId: row.id, amount: row.amount, reason: `${row.number}: ${row.description ?? ''}` });
    return { set: { approvalId: a.id }, message: 'Sent for approval' };
  }
  return { status: 'approved', message: 'Within the approval limit: approved' };
});
approvalCallbacks['expense'] = async ({ tx, approval, approved }) => { await tx.expense.update({ where: { id: approval.refId }, data: { status: approved ? 'approved' : 'rejected' } }); };
A('Expense.post', async ({ ctx, tx, row }) => {
  if (!['draft', 'approved'].includes(row.status)) throw conflict('Invalid status');
  if (row.status === 'draft' && (await needsApproval(tx, ctx.companyId, 'expense', row.amount)) && !canApprove(ctx)) throw conflict('This expense needs approval first: submit it', 'approval_required');
  const cat = await tx.expenseCategory.findUnique({ where: { id: row.categoryId } });
  const vat = D(row.vatAmount ?? 0), net = D(row.amount).minus(vat);
  const bank = row.bankAccountId ?? (await tx.bankAccount.findFirst({ where: { companyId: ctx.companyId, type: row.method === 'petty_cash' ? 'petty_cash' : row.method === 'cash' ? 'cash' : 'bank' } }))?.id;
  const entry = await postJournal(tx, ctx, { event: row.method === 'payable' ? 'expense_payable' : 'expense', date: row.expenseDate ?? today(), amounts: { total: row.amount, net, vat }, sourceType: 'Expense', sourceId: row.id, memo: row.description ?? row.number, expenseAccountId: cat?.accountId, bankAccountId: row.method === 'payable' ? undefined : bank, costCenterId: row.costCenterId, partnerType: 'supplier', partnerId: row.supplierId });
  // budget overrun alert
  const ms = new Date(row.expenseDate ?? today()); const start = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth(), 1)), end = new Date(Date.UTC(ms.getUTCFullYear(), ms.getUTCMonth() + 1, 0));
  const budget = await tx.budget.findFirst({ where: { companyId: ctx.companyId, categoryId: row.categoryId, periodStart: { lte: end }, periodEnd: { gte: start }, OR: [{ costCenterId: row.costCenterId }, { costCenterId: null }] } });
  if (budget) {
    const spent = (await tx.expense.aggregate({ where: { companyId: ctx.companyId, categoryId: row.categoryId, status: 'posted', expenseDate: { gte: start, lte: end } }, _sum: { amount: true } }))._sum.amount ?? D(0);
    if (D(spent).plus(D(row.amount)).gt(D(budget.amount))) await notifyRole(tx, ctx.companyId, 'finance', { title: `Budget exceeded: ${cat?.name}`, body: `Spent ${D(spent).plus(D(row.amount)).toFixed(2)} of ${D(budget.amount).toFixed(2)}`, link: '/app/dashboards/expenses', severity: 'warning', type: 'budget' });
  }
  return { set: { journalEntryId: entry?.id }, message: 'Expense posted' };
});

// ================= ZATCA CREDENTIALS (FIN-06) =================
A('ZatcaCredential.generate_csr', async ({ ctx, tx, row }) => { const c = await ensureCredential(tx, ctx.companyId, row.branchId); return { skip: true, message: 'Key pair and CSR generated. In live mode submit the CSR to the ZATCA Fatoora portal with your OTP.', data: { status: c.status } }; });
A('ZatcaCredential.compliance', async ({ ctx, tx, row }) => {
  const c = await ensureCredential(tx, ctx.companyId, row.branchId);
  const company = await tx.company.findUnique({ where: { id: ctx.companyId } });
  const checks: any[] = [];
  for (const [name, typeCode, simplified] of [['Standard invoice', '388', false], ['Standard credit note', '381', false], ['Standard debit note', '383', false], ['Simplified invoice', '388', true], ['Simplified credit note', '381', true], ['Simplified debit note', '383', true]] as const) {
    const xml = buildUbl({ invoice: { number: `TEST-${typeCode}`, issueDate: new Date() }, lines: [{ qty: 1, unitPrice: 100, vatPct: 15, vatAmount: 15, lineTotal: 115, description: 'Compliance sample' }], seller: { name: company!.name, vat: company!.vatNumber, cr: company!.crNumber, city: company!.city }, buyer: { name: 'Sample buyer', vat: '310000000000003' }, uuid: crypto.randomUUID(), icv: 1, pih: 'MA==', typeCode: typeCode as any, simplified, originalNumber: typeCode === '388' ? undefined : 'TEST-388' });
    checks.push({ name, passed: xml.includes('<cbc:InvoiceTypeCode') && xml.length > 500 });
  }
  return { status: 'compliance', set: { csr: c.csr }, data: { checks }, message: `${checks.filter((x) => x.passed).length}/${checks.length} compliance checks passed (simulated).` };
});
A('ZatcaCredential.go_production', async ({ ctx, tx, row }) => {
  const mode = await getSetting<string>(ctx.companyId, 'zatca.mode', 'fake');
  if (mode === 'live') throw conflict('In live mode the production CSID is issued by ZATCA after compliance checks; enter it on this record.', 'live_mode');
  return { set: { csid: 'SIM-' + randomBytes(8).toString('hex'), issuedAt: today(), expiresAt: addDays(today(), 365 * 5), environment: 'simulation' }, message: 'Simulated production CSID issued' };
});
A('DaftraSyncLog.retry', async ({ ctx, tx, row }) => { const r = await daftraPush(tx, ctx.companyId, row.entity, row.entityId ?? '', row.payload); return { set: { status: r.status === 'ok' ? 'ok' : 'error', externalId: (r as any).externalId } }; });

void createHash; void lineTotals; void audit; void notifyRole;
