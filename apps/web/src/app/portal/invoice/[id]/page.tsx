'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { Button, Card, CardHeader, ErrorState, Field, Input, Modal, PageHeader, SkeletonRows, Stat, StatusBadge, toast } from '@/components/ui';

export default function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter(); const [pay, setPay] = useState(false); const [amount, setAmount] = useState('');
  const q = useQuery({ queryKey: ['detail', 'invoice', id], queryFn: () => api<{ data: any }>(`/api/v1/r/invoice/${id}`) });
  const go = useMutation({ mutationFn: () => api<{ data: { url: string } }>(`/api/v1/portal/invoices/${id}/pay`, { method: 'POST', body: { amount: Number(amount) } }), onSuccess: (r) => { location.href = r.data.url; }, onError: (e: any) => toast.error(e.message) });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={4} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!.data; const lines: any[] = r._children?.InvoiceLine ?? []; const payable = Number(r.balance) > 0 && ['cleared', 'reported', 'partially_paid'].includes(r.status);
  return (
    <>
      <PageHeader back={() => router.push('/portal/invoice')} title={r.number ?? '—'} badge={<StatusBadge value={r.status} />} sub={`${t('Due')} ${fmtDate(r.dueDate, lang)}`} actions={<><Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/invoice/${id}`)}>{t('Download invoice')}</Button>{payable && <Button icon="credit-card" onClick={() => { setAmount(String(Number(r.balance))); setPay(true); }}>{t('Pay now')}</Button>}</>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label={t('Total')} value={fmtMoney(r.total, lang)} /><Stat label={t('Paid')} value={fmtMoney(r.paidAmount, lang)} tone="success" /><Stat label={t('Balance')} value={fmtMoney(r.balance, lang)} tone={Number(r.balance) > 0 ? 'danger' : 'success'} /></div>
      <Card className="overflow-x-auto"><CardHeader title={t('Items')} /><table className="w-full min-w-[520px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-3 text-start">{t('Item')}</th><th className="p-3 text-start">{t('Qty')}</th><th className="p-3 text-start">{t('Unit price')}</th><th className="p-3 text-start">VAT</th><th className="p-3 text-start">{t('Total')}</th></tr></thead><tbody className="divide-y divide-line">{lines.map((l) => <tr key={l.id}><td className="p-3">{l.description}</td><td className="num p-3">{fmtNum(l.qty, lang, 0)}</td><td className="num p-3">{fmtNum(l.unitPrice, lang)}</td><td className="num p-3">{fmtNum(l.vatAmount, lang)}</td><td className="num p-3 font-bold">{fmtMoney(l.lineTotal, lang)}</td></tr>)}</tbody></table></Card>
      <Modal open={pay} onClose={() => setPay(false)} title={t('Pay invoice')} footer={<><Button variant="secondary" onClick={() => setPay(false)}>{t('Cancel')}</Button><Button loading={go.isPending} disabled={!(Number(amount) > 0) || Number(amount) > Number(r.balance)} onClick={() => go.mutate()}>{t('Continue to payment')}</Button></>}><Field label={t('Amount to pay')} hint={`${t('Balance')}: ${fmtMoney(r.balance, lang)}`}><Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" autoFocus /></Field><p className="mt-3 text-xs text-muted">{t('You will be redirected to our secure payment partner (Mada / card).')}</p></Modal>
    </>
  );
}
