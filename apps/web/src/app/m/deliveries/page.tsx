'use client';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { useWorkset } from '@/lib/offline';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, StatusBadge } from '@/components/ui';

export default function Deliveries() {
  const { t, lang } = useT(); const { ws, loading, error, refresh } = useWorkset();
  if (loading && !ws) return <div className="space-y-3">{[1, 2, 3].map((i) => <Card key={i} className="space-y-2 p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48" /></Card>)}</div>;
  if (error && !ws) return <ErrorState error={{ message: error }} onRetry={refresh} />;
  const dns: any[] = ws?.deliveries ?? [];
  return (
    <div className="space-y-3"><div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">{t('Deliveries')}</h1><Button size="sm" variant="secondary" icon="refresh-cw" onClick={refresh}>{t('Refresh')}</Button></div>
      {dns.length === 0 ? <Card><EmptyState icon="truck" title={t('No deliveries assigned')} desc={t('Your route will appear here once a dispatcher assigns it.')} /></Card> : dns.map((d, i) => (
        <Link key={d.id} href={`/m/deliveries/${d.id}`}><Card className="space-y-1.5 p-4 transition active:scale-[.98]"><div className="flex items-center justify-between"><span className="flex items-center gap-2"><span className="num grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">{d.routeSeq || i + 1}</span><b className="text-lg">{d.number}</b></span><StatusBadge value={d.status} /></div>
          <p className="font-semibold">{d.customer?.name}</p><p className="text-sm text-muted">{d.address?.line1} {d.address?.city}</p><div className="flex flex-wrap gap-1.5"><Badge>{d.routeArea ?? '—'}</Badge><Badge>{fmtDate(d.plannedDate, lang)}</Badge><Badge tone="info">{d.lines.length} {t('lines')}</Badge></div></Card></Link>))}</div>
  );
}
