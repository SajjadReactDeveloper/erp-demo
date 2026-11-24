'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CloudOff, RefreshCw, Wifi } from 'lucide-react';
import { flush, useOnline, useQueue } from '@/lib/offline';
import { useRequireAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Spinner, cn, toast } from '@/components/ui';

export default function MobileLayout({ children }: { children: ReactNode }) {
  const { me, ready, logout } = useRequireAuth('staff'); const { t, lang, setLang } = useT(); const online = useOnline(); const { queue } = useQueue(); const path = usePathname(); const [busy, setBusy] = useState(false);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => null); }, []);
  const sync = async (silent = false) => { setBusy(true); try { const r = await flush(); if (!silent && (r.ok || r.errors)) toast[r.errors ? 'warning' : 'success'](`${t('Synced')}: ${r.ok}${r.errors ? ` · ${r.errors} ${t('need attention')}` : ''}`); } catch (e: any) { if (!silent) toast.error(e.message); } finally { setBusy(false); } };
  useEffect(() => { if (online) sync(true); const i = setInterval(() => navigator.onLine && sync(true), 30000); return () => clearInterval(i); /* eslint-disable-next-line */ }, [online]);
  if (!ready || !me) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
  const pending = queue.filter((e) => e.status === 'pending').length, errs = queue.filter((e) => e.status === 'error').length;
  const home = path === '/m';
  const pill = (href: string, label: string, active: boolean) => <Link href={href} className={cn('rounded-full px-4 py-1.5 text-sm font-semibold transition', active ? 'bg-gold text-navy shadow-sm' : 'bg-white/10 text-onnavy-secondary hover:bg-white/15')}>{label}</Link>;
  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg pb-8">
      <header className="sticky top-0 z-30 bg-gradient-to-br from-navy via-navy to-navy-light text-white shadow-lg shadow-navy/20">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <Link href="/m" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gold text-xl font-black text-navy shadow-md">A</Link>
          <div className="min-w-0 flex-1 leading-tight"><Link href="/m" className="block text-lg font-extrabold tracking-tight">Autoc<span className="text-gold">Quick</span> <span className="font-medium text-onnavy-muted">{t('Logistics')}</span></Link><span className="block truncate text-xs text-onnavy-muted">{me.name}</span></div>
          <button onClick={() => sync()} disabled={!online} aria-label={t('Sync now')} className="grid h-10 w-10 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 active:scale-95 disabled:opacity-50"><RefreshCw size={17} className={cn(busy && 'animate-spin')} /></button>
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} className="grid h-10 min-w-10 place-items-center rounded-full bg-white/10 px-3 text-xs font-bold transition hover:bg-white/20"><span lang={lang === 'ar' ? 'en' : 'ar'} className={lang === 'ar' ? 'font-sans' : 'font-arabic'}>{lang === 'ar' ? 'EN' : 'ع'}</span></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', online ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300')}>{online ? <Wifi size={13} /> : <CloudOff size={13} />}{online ? t('Online') : t('Offline')}</span>
          {(pending > 0 || errs > 0) && <Link href="/m/sync" className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold', errs ? 'bg-red-400/15 text-red-300' : 'bg-gold/20 text-gold')}>{pending + errs} {t('Pending sync')}</Link>}
          {!home && <nav className="ms-auto flex gap-2">{pill('/m', t('Home'), false)}{pill('/m/receive', t('Receive'), path.startsWith('/m/receive'))}{pill('/m/deliveries', t('Deliveries'), path.startsWith('/m/deliveries'))}</nav>}
        </div>
        <div className="h-1 bg-gradient-to-r from-gold via-gold-hover to-transparent" />
      </header>
      <main className="p-4">{children}</main>
      {home && <footer className="px-4 pt-4 text-center"><button className="rounded-full border border-line bg-card px-6 py-2.5 text-sm font-semibold text-muted shadow-sm transition hover:text-navy active:scale-95" onClick={logout}>{t('Sign out')}</button></footer>}
    </div>
  );
}
