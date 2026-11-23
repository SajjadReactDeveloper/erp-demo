'use client';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, Input, NoAccess, Select, Skeleton, Textarea, cn, toast } from '@/components/ui';
import { Banner, DashHeader } from '@/components/erp/dash';

type Tpl = { id: string; docType: string; name: string; language: 'ar' | 'en'; body: string; isDefault: boolean; version?: number };
const DOC_TYPES = ['quotation', 'purchase_order', 'delivery_note', 'invoice', 'statement', 'receipt', 'label'];
const STARTER = (lang: string) => `<div style="font-family:Arial,sans-serif;border-top:6px solid #0B1F3A;padding-top:12px" dir="${lang === 'ar' ? 'rtl' : 'ltr'}">\n  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">\n    <b style="font-size:18px">${lang === 'ar' ? 'اسم شركتك' : 'Your company name'}</b>\n    <span style="color:#64748B">${lang === 'ar' ? 'هاتف: 000 000 0000' : 'Tel: 000 000 0000'}</span>\n  </div>\n  {{content}}\n  <p style="margin-top:24px;color:#64748B;font-size:12px;text-align:center">${lang === 'ar' ? 'شكراً لتعاملكم معنا' : 'Thank you for your business'}</p>\n</div>`;
const SAMPLE = `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:13px"><thead><tr style="background:#F1F5F9"><th style="padding:8px;text-align:start">Item</th><th style="padding:8px">Qty</th><th style="padding:8px">Total</th></tr></thead><tbody><tr><td style="padding:8px;border-top:1px solid #E2E8F0">Front brake pads — Camry</td><td style="padding:8px;border-top:1px solid #E2E8F0;text-align:center">2</td><td style="padding:8px;border-top:1px solid #E2E8F0;text-align:end">SAR 480.00</td></tr><tr><td style="padding:8px;border-top:1px solid #E2E8F0">Oil filter — Toyota</td><td style="padding:8px;border-top:1px solid #E2E8F0;text-align:center">1</td><td style="padding:8px;border-top:1px solid #E2E8F0;text-align:end">SAR 35.00</td></tr></tbody></table>`;
const render = (body: string) => (body.trim() === '{{default}}' || !body.trim() ? SAMPLE : body.replace(/\{\{(?:default|content)\}\}/g, SAMPLE));

export default function Templates() {
  const { t } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient(); const canWrite = can({ mod: 'platform', slug: 'template' }, 'create');
  const q = useQuery({ queryKey: ['templates'], queryFn: () => api<{ data: Tpl[] }>('/api/v1/r/template', { query: { limit: 200 } }) });
  const [sel, setSel] = useState<Partial<Tpl> | null>(null); const [del, setDel] = useState(false); const [err, setErr] = useState<string>();
  const rows = useMemo(() => q.data?.data ?? [], [q.data]);
  useEffect(() => { if (!sel && rows.length) setSel(rows[0]); }, [rows, sel]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['templates'] });
  const save = useMutation({
    mutationFn: async () => {
      const f = sel!; const body = { docType: f.docType, name: f.name, language: f.language, body: f.body, isDefault: !!f.isDefault };
      const r: any = f.id ? await api(`/api/v1/r/template/${f.id}`, { method: 'PATCH', body: { ...body, version: f.version } }) : await api('/api/v1/r/template', { method: 'POST', body });
      const id = r.data?.id ?? f.id;
      if (f.isDefault) for (const o of rows.filter((x) => x.id !== id && x.docType === f.docType && x.language === f.language && x.isDefault)) await api(`/api/v1/r/template/${o.id}`, { method: 'PATCH', body: { isDefault: false, version: o.version } });
      return r.data;
    },
    onSuccess: (d) => { toast.success(t('Saved successfully')); setErr(undefined); refresh(); setSel(d); }, onError: (e: any) => setErr(e.message),
  });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/r/template/${sel!.id}`, { method: 'DELETE' }), onSuccess: () => { setDel(false); setSel(null); refresh(); toast.success(t('Deleted')); }, onError: (e: any) => { setDel(false); toast.error(e.message); } });
  if (ready && !can({ mod: 'platform', slug: 'template' }, 'read')) return <NoAccess />;
  const set = (k: string, v: any) => setSel({ ...sel, [k]: v });
  return (
    <div className="space-y-5">
      <DashHeader title={t('Document templates')} sub={t('Brand the documents you print or send: a header, footer and layout around the document content.')} actions={canWrite && <Button icon="plus" onClick={() => setSel({ docType: 'quotation', language: 'ar', name: '', body: STARTER('ar'), isDefault: false })}>{t('New template')}</Button>} />
      {q.isLoading ? <Card className="space-y-3 p-5">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <div className="grid items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <Card className="overflow-hidden"><div className="border-b border-line bg-soft/60 px-5 py-3"><h3 className="text-small font-bold">{t('Templates')}</h3></div>
            {rows.length === 0 && !sel?.docType ? <EmptyState icon="file-text" title={t('No templates yet')} /> : <ul className="divide-y divide-line">{rows.map((r) => <li key={r.id}><button onClick={() => { setSel(r); setErr(undefined); }} className={cn('flex w-full items-start gap-3 px-5 py-3 text-start transition-colors hover:bg-soft', sel?.id === r.id && 'bg-gold-light/60')}><Icon name="file-text" size={17} className="mt-0.5 shrink-0 text-muted" /><span className="min-w-0 flex-1"><b className="block truncate text-body font-semibold">{r.name}</b><span className="text-caption text-muted">{t(r.docType.replace('_', ' '))} · {r.language === 'ar' ? 'العربية' : 'English'}</span></span>{r.isDefault && <Badge tone="success">{t('Default')}</Badge>}</button></li>)}</ul>}
          </Card>
          {sel ? (
            <div className="space-y-5">
              <Card className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
                <Field label={t('Name')} required className="sm:col-span-2"><Input value={sel.name ?? ''} onChange={(e) => set('name', e.target.value)} disabled={!canWrite} /></Field>
                <Field label={t('Document')}><Select value={sel.docType} onChange={(e) => set('docType', e.target.value)} disabled={!canWrite}>{DOC_TYPES.map((d) => <option key={d} value={d}>{t(d.replace('_', ' '))}</option>)}</Select></Field>
                <Field label={t('Language')}><Select value={sel.language} onChange={(e) => set('language', e.target.value)} disabled={!canWrite}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
              </Card>
              <div className="grid gap-5 2xl:grid-cols-2">
                <Card className="overflow-hidden"><div className="flex flex-wrap items-center gap-2 border-b border-line bg-soft/60 px-5 py-3"><h3 className="text-small font-bold">{t('Layout (HTML)')}</h3>{canWrite && <div className="ms-auto flex gap-2"><Button size="sm" variant="secondary" onClick={() => set('body', (sel.body ?? '') + '\n{{content}}')}>{'{{content}}'}</Button><Button size="sm" variant="secondary" onClick={() => set('body', STARTER(sel.language ?? 'ar'))}>{t('Start from example')}</Button></div>}</div>
                  <Textarea rows={16} value={sel.body ?? ''} onChange={(e) => set('body', e.target.value)} disabled={!canWrite} dir="ltr" spellCheck={false} className="mono !rounded-none !border-0 !bg-card !text-[12px] leading-5 focus:!shadow-none" />
                  <p className="border-t border-line px-5 py-3 text-caption text-muted">{t('Put {{content}} where the document itself should appear. Scripts are removed when printing.')}</p></Card>
                <Card className="overflow-hidden"><div className="border-b border-line bg-soft/60 px-5 py-3"><h3 className="text-small font-bold">{t('Preview')}</h3></div>
                  <iframe title={t('Preview')} sandbox="" srcDoc={`<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: https:"><body style="margin:16px">${render(sel.body ?? '')}</body>`} className="h-[420px] w-full bg-white" /></Card>
              </div>
              {!(sel.body ?? '').includes('{{content}}') && (sel.body ?? '').trim() !== '{{default}}' && <Banner tone="warn" icon="triangle-alert">{t('This layout has no {{content}}, so the document itself will not be shown.')}</Banner>}
              {err && <Banner tone="danger" icon="octagon-alert">{err}</Banner>}
              {canWrite && <div className="flex flex-wrap items-center gap-3 border border-line bg-card p-4"><label className="inline-flex cursor-pointer items-center gap-2 text-small font-semibold"><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--navy))]" checked={!!sel.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />{t('Use as the default for this document and language')}</label>
                <div className="ms-auto flex gap-2">{sel.id && <Button variant="ghost" className="text-danger" icon="trash-2" onClick={() => setDel(true)}>{t('Delete')}</Button>}<Button loading={save.isPending} disabled={!(sel.name ?? '').trim() || !(sel.body ?? '').trim()} onClick={() => { setErr(undefined); save.mutate(); }}>{t('Save')}</Button></div></div>}
            </div>) : <Card><EmptyState icon="file-text" title={t('Select a template')} /></Card>}
        </div>)}
      <ConfirmDialog open={del} onClose={() => setDel(false)} loading={remove.isPending} danger title={t('Delete template')} message={t('This cannot be undone.')} confirmText={t('Delete')} onConfirm={() => remove.mutate()} />
    </div>
  );
}
