'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtNum, fmtDate } from '@/lib/format';
import { BarCard } from '@/components/charts';
import { Badge, Button, Card, EmptyState, ErrorState, SkeletonRows, cn, toast } from '@/components/ui';
import { DashHeader, Panel, TD, TH } from '@/components/erp/dash';

export default function ForecastPage() {
  const { t, lang } = useT(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['forecast'], queryFn: () => api<{ data: any[] }>('/api/v1/reports/forecast/latest') });
  const run = useMutation({ mutationFn: () => api<any>('/api/v1/reports/forecast/run', { method: 'POST' }), onSuccess: (r) => { toast.success(`${r.count} ${t('forecasts refreshed')}`); qc.invalidateQueries({ queryKey: ['forecast'] }); }, onError: (e: any) => toast.error(e.message) });
  const d = q.data?.data ?? [];
  return (
    <div className="space-y-5">
      <DashHeader title={t('Demand & price forecasting')} sub={t('Statistical forecasts from invoiced history, back-tested on the last months. MAPE shows how reliable each forecast has been.')} actions={<><Link href="/app/reorder-suggestion"><Button variant="secondary" icon="lightbulb">{t('Reorder suggestions')}</Button></Link><Button icon="refresh-cw" loading={run.isPending} onClick={() => run.mutate()}>{t('Refresh forecasts')}</Button></>} />
      {q.isLoading ? <Card><SkeletonRows rows={6} cols={5} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : d.length === 0 ? <Card><EmptyState icon="trending-up" title={t('No forecasts yet')} desc={t('Forecasts need at least two months of sales history per part. Invoice some deliveries, then refresh.')} action={<Button loading={run.isPending} onClick={() => run.mutate()}>{t('Refresh forecasts')}</Button>} /></Card> : (
        <><BarCard title={t('Predicted demand next month (top parts)')} data={d.slice(0, 10).map((x) => ({ name: x.part.split(' — ')[0], value: x.predictedQty }))} h={260} />
          <Panel title={t('All forecasts')} icon="trending-up"><div className="sticky-head"><table className="w-full min-w-[640px] text-body"><thead><tr><th className={TH}>{t('Part')}</th><th className={TH}>{t('Segment')}</th><th className={cn(TH, 'text-end')}>{t('Predicted qty')}</th><th className={cn(TH, 'text-end')}>{t('Predicted price')}</th><th className={TH}>MAPE</th><th className={TH}>{t('Model')}</th><th className={TH}>{t('For month')}</th></tr></thead>
            <tbody className="divide-y divide-line">{d.map((x) => <tr key={x.partId} className="transition-colors hover:bg-soft/60"><td className={cn(TD, 'font-semibold')}>{x.part}</td><td className={TD}>{x.segment}</td><td className={cn(TD, 'num text-end')}>{fmtNum(x.predictedQty, lang, 1)}</td><td className={cn(TD, 'num text-end')}>{fmtNum(x.predictedPrice, lang)}</td><td className={TD}>{x.mape == null ? '—' : <Badge tone={x.mape < 25 ? 'success' : x.mape < 50 ? 'warn' : 'danger'}>{fmtNum(x.mape, lang, 0)}%</Badge>}</td><td className={TD}><Badge>{x.model}</Badge></td><td className={cn(TD, 'num text-muted')}>{fmtDate(x.periodStart, lang)}</td></tr>)}</tbody></table></div></Panel></>)}
    </div>
  );
}
