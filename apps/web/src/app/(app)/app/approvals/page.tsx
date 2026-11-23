'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime, fmtMoney, timeAgo } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Modal, SkeletonRows, Textarea, cn, toast } from '@/components/ui';
import { Chip, DashHeader } from '@/components/erp/dash';

const SLUG: Record<string, string> = { Quotation: 'quotation', PurchaseOrder: 'purchase-order', CreditHold: 'credit-hold', Expense: 'expense', ReturnAuth: 'return-auth', DiscountRequest: 'discount-request' };

export default function ApprovalsPage() {
  const { t, lang, el } = useT(); const qc = useQueryClient(); const [rej, setRej] = useState<any>(null); const [note, setNote] = useState('');
  const q = useQuery({ queryKey: ['approvals', 'inbox'], queryFn: () => api<{ data: any[] }>('/api/v1/approvals/inbox'), refetchInterval: 30000 });
  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) => api<any>(`/api/v1/r/approval-request/${id}/actions/${action}`, { method: 'POST', body: { note } }),
    onSuccess: (r) => { toast.success(r.message ?? t('Done')); setRej(null); setNote(''); qc.invalidateQueries({ queryKey: ['approvals'] }); }, onError: (e: any) => toast.error(e.message),
  });
  const ICON: Record<string, string> = { margin: 'percent', credit: 'octagon-alert', purchase_order: 'shopping-basket', discount: 'badge-percent', expense: 'wallet', return: 'undo-2' };
  const rows = q.data?.data ?? [];
  return (
    <div className="space-y-5">
      <DashHeader title={t('Approvals')} sub={q.data ? `${rows.length} ${t('waiting for you')}` : undefined} actions={rows.length > 0 && <Chip tone="gold">{rows.length}</Chip>} />
      {q.isLoading ? <Card><SkeletonRows rows={5} cols={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : rows.length === 0 ? <Card><EmptyState icon="check-circle-2" title={t('Nothing to approve')} desc={t('New approval requests will appear here and in your notifications.')} /></Card> : (
        <div className="grid gap-4 xl:grid-cols-2">{rows.map((a) => (
          <Card key={a.id} className={cn('relative flex flex-col overflow-hidden before:absolute before:inset-y-0 before:start-0 before:w-[3px]', a.overdue ? 'before:bg-danger' : 'before:bg-gold')}>
            <div className="flex items-start gap-4 p-5">
              <span className={cn('grid h-11 w-11 shrink-0 place-items-center', a.overdue ? 'bg-danger-bg text-danger' : 'bg-gold-light text-gold-text')}><Icon name={ICON[a.type] ?? 'check-circle-2'} size={21} /></span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><Badge tone="gold">{el(a.type)}</Badge>{a.status === 'escalated' && <Badge tone="danger">{t('Escalated')}</Badge>}{a.overdue && <Badge tone="danger">{t('Overdue')}</Badge>}</div>
                <p className="mt-2 break-words text-body font-semibold leading-snug">{a.reason}</p>
                <p className="mt-1 text-caption text-muted">{a.requestedBy} · {timeAgo(a.createdAt, lang)}</p>
              </div>
              <div className="shrink-0 text-end"><p className="num text-[19px] font-semibold leading-6">{fmtMoney(a.amount, lang)}</p>{SLUG[a.refType] && <Link href={`/app/${SLUG[a.refType]}/${a.refId}`} className="mt-1 inline-block text-caption font-semibold text-navy hover:underline">{t('Open the record')} →</Link>}</div>
            </div>
            <dl className="grid grid-cols-3 border-t border-line bg-soft/40 text-small">
              <div className="border-e border-line px-5 py-2.5"><dt className="text-caption text-muted">{t('Step')}</dt><dd className="num font-semibold">{a.currentStep + 1}/{(a.steps as any[]).length}</dd></div>
              <div className="border-e border-line px-5 py-2.5"><dt className="text-caption text-muted">{t('Approver role')}</dt><dd className="truncate font-semibold">{a.stepRole}</dd></div>
              <div className="px-5 py-2.5"><dt className="text-caption text-muted">{t('Due')}</dt><dd className={cn('num truncate font-semibold', a.overdue && 'text-danger')}>{fmtDateTime(a.dueAt, lang)}</dd></div>
            </dl>
            <div className="mt-auto flex gap-2 border-t border-line p-4"><Button icon="check" loading={act.isPending && act.variables?.id === a.id && act.variables?.action === 'approve'} onClick={() => act.mutate({ id: a.id, action: 'approve' })}>{t('Approve')}</Button><Button variant="secondary" className="text-danger" icon="x" onClick={() => setRej(a)}>{t('Reject')}</Button><Link href={`/app/approval-request/${a.id}`} className="ms-auto"><Button variant="ghost">{t('Details')}</Button></Link></div>
          </Card>))}</div>
      )}
      <Modal open={!!rej} onClose={() => setRej(null)} title={t('Reject request')} footer={<><Button variant="secondary" onClick={() => setRej(null)}>{t('Cancel')}</Button><Button variant="danger" disabled={!note.trim()} loading={act.isPending} onClick={() => act.mutate({ id: rej.id, action: 'reject', note })}>{t('Reject')}</Button></>}>
        <p className="mb-3 text-small text-muted">{rej?.reason}</p><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Reason for rejecting')} autoFocus />
      </Modal>
    </div>
  );
}
