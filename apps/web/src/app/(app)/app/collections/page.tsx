'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Field, Icon, Input, Modal, Select, SkeletonRows, Textarea, cn, toast } from '@/components/ui';
import { DashHeader, Kpi } from '@/components/erp/dash';

export default function CollectionsPage() {
  const { t, lang } = useT(); const qc = useQueryClient(); const { can } = useAuth();
  const q = useQuery({ queryKey: ['worklist'], queryFn: () => api<{ data: any[]; summary: any }>('/api/v1/credit/worklist'), refetchInterval: 60000 });
  const [act, setAct] = useState<{ type: 'call' | 'promise'; row: any } | null>(null);
  const [f, setF] = useState<any>({ kind: 'call', outcome: 'reached', note: '', nextActionDate: '', promisedDate: '', amount: '' });
  const save = useMutation({
    mutationFn: () => act!.type === 'call' ? api('/api/v1/r/collection-activity', { method: 'POST', body: { customerId: act!.row.customerId, kind: f.kind, outcome: f.outcome, note: f.note, nextActionDate: f.nextActionDate || undefined } }) : api('/api/v1/r/promise-to-pay', { method: 'POST', body: { customerId: act!.row.customerId, promisedDate: f.promisedDate, amount: f.amount, note: f.note } }),
    onSuccess: () => { toast.success(t('Saved successfully')); setAct(null); qc.invalidateQueries({ queryKey: ['worklist'] }); }, onError: (e: any) => toast.error(e.message),
  });
  const remind = useMutation({ mutationFn: (customerId: string) => api<any>('/api/v1/credit/statements/send', { method: 'POST', body: { customerId } }), onSuccess: (r) => (r.ok ? toast.success(t('Reminder sent')) : toast.warning(t('Could not send (opted out or no phone)'))), onError: (e: any) => toast.error(e.message) });
  const s = q.data?.summary;
  return (
    <div className="space-y-5">
      <DashHeader title={t('Collections workbench')} sub={t('Prioritised daily list: highest overdue exposure first.')} />
      <div className="grid gap-4 md:grid-cols-3">
        <Kpi loading={q.isLoading} icon="users" label={t('Customers to follow up')} value={s?.customers} />
        <Kpi loading={q.isLoading} icon="triangle-alert" tone="danger" label={t('Total overdue')} value={s ? <span className="num"><span className="me-1.5 text-[0.5em] font-semibold opacity-55">{lang === 'ar' ? 'ر.س' : 'SAR'}</span>{fmtNum(s.totalOverdue, lang, 2)}</span> : undefined} />
        <Kpi loading={q.isLoading} icon="calendar-clock" tone="warn" label={t('Due today')} value={s?.dueToday} />
      </div>
      {q.isLoading ? <Card><SkeletonRows rows={6} cols={5} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : q.data!.data.length === 0 ? <Card><EmptyState icon="party-popper" title={t('No overdue customers')} desc={t('Great work — nothing to collect right now.')} /></Card> : (
        <Card className="overflow-hidden"><ul className="divide-y divide-line">{q.data!.data.map((r, i) => (
          <li key={r.customerId} className={cn('relative p-5 transition-colors hover:bg-soft/40', r.brokenPromise && 'bg-danger-bg/30')}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="num grid h-9 w-9 shrink-0 place-items-center bg-navy text-small font-bold text-gold">{i + 1}</span>
              <div className="min-w-[200px] flex-1"><Link href={`/app/customer/${r.customerId}`} className="text-body font-bold hover:text-navy hover:underline">{r.name}</Link><p className="num text-caption text-muted" dir="ltr">{r.phone}</p></div>
              <div className="flex flex-wrap items-center gap-2"><Badge tone="muted">{r.invoices} {t('invoices')}</Badge><Badge tone="warn">{r.oldestDays} {t('days late')}</Badge>{r.brokenPromise && <Badge tone="danger">{t('Broken promise')}</Badge>}{r.dueToday && <Badge tone="info">{t('Follow up today')}</Badge>}</div>
              <p className="num min-w-[120px] text-end text-[19px] font-semibold leading-6 text-danger">{fmtMoney(r.overdue, lang)}</p>
            </div>
            {(r.lastActivity || r.nextActionDate || r.promises.length > 0) && <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 ps-14 text-caption text-muted">
              {r.lastActivity && <span className="inline-flex items-center gap-1.5"><Icon name="history" size={13} />{t('Last')}: {r.lastActivity.kind} · {r.lastActivity.outcome} · {fmtDate(r.lastActivity.at, lang)}</span>}{r.nextActionDate && <span className="inline-flex items-center gap-1.5"><Icon name="calendar-clock" size={13} />{t('Next action')}: {fmtDate(r.nextActionDate, lang)}</span>}
              {r.promises.map((p: any) => <span key={p.id} className="inline-flex items-center gap-1.5 font-semibold text-info"><Icon name="handshake" size={13} />{t('Promise')}: {fmtMoney(p.amount, lang)} · {fmtDate(p.date, lang)}</span>)}
            </div>}
            <div className="mt-4 flex flex-wrap gap-2 ps-14">{can({ mod: 'credit', slug: 'collection-activity' }, 'create') && <Button size="sm" icon="phone-call" onClick={() => { setF({ kind: 'call', outcome: 'reached', note: '', nextActionDate: toInputDate(new Date(Date.now() + 3 * 864e5)) }); setAct({ type: 'call', row: r }); }}>{t('Log call / visit')}</Button>}<Button size="sm" variant="secondary" icon="handshake" onClick={() => { setF({ promisedDate: toInputDate(new Date(Date.now() + 5 * 864e5)), amount: r.overdue, note: '' }); setAct({ type: 'promise', row: r }); }}>{t('Promise to pay')}</Button><Button size="sm" variant="secondary" icon="message-circle" loading={remind.isPending && remind.variables === r.customerId} onClick={() => remind.mutate(r.customerId)}>{t('Send reminder')}</Button><Link href={`/app/customer/${r.customerId}`}><Button size="sm" variant="ghost">{t('Customer 360')}</Button></Link></div>
          </li>))}</ul></Card>
      )}
      <Modal open={!!act} onClose={() => setAct(null)} title={act?.type === 'call' ? t('Log collection activity') : t('Record promise to pay')} footer={<><Button variant="secondary" onClick={() => setAct(null)}>{t('Cancel')}</Button><Button loading={save.isPending} disabled={act?.type === 'promise' && (!f.promisedDate || !f.amount)} onClick={() => save.mutate()}>{t('Save')}</Button></>}>
        <p className="mb-3 text-sm font-semibold">{act?.row.name}</p>
        {act?.type === 'call' ? <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label={t('Type')}><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{['call', 'visit', 'whatsapp', 'email', 'sms', 'note'].map((k) => <option key={k}>{k}</option>)}</Select></Field><Field label={t('Outcome')}><Select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>{['reached', 'no_answer', 'promise', 'dispute', 'paid', 'escalated'].map((k) => <option key={k}>{k}</option>)}</Select></Field></div><Field label={t('Next action date')}><Input type="date" value={f.nextActionDate} onChange={(e) => setF({ ...f, nextActionDate: e.target.value })} dir="ltr" /></Field><Field label={t('Notes')}><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
          : <div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label={t('Promised date')} required><Input type="date" value={f.promisedDate} onChange={(e) => setF({ ...f, promisedDate: e.target.value })} dir="ltr" /></Field><Field label={t('Amount')} required><Input type="number" step="any" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} dir="ltr" /></Field></div><Field label={t('Notes')}><Textarea value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>}
      </Modal>
    </div>
  );
}
