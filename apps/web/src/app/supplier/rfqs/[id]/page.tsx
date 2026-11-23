'use client';
import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { Badge, Button, Card, ErrorState, Input, Select, SkeletonRows, StatusBadge, cn, toast } from '@/components/ui';
import { Banner, DocHeader, Panel, TD, TH } from '@/components/erp/dash';

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
    <div className="space-y-5">
      <DocHeader onBack={() => router.push('/supplier/rfqs')} icon="send" kicker={t('Request for quotation')} title={d.number} badge={<StatusBadge value={d.status} />} sub={`${t('Deadline')}: ${d.deadline ? fmtDateTime(d.deadline, lang) : '—'}`}
        actions={quote && <Badge tone="info">{t('Your quote')}: {quote.number} <StatusBadge value={quote.status} /></Badge>}
        facts={[{ label: t('Items to quote'), value: d.lines.length }, { label: t('Items priced'), value: `${filled.length}/${d.lines.length}` }, { label: t('Deadline'), value: d.deadline ? fmtDateTime(d.deadline, lang) : '—' }, { label: t('Your quote'), value: quote ? <StatusBadge value={quote.status} /> : <span className="text-muted">{t('Not quoted')}</span> }]} />
      {!d.open && !quote && <Banner tone="warn" icon="lock">{t('This RFQ is closed. You can no longer submit a quotation.')}</Banner>}
      {d.notes && <Banner tone="gold" icon="message-square-text">{d.notes}</Banner>}
      {quote?.status === 'captured_review' && <Banner tone="info" icon="sparkles">{t('Lines were extracted from your file. Please check every price, then submit.')}</Banner>}
      <Panel title={t('Items to quote')} icon="list" actions={d.open && !locked && <><input ref={file} type="file" hidden accept=".xlsx,.xls,.csv,.pdf" onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} /><Button size="sm" variant="soft" icon="sparkles" loading={upload.isPending} onClick={() => file.current?.click()}>{t('Upload your quotation file (AI capture)')}</Button></>}>
        <div className="sticky-head"><table className="w-full min-w-[760px] text-body"><thead><tr><th className={TH}>{t('Part')}</th><th className={TH}>{t('Brand')}</th><th className={cn(TH, 'text-end')}>{t('Qty')}</th><th className={TH}>{t('Unit price (SAR)')}</th><th className={TH}>{t('Lead time (days)')}</th><th className={TH}>{t('Availability')}</th><th className={TH}>{t('Warranty')}</th></tr></thead><tbody className="divide-y divide-line">
          {d.lines.map((l: any) => { const v = vals[l.id]; if (!v) return null; return <tr key={l.id} className="transition-colors hover:bg-soft/60"><td className={TD}><b className="mono block text-navy" dir="ltr">{l.partNumber}</b><span className="text-caption text-muted">{l.name}</span></td><td className={TD}>{l.brand}</td><td className={cn(TD, 'num text-end font-semibold')}>{fmtNum(l.qty, lang, 0)}</td>
            <td className={TD}><Input type="number" step="any" min={0} value={v.price} onChange={(e) => upd(l.id, 'price', e.target.value)} disabled={locked || !d.open} dir="ltr" className="h-9 w-32" aria-label={t('Unit price')} /></td><td className={TD}><Input type="number" min={0} value={v.lead} onChange={(e) => upd(l.id, 'lead', e.target.value)} disabled={locked || !d.open} dir="ltr" className="h-9 w-24" /></td>
            <td className={TD}><Select value={v.availability} onChange={(e) => upd(l.id, 'availability', e.target.value)} disabled={locked || !d.open} className="h-9 w-36">{['in_stock', 'on_order', 'unavailable'].map((a) => <option key={a} value={a}>{a === 'in_stock' ? t('In stock') : a === 'on_order' ? t('On order') : t('Unavailable')}</option>)}</Select></td><td className={TD}><Input value={v.warranty} onChange={(e) => upd(l.id, 'warranty', e.target.value)} disabled={locked || !d.open} placeholder="12 months" className="h-9 w-28" /></td></tr>; })}</tbody></table></div></Panel>
      {err && <Banner tone="danger" icon="octagon-alert">{err}</Banner>}
      {d.open && !locked && <div className="sticky bottom-0 z-10 -mx-4 flex items-center justify-between gap-2 border-t border-line bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"><span className="text-small text-muted"><b className="num text-fg">{filled.length}/{d.lines.length}</b> {t('items priced')}</span><div className="flex gap-2"><Button variant="secondary" loading={save.isPending && save.variables === false} disabled={!filled.length} onClick={() => { setErr(undefined); save.mutate(false); }}>{t('Save draft')}</Button><Button loading={save.isPending && save.variables === true} disabled={!filled.length} onClick={() => { setErr(undefined); save.mutate(true); }}>{t('Submit quotation')}</Button></div></div>}
    </div>
  );
}
