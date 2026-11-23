'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { can as canPerm, PORTAL_WRITE, BY_KEY, type ResourceDef } from '@erp/shared';
import { api, getToken, setToken } from './api';

export interface Me { id: string; email: string; name: string; kind: 'staff' | 'customer' | 'supplier'; locale: 'ar' | 'en'; role: string; permissions: string[]; mfaEnabled: boolean; customerId?: string; supplierId?: string }
export interface Company { id: string; name: string; nameAr?: string; currency: string; defaultLocale: string; logoUrl?: string; primaryColor?: string }
interface AuthCtx { me: Me | null; company: Company | null; ready: boolean; can: (res: ResourceDef | { mod: string; slug: string }, verb?: string) => boolean; hasPerm: (p: string) => boolean; login: (token: string) => Promise<void>; logout: () => void; refresh: () => Promise<void> }
const A = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    if (!getToken()) { setMe(null); setReady(true); return; }
    try { const r = await api<{ user: Me; company: Company }>('/api/v1/auth/me'); setMe(r.user); setCompany(r.company); } catch { setMe(null); } finally { setReady(true); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  const login = useCallback(async (token: string) => { setToken(token); setReady(false); await refresh(); }, [refresh]);
  const logout = useCallback(() => { api('/api/v1/auth/logout', { method: 'POST' }).catch(() => null); setToken(null); setMe(null); location.href = '/login'; }, []);
  const hasPerm = useCallback((p: string) => !!me?.permissions.includes('*') || !!me?.permissions.includes(p), [me]);
  const can = useCallback((r: { mod: string; slug: string }, verb = 'read') => { if (!me) return false; if (me.kind === 'staff') return canPerm(me.permissions, { mod: r.mod, slug: r.slug }, verb); const res = Object.values(BY_KEY).find((x) => x.slug === r.slug); if (verb === 'read') return !!res && res.portal === me.kind; return !!(PORTAL_WRITE[me.kind] as any)[r.slug]?.includes(verb); }, [me]);
  return <A.Provider value={{ me, company, ready, can, hasPerm, login, logout, refresh }}>{children}</A.Provider>;
}
export const useAuth = () => { const c = useContext(A); if (!c) throw new Error('AuthProvider missing'); return c; };

/** Redirects to /login when signed out, and to the right home when the account kind does not match. */
export function useRequireAuth(kind?: 'staff' | 'customer' | 'supplier') {
  const a = useAuth(); const router = useRouter();
  useEffect(() => {
    if (!a.ready) return;
    if (!a.me) { router.replace(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
    if (kind && a.me.kind !== kind) router.replace(a.me.kind === 'customer' ? '/portal' : a.me.kind === 'supplier' ? '/supplier' : '/app');
  }, [a.ready, a.me, kind, router]);
  return a;
}
