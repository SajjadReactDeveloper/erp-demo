'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Languages } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Field, Icon, Input, Spinner } from '@/components/ui';

const DEMO = [['gm@autocquick.test', 'General manager'], ['sales@autocquick.test', 'Sales'], ['purchasing@autocquick.test', 'Purchasing'], ['finance@autocquick.test', 'Finance'], ['warehouse@autocquick.test', 'Warehouse'], ['customer@alnoor.test', 'Customer portal'], ['supplier@riyadhparts.test', 'Supplier portal']];

function LoginForm() {
  const { t, lang, setLang } = useT(); const { login, me, ready } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [code, setCode] = useState(''); const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string>(); const [sso, setSso] = useState<string[]>([]);
  const home = (kind: string) => (kind === 'customer' ? '/portal' : kind === 'supplier' ? '/supplier' : '/app');
  useEffect(() => { if (ready && me) router.replace(sp.get('next') && sp.get('next')!.startsWith('/') ? sp.get('next')! : home(me.kind)); /* eslint-disable-next-line */ }, [ready, me]);
  useEffect(() => { api<{ providers: string[] }>('/api/v1/auth/sso/providers', { auth: false }).then((r) => setSso(r.providers)).catch(() => null); }, []);
  const reason = sp.get('reason');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(undefined);
    try {
      const r: any = mfaToken ? await api('/api/v1/auth/mfa/verify', { method: 'POST', body: { mfaToken, code }, auth: false }) : await api('/api/v1/auth/login', { method: 'POST', body: { email, password }, auth: false });
      if (r.mfaRequired) { setMfaToken(r.mfaToken); setBusy(false); return; }
      await login(r.token);
    } catch (err) { setError(err instanceof ApiError ? err.message : t('Something went wrong')); setBusy(false); }
  };
  const ssoStart = async (p: string) => { try { const r = await api<{ url: string }>(`/api/v1/auth/sso/${p}/start`, { auth: false }); location.href = r.url; } catch (e: any) { setError(e.message); } };
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-primary p-12 text-primary-fg lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -start-32 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" /><div className="absolute -bottom-24 -end-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15"><Icon name="cog" size={24} /></span><b className="text-lg">AutocQuick</b></div>
        <div className="relative max-w-md"><h1 className="text-4xl font-extrabold leading-tight">{lang === 'ar' ? 'من طلب القطعة إلى التحصيل، في منصة واحدة.' : 'From part request to cash collected, on one platform.'}</h1><p className="mt-4 text-primary-fg/80">{lang === 'ar' ? 'مقارنة عروض الموردين، التحكم بالهامش، الائتمان، الفوترة الإلكترونية، والتوصيل بتوقيع العميل.' : 'Compare supplier quotes, protect margins, control credit, e-invoice with ZATCA, and deliver with customer signature.'}</p></div>
        <p className="relative text-xs text-primary-fg/60">© {new Date().getFullYear()} AutocQuick</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-in">
          <div className="mb-8 flex items-center justify-between"><div><h2 className="text-2xl font-extrabold">{mfaToken ? t('Verification code') : t('Welcome back')}</h2><p className="mt-1 text-sm text-muted">{mfaToken ? t('Enter the 6-digit code from your authenticator app.') : t('Sign in to continue')}</p></div><Button variant="ghost" size="sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={16} />{lang === 'ar' ? 'EN' : 'عربي'}</Button></div>
          {reason === 'session_timeout' && <p className="mb-4 rounded-xl bg-warn/10 p-3 text-sm text-warn">{t('You were signed out after a period of inactivity.')}</p>}
          <form onSubmit={submit} className="space-y-4" noValidate>
            {mfaToken ? <Field label={t('Verification code')}><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus dir="ltr" className="text-center text-xl tracking-[0.5em]" placeholder="000000" /></Field>
              : <><Field label={t('Email')}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" autoFocus required dir="ltr" /></Field><Field label={t('Password')}><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required dir="ltr" /></Field></>}
            {error && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{error}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={mfaToken ? code.length !== 6 : !email || !password}>{mfaToken ? t('Verify') : t('Sign in')}</Button>
            {mfaToken && <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => { setMfaToken(null); setCode(''); }}>{t('Back')}</button>}
          </form>
          {sso.length > 0 && !mfaToken && <div className="mt-5 space-y-2"><p className="text-center text-xs text-muted">{t('or continue with')}</p>{sso.map((p) => <Button key={p} variant="secondary" className="w-full" onClick={() => ssoStart(p)}>{p === 'google' ? 'Google' : 'Microsoft'}</Button>)}</div>}
          {!mfaToken && <p className="mt-6 text-center text-sm text-muted">{t('New customer?')} <Link href="/register" className="font-semibold text-primary hover:underline">{t('Register your company')}</Link> · <Link href="/vendor" className="font-semibold text-primary hover:underline">{t('Become a supplier')}</Link></p>}
          {process.env.NODE_ENV !== 'production' && !mfaToken && (
            <details className="mt-6 rounded-xl border border-dashed border-line p-3 text-xs"><summary className="cursor-pointer font-semibold text-muted">Demo accounts (dev only)</summary><div className="mt-2 flex flex-wrap gap-1.5">{DEMO.map(([e, l]) => <button key={e} type="button" onClick={() => { setEmail(e); setPassword('Passw0rd!2026'); }} className="rounded-full bg-line/70 px-2.5 py-1 hover:bg-line">{l}</button>)}</div></details>
          )}
        </div>
      </section>
    </main>
  );
}
export default function LoginPage() { return <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>}><LoginForm /></Suspense>; }
