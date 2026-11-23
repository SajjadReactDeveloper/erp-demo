import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@erp/db';
import { can } from '@erp/shared';
import { Ctx, audit, bad, conflict, forbidden, notFound } from '../core/base';
import { authenticate, dropUserCache } from '../core/auth-plugin';
import { eventCatalogue } from '../services/notify-rules';
import { runReportSchedule } from '../worker';

/** User & role administration: temp passwords, resets, activation and a validated permission model (PLT-01/02). */
const PERM = /^(\*|read:\*|mod:[a-z0-9-]+:[a-z0-9_*]+|res:[a-z0-9-]+:[a-z0-9_*]+|verb:[a-z0-9_]+)$/;
const isAdmin = (ctx: Ctx) => ctx.perms.includes('*');
const guard = (ctx: Ctx, slug: 'user' | 'role' | 'company' | 'report-schedule' | 'notification-rule', verb: 'read' | 'create' | 'update' | 'delete') => { if (ctx.kind !== 'staff' || !can(ctx.perms, { mod: 'platform', slug }, verb)) throw forbidden(); };
const tempPassword = () => randomBytes(9).toString('base64url');
const hasStar = (perms: any) => Array.isArray(perms) && perms.includes('*');

export function registerAdminRoutes(app: FastifyInstance) {
  // ---------- users ----------
  app.get('/api/v1/admin/users', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'user', 'read');
    const rows = await prisma.user.findMany({ where: { companyId: ctx.companyId, NOT: { email: { endsWith: '@system.local' } } }, include: { role: true, branch: true, customer: true, supplier: true }, orderBy: [{ kind: 'asc' }, { name: 'asc' }], take: 1000 });
    const data = rows.map((u: any) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, kind: u.kind, locale: u.locale, roleId: u.roleId, roleName: u.role?.name ?? null, branchId: u.branchId, branchName: u.branch?.name ?? null, customerId: u.customerId, customerName: u.customer?.name ?? null, supplierId: u.supplierId, supplierName: u.supplier?.name ?? null, isActive: u.isActive, mfaEnabled: u.mfaEnabled, ssoLinked: !!u.ssoSubject, hasPassword: !!u.passwordHash, locked: !!u.lockedUntil && u.lockedUntil > new Date(), lastLoginAt: u.lastLoginAt, createdAt: u.createdAt }));
    return { data, summary: { total: data.length, active: data.filter((u) => u.isActive).length, staff: data.filter((u) => u.kind === 'staff').length, customer: data.filter((u) => u.kind === 'customer').length, supplier: data.filter((u) => u.kind === 'supplier').length, mfa: data.filter((u) => u.mfaEnabled).length } };
  });

  const userBody = z.object({
    name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), phone: z.string().trim().max(40).optional().nullable(), kind: z.enum(['staff', 'customer', 'supplier']).default('staff'),
    roleId: z.string().optional().nullable(), branchId: z.string().optional().nullable(), locale: z.enum(['ar', 'en']).default('ar'), customerId: z.string().optional().nullable(), supplierId: z.string().optional().nullable(),
  });
  async function checkBranch(ctx: Ctx, branchId?: string | null) {
    if (branchId && !(await prisma.branch.findFirst({ where: { id: branchId, companyId: ctx.companyId } }))) throw bad('Branch not found', { branchId: ['Not found'] });
  }
  async function checkRole(ctx: Ctx, roleId?: string | null) {
    if (!roleId) return null;
    const role = await prisma.role.findFirst({ where: { id: roleId, companyId: ctx.companyId } }); if (!role) throw bad('Role not found');
    if (hasStar(role.permissions) && !isAdmin(ctx)) throw forbidden('Only an administrator can assign a role with full access');
    return role;
  }
  app.post('/api/v1/admin/users', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'user', 'create');
    const b = userBody.safeParse(req.body); if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    const d = b.data; const email = d.email.toLowerCase();
    if (await prisma.user.findFirst({ where: { email } })) throw conflict('A user with this email already exists', 'duplicate_email');
    if (d.kind === 'staff' && !d.roleId) throw bad('Choose a role for staff users', { roleId: ['Required'] });
    if (d.kind === 'customer' && !(d.customerId && (await prisma.customer.findFirst({ where: { id: d.customerId, companyId: ctx.companyId } })))) throw bad('Choose the customer this user belongs to', { customerId: ['Required'] });
    if (d.kind === 'supplier' && !(d.supplierId && (await prisma.supplier.findFirst({ where: { id: d.supplierId, companyId: ctx.companyId } })))) throw bad('Choose the supplier this user belongs to', { supplierId: ['Required'] });
    await checkRole(ctx, d.roleId); await checkBranch(ctx, d.branchId);
    let roleId = d.roleId ?? null;
    if (d.kind !== 'staff') { roleId = (await prisma.role.findFirst({ where: { companyId: ctx.companyId, name: d.kind === 'customer' ? 'customer' : 'supplier' } }))?.id ?? roleId; }
    const temp = tempPassword();
    const u = await prisma.user.create({ data: { companyId: ctx.companyId, email, name: d.name, phone: d.phone || null, kind: d.kind, roleId, branchId: d.branchId || null, locale: d.locale, customerId: d.kind === 'customer' ? d.customerId : null, supplierId: d.kind === 'supplier' ? d.supplierId : null, passwordHash: await bcrypt.hash(temp, 10), isActive: true, createdById: ctx.userId } as any });
    await audit(prisma, ctx, 'User', u.id, 'create', undefined, { email, kind: d.kind, roleId });
    return { data: { id: u.id }, tempPassword: temp, message: 'User created' };
  });

  app.patch('/api/v1/admin/users/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'user', 'update');
    const b = userBody.pick({ name: true, phone: true, roleId: true, branchId: true, locale: true }).partial().extend({ isActive: z.boolean().optional() }).safeParse(req.body); if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    const u: any = await prisma.user.findFirst({ where: { id: req.params.id, companyId: ctx.companyId }, include: { role: true } }); if (!u) throw notFound('User');
    const d = b.data;
    if (u.id === ctx.userId && (d.isActive === false || (d.roleId !== undefined && d.roleId !== u.roleId))) throw bad('You cannot deactivate yourself or change your own role');
    if (hasStar(u.role?.permissions) && !isAdmin(ctx)) throw forbidden('Only an administrator can change an administrator');
    if (d.roleId !== undefined) { if (u.kind !== 'staff') throw bad('Portal users have a fixed role'); if (!d.roleId) throw bad('Staff users need a role'); await checkRole(ctx, d.roleId); }
    await checkBranch(ctx, d.branchId);
    const losesAdmin = hasStar(u.role?.permissions) && (d.isActive === false || (d.roleId !== undefined && d.roleId !== u.roleId));
    if (losesAdmin) { const others = await prisma.user.count({ where: { companyId: ctx.companyId, isActive: true, id: { not: u.id }, role: { name: u.role.name } } }); if (!others) throw bad('There must be at least one active administrator'); }
    const data: any = {}; for (const k of ['name', 'phone', 'roleId', 'branchId', 'locale', 'isActive'] as const) if ((d as any)[k] !== undefined) data[k] = (d as any)[k] === '' ? null : (d as any)[k];
    const row = await prisma.user.update({ where: { id: u.id }, data });
    dropUserCache(u.id);
    await audit(prisma, ctx, 'User', u.id, 'update', { name: u.name, roleId: u.roleId, isActive: u.isActive }, data);
    return { data: { id: row.id } };
  });

  const act = (path: string, fn: (u: any, ctx: Ctx) => Promise<{ data?: any; message: string; extra?: any }>, adminOnly = false) => app.post(`/api/v1/admin/users/:id/${path}`, { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'user', 'update');
    const u: any = await prisma.user.findFirst({ where: { id: req.params.id, companyId: ctx.companyId }, include: { role: true } }); if (!u) throw notFound('User');
    if (adminOnly && !isAdmin(ctx)) throw forbidden();
    if (hasStar(u.role?.permissions) && !isAdmin(ctx)) throw forbidden('Only an administrator can change an administrator');
    const r = await fn(u, ctx); dropUserCache(u.id); await audit(prisma, ctx, 'User', u.id, 'action', undefined, { action: path });
    return { ...(r.extra ?? {}), message: r.message };
  });
  act('reset-password', async (u) => { const temp = tempPassword(); await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(temp, 10), failedLogins: 0, lockedUntil: null } }); return { message: 'Password reset', extra: { tempPassword: temp } }; });
  act('unlock', async (u) => { await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null } }); return { message: 'Account unlocked' }; });
  act('reset-mfa', async (u) => { await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: false, mfaSecret: null } }); return { message: 'Two-factor authentication reset' }; });
  act('unlink-sso', async (u) => { await prisma.user.update({ where: { id: u.id }, data: { ssoSubject: null } }); return { message: 'SSO identity unlinked. The next SSO sign-in will link again.' }; });

  // ---------- roles ----------
  app.get('/api/v1/admin/roles', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'role', 'read');
    const [roles, counts] = await Promise.all([prisma.role.findMany({ where: { companyId: ctx.companyId }, orderBy: [{ isSystem: 'desc' }, { name: 'asc' }] }), prisma.user.groupBy({ by: ['roleId'], where: { companyId: ctx.companyId, isActive: true }, _count: true })]);
    return { data: roles.map((r: any) => ({ id: r.id, name: r.name, description: r.description, permissions: r.permissions ?? [], isSystem: r.isSystem, users: counts.find((c: any) => c.roleId === r.id)?._count ?? 0 })) };
  });
  const roleBody = z.object({ name: z.string().trim().min(2).max(60).regex(/^[a-z0-9_-]+$/i, 'Use letters, numbers, - or _'), description: z.string().trim().max(300).optional().nullable(), permissions: z.array(z.string().regex(PERM, 'Invalid permission')).max(2000) });
  app.post('/api/v1/admin/roles', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'role', 'create'); if (!isAdmin(ctx)) throw forbidden('Only an administrator can manage roles');
    const b = roleBody.safeParse(req.body); if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    if (await prisma.role.findFirst({ where: { companyId: ctx.companyId, name: b.data.name } })) throw conflict('A role with this name already exists', 'duplicate_role');
    const r = await prisma.role.create({ data: { companyId: ctx.companyId, name: b.data.name, description: b.data.description || null, permissions: [...new Set(b.data.permissions)], isSystem: false } as any });
    await audit(prisma, ctx, 'Role', r.id, 'create', undefined, { name: r.name, permissions: b.data.permissions.length });
    return { data: { id: r.id } };
  });
  app.patch('/api/v1/admin/roles/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'role', 'update'); if (!isAdmin(ctx)) throw forbidden('Only an administrator can manage roles');
    const r: any = await prisma.role.findFirst({ where: { id: req.params.id, companyId: ctx.companyId } }); if (!r) throw notFound('Role');
    const b = roleBody.partial().safeParse(req.body); if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    if (r.isSystem && (b.data.permissions || (b.data.name && b.data.name !== r.name))) throw bad('Built-in roles cannot be renamed or have their permissions changed. Duplicate the role to customise it.');
    const data: any = {}; if (b.data.description !== undefined) data.description = b.data.description || null; if (b.data.name) data.name = b.data.name; if (b.data.permissions) data.permissions = [...new Set(b.data.permissions)];
    await prisma.role.update({ where: { id: r.id }, data }); dropUserCache();
    await audit(prisma, ctx, 'Role', r.id, 'update', { permissions: (r.permissions ?? []).length }, { permissions: data.permissions?.length, name: data.name });
    return { data: { id: r.id } };
  });
  app.delete('/api/v1/admin/roles/:id', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'role', 'delete'); if (!isAdmin(ctx)) throw forbidden('Only an administrator can manage roles');
    const r: any = await prisma.role.findFirst({ where: { id: req.params.id, companyId: ctx.companyId } }); if (!r) throw notFound('Role');
    if (r.isSystem) throw bad('Built-in roles cannot be deleted');
    if (await prisma.user.count({ where: { roleId: r.id } })) throw conflict('This role still has users. Move them to another role first.', 'role_in_use');
    await prisma.role.delete({ where: { id: r.id } }); await audit(prisma, ctx, 'Role', r.id, 'delete', { name: r.name });
    return { ok: true };
  });

  // ---------- notification rules / report schedules / company profile ----------
  app.get('/api/v1/admin/event-catalogue', { preHandler: authenticate }, async (req: any) => { guard(req.ctx, 'notification-rule', 'read'); return { data: eventCatalogue() }; });
  app.post('/api/v1/admin/report-schedules/:id/run', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'report-schedule', 'update');
    const sch = await prisma.reportSchedule.findFirst({ where: { id: req.params.id, companyId: ctx.companyId } }); if (!sch) throw notFound('Schedule');
    if (!((sch.recipients as any[]) ?? []).length) throw bad('Add at least one recipient first');
    const r = await runReportSchedule(sch as any).catch((e: any) => { throw forbidden(String(e.message).slice(0, 200)); }); await audit(prisma, ctx, 'ReportSchedule', sch.id, 'action', undefined, { action: 'run-now', ...r });
    return { ...r, message: r.failed ? `Sent to ${r.sent}, ${r.failed} failed` : `Sent to ${r.sent} recipient(s)` };
  });
  const companyBody = z.object({ name: z.string().trim().min(2).max(160), nameAr: z.string().trim().max(160).optional().nullable(), vatNumber: z.string().trim().max(30).optional().nullable(), crNumber: z.string().trim().max(30).optional().nullable(), address: z.string().trim().max(300).optional().nullable(), city: z.string().trim().max(80).optional().nullable(), phone: z.string().trim().max(40).optional().nullable(), email: z.string().trim().email().max(200).optional().nullable().or(z.literal('')), currency: z.string().trim().length(3).optional(), logoUrl: z.string().trim().max(500).regex(/^(https:\/\/|\/(?!\/))/, 'Use an https:// address or a /path').optional().nullable().or(z.literal('')), defaultLocale: z.enum(['ar', 'en']).optional(), hijriDates: z.boolean().optional(), primaryColor: z.string().trim().regex(/^#[0-9a-f]{6}$/i, 'Use a colour like #0B1F3A').optional().nullable().or(z.literal('')) });
  app.get('/api/v1/admin/company', { preHandler: authenticate }, async (req: any) => { const ctx: Ctx = req.ctx; guard(ctx, 'company', 'read'); const c = await prisma.company.findUnique({ where: { id: ctx.companyId } }); if (!c) throw notFound('Company'); return { data: c }; });
  app.patch('/api/v1/admin/company', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; guard(ctx, 'company', 'update');
    const b = companyBody.partial().safeParse(req.body); if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    const data: any = Object.fromEntries(Object.entries(b.data).map(([k, v]) => [k, v === '' ? null : v]));
    if (data.name === null) delete data.name; if (data.currency === null) delete data.currency;
    const before = await prisma.company.findUnique({ where: { id: ctx.companyId } });
    const c = await prisma.company.update({ where: { id: ctx.companyId }, data }); await audit(prisma, ctx, 'Company', c.id, 'update', before, data);
    return { data: c };
  });
}
