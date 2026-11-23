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
  return (
    <div className="mx-auto min-h-screen max-w-xl bg-bg pb-6">
      <header className="sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div className="flex items-center gap-2 px-4 py-3"><Link href="/m" className="text-lg font-extrabold text-primary">AQ Logistics</Link><span className="text-xs text-muted">{me.name}</span>
          <div className="ms-auto flex items-center gap-2"><Badge tone={online ? 'success' : 'danger'}>{online ? <Wifi size={12} /> : <CloudOff size={12} />}{online ? t('Online') : t('Offline')}</Badge>
            {(pending > 0 || errs > 0) && <Link href="/m/sync"><Badge tone={errs ? 'danger' : 'warn'}>{pending + errs} {t('Pending sync')}</Badge></Link>}
            <Button size="sm" variant="ghost" onClick={() => sync()} disabled={!online} aria-label={t('Sync now')}><RefreshCw size={16} className={cn(busy && 'animate-spin')} /></Button></div></div>
        {path !== '/m' && <nav className="flex gap-1 px-3 pb-2 text-sm font-semibold"><Link href="/m" className="rounded-lg px-3 py-1.5 hover:bg-line/50">{t('Home')}</Link><Link href="/m/receive" className={cn('rounded-lg px-3 py-1.5', path.startsWith('/m/receive') && 'bg-primary/10 text-primary')}>{t('Receive')}</Link><Link href="/m/deliveries" className={cn('rounded-lg px-3 py-1.5', path.startsWith('/m/deliveries') && 'bg-primary/10 text-primary')}>{t('Deliveries')}</Link><button className="ms-auto rounded-lg px-3 py-1.5 text-muted hover:bg-line/50" onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}><span lang={lang === 'ar' ? 'en' : 'ar'} dir={lang === 'ar' ? 'ltr' : 'rtl'} className={lang === 'ar' ? 'font-sans' : 'font-arabic font-medium'}>{lang === 'ar' ? 'EN' : 'العربية'}</span></button></nav>}
      </header>
      <main className="p-4">{children}</main>
      {path === '/m' && <footer className="px-4 pt-6 text-center"><button className="text-sm text-muted underline" onClick={logout}>{t('Sign out')}</button></footer>}
    </div>
  );
}
