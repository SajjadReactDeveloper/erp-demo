import { Tx } from '@erp/db';
import { Ctx, D, approvalCallbacks, audit, bad, emit, forbidden, notifyRole, notifyUsers, notFound } from './base';
import { prisma } from '@erp/db';

interface Step { role: string; slaHours?: number }

export async function findRule(tx: Tx, companyId: string, type: string, amount: any, tier?: string) {
  const amt = D(amount ?? 0);
  const rules = await tx.approvalRule.findMany({ where: { companyId, type, isActive: true }, orderBy: { minAmount: 'desc' } });
  return rules.find((r) => amt.gte(D(r.minAmount ?? 0)) && (r.maxAmount == null || amt.lte(D(r.maxAmount))) && (!r.customerTier || r.customerTier === tier)) ?? null;
}
export const needsApproval = async (tx: Tx, companyId: string, type: string, amount: any, tier?: string) => !!(await findRule(tx, companyId, type, amount, tier));

// Pick the approval rule for (type, amount, tier). Falls back to a single manager step.
export async function requestApproval(tx: Tx, ctx: Ctx, a: { type: string; refType: string; refId: string; amount?: any; reason?: string; tier?: string; link?: string }) {
  const amount = D(a.amount ?? 0);
  const rule = await findRule(tx, ctx.companyId, a.type, amount, a.tier);
  const steps: Step[] = ((rule?.steps as any) ?? [{ role: 'manager', slaHours: 24 }]).map((s: any) => ({ role: s.role, slaHours: s.slaHours ?? rule?.escalateAfterHours ?? 24 }));
  const dueAt = new Date(Date.now() + (steps[0].slaHours ?? 24) * 3600000);
  const req = await tx.approvalRequest.create({
    data: { companyId: ctx.companyId, type: a.type, refType: a.refType, refId: a.refId, amount: amount, reason: a.reason, status: 'pending', currentStep: 0, steps: steps as any, requestedById: ctx.userId, dueAt },
  });
  await audit(tx, ctx, 'ApprovalRequest', req.id, 'create', undefined, req);
  await notifyRole(tx, ctx.companyId, steps[0].role, { title: `Approval needed: ${a.type}`, body: a.reason, link: `/app/approval-request/${req.id}`, severity: 'warning', type: 'approval' });
  await emit(tx, ctx.companyId, 'approval.requested', { id: req.id, type: a.type });
  return req;
}

async function canDecide(tx: Tx, ctx: Ctx, req: any) {
  if (ctx.perms.includes('*')) return true;
  const step: Step = (req.steps as any)[req.currentStep];
  if (!step) return false;
  if (ctx.role === step.role || ctx.role === 'manager' || ctx.role === 'admin') return true;
  // delegation: current user is delegate for someone holding the step's role
  const delegators = await tx.user.findMany({ where: { companyId: ctx.companyId, delegateToId: ctx.userId, delegateUntil: { gte: new Date() } }, include: { role: true } });
  return delegators.some((u: any) => u.role?.name === step.role);
}

export async function decide(tx: Tx, ctx: Ctx, id: string, decision: 'approved' | 'rejected', note?: string) {
  const req = await tx.approvalRequest.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!req) throw notFound('Approval');
  if (!['pending', 'escalated'].includes(req.status)) throw bad('Approval already decided');
  if (!(await canDecide(tx, ctx, req))) throw forbidden('You are not an approver for this step');
  await tx.approvalAction.create({ data: { companyId: ctx.companyId, approvalId: id, step: req.currentStep, actorId: ctx.userId, action: decision, note } });
  const steps = req.steps as any as Step[];
  let updated;
  if (decision === 'approved' && req.currentStep < steps.length - 1) {
    const next = req.currentStep + 1;
    updated = await tx.approvalRequest.update({ where: { id }, data: { currentStep: next, status: 'pending', dueAt: new Date(Date.now() + (steps[next].slaHours ?? 24) * 3600000) } });
    await notifyRole(tx, ctx.companyId, steps[next].role, { title: `Approval needed (step ${next + 1}): ${req.type}`, link: `/app/approval-request/${id}`, severity: 'warning', type: 'approval' });
  } else {
    updated = await tx.approvalRequest.update({ where: { id }, data: { status: decision, decidedById: ctx.userId, decidedAt: new Date(), decisionNote: note } });
    const cb = approvalCallbacks[req.type];
    if (cb) await cb({ tx, ctx, approval: updated, approved: decision === 'approved' });
    await notifyUsers(tx, ctx.companyId, [req.requestedById!], { title: `${req.type} ${decision}`, body: note, link: `/app/approval-request/${id}`, severity: decision === 'approved' ? 'info' : 'warning', type: 'approval' });
  }
  await audit(tx, ctx, 'ApprovalRequest', id, 'action', { status: req.status }, { decision, note });
  return updated;
}

export async function delegateApproval(tx: Tx, ctx: Ctx, id: string, toUserId: string) {
  const req = await tx.approvalRequest.findFirst({ where: { id, companyId: ctx.companyId } });
  if (!req) throw notFound('Approval');
  await tx.approvalAction.create({ data: { companyId: ctx.companyId, approvalId: id, step: req.currentStep, actorId: ctx.userId, action: 'delegated', note: `to ${toUserId}` } });
  await notifyUsers(tx, ctx.companyId, [toUserId], { title: `Approval delegated to you: ${req.type}`, link: `/app/approval-request/${id}`, severity: 'warning', type: 'approval' });
  return req;
}

// SLA escalation job: pending approvals past dueAt move to the next role (or are flagged escalated).
export async function escalateOverdue() {
  const due = await prisma.approvalRequest.findMany({ where: { status: 'pending', dueAt: { lt: new Date() } }, take: 100 });
  for (const r of due) {
    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.update({ where: { id: r.id }, data: { status: 'escalated', dueAt: new Date(Date.now() + 24 * 3600000) } });
      await tx.approvalAction.create({ data: { companyId: r.companyId, approvalId: r.id, step: r.currentStep, action: 'escalated', note: 'SLA breached' } });
      await notifyRole(tx, r.companyId, 'admin', { title: `Approval overdue: ${r.type}`, link: `/app/approval-request/${r.id}`, severity: 'critical', type: 'approval' });
    });
  }
  return due.length;
}
