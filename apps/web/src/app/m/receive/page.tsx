'use client';
import Link from 'next/link';
import { useT } from '@/lib/i18n';
import { useWorkset } from '@/lib/offline';
import { fmtDate } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui';

export default function ReceiveList() {
  const { t, lang } = useT(); const { ws, loading, error, refresh } = useWorkset();
  if (loading && !ws) return <div className="space-y-3">{[1, 2, 3].map((i) => <Card key={i} className="space-y-2 p-4"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-48" /></Card>)}</div>;
  if (error && !ws) return <ErrorState error={{ message: error }} onRetry={refresh} />;
  const pos: any[] = ws?.purchaseOrders ?? [];
  return (
    <div className="space-y-3"><div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">{t('Receive goods')}</h1><Button size="sm" variant="secondary" icon="refresh-cw" onClick={refresh}>{t('Refresh')}</Button></div>
      {pos.length === 0 ? <Card><EmptyState icon="package-check" title={t('Nothing to receive')} desc={t('Purchase orders sent to suppliers will show here.')} /></Card> : pos.map((p) => { const rem = p.lines.reduce((s: number, l: any) => s + Math.max(0, l.qty - l.received), 0); return (
        <Link key={p.id} href={`/m/receive/${p.id}`}><Card className="space-y-1 p-4 transition active:scale-[.98]"><div className="flex items-center justify-between"><b className="text-lg">{p.number}</b><Badge tone={p.status === 'partially_received' ? 'warn' : 'info'}>{p.status.replace('_', ' ')}</Badge></div><p className="text-sm">{p.supplier}</p><p className="text-xs text-muted">{t('Expected')} {fmtDate(p.expectedDate, lang)} · {p.lines.length} {t('lines')} · {rem} {t('units to receive')}</p></Card></Link>); })}</div>
  );
}
