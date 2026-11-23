import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { RESOURCES, BY_KEY } from '@erp/shared';
import { A, H, bad, conflict, delegateOf, notifyUsers, D, audit, getSetting } from '../core/base';
import { createRow } from '../core/crud';
import { decodeVin, decodeVinFull, isVinFormat } from '../services/ai';
import { normPN } from '../services/catalogue';

// ---- MDM-01/02 parts ----
H('Part', {
  beforeCreate: ({ data }) => { data.partNumber = String(data.partNumber).trim(); },
  afterCreate: async ({ tx, row, ctx }) => {
    // duplicate suggestion: tell the user when a near-identical number already exists (does not block)
    const dup: any[] = await tx.$queryRawUnsafe(`SELECT id, "partNumber" FROM part WHERE "companyId"=$1 AND id <> $2 AND status <> 'merged' AND similarity("partNumber", $3) > 0.85 LIMIT 3`, ctx.companyId, row.id, row.partNumber);
    if (dup.length) await notifyUsers(tx, ctx.companyId, [ctx.userId], { title: 'Possible duplicate part', body: `${row.partNumber} looks similar to ${dup.map((d) => d.partNumber).join(', ')}. Review and merge if needed.`, link: `/app/part/${row.id}`, severity: 'warning', type: 'catalogue' });
  },
});
A('Part.merge', async ({ tx, ctx, row, body }) => {
  const intoId = body?.intoId;
  if (!intoId || intoId === row.id) throw bad('Choose a different part to merge into');
  const into = await tx.part.findFirst({ where: { id: intoId, companyId: ctx.companyId } });
  if (!into) throw bad('Target part not found');
  let moved = 0;
  for (const r of RESOURCES) {
    for (const f of r.fields) {
      if (f.type !== 'ref' || f.ref !== 'Part' || r.key === 'Part') continue;
      const d = delegateOf(tx, r.key);
      const rows: any[] = await d.findMany({ where: { [f.name]: row.id }, select: { id: true } });
      for (const x of rows) {
        try { await tx.$executeRawUnsafe(`SAVEPOINT m`); await d.update({ where: { id: x.id }, data: { [f.name]: intoId } }); await tx.$executeRawUnsafe(`RELEASE SAVEPOINT m`); moved++; }
        catch { await tx.$executeRawUnsafe(`ROLLBACK TO SAVEPOINT m`); await d.delete({ where: { id: x.id } }).catch(() => null); }
      }
    }
  }
  await tx.partXref.create({ data: { companyId: ctx.companyId, partId: intoId, xrefNumber: row.partNumber, xrefType: 'superseded' } }).catch(() => null);
  return { set: { mergedIntoId: intoId }, message: `Merged. ${moved} linked record(s) moved to ${into.partNumber}.` };
});

// ---- MDM-03 vehicles ----
const vinHook = async ({ tx, data, ctx }: any) => {
  if (data.vin == null) return;
  data.vin = String(data.vin).toUpperCase().trim();
  if (!isVinFormat(data.vin)) throw bad('VIN must be 17 characters (letters except I, O, Q, and digits)');
  const d: any = await decodeVinFull(tx, ctx.companyId, data.vin);
  if (d.valid) { data.make ??= d.make ?? undefined; data.year ??= d.year ?? undefined; }
};
H('Vehicle', {
  beforeCreate: vinHook,
  beforeUpdate: vinHook,
});

// ---- MDM-04 customers / CRD-01 ----
H('Customer', {
  beforeCreate: ({ data }) => {
    if (data.source === 'portal') { data.status = 'pending'; data.creditLimit = 0; }
    if (data.email) data.email = String(data.email).toLowerCase();
    if (data.vatNumber && !/^\d{15}$/.test(String(data.vatNumber))) throw bad('VAT number must be 15 digits');
    if (data.crNumber && !/^\d{10}$/.test(String(data.crNumber)) && String(data.crNumber).length < 5) throw bad('Commercial registration number looks invalid');
  },
  beforeUpdate: ({ data }) => { if (data.vatNumber && !/^\d{15}$/.test(String(data.vatNumber))) throw bad('VAT number must be 15 digits'); },
  afterCreate: async ({ tx, row, ctx }) => {
    await tx.creditProfile.create({ data: { companyId: ctx.companyId, customerId: row.id, limitAmount: row.creditLimit ?? 0, termsDays: row.paymentTermsDays ?? 0, tier: row.priceTier, graceDays: await getSetting(ctx.companyId, 'credit.grace_days', 5), status: row.status === 'active' ? 'active' : 'suspended' } });
  },
  afterUpdate: async ({ tx, row, before, ctx }) => {
    if (String(row.creditLimit) !== String(before.creditLimit)) {
      await tx.creditProfile.updateMany({ where: { companyId: ctx.companyId, customerId: row.id }, data: { limitAmount: row.creditLimit ?? 0 } });
      await audit(tx, ctx, 'CreditProfile', row.id, 'update', { limit: before.creditLimit }, { limit: row.creditLimit, via: 'customer' });
    }
    if (row.status === 'active' && before.status !== 'active') await tx.creditProfile.updateMany({ where: { companyId: ctx.companyId, customerId: row.id, status: 'suspended' }, data: { status: 'active' } });
  },
});
A('Customer.block', async ({ tx, ctx, row }) => { await tx.creditProfile.updateMany({ where: { companyId: ctx.companyId, customerId: row.id }, data: { status: 'suspended' } }); });
A('Customer.activate', async ({ tx, ctx, row }) => { await tx.creditProfile.updateMany({ where: { companyId: ctx.companyId, customerId: row.id }, data: { status: 'active' } }); });
H('CustomerContact', { beforeCreate: ({ data }) => { if (data.email) data.email = String(data.email).toLowerCase(); } });
H('Supplier', { beforeCreate: ({ data }) => { if (data.email) data.email = String(data.email).toLowerCase(); if (data.iban && !/^SA\d{22}$/.test(String(data.iban).replace(/\s/g, ''))) throw bad('Saudi IBAN must be SA followed by 22 digits'); } });

// ---- MDM-06 pricing rules ----
const ruleCheck = ({ data, row }: any) => {
  const t = Number(data.targetMarginPct ?? row?.targetMarginPct), m = Number(data.minMarginPct ?? row?.minMarginPct);
  if (m > t) throw bad('Minimum margin cannot be higher than the target margin');
  if (t >= 1 || m < 0) throw bad('Margins are fractions between 0 and 1 (e.g. 0.25 for 25%)');
};
H('PriceRule', { beforeCreate: ruleCheck, beforeUpdate: ruleCheck });
H('UomConversion', { beforeCreate: ({ data }) => { if (Number(data.factor) <= 0) throw bad('Factor must be greater than zero'); } });

// ---- CRM ----
A('Activity.complete', async () => ({ set: { completedAt: new Date() } }));
A('CustomerApplication.approve', async ({ ctx, tx, row, body }) => {
  const exists = await tx.customer.findFirst({ where: { companyId: ctx.companyId, OR: [{ vatNumber: row.vatNumber ?? '__' }, { email: row.email }] } });
  if (exists) throw conflict(`A customer with the same VAT number or email already exists (${exists.name}).`);
  const cust = await createRow(tx, ctx, BY_KEY.Customer, { name: row.companyName, email: row.email, phone: row.phone, vatNumber: row.vatNumber, crNumber: row.crNumber, customerType: body?.customerType ?? 'workshop', priceTier: body?.priceTier ?? 'B', status: 'active', source: 'portal', portalEnabled: true, creditLimit: 0 }, { trusted: true });
  const role = await tx.role.findFirst({ where: { companyId: ctx.companyId, name: 'sales' } });
  const temp = randomBytes(6).toString('base64url');
  const u = await tx.user.findFirst({ where: { email: row.email } });
  if (!u) await tx.user.create({ data: { companyId: ctx.companyId, email: row.email, name: row.contactName, kind: 'customer', customerId: cust.id, roleId: role!.id, passwordHash: await bcrypt.hash(temp, 10), locale: 'ar' } });
  await tx.creditProfile.updateMany({ where: { customerId: cust.id }, data: { limitAmount: 0, status: 'active' } });
  return { set: { customerId: cust.id, reviewedById: ctx.userId }, data: { customerId: cust.id, tempPassword: u ? undefined : temp }, message: u ? 'Customer created (portal user already existed)' : `Customer created. Temporary portal password: ${temp} (share it securely; the user should change it).` };
});
A('CustomerApplication.reject', async ({ ctx, row }) => ({ set: { reviewedById: ctx.userId } }));

void D; void decodeVin; void normPN;
