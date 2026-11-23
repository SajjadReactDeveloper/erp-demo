import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma, Tx } from '@erp/db';
import { BY_KEY, BY_SLUG, RESOURCES, Field, ResourceDef, can, PORTAL_WRITE } from '@erp/shared';
import { Ctx, HttpError, audit, bad, conflict, delegateOf, emit, forbidden, handlers, hooks, nextNumber, notFound, relName } from './base';
import { authenticate } from './auth-plugin';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';

const snake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const PORTAL_READ_GLOBAL = new Set(['Part', 'Brand', 'Category', 'Uom', 'LostReason', 'ServiceType', 'TaxCode', 'ServiceInterval']);
const API_CREATE_IMMUTABLE = new Set(['ScanEvent', 'DeliveryEvent', 'ProofOfDelivery', 'StockMovement', 'LoyaltyTxn']);

// ---------- authorisation & portal scoping ----------
export function authorize(ctx: Ctx, res: ResourceDef, verb: string) {
  if (ctx.kind === 'staff') {
    if (!can(ctx.perms, { mod: res.mod, slug: res.slug }, verb)) throw forbidden(`Missing permission: ${res.slug}:${verb}`);
    return;
  }
  if (verb === 'read' && PORTAL_READ_GLOBAL.has(res.key)) return;
  if (res.portal !== ctx.kind) throw forbidden();
  if (verb === 'read') return;
  const allowed = PORTAL_WRITE[ctx.kind][res.slug] ?? [];
  if (!allowed.includes(verb)) throw forbidden();
}

export function scopeWhere(res: ResourceDef, ctx: Ctx): any {
  const where: any = res.global ? {} : { companyId: ctx.companyId };
  if (ctx.kind === 'staff') return where;
  if (PORTAL_READ_GLOBAL.has(res.key) && !res.fields.some((f) => f.name === 'customerId')) return where;
  const inner = portalScope(res, ctx);
  if (!inner) throw forbidden();
  return { ...where, ...inner };
}
function portalScope(res: ResourceDef, ctx: Ctx): any | null {
  const idField = ctx.kind === 'customer' ? 'customerId' : 'supplierId';
  const idVal = ctx.kind === 'customer' ? ctx.customerId : ctx.supplierId;
  if (!idVal) return null;
  if (res.fields.some((f) => f.name === idField)) return { [idField]: idVal };
  if (res.key === 'Customer' && ctx.kind === 'customer') return { id: idVal };
  if (res.key === 'Supplier' && ctx.kind === 'supplier') return { id: idVal };
  const parent = RESOURCES.find((p) => p.children.some((c) => c.key === res.key));
  if (!parent) return null;
  const fk = parent.children.find((c) => c.key === res.key)!.fk;
  const inner = portalScope(parent, ctx);
  return inner ? { [relName(fk)]: inner } : null;
}

// ---------- validation built from the registry ----------
const zCache = new Map<string, z.ZodObject<any>>();
function zField(f: Field): z.ZodTypeAny {
  switch (f.type) {
    case 'string': return z.string().max(500);
    case 'text': return z.string().max(100000);
    case 'int': return z.coerce.number().int();
    case 'decimal': return z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/)]);
    case 'bool': return z.boolean();
    case 'date': case 'datetime': return z.string().refine((s) => !isNaN(Date.parse(s)), 'invalid date');
    case 'json': return z.any();
    case 'enum': return z.enum(f.values as [string, ...string[]]);
    case 'ref': return z.string().uuid();
  }
}
export function zodFor(res: ResourceDef) {
  if (zCache.has(res.key)) return zCache.get(res.key)!;
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of res.fields) {
    if (f.readonly) continue;
    const base = zField(f);
    shape[f.name] = f.required ? base : base.nullish();
  }
  const s = z.object(shape).passthrough().partial(); // required-ness checked per create/update below
  zCache.set(res.key, s as any);
  return s as any;
}

function coerce(res: ResourceDef, input: any, mode: 'create' | 'update', ctx: Ctx): any {
  const parsed = zodFor(res).safeParse(input ?? {});
  if (!parsed.success) throw bad('Validation failed', parsed.error.flatten().fieldErrors);
  const out: any = {};
  const missing: Record<string, string[]> = {};
  const lockStatus = res.actions.length > 0 && res.statusField;
  for (const f of res.fields) {
    if (f.readonly) continue;
    if (mode === 'update' && f.name === lockStatus) continue;
    if (mode === 'create' && f.name === lockStatus) continue;
    let v = (parsed.data as any)[f.name];
    if (v === undefined) {
      if (mode === 'create' && f.required && !(f.type === 'ref' && ctx.kind !== 'staff' && (f.name === 'customerId' || f.name === 'supplierId'))) missing[f.name] = ['Required'];
      continue;
    }
    if (v === '' && f.type !== 'string' && f.type !== 'text') v = null;
    if (v === null && f.required) { missing[f.name] = ['Required']; continue; }
    if (v !== null && (f.type === 'date' || f.type === 'datetime')) v = new Date(v);
    out[f.name] = v;
  }
  if (Object.keys(missing).length) throw bad('Validation failed', missing);
  // portal users are pinned to their own customer / supplier
  if (ctx.kind === 'customer' && res.fields.some((f) => f.name === 'customerId')) out.customerId = ctx.customerId;
  if (ctx.kind === 'supplier' && res.fields.some((f) => f.name === 'supplierId')) out.supplierId = ctx.supplierId;
  return out;
}

// ---------- refs / labels ----------
function labelSelect(t: ResourceDef) {
  const s: any = { id: true, [t.label]: true };
  if (t.key === 'Part') s.name = true;
  if (t.key === 'Vehicle') { s.make = true; s.model = true; }
  if (t.key === 'Customer' || t.key === 'Supplier') s.code = true;
  return s;
}
function labelValue(t: ResourceDef, o: any) {
  if (!o) return null;
  if (t.key === 'Part') return `${o.partNumber} — ${o.name}`;
  if (t.key === 'Vehicle') return `${o.vin}${o.make ? ` · ${o.make} ${o.model ?? ''}` : ''}`;
  return String(o[t.label] ?? o.id);
}
function includeRefs(res: ResourceDef) {
  const inc: any = {};
  for (const f of res.fields) if (f.type === 'ref') inc[relName(f.name)] = { select: labelSelect(BY_KEY[f.ref!]) };
  return inc;
}
function shape(res: ResourceDef, row: any) {
  const out: any = {};
  const refs: any = {};
  for (const [k, v] of Object.entries(row)) {
    const f = res.fields.find((x) => relName(x.name) === k && x.type === 'ref');
    if (f) refs[f.name] = v ? { id: (v as any).id, label: labelValue(BY_KEY[f.ref!], v) } : null;
    else if (res.fields.some((x) => x.name === k && x.hidden && x.readonly) || k === 'passwordHash' || k === 'mfaSecret' || k === 'privateKey' || k === 'embedding') continue;
    else out[k] = v;
  }
  out._refs = refs;
  return out;
}

function parseFilters(res: ResourceDef, q: Record<string, any>) {
  const where: any = {};
  for (const [key, raw] of Object.entries(q)) {
    if (!key.startsWith('f.') || raw === '' || raw == null) continue;
    const [, name, op] = key.split('.');
    const f = res.fields.find((x) => x.name === name);
    if (!f && !['createdAt', 'updatedAt'].includes(name)) continue;
    const t = f?.type ?? 'datetime';
    const cast = (s: string) => (t === 'int' ? Number(s) : t === 'decimal' ? s : t === 'bool' ? s === 'true' : t === 'date' || t === 'datetime' ? new Date(s) : s);
    const vals = String(raw).split(',');
    if (op && ['gte', 'lte', 'gt', 'lt'].includes(op)) where[name] = { ...(where[name] ?? {}), [op]: cast(vals[0]) };
    else if (vals.length > 1) where[name] = { in: vals.map(cast) };
    else where[name] = cast(vals[0]);
  }
  return where;
}

function searchWhere(res: ResourceDef, q?: string) {
  if (!q?.trim()) return undefined;
  const fields = res.fields.filter((f) => f.search && (f.type === 'string' || f.type === 'text'));
  if (!fields.length) return undefined;
  return { OR: fields.map((f) => ({ [f.name]: { contains: q.trim(), mode: 'insensitive' } })) };
}

// ---------- core operations (used by routes and by domain code) ----------
async function inheritRequestId(tx: Tx, res: ResourceDef, data: any) {
  if (!res.req || data.requestId) return;
  for (const f of res.fields) {
    if (f.type !== 'ref' || !data[f.name]) continue;
    const t = BY_KEY[f.ref!];
    if (!t.req) continue;
    const parent = await delegateOf(tx, t.key).findUnique({ where: { id: data[f.name] }, select: { requestId: true } });
    if (parent?.requestId) { data.requestId = parent.requestId; return; }
  }
}

export async function createRow(tx: Tx, ctx: Ctx, res: ResourceDef, input: any, opts: { trusted?: boolean } = {}): Promise<any> {
  const { children, ...fields } = input ?? {};
  const data = opts.trusted ? { ...fields } : coerce(res, fields, 'create', ctx);
  if (!res.global) data.companyId = ctx.companyId;
  data.createdById = ctx.userId;
  const lockStatus = res.actions.length > 0 && res.statusField;
  if (!opts.trusted && lockStatus && !data[lockStatus]) data[lockStatus] = res.fields.find((f) => f.name === lockStatus)!.values![0];
  if (res.num && res.numField && !data[res.numField] && !hooks[res.key]?.deferNumber) data[res.numField] = await nextNumber(tx, ctx.companyId, res.num, data.branchId ?? ctx.branchId);
  await inheritRequestId(tx, res, data);
  await hooks[res.key]?.beforeCreate?.({ ctx, tx, data, children });
  const row = await delegateOf(tx, res.key).create({ data });
  if (res.key === 'Request' && !row.requestId) await tx.request.update({ where: { id: row.id }, data: { requestId: row.id } }), (row.requestId = row.id);
  for (const c of res.children) {
    const items = children?.[c.key];
    if (!Array.isArray(items)) continue;
    const cres = BY_KEY[c.key];
    for (const [i, item] of items.entries()) {
      const payload = { ...item, [c.fk]: row.id };
      if (cres.fields.some((f) => f.name === 'lineNo') && payload.lineNo == null) payload.lineNo = i + 1;
      const cdata = opts.trusted ? payload : { ...payload };
      const child = await createRow(tx, ctx, cres, cdata, { trusted: opts.trusted });
      void child;
    }
  }
  const after = opts.trusted && res.children.length === 0 ? row : await delegateOf(tx, res.key).findUnique({ where: { id: row.id } });
  await hooks[res.key]?.afterCreate?.({ ctx, tx, row: after, children });
  await audit(tx, ctx, res.key, row.id, 'create', undefined, after);
  await emit(tx, ctx.companyId, `${res.key}.created`, { id: row.id });
  return await delegateOf(tx, res.key).findUnique({ where: { id: row.id } });
}

export async function updateRow(tx: Tx, ctx: Ctx, res: ResourceDef, id: string, input: any, opts: { trusted?: boolean; scope?: any } = {}): Promise<any> {
  const { children, version, ...fields } = input ?? {};
  const where: any = { id, ...(opts.scope ?? {}) };
  const row = await delegateOf(tx, res.key).findFirst({ where });
  if (!row) throw notFound(res.en);
  if (version != null && row.version !== Number(version)) throw conflict('This record was changed by someone else. Reload and try again.', 'version_conflict', { current: row.version });
  const data = opts.trusted ? { ...fields } : coerce(res, fields, 'update', ctx);
  await hooks[res.key]?.beforeUpdate?.({ ctx, tx, row, data, children });
  data.version = { increment: 1 };
  if (Object.keys(data).length > 1 || true) await delegateOf(tx, res.key).update({ where: { id }, data });
  for (const c of res.children) {
    const items = children?.[c.key];
    if (!Array.isArray(items)) continue;
    const cres = BY_KEY[c.key];
    const existing: any[] = await delegateOf(tx, c.key).findMany({ where: { [c.fk]: id }, select: { id: true } });
    const keep = new Set(items.filter((i: any) => i.id).map((i: any) => i.id));
    for (const e of existing) if (!keep.has(e.id)) await deleteRow(tx, ctx, cres, e.id, { trusted: true });
    for (const [i, item] of items.entries()) {
      if (item.id) await updateRow(tx, ctx, cres, item.id, item, { trusted: opts.trusted });
      else {
        const payload = { ...item, [c.fk]: id };
        if (cres.fields.some((f) => f.name === 'lineNo') && payload.lineNo == null) payload.lineNo = i + 1;
        await createRow(tx, ctx, cres, payload, { trusted: opts.trusted });
      }
    }
  }
  const after = await delegateOf(tx, res.key).findUnique({ where: { id } });
  await hooks[res.key]?.afterUpdate?.({ ctx, tx, row: after, before: row, children });
  await audit(tx, ctx, res.key, id, 'update', row, after);
  await emit(tx, ctx.companyId, `${res.key}.updated`, { id });
  return after;
}

export async function deleteRow(tx: Tx, ctx: Ctx, res: ResourceDef, id: string, opts: { trusted?: boolean; scope?: any } = {}) {
  const row = await delegateOf(tx, res.key).findFirst({ where: { id, ...(opts.scope ?? {}) } });
  if (!row) throw notFound(res.en);
  if (!opts.trusted) {
    if (res.immutable || res.noDelete) throw forbidden(`${res.en} cannot be deleted`);
    const st = res.statusField ? row[res.statusField] : null;
    if (st && res.fields.find((f) => f.name === res.statusField)!.values![0] !== st && !['cancelled', 'rejected', 'inactive', 'revoked', 'paused'].includes(st) && res.actions.length > 0)
      throw conflict(`Only ${res.fields.find((f) => f.name === res.statusField)!.values![0]} ${res.en.toLowerCase()} records can be deleted; cancel it instead`, 'invalid_state');
  }
  await hooks[res.key]?.beforeDelete?.({ ctx, tx, row });
  for (const c of res.children) await delegateOf(tx, c.key).deleteMany({ where: { [c.fk]: id } });
  await delegateOf(tx, res.key).delete({ where: { id } });
  await audit(tx, ctx, res.key, id, 'delete', row, undefined);
  await emit(tx, ctx.companyId, `${res.key}.deleted`, { id });
}

function availableActions(res: ResourceDef, ctx: Ctx, row: any) {
  return res.actions.filter((a) => {
    if (a.from && res.statusField && !a.from.includes(row[res.statusField])) return false;
    try { authorize(ctx, res, a.key); return true; } catch { return false; }
  }).map((a) => a.key);
}

export async function runAction(ctx: Ctx, res: ResourceDef, id: string, actionKey: string, body: any, scope?: any) {
  const def = res.actions.find((a) => a.key === actionKey);
  if (!def) throw notFound('Action');
  authorize(ctx, res, actionKey);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe(`SELECT id FROM "${snake(res.key)}" WHERE id = $1 FOR UPDATE`, id);
    const row = await delegateOf(tx, res.key).findFirst({ where: { id, ...(scope ?? {}) } });
    if (!row) throw notFound(res.en);
    if (def.from && res.statusField && !def.from.includes(row[res.statusField]))
      throw conflict(`Cannot ${def.en.toLowerCase()} while status is "${row[res.statusField]}"`, 'invalid_state');
    const h = handlers[`${res.key}.${actionKey}`];
    if (!h && !def.to) throw new HttpError(501, 'not_implemented', `Action ${res.key}.${actionKey} is not implemented`);
    const result: any = (await h?.({ ctx, tx, row, body: body ?? {}, res })) ?? {};
    const upd: any = { ...(result.set ?? {}) };
    const target = result.status ?? def.to;
    if (target && res.statusField && !result.skip) upd[res.statusField] = target;
    if (Object.keys(upd).length) await delegateOf(tx, res.key).update({ where: { id }, data: { ...upd, version: { increment: 1 } } });
    const after = await delegateOf(tx, res.key).findUnique({ where: { id } });
    await audit(tx, ctx, res.key, id, 'action', { status: row[res.statusField ?? ''], action: actionKey }, { status: after?.[res.statusField ?? ''], body: summarize(body) });
    await emit(tx, ctx.companyId, `${res.key}.${actionKey}`, { id });
    return { data: after, result: result.data, message: result.message };
  }, { timeout: 60000, maxWait: 10000 });
}
const summarize = (b: any) => (b && JSON.stringify(b).length < 2000 ? b : undefined);

// ---------- routes ----------
export function registerCrud(app: FastifyInstance) {
  const getRes = (slug: string) => {
    const r = BY_SLUG[slug];
    if (!r || r.sys && false) throw notFound('Resource');
    return r;
  };

  app.get('/api/v1/r/:slug', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'read');
    const q = req.query as Record<string, any>;
    const page = Math.max(1, Number(q.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
    const [sf, sd] = String(q.sort ?? res.order ?? 'createdAt:desc').split(':');
    const sortField = [...res.fields.map((f) => f.name), 'createdAt', 'updatedAt'].includes(sf) ? sf : 'createdAt';
    const where = { AND: [scopeWhere(res, ctx), parseFilters(res, q), searchWhere(res, q.q) ?? {}] };
    const [total, rows] = await Promise.all([
      delegateOf(prisma, res.key).count({ where }),
      delegateOf(prisma, res.key).findMany({ where, orderBy: { [sortField]: sd === 'asc' ? 'asc' : 'desc' }, skip: (page - 1) * limit, take: limit, include: includeRefs(res) }),
    ]);
    return { data: rows.map((r: any) => ({ ...shape(res, r), _actions: availableActions(res, ctx, r) })), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  });

  app.get('/api/v1/r/:slug/options', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'read');
    const q = req.query as any;
    const limit = Math.min(50, Number(q.limit) || 20);
    const ids = q.ids ? String(q.ids).split(',') : null;
    const sf = res.fields.filter((f) => (f.search || f.name === res.label) && (f.type === 'string' || f.type === 'text'));
    const where: any = { AND: [scopeWhere(res, ctx), ids ? { id: { in: ids } } : {}, q.q && sf.length ? { OR: sf.map((f) => ({ [f.name]: { contains: String(q.q), mode: 'insensitive' } })) } : {}, parseFilters(res, q)] };
    const rows = await delegateOf(prisma, res.key).findMany({ where, take: limit, orderBy: { updatedAt: 'desc' }, select: labelSelect(res) });
    return { data: rows.map((r: any) => ({ id: r.id, label: labelValue(res, r) })) };
  });

  app.get('/api/v1/r/:slug/export', { preHandler: authenticate, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'read');
    if (ctx.kind !== 'staff') throw forbidden();
    const q = req.query as any;
    const where = { AND: [scopeWhere(res, ctx), parseFilters(res, q), searchWhere(res, q.q) ?? {}] };
    const rows: any[] = await delegateOf(prisma, res.key).findMany({ where, take: 50000, orderBy: { createdAt: 'desc' }, include: includeRefs(res) });
    const cols = res.fields.filter((f) => !f.hidden && f.type !== 'json');
    const data = rows.map((r) => { const s = shape(res, r); return Object.fromEntries(cols.map((c) => [c.name, c.type === 'ref' ? s._refs[c.name]?.label ?? '' : s[c.name] instanceof Date ? s[c.name].toISOString() : s[c.name] ?? ''])); });
    await audit(prisma, ctx, res.key, undefined, 'export', undefined, { count: rows.length });
    if (q.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(res.en);
      ws.columns = cols.map((c) => ({ header: c.name, key: c.name, width: 18 }));
      ws.addRows(data);
      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').header('Content-Disposition', `attachment; filename="${res.slug}.xlsx"`);
      return reply.send(Buffer.from(await wb.xlsx.writeBuffer()));
    }
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${res.slug}.csv"`);
    return reply.send('﻿' + Papa.unparse(data));
  });

  app.get('/api/v1/r/:slug/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'read');
    const row = await delegateOf(prisma, res.key).findFirst({ where: { id: req.params.id, ...scopeWhere(res, ctx) }, include: includeRefs(res) });
    if (!row) throw notFound(res.en);
    const children: Record<string, any[]> = {};
    for (const c of res.children) {
      const cres = BY_KEY[c.key];
      const orderBy = cres.fields.some((f) => f.name === 'lineNo') ? { lineNo: 'asc' } : { createdAt: 'asc' };
      const rows = await delegateOf(prisma, c.key).findMany({ where: { [c.fk]: row.id }, orderBy, take: 500, include: includeRefs(cres) });
      children[c.key] = rows.map((r: any) => shape(cres, r));
    }
    return { data: { ...shape(res, row), _actions: availableActions(res, ctx, row), _children: children } };
  });

  app.get('/api/v1/r/:slug/:id/history', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'read');
    if (ctx.kind !== 'staff') throw forbidden();
    const rows = await prisma.auditLog.findMany({ where: { companyId: ctx.companyId, entity: res.key, entityId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 200 });
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId!).filter(Boolean))] } }, select: { id: true, name: true } });
    const nm = Object.fromEntries(users.map((u) => [u.id, u.name]));
    return { data: rows.map((r) => ({ ...r, userName: nm[r.userId ?? ''] ?? null })) };
  });

  app.post('/api/v1/r/:slug', { preHandler: authenticate }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'create');
    if ((res.sys || res.immutable) && !API_CREATE_IMMUTABLE.has(res.key)) throw forbidden(`${res.en} is system-managed`);
    if (ctx.kind !== 'staff') {
      const scope = portalScope(res, ctx);
      const parentFk = RESOURCES.find((p) => p.children.some((c) => c.key === res.key))?.children.find((c) => c.key === res.key)?.fk;
      if (!scope && !res.fields.some((f) => f.name === (ctx.kind === 'customer' ? 'customerId' : 'supplierId'))) throw forbidden();
      if (parentFk && req.body?.[parentFk]) {
        const parent = RESOURCES.find((p) => p.children.some((c) => c.key === res.key))!;
        const ok = await delegateOf(prisma, parent.key).findFirst({ where: { id: req.body[parentFk], ...scopeWhere(parent, ctx) }, select: { id: true } });
        if (!ok) throw forbidden();
      }
    }
    const row = await prisma.$transaction((tx) => createRow(tx, ctx, res, req.body), { timeout: 60000, maxWait: 10000 });
    reply.code(201);
    return { data: row };
  });

  app.patch('/api/v1/r/:slug/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'update');
    if (res.immutable || res.sys) throw forbidden(`${res.en} cannot be modified`);
    const scope = scopeWhere(res, ctx);
    const row = await prisma.$transaction((tx) => updateRow(tx, ctx, res, req.params.id, req.body, { scope }), { timeout: 60000, maxWait: 10000 });
    return { data: row };
  });

  app.delete('/api/v1/r/:slug/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    authorize(ctx, res, 'delete');
    const scope = scopeWhere(res, ctx);
    await prisma.$transaction((tx) => deleteRow(tx, ctx, res, req.params.id, { scope }));
    return { ok: true };
  });

  app.post('/api/v1/r/:slug/:id/actions/:action', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const res = getRes(req.params.slug);
    return runAction(ctx, res, req.params.id, req.params.action, req.body, scopeWhere(res, ctx));
  });
}
