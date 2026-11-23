'use client';
import Link from 'next/link';
import { PackageCheck, Truck } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useWorkset, useQueue } from '@/lib/offline';
import { Card, ErrorState, Skeleton } from '@/components/ui';

export default function MobileHome() {
  const { t } = useT(); const { ws, loading, error, refresh } = useWorkset(); const { queue } = useQueue();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">{t('What are you doing now?')}</h1>
      {error && !ws && <ErrorState error={{ message: error }} onRetry={refresh} compact />}
      <Link href="/m/receive"><Card className="flex items-center gap-4 p-5 transition active:scale-[.98]"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><PackageCheck size={30} /></span><span className="flex-1"><b className="block text-lg">{t('Receive goods')}</b><span className="text-sm text-muted">{loading && !ws ? <Skeleton className="mt-1 h-3 w-24" /> : `${ws?.purchaseOrders?.length ?? 0} ${t('purchase orders')}`}</span></span></Card></Link>
      <Link href="/m/deliveries"><Card className="flex items-center gap-4 p-5 transition active:scale-[.98]"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-info/10 text-info"><Truck size={30} /></span><span className="flex-1"><b className="block text-lg">{t('Deliveries')}</b><span className="text-sm text-muted">{loading && !ws ? <Skeleton className="mt-1 h-3 w-24" /> : `${ws?.deliveries?.length ?? 0} ${t('stops')}`}</span></span></Card></Link>
      {queue.length > 0 && <Link href="/m/sync" className="block rounded-xl bg-warn/10 p-3 text-center text-sm font-semibold text-warn">{queue.length} {t('actions waiting to sync')}</Link>}
    </div>
  );
}
