'use client';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum } from '@/lib/format';
import { Button, Card, ErrorState, Field, Input, Modal, SkeletonRows, StatusBadge, cn, toast } from '@/components/ui';
import { DocHeader, Panel, TD, TH } from '@/components/erp/dash';

export default function PortalInvoice({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter(); const [pay, setPay] = useState(false); const [amount, setAmount] = useState('');
  const q = useQuery({ queryKey: ['detail', 'invoice', id], queryFn: () => api<{ data: any }>(`/api/v1/r/invoice/${id}`) });
  const go = useMutation({ mutationFn: () => api<{ data: { url: string } }>(`/api/v1/portal/invoices/${id}/pay`, { method: 'POST', body: { amount: Number(amount) } }), onSuccess: (r) => { location.href = r.data.url; }, onError: (e: any) => toast.error(e.message) });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={4} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const r = q.data!.data; const lines: any[] = r._children?.InvoiceLine ?? []; const payable = Number(r.balance) > 0 && ['cleared', 'reported', 'partially_paid'].includes(r.status);
  const overdue = Number(r.balance) > 0 && r.dueDate && new Date(r.dueDate) < new Date();
  return (
    <div className="space-y-5">
      <DocHeader onBack={() => router.push('/portal/invoice')} icon="receipt-text" kicker={t('Invoice')} title={r.number ?? '—'} badge={<StatusBadge value={r.status} />} sub={`${t('Due')} ${fmtDate(r.dueDate, lang)}`}
        actions={<><Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/invoice/${id}`)}>{t('Download invoice')}</Button>{payable && <Button icon="credit-card" onClick={() => { setAmount(String(Number(r.balance))); setPay(true); }}>{t('Pay now')}</Button>}</>}
        facts={[{ label: t('Total'), value: fmtMoney(r.total, lang) }, { label: t('Paid'), value: <span className="text-success">{fmtMoney(r.paidAmount, lang)}</span> }, { label: t('Balance'), value: <span className={cn(Number(r.balance) > 0 ? (overdue ? 'text-danger' : 'text-fg') : 'text-success')}>{fmtMoney(r.balance, lang)}</span> }, { label: t('Due'), value: fmtDate(r.dueDate, lang) }]} />
      <Panel title={t('Items')} icon="list">
        <div className="sticky-head"><table className="w-full min-w-[520px] text-body"><thead><tr><th className={TH}>{t('Item')}</th><th className={cn(TH, 'text-end')}>{t('Qty')}</th><th className={cn(TH, 'text-end')}>{t('Unit price')}</th><th className={cn(TH, 'text-end')}>VAT</th><th className={cn(TH, 'text-end')}>{t('Total')}</th></tr></thead>
          <tbody className="divide-y divide-line">{lines.map((l) => <tr key={l.id} className="transition-colors hover:bg-soft/60"><td className={cn(TD, 'font-medium')}>{l.description}</td><td className={cn(TD, 'num text-end')}>{fmtNum(l.qty, lang, 0)}</td><td className={cn(TD, 'num text-end')}>{fmtNum(l.unitPrice, lang)}</td><td className={cn(TD, 'num text-end text-muted')}>{fmtNum(l.vatAmount, lang)}</td><td className={cn(TD, 'num text-end font-semibold')}>{fmtMoney(l.lineTotal, lang)}</td></tr>)}</tbody></table></div>
      </Panel>
      <Modal open={pay} onClose={() => setPay(false)} title={t('Pay invoice')} footer={<><Button variant="secondary" onClick={() => setPay(false)}>{t('Cancel')}</Button><Button loading={go.isPending} disabled={!(Number(amount) > 0) || Number(amount) > Number(r.balance)} onClick={() => go.mutate()}>{t('Continue to payment')}</Button></>}><Field label={t('Amount to pay')} hint={`${t('Balance')}: ${fmtMoney(r.balance, lang)}`}><Input type="number" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" autoFocus /></Field><p className="mt-3 text-caption text-muted">{t('You will be redirected to our secure payment partner (Mada / card).')}</p></Modal>
    </div>
  );
}
