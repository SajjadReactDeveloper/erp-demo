import { Prisma, Tx } from '@erp/db';
import { Ctx, D, HttpError, nextNumber, today, r2, audit } from '../core/base';

export interface PostInput {
  event: string; // matches PostingRule.event
  date?: Date;
  amounts: Record<string, any>; // total, subtotal, net, vat, cost, amount ...
  sourceType: string;
  sourceId: string;
  requestId?: string | null;
  memo?: string;
  branchId?: string | null;
  partnerType?: 'customer' | 'supplier';
  partnerId?: string | null;
  bankAccountId?: string | null; // replaces the rule's bank/cash account
  expenseAccountId?: string | null;
  costCenterId?: string | null;
}

/** Generic data-driven poster: PostingRule rows (event -> side/account/amountExpr) produce a balanced, immutable journal entry. */
export async function postJournal(tx: Tx, ctx: Ctx, p: PostInput) {
  const rules = await tx.postingRule.findMany({ where: { companyId: ctx.companyId, event: p.event, isActive: true }, orderBy: { seq: 'asc' }, include: { account: true } });
  if (!rules.length) throw new HttpError(409, 'no_posting_rule', `No posting rules configured for event "${p.event}"`);
  let bankAcc: any = null;
  if (p.bankAccountId) {
    const b = await tx.bankAccount.findUnique({ where: { id: p.bankAccountId } });
    bankAcc = b?.accountId ?? null;
  }
  const lines: { accountId: string; debit: Prisma.Decimal; credit: Prisma.Decimal; partnerType?: string; partnerId?: string; costCenterId?: string }[] = [];
  for (const r of rules) {
    const amt = r2(p.amounts[r.amountExpr] ?? 0);
    if (amt.isZero()) continue;
    let accountId = r.accountId;
    const ct = (r as any).account.controlType;
    if (bankAcc && (ct === 'bank' || ct === 'cash')) accountId = bankAcc;
    if (p.expenseAccountId && ct === 'expense') accountId = p.expenseAccountId;
    const partner = ct === 'ar' || ct === 'ap' ? { partnerType: p.partnerType, partnerId: p.partnerId ?? undefined } : {};
    lines.push({ accountId, debit: r.side === 'debit' ? amt : D(0), credit: r.side === 'credit' ? amt : D(0), costCenterId: p.costCenterId ?? undefined, ...partner });
  }
  if (!lines.length) return null;
  const debit = lines.reduce((s, l) => s.plus(l.debit), D(0));
  const credit = lines.reduce((s, l) => s.plus(l.credit), D(0));
  if (!debit.equals(credit)) throw new HttpError(500, 'unbalanced_entry', `Posting "${p.event}" is unbalanced (debit ${debit} ≠ credit ${credit}). Check posting rules.`);
  const date = p.date ?? today();
  const period = await tx.fiscalPeriod.findFirst({ where: { companyId: ctx.companyId, startDate: { lte: date }, endDate: { gte: date } } });
  if (period && period.status !== 'open') throw new HttpError(409, 'period_closed', `Fiscal period ${period.name} is ${period.status}`);
  const entryNo = await nextNumber(tx, ctx.companyId, 'JV');
  const entry = await tx.journalEntry.create({
    data: { companyId: ctx.companyId, entryNo, entryDate: date, periodId: period?.id, branchId: p.branchId ?? ctx.branchId, sourceType: p.sourceType, sourceId: p.sourceId, requestId: p.requestId ?? undefined, memo: p.memo ?? `${p.event} ${p.sourceId}`, status: 'posted', postedById: ctx.userId, totalDebit: debit },
  });
  for (const l of lines) await tx.journalLine.create({ data: { companyId: ctx.companyId, entryId: entry.id, accountId: l.accountId, debit: l.debit, credit: l.credit, partnerType: l.partnerType, partnerId: l.partnerId, costCenterId: l.costCenterId } });
  await audit(tx, ctx, 'JournalEntry', entry.id, 'create', undefined, { event: p.event, sourceType: p.sourceType, sourceId: p.sourceId, debit });
  return entry;
}

/** Reverse a posted entry: mirror lines with debit/credit swapped, link both ways. */
export async function reverseJournal(tx: Tx, ctx: Ctx, entryId: string, reason?: string) {
  const orig = await tx.journalEntry.findFirst({ where: { id: entryId, companyId: ctx.companyId }, include: { JournalLine_entryId: true } as any });
  if (!orig) throw new HttpError(404, 'not_found', 'Journal entry not found');
  const lines = (orig as any).JournalLine_entryId as any[];
  const entryNo = await nextNumber(tx, ctx.companyId, 'JV');
  const rev = await tx.journalEntry.create({ data: { companyId: ctx.companyId, entryNo, entryDate: today(), branchId: orig.branchId, sourceType: orig.sourceType, sourceId: orig.sourceId, requestId: orig.requestId, memo: `Reversal of ${orig.entryNo}${reason ? ': ' + reason : ''}`, status: 'posted', reversalOfId: orig.id, postedById: ctx.userId, totalDebit: orig.totalDebit } });
  for (const l of lines) await tx.journalLine.create({ data: { companyId: ctx.companyId, entryId: rev.id, accountId: l.accountId, debit: l.credit, credit: l.debit, partnerType: l.partnerType, partnerId: l.partnerId, costCenterId: l.costCenterId } });
  await tx.journalEntry.update({ where: { id: orig.id }, data: { status: 'reversed' } });
  await audit(tx, ctx, 'JournalEntry', orig.id, 'action', { status: 'posted' }, { reversedBy: rev.id });
  return rev;
}

export async function accountByCode(tx: Tx, companyId: string, code: string) {
  const a = await tx.account.findFirst({ where: { companyId, code } });
  if (!a) throw new HttpError(409, 'no_account', `Account ${code} missing from chart of accounts`);
  return a;
}
