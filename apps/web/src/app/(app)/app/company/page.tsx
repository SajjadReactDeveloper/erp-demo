'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY } from '@erp/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Button, Card, Checkbox, ErrorState, Field, Input, NoAccess, Select, Skeleton, Tabs, toast } from '@/components/ui';
import { Banner, DashHeader, Panel } from '@/components/erp/dash';
import { ResourceList } from '@/components/erp/list';

export default function Organisation() {
  const { t } = useT(); const { can, ready } = useAuth(); const [tab, setTab] = useState<'company' | 'branch' | 'warehouse' | 'cost-center'>('company');
  if (ready && !can({ mod: 'platform', slug: 'company' }, 'read')) return <NoAccess />;
  return (
    <div className="space-y-5">
      <DashHeader title={t('Organisation')} sub={t('Your company details, branches, warehouses and cost centres.')} />
      <Card className="px-3"><Tabs value={tab} onChange={(k) => setTab(k as typeof tab)} tabs={[{ key: 'company', label: t('Company profile'), icon: 'building' }, { key: 'branch', label: t('Branches'), icon: 'git-branch' }, { key: 'warehouse', label: t('Warehouses'), icon: 'warehouse' }, { key: 'cost-center', label: t('Cost centres'), icon: 'layers' }]} /></Card>
      {tab === 'company' ? <CompanyForm /> : <ResourceList key={tab} res={BY_KEY[tab === 'branch' ? 'Branch' : tab === 'warehouse' ? 'Warehouse' : 'CostCenter']} embedded limit={25} />}
    </div>
  );
}

function CompanyForm() {
  const { t } = useT(); const { can } = useAuth(); const qc = useQueryClient(); const canEdit = can({ mod: 'platform', slug: 'company' }, 'update');
  const q = useQuery({ queryKey: ['company-profile'], queryFn: () => api<{ data: any }>('/api/v1/admin/company') });
  const [f, setF] = useState<any>(null); const [err, setErr] = useState<string>(); const [fe, setFe] = useState<Record<string, string>>({});
  useEffect(() => { if (q.data) setF({ ...q.data.data }); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api('/api/v1/admin/company', { method: 'PATCH', body: { name: f.name, nameAr: f.nameAr, vatNumber: f.vatNumber, crNumber: f.crNumber, address: f.address, city: f.city, phone: f.phone, email: f.email, currency: f.currency, logoUrl: f.logoUrl, defaultLocale: f.defaultLocale, hijriDates: !!f.hijriDates, primaryColor: f.primaryColor } }),
    onSuccess: () => { toast.success(t('Saved successfully')); qc.invalidateQueries({ queryKey: ['company-profile'] }); qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e: any) => { setErr(e.message); setFe(Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]: any) => [k, Array.isArray(v) ? v.join(', ') : String(v)]))); },
  });
  if (q.isLoading || !f) return <Card className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const set = (k: string, v: any) => setF({ ...f, [k]: v }); const dis = !canEdit;
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); setErr(undefined); setFe({}); save.mutate(); }}>
      {err && <Banner tone="danger" icon="octagon-alert">{err}</Banner>}
      <Panel title={t('Identity')} icon="building"><div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
        <Field label={t('Company name')} required error={fe.name}><Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} disabled={dis} /></Field>
        <Field label={t('Company name (Arabic)')}><Input value={f.nameAr ?? ''} onChange={(e) => set('nameAr', e.target.value)} disabled={dis} dir="rtl" /></Field>
        <Field label={t('VAT number')} hint={t('Printed on invoices.')} error={fe.vatNumber}><Input value={f.vatNumber ?? ''} onChange={(e) => set('vatNumber', e.target.value)} disabled={dis} dir="ltr" /></Field>
        <Field label={t('Commercial registration (CR)')}><Input value={f.crNumber ?? ''} onChange={(e) => set('crNumber', e.target.value)} disabled={dis} dir="ltr" /></Field>
      </div></Panel>
      <Panel title={t('Contact')} icon="map-pin"><div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
        <Field label={t('Address')} className="sm:col-span-2"><Input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} disabled={dis} /></Field>
        <Field label={t('City')}><Input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} disabled={dis} /></Field>
        <Field label={t('Phone')}><Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} disabled={dis} dir="ltr" /></Field>
        <Field label={t('Email')} error={fe.email}><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} disabled={dis} dir="ltr" /></Field>
      </div></Panel>
      <Panel title={t('Regional & branding')} icon="palette"><div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2">
        <Field label={t('Currency')} hint={t('Three-letter code, e.g. SAR.')} error={fe.currency}><Input value={f.currency ?? 'SAR'} onChange={(e) => set('currency', e.target.value.toUpperCase().slice(0, 3))} disabled={dis} dir="ltr" /></Field>
        <Field label={t('Default language')}><Select value={f.defaultLocale ?? 'ar'} onChange={(e) => set('defaultLocale', e.target.value)} disabled={dis}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
        <Field label={t('Logo address')} hint={t('An https:// address to your logo image, used on printed documents.')} error={fe.logoUrl}><Input value={f.logoUrl ?? ''} onChange={(e) => set('logoUrl', e.target.value)} disabled={dis} dir="ltr" placeholder="https://…" /></Field>
        <Field label={t('Brand colour')} error={fe.primaryColor}><div className="flex gap-2"><input type="color" value={/^#[0-9a-f]{6}$/i.test(f.primaryColor ?? '') ? f.primaryColor : '#0B1F3A'} onChange={(e) => set('primaryColor', e.target.value)} disabled={dis} className="h-[42px] w-14 cursor-pointer border border-line bg-soft p-1" aria-label={t('Brand colour')} /><Input value={f.primaryColor ?? ''} onChange={(e) => set('primaryColor', e.target.value)} disabled={dis} dir="ltr" placeholder="#0B1F3A" /></div></Field>
        <div className="sm:col-span-2"><Checkbox checked={!!f.hijriDates} onChange={(e) => set('hijriDates', e.target.checked)} disabled={dis} label={t('Show Hijri dates alongside Gregorian dates')} /></div>
      </div></Panel>
      {canEdit && <div className="flex justify-end"><Button type="submit" loading={save.isPending}>{t('Save changes')}</Button></div>}
    </form>
  );
}
