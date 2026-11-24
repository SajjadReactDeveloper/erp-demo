'use client';
import Link from 'next/link';
import { ChevronRight, MapPin, Package, Route } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useWorkset } from '@/lib/offline';
import { fmtDate } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, Skeleton, StatusBadge, cn } from '@/components/ui';

export default function Deliveries() {
  const { t, lang } = useT(); const { ws, loading, error, refresh } = useWorkset();
  if (loading && !ws) return <div className="space-y-3">{[1, 2, 3].map((i) => <Card key={i} className="space-y-2 p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48" /></Card>)}</div>;
  if (error && !ws) return <ErrorState error={{ message: error }} onRetry={refresh} />;
  const dns: any[] = ws?.deliveries ?? [];
  const doneN = dns.filter((d) => ['delivered', 'failed'].includes(d.status)).length;
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-light p-5 text-white shadow-md">
        <Route size={110} strokeWidth={1.2} className="pointer-events-none absolute -bottom-3 -end-3 opacity-10" />
        <div className="flex items-start justify-between"><div><h1 className="text-2xl font-extrabold tracking-tight">{t('Deliveries')}</h1><p className="mt-0.5 text-sm text-onnavy-muted">{t('Your route for today')}</p></div></div>
        <div className="mt-4 flex items-end gap-6"><div><span className="text-4xl font-black leading-none">{dns.length}</span><span className="ms-2 text-sm text-onnavy-secondary">{t('stops')}</span></div><div><span className="text-2xl font-extrabold leading-none text-gold">{doneN}</span><span className="ms-2 text-sm text-onnavy-secondary">{t('done')}</span></div></div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full bg-gold transition-all" style={{ width: `${dns.length ? (doneN / dns.length) * 100 : 0}%` }} /></div>
      </div>
      {dns.length === 0 ? <Card><EmptyState icon="truck" title={t('No deliveries assigned')} desc={t('Your route will appear here once a dispatcher assigns it.')} /></Card> : dns.map((d, i) => {
        const fin = ['delivered', 'failed'].includes(d.status);
        return (
          <Link key={d.id} href={`/m/deliveries/${d.id}`} className="block">
            <Card className={cn('relative overflow-hidden p-4 ps-5 shadow-sm transition active:scale-[.98]', fin && 'opacity-70')}>
              <span className={cn('absolute inset-y-0 start-0 w-1.5', d.status === 'delivered' ? 'bg-success' : d.status === 'failed' ? 'bg-danger' : 'bg-gold')} />
              <div className="flex items-center gap-3">
                <span className="num grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy text-base font-extrabold text-gold shadow">{d.routeSeq || i + 1}</span>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><b className="num truncate text-base">{d.number}</b><StatusBadge value={d.status} /></div><p className="truncate font-semibold text-navy">{d.customer?.name}</p></div>
                <ChevronRight size={18} className={cn('shrink-0 text-muted', lang === 'ar' && 'rotate-180')} />
              </div>
              <p className="mt-3 flex items-start gap-1.5 text-sm text-muted"><MapPin size={15} className="mt-0.5 shrink-0 text-gold-text" />{d.address?.line1} {d.address?.city}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">{d.routeArea && <Badge>{d.routeArea}</Badge>}<Badge>{fmtDate(d.plannedDate, lang)}</Badge><Badge tone="info"><Package size={12} />{d.lines.length} {t('lines')}</Badge></div>
            </Card>
          </Link>);
      })}
    </div>
  );
}
