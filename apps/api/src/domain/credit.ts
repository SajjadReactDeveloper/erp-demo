import { A, H, bad, canApprove, conflict, forbidden, notifyRole, num, today, addDays, D } from '../core/base';
import { requestApproval } from '../core/approvals';
import { exposure, recomputeProfile, releaseHold } from '../services/credit';

// ================= CRD-01 credit profile =================
H('CreditProfile', {
  beforeCreate: ({ data }) => { if (D(data.limitAmount).lt(0)) throw bad('Credit limit cannot be negative'); },
  beforeUpdate: ({ ctx, row, data }) => {
    if (data.limitAmount != null && !D(data.limitAmount).equals(D(row.limitAmount)) && !canApprove(ctx)) throw forbidden('Changing a credit limit requires manager or finance approval rights');
    if (data.limitAmount != null && D(data.limitAmount).lt(0)) throw bad('Credit limit cannot be negative');
  },
  afterUpdate: async ({ tx, row, before }) => {
    if (!D(row.limitAmount).equals(D(before.limitAmount))) await tx.customer.update({ where: { id: row.customerId }, data: { creditLimit: row.limitAmount } });
    await recomputeProfile(tx, row.companyId, row.customerId);
  },
});
A('CreditProfile.recompute', async ({ tx, row }) => { const e = await recomputeProfile(tx, row.companyId, row.customerId); return { skip: true, data: e, message: `Exposure SAR ${e.total.toFixed(2)} of ${e.limit.toFixed(2)}` }; });

// ================= CRD-03/04 holds =================
A('CreditHold.request_release', async ({ ctx, tx, row }) => {
  if (row.approvalId) { const a = await tx.approvalRequest.findUnique({ where: { id: row.approvalId } }); if (a && ['pending', 'escalated'].includes(a.status)) throw conflict('A release approval is already pending', 'duplicate'); }
  const cust = await tx.customer.findUnique({ where: { id: row.customerId } });
  const a = await requestApproval(tx, ctx, { type: 'credit', refType: 'CreditHold', refId: row.id, amount: D(row.amount ?? 0).plus(D(row.exposureAtHold ?? 0)), reason: `Release credit hold: ${cust?.name}`, tier: cust?.priceTier ?? undefined });
  return { skip: true, set: { approvalId: a.id }, message: 'Release request sent through the approval matrix' };
});
A('CreditHold.release', async ({ ctx, tx, row, body }) => {
  if (!body?.reason) throw bad('A reason is required to release a hold');
  await releaseHold(tx, ctx, row.id, body.reason);
  return { skip: true, message: 'Hold released. Blocked documents were resumed.' };
});

// ================= CRD-08 collection =================
H('PromiseToPay', { beforeCreate: ({ ctx, data }) => { if (new Date(data.promisedDate) < today()) throw bad('The promised date must be today or later'); data.collectorId ??= ctx.userId; } });
A('PromiseToPay.kept', async () => ({}));
A('PromiseToPay.broken', async ({ ctx, tx, row }) => {
  const n = await tx.promiseToPay.count({ where: { customerId: row.customerId, status: 'broken' } });
  if (n + 1 >= 2) await tx.creditAlert.create({ data: { companyId: ctx.companyId, customerId: row.customerId, kind: 'broken_promise', severity: 'warning', message: `${n + 1} broken promises to pay`, assignedToId: row.collectorId } });
});
H('CollectionActivity', {
  beforeCreate: async ({ ctx, data }) => { data.collectorId ??= ctx.userId; data.nextActionDate ??= addDays(today(), data.outcome === 'no_answer' ? 1 : 3); },
  afterCreate: async ({ tx, row, ctx }) => { if (row.outcome === 'escalated') await notifyRole(tx, ctx.companyId, 'finance', { title: 'Collection escalated', body: row.note ?? undefined, link: `/app/customer/${row.customerId}`, severity: 'warning', type: 'collection' }); },
});
A('CreditAlert.ack', async () => ({}));
A('CreditAlert.resolve', async () => ({}));
void exposure; void num;
