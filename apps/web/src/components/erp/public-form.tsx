'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  Clock,
  FileCheck2,
  Globe,
  ShieldCheck,
  Store,
  Truck,
} from 'lucide-react';
import { api, ApiError, fieldErrors } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Field, Input, cn } from '@/components/ui';
import { BrandLogo } from '@/components/ui/brand';

export function PublicApplication({ kind }: { kind: 'customer' | 'vendor' }) {
  const { t, lang, setLang } = useT();
  const [v, setV] = useState<Record<string, string>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string>();
  const set = (k: string, val: string) => setV({ ...v, [k]: val });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(undefined);
    setErrs({});
    try {
      await api(`/api/v1/public/${kind}-applications`, {
        method: 'POST',
        auth: false,
        body: {
          ...v,
          ...(kind === 'vendor'
            ? {
                brands: (v.brands ?? '').split(',').map((s) => s.trim()).filter(Boolean),
                categories: (v.categories ?? '').split(',').map((s) => s.trim()).filter(Boolean),
              }
            : {}),
        },
      });
      setDone(true);
    } catch (x) {
      setErrs(fieldErrors(x));
      setErr(x instanceof ApiError ? x.message : t('Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const isCustomer = kind === 'customer';
  const title = isCustomer ? t('Register your company') : t('Become a supplier');
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;

  const benefits = isCustomer
    ? [
        [Clock, lang === 'ar' ? 'تسعير سريع' : 'Fast quotations', lang === 'ar' ? 'عروض أسعار فورية للقطع' : 'Rapid multi-supplier quotes'],
        [ShieldCheck, lang === 'ar' ? 'تسهيلات ائتمانية' : 'Credit accounts', lang === 'ar' ? 'حدود ائتمان مرنة بعد التوثيق' : 'Approved business terms'],
        [Truck, lang === 'ar' ? 'توصيل وفوترة' : 'Delivery & ZATCA', lang === 'ar' ? 'تتبع مباشر وفواتير ضريبية' : 'Live tracking & e-invoices'],
      ]
    : [
        [FileCheck2, lang === 'ar' ? 'طلبات أسعار مباشرة' : 'Live RFQ inbox', lang === 'ar' ? 'استقبل الطلبات وسعّر فوراً' : 'Quote matching parts online'],
        [CheckCircle2, lang === 'ar' ? 'أوامر شراء فورية' : 'Direct POs', lang === 'ar' ? 'تأكيد إلكتروني لأوامر الشراء' : 'Confirm & fulfill seamlessly'],
        [ShieldCheck, lang === 'ar' ? 'تسويات واضحة' : 'Clear billing', lang === 'ar' ? 'متابعة الفواتير والمدفوعات' : 'Track bills & settlements'],
      ];

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Left Midnight Navy & Gold visual panel */}
      <section className="relative hidden overflow-hidden bg-[#08162B] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12">
        <img
          src="/images/signup-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -top-24 inset-x-0 h-[112%] w-full object-cover object-center opacity-55"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#08162B]/70 via-[#08162B]/35 via-[48%] to-[#08162B]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B]/65 via-[#08162B]/20 to-transparent rtl:bg-gradient-to-l" />

        {/* Top logo + onboarding badge */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <Link href="/">
            <BrandLogo size={42} subtitle={lang === 'ar' ? 'نظام إدارة قطع الغيار' : 'AUTO PARTS ERP'} dark />
          </Link>
          <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-[#0B1F3A]/75 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold backdrop-blur-sm">
            {isCustomer ? <Building2 size={12} /> : <Store size={12} />}
            <span>{isCustomer ? t('Customer onboarding') : t('Supplier network')}</span>
          </span>
        </div>

        {/* Bottom value proposition */}
        <div className="relative z-10 max-w-lg space-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
              {isCustomer
                ? lang === 'ar'
                  ? 'الورش · الأساطيل · الموزعون'
                  : 'WORKSHOPS · FLEETS · DEALERS'
                : lang === 'ar'
                  ? 'شبكة الموردين المعتمدين'
                  : 'VERIFIED SUPPLIER NETWORK'}
            </p>
            <h1 className="mt-2.5 text-[32px] font-extrabold leading-[1.16] tracking-tight xl:text-[36px]">
              {isCustomer
                ? lang === 'ar'
                  ? 'اطلب قطع الغيار بسهولة، وتابع التوصيل والائتمان من مكان واحد.'
                  : 'Source auto parts faster with instant quotes and business credit.'
                : lang === 'ar'
                  ? 'انضم لشبكة الموردين واستقبل طلبات الأسعار وأوامر الشراء مباشرة.'
                  : 'Receive live RFQs and grow your parts sales across verified workshops.'}
            </h1>
            <p className="mt-3 text-body leading-relaxed text-onnavy-secondary">
              {isCustomer
                ? t('Tell us about your workshop or fleet. Credit is granted after your documents are approved.')
                : t('List the brands and categories you supply.')}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5 border-t border-white/15 pt-5">
            {benefits.map(([IconCmp, heading, sub]: any) => (
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

      {/* Right registration form panel */}
      <section className="flex flex-col justify-between bg-bg p-6 sm:p-10">
        {/* Top utility bar */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="lg:hidden">
              <BrandLogo size={34} subtitle={lang === 'ar' ? 'نظام ERP' : 'ERP PLATFORM'} dark={false} />
            </Link>
            <Link
              href="/login"
              className="hidden items-center gap-1.5 text-small font-semibold text-muted transition-colors hover:text-navy lg:inline-flex"
            >
              <BackIcon size={15} />
              <span>{t('Back to sign in')}</span>
            </Link>
          </div>
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

        {/* Centered application card */}
        <div className="mx-auto my-auto w-full max-w-[540px] py-6 animate-in">
          {/* Account type tabs */}
          {!done && (
            <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-md border border-line bg-card p-1">
              <Link
                href="/register"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-small font-semibold transition-colors',
                  isCustomer ? 'bg-navy text-white' : 'text-muted hover:bg-soft hover:text-fg'
                )}
              >
                <Building2 size={15} className={isCustomer ? 'text-gold' : ''} />
                <span>{t('Customer account')}</span>
              </Link>
              <Link
                href="/vendor"
                className={cn(
                  'flex items-center justify-center gap-2 rounded-sm px-3 py-2 text-small font-semibold transition-colors',
                  !isCustomer ? 'bg-navy text-white' : 'text-muted hover:bg-soft hover:text-fg'
                )}
              >
                <Store size={15} className={!isCustomer ? 'text-gold' : ''} />
                <span>{t('Supplier account')}</span>
              </Link>
            </div>
          )}

          <div className="rounded-2xl border border-line bg-card p-6 shadow-card sm:p-8">
            {done ? (
              <div className="grid place-items-center gap-4 py-8 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-md bg-success-bg text-success">
                  <CheckCircle2 size={30} />
                </span>
                <div>
                  <h1 className="text-[22px] font-extrabold text-fg">{t('Your application was received')}</h1>
                  <p className="mx-auto mt-2 max-w-sm text-small text-muted">
                    {isCustomer
                      ? t('Our team will review your documents and contact you. You will get your portal login once approved.')
                      : t('Our purchasing team will review your application and contact you.')}
                  </p>
                </div>
                <Link href="/login" className="mt-2">
                  <Button>{t('Back to sign in')}</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5" noValidate>
                <div>
                  <h1 className="text-[22px] font-extrabold tracking-tight text-fg">{title}</h1>
                  <p className="mt-1 text-small text-muted">
                    {isCustomer
                      ? t('Tell us about your workshop or fleet. Credit is granted after your documents are approved.')
                      : t('List the brands and categories you supply.')}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t('Company name')} required error={errs.companyName}>
                    <Input
                      value={v.companyName ?? ''}
                      onChange={(e) => set('companyName', e.target.value)}
                      autoComplete="organization"
                      placeholder={isCustomer ? (lang === 'ar' ? 'ورشة النور للسيارات' : 'Al Noor Auto Workshop') : (lang === 'ar' ? 'قطع غيار الرياض' : 'Riyadh Auto Parts')}
                    />
                  </Field>
                  <Field label={t('Contact person')} required error={errs.contactName}>
                    <Input
                      value={v.contactName ?? ''}
                      onChange={(e) => set('contactName', e.target.value)}
                      autoComplete="name"
                    />
                  </Field>
                  <Field label={t('Email')} required error={errs.email}>
                    <Input
                      type="email"
                      value={v.email ?? ''}
                      onChange={(e) => set('email', e.target.value)}
                      autoComplete="email"
                      placeholder="name@company.com"
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t('Phone')} error={errs.phone}>
                    <Input
                      type="tel"
                      value={v.phone ?? ''}
                      onChange={(e) => set('phone', e.target.value)}
                      autoComplete="tel"
                      placeholder="+966 5X XXX XXXX"
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t('VAT number')} error={errs.vatNumber}>
                    <Input
                      value={v.vatNumber ?? ''}
                      onChange={(e) => set('vatNumber', e.target.value)}
                      inputMode="numeric"
                      maxLength={15}
                      placeholder="300000000000003"
                      dir="ltr"
                    />
                  </Field>
                  <Field label={t('Commercial registration')} error={errs.crNumber}>
                    <Input
                      value={v.crNumber ?? ''}
                      onChange={(e) => set('crNumber', e.target.value)}
                      inputMode="numeric"
                      placeholder="1010XXXXXX"
                      dir="ltr"
                    />
                  </Field>
                  {!isCustomer && (
                    <>
                      <Field label={t('Brands (comma separated)')} className="sm:col-span-2">
                        <Input value={v.brands ?? ''} onChange={(e) => set('brands', e.target.value)} placeholder="Toyota, Bosch, Denso" />
                      </Field>
                      <Field label={t('Categories (comma separated)')} className="sm:col-span-2">
                        <Input value={v.categories ?? ''} onChange={(e) => set('categories', e.target.value)} placeholder="Brakes, Filters" />
                      </Field>
                    </>
                  )}
                </div>

                {err && (
                  <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg p-3 text-small text-danger">
                    {err}
                  </p>
                )}

                <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!v.companyName || !v.contactName || !v.email}>
                  {t('Submit application')}
                </Button>

                <p className="text-center text-caption text-muted">
                  {lang === 'ar'
                    ? 'بإرسال الطلب فإنك توافق على معالجة بياناتك وفق نظام حماية البيانات الشخصية.'
                    : 'By submitting you agree to the processing of your data under the Personal Data Protection Law.'}
                </p>

                <p className="border-t border-line pt-4 text-center text-small text-muted">
                  {t('Already have an account?')}{' '}
                  <Link href="/login" className="font-semibold text-navy hover:underline">
                    {t('Sign in')}
                  </Link>
                </p>
              </form>
            )}
          </div>
        </div>

        <div className="text-center text-caption text-muted lg:hidden">© {new Date().getFullYear()} AutocQuick</div>
      </section>
    </main>
  );
}
