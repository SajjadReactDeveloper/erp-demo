'use client';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Icon, NoAccess, PageHeader, SkeletonCards, Stat, cn, toast } from '@/components/ui';
import { useState } from 'react';

const JOBS = [['reminders', 'Run payment reminders'], ['credit-sweep', 'Run credit sweep (holds & alerts)'], ['supplier-scores', 'Recompute supplier scores'], ['forecast', 'Refresh forecasts'], ['reorder', 'Generate reorder suggestions'], ['vehicle-reminders', 'Generate vehicle service reminders'], ['zatca-retry', 'Retry pending ZATCA submissions']];

export default function IntegrationsPage() {
  const { t, lang } = useT(); const { can, ready } = useAuth(); const [cut, setCut] = useState(false);
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api<any>('/api/v1/system/integrations'), refetchInterval: 30000 });
  const daf = useQuery({ queryKey: ['daftra'], queryFn: () => api<{ data: any }>('/api/v1/finance/daftra/reconciliation'), retry: false });
  const job = useMutation({ mutationFn: (n: string) => api<any>(`/api/v1/admin/jobs/${n}`, { method: 'POST' }), onSuccess: (r, n) => toast.success(`${n}: ${JSON.stringify(r.result)}`), onError: (e: any) => toast.error(e.message) });
  const cutover = useMutation({ mutationFn: () => api<any>('/api/v1/finance/daftra/cutover', { method: 'POST', body: { confirm: true } }), onSuccess: (r) => { toast.success(r.message); setCut(false); daf.refetch(); }, onError: (e: any) => { setCut(false); toast.error(e.message); } });
  if (ready && !can({ mod: 'platform', slug: 'integration-message' })) return <NoAccess />;
  const d = q.data; const r = daf.data?.data;
  return (
    <>
      <PageHeader title={t('Integrations')} sub={t('Every external call is logged, retried and replayable.')} actions={<Link href="/app/integration-message"><Button variant="secondary" icon="list">{t('Message log')}</Button></Link>} />
      {q.isLoading ? <SkeletonCards n={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label={t('Outbox pending')} value={d.outbox.pending} icon="send" /><Stat label={t('Outbox failed')} value={d.outbox.failed} icon="alert-triangle" tone={d.outbox.failed ? 'danger' : 'success'} /><Stat label="ZATCA" value="Simulation" icon="qr-code" tone="warn" /><Stat label="LLM" value={d.live.llm ? 'Live' : 'Local rules'} icon="sparkles" /></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(d.live).map(([k, live]) => { const p = d.providers.find((x: any) => x.provider === k); return (
            <Card key={k} className="p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 font-bold capitalize"><Icon name={k === 'whatsapp' ? 'message-circle' : k === 'sms' ? 'smartphone' : k === 'email' ? 'mail' : k === 'payment' ? 'credit-card' : k === 'llm' ? 'sparkles' : 'plug'} className="text-primary" />{k}</div><Badge tone={live ? 'success' : 'warn'}>{live ? t('Live') : t('Simulated')}</Badge></div>
              <p className="mt-3 text-xs text-muted">{p ? `${p.ok} ok · ${p.error} errors · ${p.retry} retry · ${t('last')} ${fmtDateTime(p.last, lang)}` : t('No traffic in the last 7 days')}</p></Card>); })}</div>
          <Card><CardHeader title={t('Daftra transition')} sub={t('The ERP is the book of record. Daftra stays in sync until cut-over, then becomes a read-only archive.')} />
            {daf.isLoading ? <div className="p-5"><SkeletonCards n={2} /></div> : r ? <div className="space-y-4 p-5"><div className="grid gap-3 sm:grid-cols-4"><Stat label={t('Mode')} value={r.mode} icon="refresh-cw" /><Stat label={t('Issued invoices')} value={r.issuedInvoices} icon="receipt" /><Stat label={t('Synced')} value={r.syncedInvoices} icon="check" tone="success" /><Stat label={t('Sync errors')} value={r.syncErrors} icon="x-circle" tone={r.syncErrors ? 'danger' : 'success'} /></div>
              <div className={cn('rounded-xl border p-3 text-sm', r.trialBalance.balanced ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger')}>{r.trialBalance.balanced ? t('Trial balance is balanced') : t('Trial balance is NOT balanced')}</div>
              {r.mode === 'push' ? <Button variant={r.readyForCutover ? 'primary' : 'secondary'} onClick={() => setCut(true)} icon="flag">{t('Cut over to the ERP ledger')}</Button> : <Badge tone="success">{t('Cut-over done: Daftra is read-only')}</Badge>}</div> : <p className="p-5 text-sm text-muted">{t('Only finance can see this.')}</p>}</Card>
          <Card><CardHeader title={t('Run a background job now')} /><div className="flex flex-wrap gap-2 p-4">{JOBS.map(([k, l]) => <Button key={k} variant="secondary" size="sm" loading={job.isPending && job.variables === k} onClick={() => job.mutate(k)}>{t(l)}</Button>)}</div></Card>
        </div>)}
      <ConfirmDialog open={cut} onClose={() => setCut(false)} onConfirm={() => cutover.mutate()} loading={cutover.isPending} danger title={t('Cut over from Daftra')} message={t('Daftra becomes read-only and no more data is pushed to it. This is done once, after the parallel run is reconciled.')} confirmText={t('Cut over')} />
    </>
  );
}
