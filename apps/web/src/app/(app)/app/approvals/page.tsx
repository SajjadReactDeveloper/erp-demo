'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime, fmtMoney, timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Modal, PageHeader, SkeletonRows, Textarea, cn, toast } from '@/components/ui';

const SLUG: Record<string, string> = { Quotation: 'quotation', PurchaseOrder: 'purchase-order', CreditHold: 'credit-hold', Expense: 'expense', ReturnAuth: 'return-auth', DiscountRequest: 'discount-request' };

export default function ApprovalsPage() {
  const { t, lang, el } = useT(); const qc = useQueryClient(); const [rej, setRej] = useState<any>(null); const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['approvals', 'inbox'], queryFn: () => api<{ data: any[] }>('/api/v1/approvals/inbox'), refetchInterval: 30000 });
  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => api<any>(`/api/v1/r/approval-request/${id}/actions/${action}`, { method: 'POST', body: { note } }),
    onSuccess: (r) => { toast.success(r.message ?? t('Done')); setRej(null); setNote(''); qc.invalidateQueries({ queryKey: ['approvals'] }); }, onError: (e: any) => toast.error(e.message),
  });
  return (
    <>
      <PageHeader title={t('Approvals')} sub={q.data ? `${q.data.data.length} ${t('waiting for you')}` : undefined} />
      {q.isLoading ? <Card><SkeletonRows rows={5} cols={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : q.data!.data.length === 0 ? <Card><EmptyState icon="check-circle-2" title={t('Nothing to approve')} desc={t('New approval requests will appear here and in your notifications.')} /></Card> : (
        <div className="space-y-3">{q.data!.data.map((a) => (
          <Card key={a.id} className={cn('p-4 sm:p-5', a.overdue && 'border-danger/40')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1"><div className="flex flex-wrap items-center gap-2"><Badge tone="primary">{el(a.type)}</Badge>{a.status === 'escalated' && <Badge tone="danger">{t('Escalated')}</Badge>}{a.overdue && <Badge tone="danger">{t('Overdue')}</Badge>}<span className="text-xs text-muted">{t('Step')} {a.currentStep + 1}/{(a.steps as any[]).length} · {a.stepRole}</span></div>
                <p className="text-sm font-semibold">{a.reason}</p><p className="text-xs text-muted">{a.requestedBy} · {timeAgo(a.createdAt, lang)} · {t('Due')} {fmtDateTime(a.dueAt, lang)}</p></div>
              <div className="text-end"><p className="num text-xl font-extrabold">{fmtMoney(a.amount, lang)}</p>{SLUG[a.refType] && <Link href={`/app/${SLUG[a.refType]}/${a.refId}`} className="text-xs font-semibold text-primary hover:underline">{t('Open the record')} →</Link>}</div>
            </div>
            <div className="mt-4 flex gap-2"><Button icon="check" loading={act.isPending && act.variables?.id === a.id && act.variables?.action === 'approve'} onClick={() => act.mutate({ id: a.id, action: 'approve' })}>{t('Approve')}</Button><Button variant="secondary" className="text-danger" icon="x" onClick={() => setRej(a)}>{t('Reject')}</Button><Link href={`/app/approval-request/${a.id}`}><Button variant="ghost">{t('Details')}</Button></Link></div>
          </Card>))}</div>
      )}
      <Modal open={!!rej} onClose={() => setRej(null)} title={t('Reject request')} footer={<><Button variant="secondary" onClick={() => setRej(null)}>{t('Cancel')}</Button><Button variant="danger" disabled={!note.trim()} loading={act.isPending} onClick={() => act.mutate({ id: rej.id, action: 'reject', note })}>{t('Reject')}</Button></>}>
        <p className="mb-2 text-sm text-muted">{rej?.reason}</p><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Reason for rejecting')} autoFocus />
      </Modal>
    </>
  );
}
