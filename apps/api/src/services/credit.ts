import { prisma, Tx } from '@erp/db';
import { Ctx, D, addDays, emit, getSetting, notifyRole, notifyUsers, num, today, approvalCallbacks, audit, HttpError, r2 } from '../core/base';
import { requestApproval } from '../core/approvals';

export interface Exposure { invoices: number; orders: number; quotes: number; total: number; overdue: number; overdueCount: number; limit: number; available: number }

/** BR-2: exposure = open invoices + confirmed/undelivered order value + approved-not-ordered quotations x w */
export async function exposure(tx: Tx | typeof prisma, companyId: string, customerId: string, opts: { excludeQuotationId?: string } = {}): Promise<Exposure> {
  const db: any = tx;
  const grace = await getSetting<number>(companyId, 'credit.grace_days', 5);
  const w = await getSetting<number>(companyId, 'credit.exposure_quote_weight', 1);
  const invs = await db.invoice.findMany({ where: { companyId, customerId, status: { in: ['cleared', 'reported', 'partially_paid'] }, invoiceType: { in: ['standard', 'simplified', 'debit_note'] } }, select: { balance: true, dueDate: true } });
  const invoices = invs.reduce((s: number, i: any) => s + num(i.balance), 0);
  const cutoff = addDays(today(), -grace);
  const overdueInv = invs.filter((i: any) => i.dueDate && i.dueDate < cutoff && num(i.balance) > 0);
  const lines = await db.salesOrderLine.findMany({ where: { companyId, status: { not: 'cancelled' }, salesOrder: { customerId, status: { in: ['confirmed', 'partially_delivered', 'delivered'] } } }, select: { qty: true, invoicedQty: true, unitPrice: true, vatPct: true } });
  const orders = lines.reduce((s: number, l: any) => s + Math.max(0, num(l.qty) - num(l.invoicedQty)) * num(l.unitPrice) * (1 + num(l.vatPct) / 100), 0);
  const quotes = await db.quotation.findMany({ where: { companyId, customerId, status: { in: ['approved_full', 'approved_partial'] }, id: opts.excludeQuotationId ? { not: opts.excludeQuotationId } : undefined }, select: { id: true, total: true } });
  let quoteVal = 0;
  for (const q of quotes) {
    const ordered = await db.salesOrder.count({ where: { quotationId: q.id, status: { not: 'cancelled' } } });
    if (!ordered) quoteVal += num(q.total);
  }
  const profile = await db.creditProfile.findFirst({ where: { companyId, customerId } });
  const limit = num(profile?.limitAmount);
  const total = invoices + orders + quoteVal * w;
  return { invoices, orders, quotes: quoteVal * w, total, overdue: overdueInv.reduce((s: number, i: any) => s + num(i.balance), 0), overdueCount: overdueInv.length, limit, available: limit - total };
}

export async function recomputeProfile(tx: Tx | typeof prisma, companyId: string, customerId: string) {
  const e = await exposure(tx, companyId, customerId);
  await (tx as any).creditProfile.updateMany({ where: { companyId, customerId }, data: { exposure: e.total, overdueAmount: e.overdue, lastCheckedAt: new Date() } });
  return e;
}

export type CreditVerdict = { ok: boolean; reason?: 'limit' | 'overdue' | 'no_profile'; message?: string; exposure: Exposure };

/** Serialised per customer (row lock) so two concurrent confirmations cannot both pass the limit. */
export async function checkCredit(tx: Tx, companyId: string, customerId: string, newAmount: any, opts: { excludeQuotationId?: string } = {}): Promise<CreditVerdict> {
  await tx.$queryRawUnsafe(`SELECT id FROM credit_profile WHERE "companyId" = $1 AND "customerId" = $2 FOR UPDATE`, companyId, customerId);
  const profile = await tx.creditProfile.findFirst({ where: { companyId, customerId } });
  const e = await exposure(tx, companyId, customerId, opts);
  if (!profile || profile.status === 'suspended') return { ok: false, reason: 'no_profile', exposure: e, message: 'Customer has no active credit profile' };
  if (e.overdueCount > 0) return { ok: false, reason: 'overdue', exposure: e, message: `Customer has ${e.overdueCount} overdue invoice(s) totalling SAR ${e.overdue.toFixed(2)}` };
  if (e.total + num(newAmount) > e.limit) return { ok: false, reason: 'limit', exposure: e, message: `Credit limit exceeded: exposure ${e.total.toFixed(2)} + ${num(newAmount).toFixed(2)} > limit ${e.limit.toFixed(2)}` };
  return { ok: true, exposure: e };
}

export async function placeHold(tx: Tx, ctx: Ctx, p: { customerId: string; reason: 'limit' | 'overdue' | 'no_profile' | 'manual'; refType: string; refId: string; amount: any; exposure?: number; message?: string }) {
  const existing = await tx.creditHold.findFirst({ where: { companyId: ctx.companyId, customerId: p.customerId, refType: p.refType, refId: p.refId, status: 'held' } });
  if (existing) return existing;
  const customer = await tx.customer.findUnique({ where: { id: p.customerId } });
  const hold = await tx.creditHold.create({ data: { companyId: ctx.companyId, customerId: p.customerId, reason: p.reason, status: 'held', refType: p.refType, refId: p.refId, amount: p.amount, exposureAtHold: p.exposure ?? 0, heldAt: new Date() } });
  const total = D(p.amount).plus(p.exposure ?? 0);
  const approval = await requestApproval(tx, ctx, { type: 'credit', refType: 'CreditHold', refId: hold.id, amount: total, reason: `${customer?.name}: ${p.message ?? p.reason}`, tier: customer?.priceTier ?? undefined });
  await tx.creditHold.update({ where: { id: hold.id }, data: { approvalId: approval.id } });
  await notifyRole(tx, ctx.companyId, 'finance', { title: `Credit hold: ${customer?.name}`, body: p.message, link: `/app/credit-hold/${hold.id}`, severity: 'warning', type: 'credit' });
  await emit(tx, ctx.companyId, 'credit.hold', { id: hold.id, customerId: p.customerId });
  return hold;
}

export const resumers: Record<string, (tx: Tx, ctx: Ctx, refId: string) => Promise<void>> = {};

export async function releaseHold(tx: Tx, ctx: Ctx, holdId: string, reason: string) {
  const hold = await tx.creditHold.findFirst({ where: { id: holdId, companyId: ctx.companyId } });
  if (!hold) throw new HttpError(404, 'not_found', 'Hold not found');
  if (hold.status !== 'held') throw new HttpError(409, 'invalid_state', 'Hold is already released');
  await tx.creditHold.update({ where: { id: holdId }, data: { status: 'released', releasedById: ctx.userId, releasedAt: new Date(), releaseReason: reason } });
  await audit(tx, ctx, 'CreditHold', holdId, 'action', { status: 'held' }, { released: true, reason });
  if (hold.refType && hold.refId && resumers[hold.refType]) await resumers[hold.refType](tx, ctx, hold.refId);
  await emit(tx, ctx.companyId, 'credit.released', { id: holdId });
}

// approving the credit approval releases the hold and resumes the blocked document
approvalCallbacks['credit'] = async ({ tx, ctx, approval, approved }) => {
  const hold = await tx.creditHold.findFirst({ where: { id: approval.refId } });
  if (!hold || hold.status !== 'held') return;
  if (approved) await releaseHold(tx, { ...ctx }, hold.id, approval.decisionNote ?? 'Approved via approval matrix');
  else await notifyUsers(tx, ctx.companyId, [approval.requestedById!].filter(Boolean), { title: 'Credit release rejected', body: approval.decisionNote ?? undefined, link: `/app/credit-hold/${hold.id}`, severity: 'warning', type: 'credit' });
};

/** CRD-03 / CRD-10: daily job — auto-hold on overdue, early-warning alerts */
export async function creditSweep() {
  const profiles = await prisma.creditProfile.findMany({ where: { status: 'active' }, take: 2000 });
  let holds = 0, alerts = 0;
  for (const p of profiles) {
    const e = await exposure(prisma, p.companyId, p.customerId);
    await prisma.creditProfile.update({ where: { id: p.id }, data: { exposure: e.total, overdueAmount: e.overdue, lastCheckedAt: new Date() } });
    const mk = async (kind: string, severity: string, message: string) => {
      const open = await prisma.creditAlert.findFirst({ where: { companyId: p.companyId, customerId: p.customerId, kind, status: { in: ['open', 'ack'] } } });
      if (open) return;
      const collector = (await prisma.user.findFirst({ where: { companyId: p.companyId, role: { name: 'collector' } } }))?.id;
      await prisma.creditAlert.create({ data: { companyId: p.companyId, customerId: p.customerId, kind, severity, message, data: e as any, assignedToId: collector } });
      alerts++;
    };
    if (e.limit > 0 && e.total / e.limit >= 0.9) await mk('limit_usage', e.total > e.limit ? 'critical' : 'warning', `Credit usage ${(100 * e.total / e.limit).toFixed(0)}% of limit`);
    if (e.overdueCount > 0 && e.overdue > 0.25 * Math.max(e.limit, 1)) await mk('rising_overdue', 'warning', `Overdue SAR ${e.overdue.toFixed(2)} on ${e.overdueCount} invoice(s)`);
    const broken = await prisma.promiseToPay.count({ where: { companyId: p.companyId, customerId: p.customerId, status: 'broken' } });
    if (broken >= 2) await mk('broken_promise', 'warning', `${broken} broken promises to pay`);
    if (e.overdueCount > 0) {
      const held = await prisma.creditHold.findFirst({ where: { companyId: p.companyId, customerId: p.customerId, reason: 'overdue', status: 'held' } });
      if (!held) {
        await prisma.$transaction(async (tx) => {
          await tx.creditHold.create({ data: { companyId: p.companyId, customerId: p.customerId, reason: 'overdue', status: 'held', amount: e.overdue, exposureAtHold: e.total, heldAt: new Date() } });
          await notifyRole(tx, p.companyId, 'finance', { title: 'Customer auto-held: overdue invoices', body: `Overdue SAR ${e.overdue.toFixed(2)}`, link: `/app/credit-hold`, severity: 'warning', type: 'credit' });
        });
        holds++;
      }
    }
  }
  return { holds, alerts, profiles: profiles.length };
}
