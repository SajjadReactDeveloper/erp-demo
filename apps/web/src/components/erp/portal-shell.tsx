'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Languages, LogOut } from 'lucide-react';
import { API_URL, api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useRequireAuth } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { Button, EmptyState, Icon, Skeleton, Spinner, cn, toast } from '@/components/ui';
import { BaseProvider } from './base';

const NAV = {
  customer: [['', 'layout-dashboard', 'Home', 'الرئيسية'], ['request', 'inbox', 'Requests', 'الطلبات'], ['quotation', 'file-text', 'Quotations', 'عروض الأسعار'], ['sales-order', 'shopping-bag', 'Orders', 'الأوامر'], ['invoice', 'receipt-text', 'Invoices', 'الفواتير'], ['return-auth', 'undo-2', 'Returns', 'المرتجعات'], ['vehicles', 'car', 'Vehicles', 'المركبات'], ['service-booking', 'calendar-check', 'Bookings', 'الحجوزات'], ['customer-address', 'map-pin', 'Addresses', 'العناوين']],
  supplier: [['', 'layout-dashboard', 'Home', 'الرئيسية'], ['rfqs', 'send', 'RFQs', 'طلبات الأسعار'], ['supplier-quote', 'file-input', 'My quotes', 'عروضي'], ['purchase-order', 'shopping-basket', 'Purchase orders', 'أوامر الشراء'], ['supplier-bill', 'receipt', 'Bills', 'الفواتير'], ['catalogue-item', 'book-open', 'Catalogue', 'الكتالوج'], ['availability-feed', 'rss', 'Feeds', 'الخلاصات']],
} as const;

export function PortalShell({ kind, children }: { kind: 'customer' | 'supplier'; children: ReactNode }) {
  const { me, ready, logout } = useRequireAuth(kind); const { t, lang, setLang } = useT(); const path = usePathname(); const base = kind === 'customer' ? '/portal' : '/supplier';
  if (!ready || !me) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
  const items = NAV[kind]; const active = (s: string) => (s === '' ? path === base : path.startsWith(`${base}/${s}`));
  return (
    <BaseProvider value={base}>
      <div className="min-h-screen pb-20 lg:pb-0">
        <header className="no-print sticky top-0 z-30 border-b border-line bg-card/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5">
            <Link href={base} className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-fg"><Icon name="cog" size={20} /></span><b className="hidden sm:block">AutocQuick</b></Link>
            <nav className="ms-4 hidden flex-1 gap-1 overflow-x-auto lg:flex" aria-label="Main">{items.map(([s, icon, en, ar]) => <Link key={s} href={`${base}/${s}`.replace(/\/$/, '')} className={cn('flex items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition', active(s) ? 'bg-primary/12 text-primary' : 'text-fg/75 hover:bg-line/50')}><Icon name={icon} size={16} />{lang === 'ar' ? ar : en}</Link>)}</nav>
            <div className="ms-auto flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><Languages size={17} />{lang === 'ar' ? 'EN' : 'عربي'}</Button><PortalBell /><Button variant="ghost" size="sm" onClick={logout} aria-label={t('Sign out')}><LogOut size={17} /></Button></div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6">{children}</main>
        <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-card/95 backdrop-blur lg:hidden" aria-label="Mobile">{items.slice(0, 6).map(([s, icon, en, ar]) => <Link key={s} href={`${base}/${s}`.replace(/\/$/, '')} className={cn('flex min-w-16 flex-1 flex-col items-center gap-0.5 px-2 py-2 text-[11px] font-semibold', active(s) ? 'text-primary' : 'text-muted')}><Icon name={icon} size={20} />{lang === 'ar' ? ar : en}</Link>)}</nav>
      </div>
    </BaseProvider>
  );
}

function PortalBell() {
  const { t, lang } = useT(); const qc = useQueryClient(); const router = useRouter(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  const count = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ count: number }>('/api/v1/notifications/unread-count'), refetchInterval: 45000 });
  const list = useQuery({ queryKey: ['notifs'], enabled: open, queryFn: () => api<{ data: any[] }>('/api/v1/notifications/mine', { query: { limit: 12 } }) });
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => { const token = getToken(); if (!token) return; const es = new EventSource(`${API_URL}/api/v1/stream?access_token=${encodeURIComponent(token)}`); es.addEventListener('notification', (e: MessageEvent) => { const n = JSON.parse(e.data); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); toast(n.title, { description: n.body, action: n.link ? { label: t('Open'), onClick: () => router.push(n.link) } : undefined }); }); es.addEventListener('delivery', () => qc.invalidateQueries({ queryKey: ['order-track'] })); return () => es.close(); /* eslint-disable-next-line */ }, []);
  const n = count.data?.count ?? 0;
  return (
    <div ref={box} className="relative"><Button variant="ghost" size="sm" onClick={() => setOpen(!open)} aria-label={t('Notifications')} className="relative"><Bell size={18} />{n > 0 && <span className="num absolute -end-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{n > 9 ? '9+' : n}</span>}</Button>
      {open && <div className="absolute end-0 z-40 mt-2 w-[min(92vw,360px)] rounded-2xl border border-line bg-card shadow-2xl animate-in"><div className="flex items-center justify-between border-b border-line px-4 py-3"><b className="text-sm">{t('Notifications')}</b>{n > 0 && <button className="text-xs font-semibold text-primary" onClick={async () => { await api('/api/v1/notifications/read', { method: 'POST', body: { all: true } }); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); }}>{t('Mark all read')}</button>}</div>
        <div className="max-h-80 overflow-y-auto">{list.isLoading ? <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div> : !list.data?.data.length ? <EmptyState icon="bell-off" title={t('No notifications')} /> : list.data.data.map((x) => <button key={x.id} onClick={() => { api('/api/v1/notifications/read', { method: 'POST', body: { ids: [x.id] } }).then(() => qc.invalidateQueries({ queryKey: ['notif-count'] })); if (x.link) router.push(x.link); setOpen(false); }} className={cn('block w-full border-b border-line px-4 py-3 text-start last:border-0 hover:bg-primary/5', !x.read && 'bg-primary/5')}><b className="block truncate text-sm">{x.title}</b>{x.body && <span className="block truncate text-xs text-muted">{x.body}</span>}<span className="text-[11px] text-muted">{timeAgo(x.createdAt, lang)}</span></button>)}</div></div>}</div>
  );
}
