'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowUpRight, Building2, CheckCircle2, Eye, EyeOff, Globe, ShieldCheck, Store, Truck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Field, Input, Spinner } from '@/components/ui';
import { BrandLogo } from '@/components/ui/brand';

const DEMO = [
  ['gm@autocquick.test', 'General manager'],
  ['sales@autocquick.test', 'Sales'],
  ['purchasing@autocquick.test', 'Purchasing'],
  ['finance@autocquick.test', 'Finance'],
  ['warehouse@autocquick.test', 'Warehouse'],
  ['customer@alnoor.test', 'Customer portal'],
  ['supplier@riyadhparts.test', 'Supplier portal'],
];

function LoginForm() {
  const { t, lang, setLang } = useT();
  const { login, me, ready } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sso, setSso] = useState<string[]>([]);
  const home = (kind: string) => (kind === 'customer' ? '/portal' : kind === 'supplier' ? '/supplier' : '/app');

  useEffect(() => {
    if (ready && me) { const nx = sp.get('next'); /* same-origin paths only: reject '//host' and '/\host' */ router.replace(nx && nx.startsWith('/') && !nx.startsWith('//') && !nx.startsWith('/\\') ? nx : home(me.kind)); }
    // eslint-disable-next-line
  }, [ready, me]);

  useEffect(() => {
    api<{ providers: string[] }>('/api/v1/auth/sso/providers', { auth: false })
      .then((r) => setSso(r.providers))
      .catch(() => null);
  }, []);

  const reason = sp.get('reason');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r: any = mfaToken
        ? await api('/api/v1/auth/mfa/verify', { method: 'POST', body: { mfaToken, code }, auth: false })
        : await api('/api/v1/auth/login', { method: 'POST', body: { email, password }, auth: false });
      if (r.mfaRequired) {
        setMfaToken(r.mfaToken);
        setBusy(false);
        return;
      }
      await login(r.token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('Something went wrong'));
      setBusy(false);
    }
  };

  const ssoStart = async (p: string) => {
    try {
      const r = await api<{ url: string }>(`/api/v1/auth/sso/${p}/start`, { auth: false });
      location.href = r.url;
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left luxury Navy & Gold editorial visual panel */}
      <section className="relative hidden overflow-hidden bg-[#08162B] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-85"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#08162B]/90 via-[#0B1F3A]/45 to-[#08162B]/95" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B]/75 via-transparent to-[#08162B]/35 rtl:bg-gradient-to-l" />

        {/* Top custom brand logo */}
        <div className="relative z-10 flex items-center justify-between">
          <BrandLogo size={42} subtitle={lang === 'ar' ? 'نظام إدارة قطع الغيار' : 'AUTO PARTS ERP'} dark />
          <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-[#0B1F3A]/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
            <ShieldCheck size={12} />
            <span>{lang === 'ar' ? 'متوافق مع زاتكا' : 'ZATCA Phase 2'}</span>
          </span>
        </div>

        {/* Bottom value prop & highlights */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              {lang === 'ar' ? 'التوريد · الائتمان · التوصيل' : 'SOURCING · CREDIT · DELIVERY'}
            </p>
            <h1 className="mt-2.5 text-[34px] font-extrabold leading-[1.15] tracking-tight xl:text-[38px]">
              {lang === 'ar'
                ? 'من طلب القطعة إلى التحصيل، في منصة واحدة.'
                : 'From part request to cash collected, on one platform.'}
            </h1>
            <p className="mt-3 text-body leading-relaxed text-onnavy-secondary">
              {lang === 'ar'
                ? 'مقارنة عروض الموردين، التحكم بالهامش، الائتمان، الفوترة الإلكترونية، والتوصيل بتوقيع العميل.'
                : 'Compare supplier quotes, protect margins, control credit, e-invoice with ZATCA, and deliver with customer signature.'}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 border-t border-white/15 pt-5">
            {[
              [CheckCircle2, lang === 'ar' ? 'مقارنة العروض' : 'RFQ & margins', lang === 'ar' ? 'اعتماد فوري للهامش' : 'Instant quote control'],
              [ShieldCheck, lang === 'ar' ? 'فوترة زاتكا' : 'ZATCA e-invoice', lang === 'ar' ? 'ربط مباشر للمرحلة ٢' : 'Cleared tax invoices'],
              [Truck, lang === 'ar' ? 'تتبع التوصيل' : 'Live logistics', lang === 'ar' ? 'إثبات تسليم رقمي' : 'Signed proof of delivery'],
            ].map(([IconCmp, heading, sub]: any) => (
              <div key={heading} className="rounded-md border border-white/10 bg-[#0B1F3A]/65 p-3 backdrop-blur-sm">
                <IconCmp size={15} className="text-gold" />
                <p className="mt-2 text-caption font-bold text-white">{heading}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-onnavy-muted">{sub}</p>
              </div>
            ))}
          </div>

          <p className="text-caption text-onnavy-muted/80">© {new Date().getFullYear()} AutocQuick</p>
        </div>
      </section>

      {/* Right authentication panel */}
      <section className="flex flex-col justify-between bg-bg p-6 sm:p-10">
        {/* Top bar with mobile logo + language switcher */}
        <div className="flex items-center justify-between">
          <div className="lg:hidden">
            <BrandLogo size={36} subtitle={lang === 'ar' ? 'نظام ERP' : 'ERP PLATFORM'} dark={false} />
          </div>
          <div className="ms-auto">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="gap-1.5 !h-9 !px-3 !font-medium"
            >
              <Globe size={14} className="text-muted" />
              <span
                lang={lang === 'ar' ? 'en' : 'ar'}
                dir={lang === 'ar' ? 'ltr' : 'rtl'}
                className={lang === 'ar' ? 'font-sans text-[13px] leading-none' : 'font-arabic pb-[1px] text-[13px] leading-none'}
              >
                {lang === 'ar' ? 'English' : 'العربية'}
              </span>
            </Button>
          </div>
        </div>

        {/* Centered form card */}
        <div className="mx-auto my-auto w-full max-w-[400px] py-8 animate-in">
          <div className="rounded-2xl border border-line bg-card p-6 shadow-card sm:p-8">
            <div className="mb-6">
              <h2 className="text-[22px] font-extrabold tracking-tight text-fg">
                {mfaToken ? t('Verification code') : t('Welcome back')}
              </h2>
              <p className="mt-1 text-small text-muted">
                {mfaToken ? t('Enter the 6-digit code from your authenticator app.') : t('Sign in to continue')}
              </p>
            </div>

            {reason === 'session_timeout' && (
              <p className="mb-4 rounded-md border border-warn/25 bg-warn-bg p-3 text-small text-warn">
                {t('You were signed out after a period of inactivity.')}
              </p>
            )}

            <form onSubmit={submit} className="space-y-4" noValidate>
              {mfaToken ? (
                <Field label={t('Verification code')}>
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    dir="ltr"
                    className="text-center text-xl tracking-[0.5em]"
                    placeholder="000000"
                  />
                </Field>
              ) : (
                <>
                  <Field label={t('Email')}>
                    <Input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="username"
                      autoFocus
                      required
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t('Password')}>
                    <div className="relative" dir="ltr">
                      <Input
                        type={showPw ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        required
                        dir="ltr"
                        className="pe-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => !s)}
                        aria-label={showPw ? t('Hide password') : t('Show password')}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-xs p-1 text-muted hover:text-fg"
                      >
                        {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </Field>
                </>
              )}

              {error && (
                <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg p-3 text-small text-danger">
                  {error}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={mfaToken ? code.length !== 6 : !email || !password}>
                {mfaToken ? t('Verify') : t('Sign in')}
              </Button>

              {mfaToken && (
                <button
                  type="button"
                  className="w-full text-center text-small text-muted hover:text-fg"
                  onClick={() => {
                    setMfaToken(null);
                    setCode('');
                  }}
                >
                  {t('Back')}
                </button>
              )}
            </form>

            {sso.length > 0 && !mfaToken && (
              <div className="mt-5 space-y-2">
                <p className="text-center text-caption text-muted">{t('or continue with')}</p>
                {sso.map((p) => (
                  <Button key={p} variant="secondary" className="w-full" onClick={() => ssoStart(p)}>
                    {p === 'google' ? 'Google' : 'Microsoft'}
                  </Button>
                ))}
              </div>
            )}

            {!mfaToken && (
              <div className="mt-6 border-t border-line pt-5">
                <p className="mb-3 text-center text-caption font-medium text-muted">{t('New to AutocQuick?')}</p>
                <div className="grid grid-cols-2 gap-2.5">
                  <Link
                    href="/register"
                    className="group flex flex-col gap-2 rounded-md border border-line bg-soft/45 p-3 transition-colors hover:border-gold-border hover:bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-7 w-7 place-items-center rounded-xs bg-gold-light text-gold-text">
                        <Building2 size={14} />
                      </span>
                      <ArrowUpRight size={13} className="text-muted/60 transition-colors group-hover:text-navy rtl:-scale-x-100" />
                    </div>
                    <span className="text-caption font-semibold leading-snug text-fg">{t('Register your company')}</span>
                  </Link>
                  <Link
                    href="/vendor"
                    className="group flex flex-col gap-2 rounded-md border border-line bg-soft/45 p-3 transition-colors hover:border-gold-border hover:bg-card"
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid h-7 w-7 place-items-center rounded-xs bg-navy/10 text-navy">
                        <Store size={14} />
                      </span>
                      <ArrowUpRight size={13} className="text-muted/60 transition-colors group-hover:text-navy rtl:-scale-x-100" />
                    </div>
                    <span className="text-caption font-semibold leading-snug text-fg">{t('Become a supplier')}</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {process.env.NODE_ENV !== 'production' && !mfaToken && (
            <details className="mt-4 rounded-md border border-dashed border-line bg-card/60 p-3 text-caption">
              <summary className="cursor-pointer font-semibold text-muted">Demo accounts (dev only)</summary>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {DEMO.map(([e, l]) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      setEmail(e);
                      setPassword('Passw0rd!2026');
                    }}
                    className="rounded-xs border border-line bg-soft px-2.5 py-1 font-medium text-strong transition-colors hover:border-navy hover:bg-card hover:text-navy"
                  >
                    {l}
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>

        <div className="text-center text-caption text-muted lg:hidden">© {new Date().getFullYear()} AutocQuick</div>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>}>
      <LoginForm />
    </Suspense>
  );
}
