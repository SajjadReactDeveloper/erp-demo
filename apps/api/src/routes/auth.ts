import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { prisma } from '@erp/db';
import { HttpError, audit, bad, emit, forbidden, notifyRole } from '../core/base';
import { authenticate, dropUserCache, signToken, JWT_SECRET } from '../core/auth-plugin';
import jwt from 'jsonwebtoken';

const MFA_REQUIRED_ROLES = ['admin', 'finance', 'manager'];
const pub = (u: any) => ({ id: u.id, email: u.email, name: u.name, kind: u.kind, locale: u.locale, role: u.role?.name, mfaEnabled: u.mfaEnabled, customerId: u.customerId, supplierId: u.supplierId });

async function issue(u: any) {
  const full = await prisma.user.findUnique({ where: { id: u.id }, include: { role: true } });
  return { token: signToken(u), user: { ...pub(full), permissions: [...(((full!.role?.permissions as any) ?? []) as string[]), ...(((full!.permissionsExtra as any) ?? []) as string[])], mfaSetupRequired: !full!.mfaEnabled && MFA_REQUIRED_ROLES.includes(full!.role?.name ?? '') } };
}

export function registerAuth(app: FastifyInstance) {
  const strict = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  app.post('/api/v1/auth/login', strict, async (req: any) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
    if (!body.success) throw bad('Email and password are required');
    const u = await prisma.user.findFirst({ where: { email: body.data.email.toLowerCase() }, include: { role: true } });
    const fail = () => new HttpError(401, 'invalid_credentials', 'Incorrect email or password');
    if (!u || !u.passwordHash || !u.isActive) throw fail();
    if (u.lockedUntil && u.lockedUntil > new Date()) throw new HttpError(423, 'locked', `Account locked. Try again after ${u.lockedUntil.toISOString()}`);
    if (!(await bcrypt.compare(body.data.password, u.passwordHash))) {
      const n = u.failedLogins + 1;
      await prisma.user.update({ where: { id: u.id }, data: { failedLogins: n, lockedUntil: n >= 5 ? new Date(Date.now() + 15 * 60000) : null } });
      await audit(prisma, { companyId: u.companyId, userId: u.id, ip: req.ip }, 'User', u.id, 'deny', undefined, { reason: 'bad password' });
      throw fail();
    }
    await prisma.user.update({ where: { id: u.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    if (u.mfaEnabled) return { mfaRequired: true, mfaToken: signToken(u, '5m', 'mfa') };
    await audit(prisma, { companyId: u.companyId, userId: u.id, ip: req.ip }, 'User', u.id, 'login');
    return issue(u);
  });

  app.post('/api/v1/auth/mfa/verify', strict, async (req: any) => {
    const { mfaToken, code } = req.body ?? {};
    let p: any;
    try { p = jwt.verify(mfaToken, JWT_SECRET); } catch { throw new HttpError(401, 'invalid_token', 'MFA step expired, sign in again'); }
    if (p.typ !== 'mfa') throw new HttpError(401, 'invalid_token', 'Invalid token');
    const u = await prisma.user.findUnique({ where: { id: p.sub } });
    if (!u?.mfaSecret || !authenticator.check(String(code ?? ''), u.mfaSecret)) throw new HttpError(401, 'invalid_code', 'Incorrect verification code');
    await audit(prisma, { companyId: u.companyId, userId: u.id, ip: req.ip }, 'User', u.id, 'login', undefined, { mfa: true });
    return issue(u);
  });

  app.get('/api/v1/auth/me', { preHandler: authenticate }, async (req: any) => {
    const u = await prisma.user.findUnique({ where: { id: req.ctx.userId }, include: { role: true } });
    const company = await prisma.company.findUnique({ where: { id: req.ctx.companyId } });
    return { user: { ...pub(u), permissions: req.ctx.perms }, company: company && { id: company.id, name: company.name, nameAr: company.nameAr, currency: company.currency, defaultLocale: company.defaultLocale, logoUrl: company.logoUrl, primaryColor: company.primaryColor } };
  });

  app.post('/api/v1/auth/logout', { preHandler: authenticate }, async (req: any) => {
    await audit(prisma, req.ctx, 'User', req.ctx.userId, 'logout');
    return { ok: true };
  });

  app.patch('/api/v1/auth/preferences', { preHandler: authenticate }, async (req: any) => {
    const locale = z.enum(['ar', 'en']).parse(req.body?.locale);
    await prisma.user.update({ where: { id: req.ctx.userId }, data: { locale } });
    dropUserCache(req.ctx.userId);
    return { ok: true };
  });

  app.post('/api/v1/auth/change-password', { preHandler: authenticate, ...strict }, async (req: any) => {
    const { current, next } = req.body ?? {};
    if (!next || String(next).length < 10) throw bad('New password must be at least 10 characters');
    const u = await prisma.user.findUnique({ where: { id: req.ctx.userId } });
    if (!u?.passwordHash || !(await bcrypt.compare(String(current ?? ''), u.passwordHash))) throw new HttpError(401, 'invalid_credentials', 'Current password is incorrect');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(String(next), 10) } });
    await audit(prisma, req.ctx, 'User', u.id, 'update', undefined, { passwordChanged: true });
    return { ok: true };
  });

  // --- MFA (TOTP) setup ---
  app.post('/api/v1/auth/mfa/setup', { preHandler: authenticate }, async (req: any) => {
    const secret = authenticator.generateSecret();
    const u = await prisma.user.update({ where: { id: req.ctx.userId }, data: { mfaSecret: secret, mfaEnabled: false } });
    return { secret, otpauthUrl: authenticator.keyuri(u.email, 'AutocQuick ERP', secret) };
  });
  app.post('/api/v1/auth/mfa/enable', { preHandler: authenticate }, async (req: any) => {
    const u = await prisma.user.findUnique({ where: { id: req.ctx.userId } });
    if (!u?.mfaSecret || !authenticator.check(String(req.body?.code ?? ''), u.mfaSecret)) throw new HttpError(400, 'invalid_code', 'Incorrect verification code');
    await prisma.user.update({ where: { id: u.id }, data: { mfaEnabled: true } });
    await audit(prisma, req.ctx, 'User', u.id, 'update', undefined, { mfaEnabled: true });
    dropUserCache(u.id);
    return { ok: true };
  });
  app.post('/api/v1/auth/mfa/disable', { preHandler: authenticate }, async (req: any) => {
    if (MFA_REQUIRED_ROLES.includes(req.ctx.role)) throw forbidden('MFA is mandatory for your role');
    await prisma.user.update({ where: { id: req.ctx.userId }, data: { mfaEnabled: false, mfaSecret: null } });
    dropUserCache(req.ctx.userId);
    return { ok: true };
  });

  // --- SSO (OIDC authorisation-code flow; Microsoft / Google). Enabled when OIDC_<PROVIDER>_CLIENT_ID is set. ---
  const providers: Record<string, { issuer: string; env: string }> = {
    google: { issuer: 'https://accounts.google.com', env: 'GOOGLE' },
    microsoft: { issuer: 'https://login.microsoftonline.com/common/v2.0', env: 'MICROSOFT' },
  };
  app.get('/api/v1/auth/sso/providers', async () => ({ providers: Object.entries(providers).filter(([, p]) => process.env[`OIDC_${p.env}_CLIENT_ID`]).map(([k]) => k) }));
  app.get('/api/v1/auth/sso/:provider/start', async (req: any) => {
    const p = providers[req.params.provider];
    if (!p || !process.env[`OIDC_${p.env}_CLIENT_ID`]) throw new HttpError(501, 'sso_not_configured', 'SSO is not configured for this provider');
    const cfg: any = await (await fetch(`${p.issuer}/.well-known/openid-configuration`)).json();
    const redirect = `${process.env.WEB_ORIGIN}/auth/sso/${req.params.provider}`;
    const state = signToken({ id: 'sso', companyId: '', kind: 'sso' }, '10m', 'sso');
    const url = `${cfg.authorization_endpoint}?${new URLSearchParams({ client_id: process.env[`OIDC_${p.env}_CLIENT_ID`]!, response_type: 'code', scope: 'openid email profile', redirect_uri: redirect, state })}`;
    return { url };
  });
  app.post('/api/v1/auth/sso/:provider/callback', strict, async (req: any) => {
    const p = providers[req.params.provider];
    if (!p || !process.env[`OIDC_${p.env}_CLIENT_ID`]) throw new HttpError(501, 'sso_not_configured', 'SSO is not configured for this provider');
    const { code, state } = req.body ?? {};
    try { if ((jwt.verify(state, JWT_SECRET) as any).typ !== 'sso') throw 0; } catch { throw new HttpError(400, 'bad_state', 'Invalid SSO state'); }
    const cfg: any = await (await fetch(`${p.issuer}/.well-known/openid-configuration`)).json();
    const tok: any = await (await fetch(cfg.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, client_id: process.env[`OIDC_${p.env}_CLIENT_ID`]!, client_secret: process.env[`OIDC_${p.env}_CLIENT_SECRET`] ?? '', redirect_uri: `${process.env.WEB_ORIGIN}/auth/sso/${req.params.provider}` }) })).json();
    const claims: any = jwt.decode(tok.id_token);
    const u = claims?.email ? await prisma.user.findFirst({ where: { email: String(claims.email).toLowerCase(), kind: 'staff', isActive: true } }) : null;
    if (!u) throw new HttpError(403, 'no_account', 'No ERP account is linked to this identity. Ask an administrator.');
    await audit(prisma, { companyId: u.companyId, userId: u.id, ip: req.ip }, 'User', u.id, 'login', undefined, { sso: req.params.provider });
    return issue(u);
  });

  // --- Public portal self-registration (CRM-06): creates an application, never an account ---
  app.post('/api/v1/public/customer-applications', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req: any, reply) => {
    const b = z.object({ companyName: z.string().min(2).max(200), contactName: z.string().min(2).max(200), email: z.string().email(), phone: z.string().max(40).optional(), vatNumber: z.string().max(30).optional(), crNumber: z.string().max(30).optional(), documents: z.any().optional() }).safeParse(req.body);
    if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    const company = await prisma.company.findFirst();
    if (!company) throw new HttpError(503, 'not_ready', 'System is not configured');
    const row = await prisma.customerApplication.create({ data: { ...b.data, email: b.data.email.toLowerCase(), companyId: company.id } as any });
    await prisma.$transaction(async (tx) => { await notifyRole(tx, company.id, 'sales', { title: `New customer application: ${b.data.companyName}`, link: `/app/customer-application/${row.id}`, type: 'crm' }); await emit(tx, company.id, 'CustomerApplication.created', { id: row.id }); });
    reply.code(201);
    return { ok: true, id: row.id };
  });

  app.post('/api/v1/public/vendor-applications', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (req: any, reply) => {
    const b = z.object({ companyName: z.string().min(2).max(200), contactName: z.string().min(2).max(200), email: z.string().email(), phone: z.string().max(40).optional(), vatNumber: z.string().max(30).optional(), crNumber: z.string().max(30).optional(), brands: z.array(z.string()).optional(), categories: z.array(z.string()).optional() }).safeParse(req.body);
    if (!b.success) throw bad('Please check the form', b.error.flatten().fieldErrors);
    const company = await prisma.company.findFirst();
    if (!company) throw new HttpError(503, 'not_ready', 'System is not configured');
    const row = await prisma.vendorApplication.create({ data: { ...b.data, email: b.data.email.toLowerCase(), companyId: company.id } as any });
    await prisma.$transaction((tx) => notifyRole(tx, company.id, 'purchasing', { title: `New vendor application: ${b.data.companyName}`, link: `/app/vendor-application/${row.id}`, type: 'procurement' }));
    reply.code(201);
    return { ok: true, id: row.id };
  });
}
