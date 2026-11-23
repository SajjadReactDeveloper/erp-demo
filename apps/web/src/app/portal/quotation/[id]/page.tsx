'use client';
import { Fragment, use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY } from '@erp/shared';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Modal, SkeletonRows, StatusBadge, cn, toast } from '@/components/ui';
import { RefPicker } from '@/components/erp/fields';
import { QuotationApproveModal } from '@/components/erp/extras';
import { Banner, DocHeader, Panel, TD, TH } from '@/components/erp/dash';

export default function PortalQuotation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['detail', 'quotation', id], queryFn: () => api<{ data: any }>(`/api/v1/r/quotation/${id}`) });
  const [approve, setApprove] = useState(false); const [reject, setReject] = useState(false); const [reason, setReason] = useState<string | null>(null);
  useEffect(() => { api(`/api/v1/portal/quotations/${id}/viewed`, { method: 'POST' }).catch(() => null); }, [id]);
  const rej = useMutation({ mutationFn: () => api(`/api/v1/r/quotation/${id}/actions/reject`, { method: 'POST', body: { reasonId: reason } }), onSuccess: () => { toast.success(t('Quotation declined')); setReject(false); qc.invalidateQueries({ queryKey: ['detail', 'quotation', id] }); }, onError: (e: any) => toast.error(e.message) });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={5} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!.data; const lines: any[] = r._children?.QuotationLine ?? []; const alts = lines.filter((l) => l.isAlternative); const open = ['sent', 'viewed'].includes(r.status); const expired = r.validUntil && new Date(r.validUntil) < new Date();
  return (
    <div className="space-y-5">
      <DocHeader onBack={() => router.push('/portal/quotation')} icon="file-text" kicker={t('Quotation')} title={r.number} badge={<StatusBadge value={r.status} />} sub={`${t('Valid until')} ${fmtDate(r.validUntil, lang)}`}
        actions={<><Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/quotation/${id}`)}>{t('Print / PDF')}</Button>{open && !expired && <><Button variant="secondary" className="text-danger" onClick={() => setReject(true)}>{t('Decline')}</Button><Button icon="check" onClick={() => setApprove(true)}>{t('Review & approve')}</Button></>}</>}
        facts={[{ label: t('Subtotal'), value: fmtMoney(r.subtotal, lang) }, { label: 'VAT', value: fmtMoney(r.vatAmount, lang) }, { label: t('Total'), value: fmtMoney(r.total, lang) }, { label: t('Valid until'), value: <span className={cn(expired && 'text-danger')}>{fmtDate(r.validUntil, lang)}</span> }]} />
      {expired && open && <Banner tone="warn" icon="alarm-clock-off">{t('This quotation has expired. Please ask for a new one.')}</Banner>}
      <Panel title={t('Items')} icon="list">{lines.length === 0 ? <EmptyState icon="list" title={t('No items')} /> : <div className="sticky-head"><table className="w-full min-w-[640px] text-body"><thead><tr><th className={TH}>{t('Part')}</th><th className={cn(TH, 'text-end')}>{t('Qty')}</th><th className={cn(TH, 'text-end')}>{t('Unit price')}</th><th className={TH}>{t('Lead time')}</th><th className={TH}>{t('Warranty')}</th><th className={cn(TH, 'text-end')}>{t('Total')}</th></tr></thead><tbody className="divide-y divide-line">
        {lines.filter((l) => !l.isAlternative).map((l) => <Fragment key={l.id}><tr className="transition-colors hover:bg-soft/60"><td className={cn(TD, 'font-semibold')}>{l._refs?.partId?.label}</td><td className={cn(TD, 'num text-end')}>{fmtNum(l.qty, lang, 0)}</td><td className={cn(TD, 'num text-end')}>{fmtNum(l.unitPrice, lang)}</td><td className={cn(TD, 'num')}>{l.leadTimeDays != null ? `${l.leadTimeDays} ${t('days')}` : '—'}</td><td className={TD}>{l.warranty ?? '—'}</td><td className={cn(TD, 'num text-end font-semibold')}>{fmtMoney(l.lineTotal, lang)}</td></tr>
          {alts.filter((a) => a.alternativeOfId === l.id).map((a) => <tr key={a.id} className="bg-soft/50 text-muted"><td className={cn(TD, 'ps-8')}><Badge tone="info">{t('Alternative')}</Badge> <span className="ms-1">{a._refs?.partId?.label}</span></td><td className={cn(TD, 'num text-end')}>{fmtNum(a.qty, lang, 0)}</td><td className={cn(TD, 'num text-end')}>{fmtNum(a.unitPrice, lang)}</td><td className={cn(TD, 'num')}>{a.leadTimeDays != null ? `${a.leadTimeDays} ${t('days')}` : '—'}</td><td className={TD}>{a.warranty ?? '—'}</td><td className={cn(TD, 'num text-end')}>{fmtMoney(Number(a.unitPrice) * Number(a.qty) * 1.15, lang)}</td></tr>)}</Fragment>)}</tbody></table></div>}</Panel>
      {approve && <QuotationApproveModal row={r} res={BY_KEY.Quotation} onClose={() => setApprove(false)} onDone={() => { setApprove(false); qc.invalidateQueries({ queryKey: ['detail', 'quotation', id] }); }} />}
      <Modal open={reject} onClose={() => setReject(false)} title={t('Decline quotation')} footer={<><Button variant="secondary" onClick={() => setReject(false)}>{t('Cancel')}</Button><Button variant="danger" loading={rej.isPending} onClick={() => rej.mutate()}>{t('Decline')}</Button></>}><Field label={t('Why? (helps us improve)')}><RefPicker resKey="LostReason" value={reason} onChange={setReason} /></Field></Modal>
    </div>
  );
}
