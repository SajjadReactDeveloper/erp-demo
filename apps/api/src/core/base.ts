import { prisma, Prisma, Tx } from '@erp/db';
import { BY_KEY, ResourceDef } from '@erp/shared';
import { EventEmitter } from 'node:events';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}
export const bad = (msg: string, details?: any) => new HttpError(400, 'bad_request', msg, details);
export const notFound = (what = 'Record') => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = (msg = 'You do not have permission to do this') => new HttpError(403, 'forbidden', msg);
export const conflict = (msg: string, code = 'conflict', details?: any) => new HttpError(409, code, msg, details);

export interface Ctx {
  userId: string;
  companyId: string;
  role: string;
  perms: string[];
  kind: 'staff' | 'customer' | 'supplier';
  customerId?: string | null;
  supplierId?: string | null;
  branchId?: string | null;
  locale: 'ar' | 'en';
  ip?: string;
  requestId?: string;
  name?: string;
  internal?: boolean; // set for system-initiated writes so user-facing guards (e.g. discount approval) are skipped
}
export const canApprove = (ctx: Ctx) => ctx.perms.includes('*') || ctx.perms.includes('verb:approve');
export const sys = (ctx: Ctx): Ctx => ({ ...ctx, internal: true });

export const D = Object.assign((x: any) => new Prisma.Decimal(x ?? 0), {
  max: (...xs: any[]) => Prisma.Decimal.max(...xs.map((x) => new Prisma.Decimal(x ?? 0))),
  min: (...xs: any[]) => Prisma.Decimal.min(...xs.map((x) => new Prisma.Decimal(x ?? 0))),
});
export const num = (x: any) => Number(x ?? 0);
export const r2 = (x: any) => D(x).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const r4 = (x: any) => D(x).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
export const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
export const delegateOf = (db: any, key: string) => db[lowerFirst(key)];
export const relName = (fname: string) => (fname.endsWith('Id') ? fname.slice(0, -2) : fname + 'Rel');
export const today = () => new Date(new Date().toISOString().slice(0, 10));
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// ---- realtime pub/sub (SSE) ----
export const bus = new EventEmitter();
bus.setMaxListeners(1000);

// ---- settings ----
const settingCache = new Map<string, { v: any; at: number }>();
export async function getSetting<T = any>(companyId: string, key: string, def: T, db: any = prisma): Promise<T> {
  const ck = `${companyId}:${key}`;
  const c = settingCache.get(ck);
  if (c && Date.now() - c.at < 15000) return c.v;
  const s = await db.setting.findFirst({ where: { companyId, key } });
  const v = s ? (s.value as any)?.v ?? s.value : def;
  settingCache.set(ck, { v, at: Date.now() });
  return v as T;
}
export const clearSettingCache = () => settingCache.clear();

// ---- numbering (gapless per company/doc/year; runs inside the caller's transaction) ----
export async function nextNumber(tx: Tx, companyId: string, prefix: string, branchId?: string | null): Promise<string> {
  const year = new Date().getFullYear();
  const bid = ''; // one gapless series per company, document type and year (the number carries no branch, so a per-branch counter would collide)
  void branchId;
  await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `${companyId}:${prefix}:${year}`);
  const row = await tx.docSequence.findFirst({ where: { companyId, docType: prefix, year, branchId: bid } });
  let n = 1;
  if (row) {
    n = row.nextNo;
    await tx.docSequence.update({ where: { id: row.id }, data: { nextNo: n + 1 } });
  } else {
    await tx.docSequence.create({ data: { companyId, docType: prefix, year, branchId: bid, nextNo: 2 } });
  }
  return `${prefix}-${year}-${String(n).padStart(5, '0')}`;
}

// ---- audit ----
export async function audit(tx: Tx | typeof prisma, ctx: Partial<Ctx>, entity: string, entityId: string | undefined, action: string, before?: any, after?: any) {
  await (tx as any).auditLog.create({
    data: { companyId: ctx.companyId!, userId: ctx.userId, entity, entityId, action, before: before ? JSON.parse(JSON.stringify(before)) : undefined, after: after ? JSON.parse(JSON.stringify(after)) : undefined, ip: ctx.ip, requestId: ctx.requestId },
  });
}

// ---- outbox: events committed with the transaction, consumed by the worker ----
export async function emit(tx: Tx | typeof prisma, companyId: string, type: string, payload: any) {
  await (tx as any).outboxEvent.create({ data: { companyId, type, payload: JSON.parse(JSON.stringify(payload)), nextRunAt: new Date() } });
}

// ---- notifications (in-app + queued external channels) ----
export async function notifyUsers(tx: Tx | typeof prisma, companyId: string, userIds: string[], n: { title: string; body?: string; link?: string; severity?: 'info' | 'warning' | 'critical'; type?: string }) {
  const unique = [...new Set(userIds.filter(Boolean))];
  for (const userId of unique) {
    const row = await (tx as any).notification.create({ data: { companyId, userId, type: n.type ?? 'info', title: n.title, body: n.body, link: n.link, severity: n.severity ?? 'info', channel: 'inapp' } });
    bus.emit('notify', { userId, row });
  }
}
export async function notifyRole(tx: Tx | typeof prisma, companyId: string, roleName: string, n: Parameters<typeof notifyUsers>[3]) {
  const role = await (tx as any).role.findFirst({ where: { companyId, name: roleName } });
  if (!role) return;
  const users = await (tx as any).user.findMany({ where: { companyId, roleId: role.id, isActive: true, kind: 'staff' }, select: { id: true } });
  await notifyUsers(tx, companyId, users.map((u: any) => u.id), n);
}

// ---- runtime registries filled by the domain modules ----
export type ActionFn = (a: { ctx: Ctx; tx: Tx; row: any; body: any; res: ResourceDef }) => Promise<any | void>;
export interface Hooks {
  deferNumber?: boolean; // assign the document number later (e.g. on issue) so numbers stay gapless
  beforeCreate?: (a: { ctx: Ctx; tx: Tx; data: any; children?: any }) => Promise<void> | void;
  afterCreate?: (a: { ctx: Ctx; tx: Tx; row: any; children?: any }) => Promise<void> | void;
  beforeUpdate?: (a: { ctx: Ctx; tx: Tx; row: any; data: any; children?: any }) => Promise<void> | void;
  afterUpdate?: (a: { ctx: Ctx; tx: Tx; row: any; before: any; children?: any }) => Promise<void> | void;
  beforeDelete?: (a: { ctx: Ctx; tx: Tx; row: any }) => Promise<void> | void;
}
export const hooks: Record<string, Hooks> = {};
export const handlers: Record<string, ActionFn> = {};
export const H = (key: string, h: Hooks) => {
  if (!BY_KEY[key]) throw new Error(`H: unknown resource ${key}`);
  hooks[key] = { ...(hooks[key] ?? {}), ...h };
};
export const A = (key: string, fn: ActionFn) => {
  const [k, a] = key.split('.');
  if (!BY_KEY[k]?.actions.some((x) => x.key === a)) throw new Error(`A: unknown action ${key}`);
  handlers[key] = fn;
};
export type ApprovalCb = (a: { tx: Tx; ctx: Ctx; approval: any; approved: boolean }) => Promise<void>;
export const approvalCallbacks: Record<string, ApprovalCb> = {};
