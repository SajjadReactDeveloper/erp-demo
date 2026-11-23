'use client';
import { useState } from 'react';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { api, ApiError, fieldErrors } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Button, Card, Field, Icon, Input } from '@/components/ui';

export function PublicApplication({ kind }: { kind: 'customer' | 'vendor' }) {
  const { t, lang } = useT(); const [v, setV] = useState<Record<string, string>>({}); const [errs, setErrs] = useState<Record<string, string>>({}); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState<string>();
  const set = (k: string, val: string) => setV({ ...v, [k]: val });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(undefined); setErrs({});
    try { await api(`/api/v1/public/${kind}-applications`, { method: 'POST', auth: false, body: { ...v, ...(kind === 'vendor' ? { brands: (v.brands ?? '').split(',').map((s) => s.trim()).filter(Boolean), categories: (v.categories ?? '').split(',').map((s) => s.trim()).filter(Boolean) } : {}) } }); setDone(true); }
    catch (x) { setErrs(fieldErrors(x)); setErr(x instanceof ApiError ? x.message : t('Something went wrong')); } finally { setBusy(false); }
  };
  const title = kind === 'customer' ? t('Register your company') : t('Become a supplier');
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl content-center p-5">
      <Link href="/" className="mb-6 flex items-center gap-3 self-start"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-fg"><Icon name="cog" size={22} /></span><b className="text-lg">AutocQuick</b></Link>
      <Card className="p-6 sm:p-8 animate-in">
        {done ? <div className="grid place-items-center gap-3 py-8 text-center"><CheckCircle2 size={56} className="text-success" /><h1 className="text-2xl font-extrabold">{t('Your application was received')}</h1><p className="max-w-sm text-sm text-muted">{kind === 'customer' ? t('Our team will review your documents and contact you. You will get your portal login once approved.') : t('Our purchasing team will review your application and contact you.')}</p><Link href="/login"><Button variant="secondary">{t('Back to sign in')}</Button></Link></div> : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <h1 className="text-2xl font-extrabold">{title}</h1><p className="text-sm text-muted">{kind === 'customer' ? t('Tell us about your workshop or fleet. Credit is granted after your documents are approved.') : t('List the brands and categories you supply.')}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t('Company name')} required error={errs.companyName}><Input value={v.companyName ?? ''} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" /></Field>
              <Field label={t('Contact person')} required error={errs.contactName}><Input value={v.contactName ?? ''} onChange={(e) => set('contactName', e.target.value)} autoComplete="name" /></Field>
              <Field label={t('Email')} required error={errs.email}><Input type="email" value={v.email ?? ''} onChange={(e) => set('email', e.target.value)} autoComplete="email" dir="ltr" /></Field>
              <Field label={t('Phone')} error={errs.phone}><Input type="tel" value={v.phone ?? ''} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" dir="ltr" /></Field>
              <Field label={t('VAT number')} error={errs.vatNumber}><Input value={v.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} inputMode="numeric" maxLength={15} dir="ltr" /></Field>
              <Field label={t('Commercial registration')} error={errs.crNumber}><Input value={v.crNumber ?? ''} onChange={(e) => set('crNumber', e.target.value)} inputMode="numeric" dir="ltr" /></Field>
              {kind === 'vendor' && <><Field label={t('Brands (comma separated)')} className="sm:col-span-2"><Input value={v.brands ?? ''} onChange={(e) => set('brands', e.target.value)} placeholder="Toyota, Bosch, Denso" /></Field><Field label={t('Categories (comma separated)')} className="sm:col-span-2"><Input value={v.categories ?? ''} onChange={(e) => set('categories', e.target.value)} placeholder="Brakes, Filters" /></Field></>}
            </div>
            {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!v.companyName || !v.contactName || !v.email}>{t('Submit application')}</Button>
            <p className="text-center text-xs text-muted">{lang === 'ar' ? 'بإرسال الطلب فإنك توافق على معالجة بياناتك وفق نظام حماية البيانات الشخصية.' : 'By submitting you agree to the processing of your data under the Personal Data Protection Law.'}</p>
          </form>)}
      </Card>
    </main>
  );
}
