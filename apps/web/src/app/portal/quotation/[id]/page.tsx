'use client';
import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY } from '@erp/shared';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageHeader, SkeletonRows, Stat, StatusBadge, toast } from '@/components/ui';
import { RefPicker } from '@/components/erp/fields';
import { QuotationApproveModal } from '@/components/erp/extras';

export default function PortalQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['detail', 'quotation', id], queryFn: () => api<{ data: any }>(`/api/v1/r/quotation/${id}`) });
  const [approve, setApprove] = useState(false); const [reject, setReject] = useState(false); const [reason, setReason] = useState<string | null>(null);
  useEffect(() => { api(`/api/v1/portal/quotations/${id}/viewed`, { method: 'POST' }).catch(() => null); }, [id]);
  const rej = useMutation({ mutationFn: () => api(`/api/v1/r/quotation/${id}/actions/reject`, { method: 'POST', body: { reasonId: reason } }), onSuccess: () => { toast.success(t('Quotation declined')); setReject(false); qc.invalidateQueries({ queryKey: ['detail', 'quotation', id] }); }, onError: (e: any) => toast.error(e.message) });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={5} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!.data; const lines: any[] = r._children?.QuotationLine ?? []; const alts = lines.filter((l) => l.isAlternative); const open = ['sent', 'viewed'].includes(r.status); const expired = r.validUntil && new Date(r.validUntil) < new Date();
  return (
    <>
      <PageHeader back={() => router.push('/portal/quotation')} title={r.number} badge={<StatusBadge value={r.status} />} sub={`${t('Valid until')} ${fmtDate(r.validUntil, lang)}`} actions={<><Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/quotation/${id}`)}>{t('Print / PDF')}</Button>{open && !expired && <><Button variant="secondary" className="text-danger" onClick={() => setReject(true)}>{t('Decline')}</Button><Button icon="check" onClick={() => setApprove(true)}>{t('Review & approve')}</Button></>}</>} />
      {expired && open && <p role="alert" className="mb-4 rounded-xl bg-warn/10 p-3 text-sm text-warn">{t('This quotation has expired. Please ask for a new one.')}</p>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label={t('Subtotal')} value={fmtMoney(r.subtotal, lang)} /><Stat label="VAT" value={fmtMoney(r.vatAmount, lang)} /><Stat label={t('Total')} value={fmtMoney(r.total, lang)} tone="primary" icon="wallet" /></div>
      <Card className="overflow-hidden"><CardHeader title={t('Items')} />{lines.length === 0 ? <EmptyState icon="list" title={t('No items')} /> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-3 text-start">{t('Part')}</th><th className="p-3 text-start">{t('Qty')}</th><th className="p-3 text-start">{t('Unit price')}</th><th className="p-3 text-start">{t('Lead time')}</th><th className="p-3 text-start">{t('Warranty')}</th><th className="p-3 text-start">{t('Total')}</th></tr></thead><tbody className="divide-y divide-line">
        {lines.filter((l) => !l.isAlternative).map((l) => <><tr key={l.id}><td className="p-3 font-semibold">{l._refs?.partId?.label}</td><td className="num p-3">{fmtNum(l.qty, lang, 0)}</td><td className="num p-3">{fmtNum(l.unitPrice, lang)}</td><td className="num p-3">{l.leadTimeDays ?? '—'} {t('days')}</td><td className="p-3">{l.warranty ?? '—'}</td><td className="num p-3 font-bold">{fmtMoney(l.lineTotal, lang)}</td></tr>
          {alts.filter((a) => a.alternativeOfId === l.id).map((a) => <tr key={a.id} className="bg-line/20 text-muted"><td className="p-3 ps-8"><Badge tone="info">{t('Alternative')}</Badge> {a._refs?.partId?.label}</td><td className="num p-3">{fmtNum(a.qty, lang, 0)}</td><td className="num p-3">{fmtNum(a.unitPrice, lang)}</td><td className="num p-3">{a.leadTimeDays ?? '—'}</td><td className="p-3">{a.warranty ?? '—'}</td><td className="num p-3">{fmtMoney(Number(a.unitPrice) * Number(a.qty) * 1.15, lang)}</td></tr>)}</>)}</tbody></table></div>}</Card>
      {approve && <QuotationApproveModal row={r} res={BY_KEY.Quotation} onClose={() => setApprove(false)} onDone={() => { setApprove(false); qc.invalidateQueries({ queryKey: ['detail', 'quotation', id] }); }} />}
      <Modal open={reject} onClose={() => setReject(false)} title={t('Decline quotation')} footer={<><Button variant="secondary" onClick={() => setReject(false)}>{t('Cancel')}</Button><Button variant="danger" loading={rej.isPending} onClick={() => rej.mutate()}>{t('Decline')}</Button></>}><Field label={t('Why? (helps us improve)')}><RefPicker resKey="LostReason" value={reason} onChange={setReason} /></Field></Modal>
    </>
  );
}
