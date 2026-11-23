'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ErrorState, Input, PageHeader, Select, SkeletonRows, StatusBadge, cn, toast } from '@/components/ui';

interface QL { price: string; lead: string; availability: string; warranty: string }
export default function SupplierQuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter(); const qc = useQueryClient(); const file = useRef<HTMLInputElement>(null);
  const q = useQuery({ queryKey: ['supplier-rfq', id], queryFn: () => api<{ data: any }>(`/api/v1/portal/supplier/rfqs/${id}`) });
  const [vals, setVals] = useState<Record<string, QL>>({}); const [err, setErr] = useState<string>();
  const d = q.data?.data; const quote = d?.quote; const locked = quote && !['draft', 'captured_review'].includes(quote.status);
  useEffect(() => { if (!d) return; const o: Record<string, QL> = {}; for (const l of d.lines) { const ql = quote?.SupplierQuoteLine_supplierQuoteId?.find((x: any) => x.rfqLineId === l.id); o[l.id] = { price: ql ? String(Number(ql.unitPrice)) : '', lead: ql?.leadTimeDays != null ? String(ql.leadTimeDays) : '', availability: ql?.availability ?? 'in_stock', warranty: ql?.warranty ?? '' }; } setVals(o); /* eslint-disable-next-line */ }, [d?.id, quote?.id, quote?.updatedAt]);
  const upd = (id: string, k: keyof QL, v: string) => setVals({ ...vals, [id]: { ...vals[id], [k]: v } });
  const filled = d?.lines.filter((l: any) => Number(vals[l.id]?.price) > 0) ?? [];
  const build = () => d.lines.filter((l: any) => Number(vals[l.id]?.price) > 0).map((l: any) => { const ex = quote?.SupplierQuoteLine_supplierQuoteId?.find((x: any) => x.rfqLineId === l.id); return { ...(ex ? { id: ex.id } : {}), rfqLineId: l.id, qty: l.qty, unitPrice: vals[l.id].price, availability: vals[l.id].availability, leadTimeDays: vals[l.id].lead ? Number(vals[l.id].lead) : undefined, warranty: vals[l.id].warranty || undefined }; });
  const save = useMutation({
    mutationFn: async (submit: boolean) => {
      let qid = quote?.id;
      if (qid) await api(`/api/v1/r/supplier-quote/${qid}`, { method: 'PATCH', body: { children: { SupplierQuoteLine: build() } } });
      else { const r = await api<any>('/api/v1/r/supplier-quote', { method: 'POST', body: { rfqId: id, children: { SupplierQuoteLine: build() } } }); qid = r.data.id; }
      if (submit) await api(`/api/v1/r/supplier-quote/${qid}/actions/submit`, { method: 'POST', body: {} });
      return submit;
    },
    onSuccess: (submit) => { toast.success(submit ? t('Quotation submitted') : t('Draft saved')); qc.invalidateQueries({ queryKey: ['supplier-rfq', id] }); }, onError: (e: any) => setErr(e.message),
  });
  const upload = useMutation({
    mutationFn: async (f: File) => { let qid = quote?.id; if (!qid) { const r = await api<any>('/api/v1/r/supplier-quote', { method: 'POST', body: { rfqId: id, children: { SupplierQuoteLine: [] } } }); qid = r.data.id; } const fd = new FormData(); fd.append('refType', 'SupplierQuote'); fd.append('refId', qid); fd.append('kind', 'quotation'); fd.append('file', f); const up = await api<any>('/api/v1/files', { method: 'POST', form: fd }); return api<any>(`/api/v1/r/supplier-quote/${qid}/actions/capture`, { method: 'POST', body: { attachmentId: up.data.id } }); },
    onSuccess: (r) => { toast.success(r.message, { duration: 9000 }); qc.invalidateQueries({ queryKey: ['supplier-rfq', id] }); }, onError: (e: any) => toast.error(e.message),
  });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={5} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <>
      <PageHeader back={() => router.push('/supplier/rfqs')} title={d.number} badge={<StatusBadge value={d.status} />} sub={`${t('Deadline')}: ${d.deadline ? fmtDateTime(d.deadline, lang) : '—'}`} actions={quote && <Badge tone="info">{t('Your quote')}: {quote.number} <StatusBadge value={quote.status} /></Badge>} />
      {!d.open && !quote && <p role="alert" className="mb-4 rounded-xl bg-warn/10 p-3 text-sm text-warn">{t('This RFQ is closed. You can no longer submit a quotation.')}</p>}
      {d.notes && <p className="mb-4 rounded-xl bg-line/40 p-3 text-sm">{d.notes}</p>}
      {quote?.status === 'captured_review' && <p className="mb-4 rounded-xl bg-info/10 p-3 text-sm text-info">{t('Lines were extracted from your file. Please check every price, then submit.')}</p>}
      <Card className="overflow-hidden"><CardHeader title={t('Items to quote')} actions={d.open && !locked && <><input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} /><Button size="sm" variant="soft" icon="sparkles" loading={upload.isPending} onClick={() => file.current?.click()}>{t('Upload your quotation file (AI capture)')}</Button></>} />
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-3 text-start">{t('Part')}</th><th className="p-3 text-start">{t('Brand')}</th><th className="p-3 text-start">{t('Qty')}</th><th className="p-3 text-start">{t('Unit price (SAR)')}</th><th className="p-3 text-start">{t('Lead time (days)')}</th><th className="p-3 text-start">{t('Availability')}</th><th className="p-3 text-start">{t('Warranty')}</th></tr></thead><tbody className="divide-y divide-line">
          {d.lines.map((l: any) => { const v = vals[l.id]; if (!v) return null; return <tr key={l.id}><td className="p-3"><b className="num block" dir="ltr">{l.partNumber}</b><span className="text-xs text-muted">{l.name}</span></td><td className="p-3">{l.brand}</td><td className="num p-3">{fmtNum(l.qty, lang, 0)}</td>
            <td className="p-3"><Input type="number" step="any" min={0} value={v.price} onChange={(e) => upd(l.id, 'price', e.target.value)} disabled={locked || !d.open} dir="ltr" className="h-9 w-32" aria-label={t('Unit price')} /></td><td className="p-3"><Input type="number" min={0} value={v.lead} onChange={(e) => upd(l.id, 'lead', e.target.value)} disabled={locked || !d.open} dir="ltr" className="h-9 w-24" /></td>
            <td className="p-3"><Select value={v.availability} onChange={(e) => upd(l.id, 'availability', e.target.value)} disabled={locked || !d.open} className="h-9 w-36">{['in_stock', 'on_order', 'unavailable'].map((a) => <option key={a} value={a}>{t(a)}</option>)}</Select></td><td className="p-3"><Input value={v.warranty} onChange={(e) => upd(l.id, 'warranty', e.target.value)} disabled={locked || !d.open} placeholder="12 months" className="h-9 w-28" /></td></tr>; })}</tbody></table></div></Card>
      {err && <p role="alert" className="mt-4 rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
      {d.open && !locked && <div className={cn('sticky bottom-20 mt-4 flex items-center justify-between gap-2 rounded-2xl border border-line bg-card/90 p-3 shadow-soft backdrop-blur lg:bottom-3')}><span className="text-sm text-muted">{filled.length}/{d.lines.length} {t('items priced')}</span><div className="flex gap-2"><Button variant="secondary" loading={save.isPending && save.variables === false} disabled={!filled.length} onClick={() => { setErr(undefined); save.mutate(false); }}>{t('Save draft')}</Button><Button loading={save.isPending && save.variables === true} disabled={!filled.length} onClick={() => { setErr(undefined); save.mutate(true); }}>{t('Submit quotation')}</Button></div></div>}
    </>
  );
}
