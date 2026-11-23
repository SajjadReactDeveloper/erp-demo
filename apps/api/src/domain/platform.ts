import { BY_KEY, RESOURCES } from '@erp/shared';
import { A, H, bad, clearSettingCache, conflict, forbidden, hooks, relName } from '../core/base';
import { decide, delegateApproval } from '../core/approvals';
import { dropUserCache } from '../core/auth-plugin';

A('ApprovalRequest.approve', async ({ ctx, tx, row, body }) => {
  await decide(tx, ctx, row.id, 'approved', body?.note);
  return { skip: true, message: 'Approved' };
});
A('ApprovalRequest.reject', async ({ ctx, tx, row, body }) => {
  if (!body?.note) throw bad('Please give a reason for rejecting');
  await decide(tx, ctx, row.id, 'rejected', body.note);
  return { skip: true, message: 'Rejected' };
});
A('ApprovalRequest.delegate', async ({ ctx, tx, row, body }) => {
  if (!body?.toUserId) throw bad('Choose who to delegate to');
  await delegateApproval(tx, ctx, row.id, body.toUserId);
  return { skip: true, message: 'Delegated' };
});

A('IntegrationMessage.replay', async ({ ctx, tx, row }) => ({ set: { attempts: row.attempts + 1 }, message: 'Queued for retry' }));

H('User', {
  beforeCreate: ({ data }) => {
    if (data.email) data.email = String(data.email).toLowerCase().trim();
    if (data.kind === 'customer' && !data.customerId) throw bad('A customer portal user must be linked to a customer');
    if (data.kind === 'supplier' && !data.supplierId) throw bad('A supplier portal user must be linked to a supplier');
  },
  beforeUpdate: ({ data, row, ctx }) => {
    if (data.email) data.email = String(data.email).toLowerCase().trim();
    if (row.id === ctx.userId && data.isActive === false) throw conflict('You cannot deactivate your own account');
  },
  afterUpdate: ({ row }) => { dropUserCache(row.id); },
});
H('Role', {
  beforeUpdate: ({ row, data }) => { if (row.isSystem && data.name && data.name !== row.name) throw forbidden('System roles cannot be renamed'); },
  afterUpdate: () => { dropUserCache(); },
  beforeDelete: async ({ tx, row }) => {
    if (row.isSystem) throw forbidden('System roles cannot be deleted');
    if (await tx.user.count({ where: { roleId: row.id } })) throw conflict('Reassign the users of this role before deleting it', 'in_use');
  },
});
H('Setting', { afterCreate: () => clearSettingCache(), afterUpdate: () => clearSettingCache() });
H('ApprovalRule', {
  beforeCreate: ({ data }) => { if (!Array.isArray(data.steps) || !data.steps.length) throw bad('Add at least one approval step'); },
});
H('Notification', {});

// Guard: a record referenced elsewhere cannot be deleted. Generic safety net for master data (friendly message instead of a raw FK error).
for (const r of RESOURCES.filter((x) => ['masterdata', 'platform'].includes(x.mod) && !x.sys && !x.immutable)) {
  const refs = RESOURCES.flatMap((o) => o.fields.filter((f) => f.type === 'ref' && f.ref === r.key).map((f) => ({ o, f })));
  if (!refs.length) continue;
  const prev = hooks[r.key]?.beforeDelete;
  H(r.key, {
    beforeDelete: async (a) => {
      if (prev) await prev(a);
      for (const { o, f } of refs) {
        if (o.children.some((c) => c.key === r.key)) continue;
        const n = await (a.tx as any)[o.key.charAt(0).toLowerCase() + o.key.slice(1)].count({ where: { [f.name]: a.row.id } });
        if (n > 0) throw conflict(`${r.en} is used by ${n} ${o.enPlural.toLowerCase()} and cannot be deleted. Deactivate it instead.`, 'in_use');
      }
    },
  });
}
void BY_KEY; void relName;
