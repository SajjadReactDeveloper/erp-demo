// Permission patterns:  '*'  |  'read:*'  |  'mod:<module>:<verb|*>'  |  'res:<slug>:<verb|*>'  |  'verb:<actionKey>'
// verbs: read, create, update, delete, plus any action key (approve, send, confirm, ...)

export interface PermCtx { mod: string; slug: string }

export function can(perms: string[] | undefined, ctx: PermCtx, verb: string): boolean {
  if (!perms) return false;
  for (const p of perms) {
    if (p === '*') return true;
    if (p === `read:*` && verb === 'read') return true;
    if (p === `verb:${verb}`) return true;
    if (p.startsWith('mod:')) {
      const [, m, v] = p.split(':');
      if (m === ctx.mod && (v === '*' || v === verb)) return true;
    }
    if (p.startsWith('res:')) {
      const [, s, v] = p.split(':');
      if (s === ctx.slug && (v === '*' || v === verb)) return true;
    }
  }
  return false;
}

const APPROVER_VERBS = ['approve', 'reject', 'release', 'confirm', 'approve_variance', 'delegate', 'request_release'].map((v) => `verb:${v}`);

export const DEFAULT_ROLES: Record<string, { description: string; permissions: string[] }> = {
  admin: { description: 'Full access / administrator', permissions: ['*'] },
  manager: { description: 'Manager / General Manager: approvals and dashboards', permissions: ['read:*', ...APPROVER_VERBS, 'res:setting:read', 'res:approval-rule:*', 'res:price-rule:*', 'res:credit-profile:*'] },
  sales: {
    description: 'Sales representative',
    permissions: [
      'mod:sales:*', 'mod:masterdata:read', 'res:customer:*', 'res:customer-contact:*', 'res:customer-address:*', 'res:vehicle:*', 'res:rfq:read', 'res:award:read', 'res:supplier-quote:read', 'res:supplier-quote-line:read',
      'res:credit-profile:read', 'res:credit-hold:read', 'res:invoice:read', 'res:delivery-note:read', 'res:delivery-note:assign', 'res:delivery-line:read', 'res:delivery-event:read', 'res:proof-of-delivery:read', 'res:sales-order:*', 'res:sales-order-line:*', 'res:purchase-order:read', 'res:approval-request:read',
    ],
  },
  purchasing: {
    description: 'Purchasing officer',
    permissions: ['mod:procurement:*', 'mod:marketplace:*', 'mod:masterdata:*', 'mod:sales:read', 'res:sales-order:create_pos', 'res:request:read', 'res:request-line:read', 'res:quotation:read', 'res:sales-order:read', 'mod:logistics:read', 'res:approval-request:read'],
  },
  warehouse: {
    description: 'Warehouse staff',
    permissions: ['res:goods-receipt:*', 'res:gr-line:*', 'res:scan-event:*', 'res:delivery-note:*', 'res:delivery-line:*', 'res:delivery-event:*', 'res:proof-of-delivery:*', 'res:device:read', 'res:purchase-order:read', 'res:po-line:read', 'res:part:read', 'res:supplier-claim:read', 'res:shipment:*', 'mod:inventory:*', 'res:transfer:*', 'res:transfer-line:*', 'res:sales-order:read', 'res:sales-order-line:read'],
  },
  driver: {
    description: 'Delivery driver',
    permissions: ['res:delivery-note:read', 'res:delivery-note:dispatch', 'res:delivery-note:deliver', 'res:delivery-note:fail', 'res:delivery-line:read', 'res:delivery-line:update', 'res:delivery-event:*', 'res:proof-of-delivery:*', 'res:scan-event:*', 'res:customer-address:read', 'res:part:read', 'res:sales-order:read'],
  },
  finance: { description: 'Finance team', permissions: ['mod:finance:*', 'mod:credit:*', 'read:*', 'verb:approve', 'verb:release'] },
  collector: { description: 'Collections officer', permissions: ['mod:credit:*', 'res:customer:read', 'res:invoice:read', 'res:receipt:*', 'res:receipt-allocation:*', 'res:customer-contact:read', 'res:activity:*', 'res:credit-alert:*'] },
  cashier: { description: 'Branch cashier', permissions: ['mod:pos:*', 'res:part:read', 'res:customer:read', 'res:customer:create', 'res:vehicle:read', 'res:vehicle:create', 'res:invoice:read', 'mod:inventory:read'] },
  technician: { description: 'Workshop technician', permissions: ['mod:workshop:*', 'res:vehicle:read', 'res:customer:read', 'res:part:read'] },
};

// Portal users: allowed verbs per resource slug (rows are additionally scoped to their own customerId / supplierId).
export const PORTAL_WRITE: Record<'customer' | 'supplier', Record<string, string[]>> = {
  customer: {
    request: ['create', 'update', 'submit', 'cancel'], 'request-line': ['create', 'update', 'delete'], quotation: ['approve', 'reject'], 'quotation-line': ['update'],
    'return-auth': ['create', 'update'], 'return-line': ['create', 'update', 'delete'], 'customer-address': ['create', 'update', 'delete'], vehicle: ['create', 'update'], 'service-booking': ['create', 'update', 'cancel'],
    receipt: ['create'], 'user': ['create', 'update'],
  },
  supplier: {
    'supplier-quote': ['create', 'update', 'submit', 'capture'], 'supplier-quote-line': ['create', 'update', 'delete'], 'rfq-supplier': ['update'], 'purchase-order': ['confirm'], 'po-line': ['update'],
    'supplier-bill': ['create', 'update'], 'supplier-bill-line': ['create', 'update', 'delete'], 'catalogue-item': ['create', 'update', 'delete'], 'availability-feed': ['create', 'update', 'run'],
  },
};
