import jwt from 'jsonwebtoken';
import { prisma } from '@erp/db';
import { Ctx, HttpError, getSetting } from './base';

export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-only-change-me-please-32chars-min';

const userCache = new Map<string, { at: number; v: any }>();
const lastSeen = new Map<string, number>();
export const dropUserCache = (id?: string) => (id ? userCache.delete(id) : userCache.clear());

export function signToken(u: { id: string; companyId: string; kind: string }, ttl = '12h', type = 'access') {
  return jwt.sign({ sub: u.id, cid: u.companyId, kind: u.kind, typ: type }, JWT_SECRET, { expiresIn: ttl } as any);
}

export async function loadCtx(userId: string): Promise<Ctx | null> {
  let c = userCache.get(userId);
  if (!c || Date.now() - c.at > 20000) {
    const u = await prisma.user.findUnique({ where: { id: userId }, include: { role: true } });
    c = { at: Date.now(), v: u };
    userCache.set(userId, c);
  }
  const u = c.v;
  if (!u || !u.isActive) return null;
  const perms = [...(((u.role?.permissions as any) ?? []) as string[]), ...(((u.permissionsExtra as any) ?? []) as string[])];
  return { userId: u.id, companyId: u.companyId, role: u.role?.name ?? 'none', perms, kind: u.kind as any, customerId: u.customerId, supplierId: u.supplierId, branchId: u.branchId, locale: (u.locale as any) ?? 'ar', name: u.name };
}

export async function authenticate(req: any) {
  const h = req.headers.authorization as string | undefined;
  const token = h?.startsWith('Bearer ') ? h.slice(7) : (req.query as any)?.access_token;
  if (!token) throw new HttpError(401, 'unauthenticated', 'Sign in required');
  let payload: any;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new HttpError(401, 'invalid_token', 'Your session has expired. Please sign in again.');
  }
  if (payload.typ !== 'access') throw new HttpError(401, 'invalid_token', 'Invalid token');
  const ctx = await loadCtx(payload.sub);
  if (!ctx) throw new HttpError(401, 'invalid_token', 'Account is disabled');
  // idle session timeout (PLT-02)
  const idleMin = await getSetting<number>(ctx.companyId, 'security.idle_timeout_min', 120);
  const key = `${payload.sub}:${payload.iat}`;
  const seen = lastSeen.get(key);
  if (seen && Date.now() - seen > idleMin * 60000) {
    lastSeen.delete(key);
    throw new HttpError(401, 'session_timeout', 'Session timed out due to inactivity');
  }
  lastSeen.set(key, Date.now());
  req.ctx = { ...ctx, ip: req.ip, requestId: req.id } as Ctx;
}
