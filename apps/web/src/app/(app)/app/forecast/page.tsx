'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtNum, fmtDate } from '@/lib/format';
import { BarCard } from '@/components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows, toast } from '@/components/ui';

export default function ForecastPage() {
  const { t, lang } = useT(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['forecast'], queryFn: () => api<{ data: any[] }>('/api/v1/reports/forecast/latest') });
  const run = useMutation({ mutationFn: () => api<any>('/api/v1/reports/forecast/run', { method: 'POST' }), onSuccess: (r) => { toast.success(`${r.count} ${t('forecasts refreshed')}`); qc.invalidateQueries({ queryKey: ['forecast'] }); }, onError: (e: any) => toast.error(e.message) });
  const d = q.data?.data ?? [];
  return (
    <>
      <PageHeader title={t('Demand & price forecasting')} sub={t('Statistical forecasts from invoiced history, back-tested on the last months. MAPE shows how reliable each forecast has been.')} actions={<><Link href="/app/reorder-suggestion"><Button variant="secondary" icon="lightbulb">{t('Reorder suggestions')}</Button></Link><Button icon="refresh-cw" loading={run.isPending} onClick={() => run.mutate()}>{t('Refresh forecasts')}</Button></>} />
      {q.isLoading ? <Card><SkeletonRows rows={6} cols={5} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : d.length === 0 ? <Card><EmptyState icon="trending-up" title={t('No forecasts yet')} desc={t('Forecasts need at least two months of sales history per part. Invoice some deliveries, then refresh.')} action={<Button loading={run.isPending} onClick={() => run.mutate()}>{t('Refresh forecasts')}</Button>} /></Card> : (
        <div className="space-y-5"><BarCard title={t('Predicted demand next month (top parts)')} data={d.slice(0, 10).map((x) => ({ name: x.part.split(' — ')[0], value: x.predictedQty }))} h={260} />
          <Card className="overflow-x-auto"><CardHeader title={t('All forecasts')} /><table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-2.5 text-start">{t('Part')}</th><th className="p-2.5 text-start">{t('Segment')}</th><th className="p-2.5 text-start">{t('Predicted qty')}</th><th className="p-2.5 text-start">{t('Predicted price')}</th><th className="p-2.5 text-start">MAPE</th><th className="p-2.5 text-start">{t('Model')}</th><th className="p-2.5 text-start">{t('For month')}</th></tr></thead>
            <tbody className="divide-y divide-line">{d.map((x) => <tr key={x.partId}><td className="p-2.5 font-semibold">{x.part}</td><td className="p-2.5">{x.segment}</td><td className="num p-2.5">{fmtNum(x.predictedQty, lang, 1)}</td><td className="num p-2.5">{fmtNum(x.predictedPrice, lang)}</td><td className="p-2.5">{x.mape == null ? '—' : <Badge tone={x.mape < 25 ? 'success' : x.mape < 50 ? 'warn' : 'danger'}>{fmtNum(x.mape, lang, 0)}%</Badge>}</td><td className="p-2.5"><Badge>{x.model}</Badge></td><td className="num p-2.5">{fmtDate(x.periodStart, lang)}</td></tr>)}</tbody></table></Card></div>)}
    </>
  );
}
