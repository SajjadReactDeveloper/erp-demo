'use client';
import Link from 'next/link';
import { ChevronRight, PackageCheck, Truck } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useWorkset, useQueue } from '@/lib/offline';
import { ErrorState, Skeleton, cn } from '@/components/ui';

export default function MobileHome() {
  const { t, lang } = useT(); const { ws, loading, error, refresh } = useWorkset(); const { queue } = useQueue();
  const tiles = [
    { href: '/m/receive', icon: PackageCheck, title: t('Receive goods'), hint: t('Scan items against the purchase order'), n: ws?.purchaseOrders?.length ?? 0, unit: t('purchase orders'), tone: 'from-navy to-navy-light text-white', chip: 'bg-gold text-navy' },
    { href: '/m/deliveries', icon: Truck, title: t('Deliveries'), hint: t('Deliver with signature, photo and location'), n: ws?.deliveries?.length ?? 0, unit: t('stops'), tone: 'from-gold-light to-white text-navy border border-gold-border', chip: 'bg-navy text-white' },
  ];
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-extrabold tracking-tight text-navy">{t('What are you doing now?')}</h1><p className="mt-1 text-sm text-muted">{t('Pick a task to get started')}</p></div>
      {error && !ws && <ErrorState error={{ message: error }} onRetry={refresh} compact />}
      {tiles.map((x) => (
        <Link key={x.href} href={x.href} className="block">
          <div className={cn('relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 shadow-md transition active:scale-[.98]', x.tone)}>
            <x.icon size={120} strokeWidth={1.2} className="pointer-events-none absolute -bottom-4 -end-4 opacity-10" />
            <div className="flex items-start gap-4">
              <span className={cn('grid h-14 w-14 shrink-0 place-items-center rounded-2xl shadow', x.chip)}><x.icon size={28} /></span>
              <div className="min-w-0 flex-1"><b className="block text-xl font-extrabold">{x.title}</b><span className="mt-0.5 block text-sm opacity-75">{x.hint}</span></div>
              <ChevronRight size={22} className={cn('mt-4 shrink-0 opacity-60', lang === 'ar' && 'rotate-180')} />
            </div>
            <div className="mt-4 flex items-baseline gap-2 border-t border-current/10 pt-3">{loading && !ws ? <Skeleton className="h-8 w-16" /> : <span className="text-4xl font-black leading-none">{x.n}</span>}<span className="text-sm font-semibold opacity-75">{x.unit}</span></div>
          </div>
        </Link>
      ))}
      {queue.length > 0 && <Link href="/m/sync" className="flex items-center justify-center gap-2 rounded-2xl border border-gold-border bg-gold-light p-3 text-center text-sm font-bold text-gold-text">{queue.length} {t('actions waiting to sync')}</Link>}
    </div>
  );
}
