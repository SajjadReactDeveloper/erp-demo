'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_SLUG, MODULES, RESOURCES } from '@erp/shared';
import { Bell, ChevronDown, LogOut, Menu, Plus, Search, X } from 'lucide-react';
import { API_URL, api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { fmtDate, fmtHijri, fmtMoney, timeAgo } from '@/lib/format';
import { Avatar, Button, EmptyState, Icon, Input, Progress, Skeleton, Spinner, cn, toast } from '@/components/ui';
import { useDebounced } from './fields';

type NavItem = { href: string; icon: string; en: string; ar: string; slug?: string; count?: 'approvals' | 'holds' };
const GROUPS: { en: string; ar: string; items: NavItem[] }[] = [
  { en: 'Main', ar: 'الرئيسية', items: [
    { href: '/app', icon: 'layout-dashboard', en: 'Dashboard', ar: 'لوحة المعلومات' }, { href: '/app/request', icon: 'inbox', en: 'Customer requests', ar: 'طلبات العملاء', slug: 'request' },
    { href: '/app/quotation', icon: 'file-text', en: 'Quotations', ar: 'عروض الأسعار', slug: 'quotation' }, { href: '/app/sales-order', icon: 'shopping-bag', en: 'Sales orders', ar: 'أوامر البيع', slug: 'sales-order' },
    { href: '/app/approvals', icon: 'check-circle-2', en: 'Approvals', ar: 'الاعتمادات', count: 'approvals' },
  ] },
  { en: 'Operations', ar: 'العمليات', items: [
    { href: '/app/rfq', icon: 'send', en: 'Purchasing & RFQs', ar: 'المشتريات وطلبات الأسعار', slug: 'rfq' }, { href: '/app/delivery-note', icon: 'truck', en: 'Logistics', ar: 'الخدمات اللوجستية', slug: 'delivery-note' },
    { href: '/app/customer', icon: 'users', en: 'Customers & suppliers', ar: 'العملاء والموردون', slug: 'customer' }, { href: '/app/pos', icon: 'monitor-smartphone', en: 'Point of sale', ar: 'نقطة البيع', slug: 'pos-sale' },
  ] },
  { en: 'Finance', ar: 'المالية', items: [
    { href: '/app/journal-entry', icon: 'book-open-check', en: 'Accounting', ar: 'المحاسبة', slug: 'journal-entry' }, { href: '/app/collections', icon: 'wallet', en: 'Credit & collections', ar: 'الائتمان والتحصيل', slug: 'promise-to-pay', count: 'holds' },
    { href: '/app/invoice', icon: 'receipt-text', en: 'ZATCA invoices', ar: 'فواتير زاتكا', slug: 'invoice' }, { href: '/app/reports/pnl', icon: 'bar-chart-3', en: 'Reports', ar: 'التقارير', slug: 'journal-entry' },
  ] },
  { en: 'Intelligence', ar: 'الذكاء', items: [
    { href: '/app/assistant', icon: 'sparkles', en: 'Assistant', ar: 'المساعد الذكي' }, { href: '/app/forecast', icon: 'trending-up', en: 'Forecasting', ar: 'التوقعات', slug: 'forecast' },
  ] },
];
const DASH = [['executive', 'Executive', 'التنفيذية'], ['sales', 'Sales', 'المبيعات'], ['profitability', 'Profitability', 'الربحية'], ['expenses', 'Expenses', 'المصروفات'], ['receivables', 'Receivables', 'الذمم المدينة'], ['procurement', 'Procurement', 'المشتريات'], ['operations', 'Operations', 'العمليات'], ['history', 'History', 'التاريخ'], ['branch', 'Branches', 'الفروع']];
const REPORTS = [['trial-balance', 'Trial balance', 'ميزان المراجعة'], ['pnl', 'Profit & loss', 'قائمة الدخل'], ['balance-sheet', 'Balance sheet', 'الميزانية العمومية'], ['cash-flow', 'Cash flow', 'التدفقات النقدية'], ['vat', 'VAT', 'ضريبة القيمة المضافة'], ['ageing', 'Ageing', 'أعمار الديون'], ['supplier-performance', 'Supplier performance', 'أداء الموردين']];
const ADMIN = [{ href: '/app/imports', icon: 'upload', en: 'Import data', ar: 'استيراد البيانات' }, { href: '/app/integrations', icon: 'plug', en: 'Integrations', ar: 'التكاملات' }, { href: '/app/settings', icon: 'sliders-horizontal', en: 'Settings', ar: 'الإعدادات' }];

function usePageTitle() {
  const { lang, rl } = useT(); const path = usePathname();
  return useMemo(() => {
    const seg = path.split('/').filter(Boolean); const k = seg[1];
    if (!k) return lang === 'ar' ? 'لوحة المعلومات' : 'Dashboard';
    if (k === 'dashboards') return lang === 'ar' ? 'لوحات المعلومات' : 'Dashboards'; if (k === 'reports') return lang === 'ar' ? 'التقارير' : 'Reports';
    const hit = [...GROUPS.flatMap((g) => g.items), ...ADMIN].find((i) => i.href === `/app/${k}`); if (hit) return lang === 'ar' ? hit.ar : hit.en;
    const res = BY_SLUG[k]; return res ? rl(res, true) : '';
  }, [path, lang, rl]);
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, ready } = useRequireAuth('staff');
  const { t, dir } = useT(); const path = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (!ready || !me) return <div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>;
  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-sm focus:bg-gold focus:p-2 focus:text-navy">{t('Skip to content')}</a>
      {open && <div className="fixed inset-0 z-30 bg-navy/50 md:hidden" onClick={() => setOpen(false)} />}
      <aside aria-label="Main navigation" className={cn('no-print fixed inset-y-0 z-40 flex w-sidebar flex-col bg-navy transition-transform md:sticky md:top-0 md:z-20 md:h-screen md:w-rail md:translate-x-0 xl:w-sidebar', dir === 'rtl' ? 'right-0' : 'left-0', open ? 'translate-x-0' : dir === 'rtl' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')}>
        <Sidebar onClose={() => setOpen(false)} />
      </aside>
      <div className="min-w-0 flex-1">
        <Topbar onMenu={() => setOpen(true)} />
        <main id="main" className="mx-auto w-full max-w-content px-4 pb-12 pt-6 sm:px-9 sm:pt-7">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const { lang, t } = useT(); const { me, company, can, logout } = useAuth(); const path = usePathname(); const [more, setMore] = useState<Record<string, boolean>>({});
  const L = 'inline md:hidden xl:inline'; // labels hide in the 76px rail (tablet widths)
  const active = (h: string) => (h === '/app' ? path === '/app' : path === h || path.startsWith(h + '/') || (h === '/app/reports/pnl' && path.startsWith('/app/reports')));
  const pending = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api<{ data: any[] }>('/api/v1/approvals/inbox'), refetchInterval: 60000, enabled: can({ mod: 'platform', slug: 'approval-request' }) });
  const holds = useQuery({ queryKey: ['holds-count'], queryFn: () => api<{ meta: { total: number } }>('/api/v1/r/credit-hold', { query: { limit: 1, 'f.status': 'held' } }), refetchInterval: 90000, enabled: can({ mod: 'credit', slug: 'credit-hold' }) });
  const target = useQuery({ queryKey: ['dash', 'sales-target'], queryFn: () => api<any>('/api/v1/dashboards/sales'), enabled: can({ mod: 'sales', slug: 'quotation' }), staleTime: 120000 });
  const tg = (target.data?.targets ?? []) as any[]; const tAmt = tg.reduce((s, x) => s + x.target, 0), aAmt = tg.reduce((s, x) => s + x.achieved, 0);
  const childKeys = useMemo(() => new Set(RESOURCES.flatMap((r) => r.children.map((c) => c.key))), []);
  const modules = MODULES.map((m) => ({ ...m, items: RESOURCES.filter((r) => r.mod === m.key && !r.sys && !childKeys.has(r.key) && can(r, 'read')) })).filter((g) => g.items.length);
  const Item = ({ it }: { it: NavItem }) => {
    if (it.slug && !can({ mod: 'x', slug: it.slug } as any) && !me?.permissions.includes('*') && !RESOURCES.find((r) => r.slug === it.slug && can(r, 'read'))) return null;
    const on = active(it.href); const n = it.count === 'approvals' ? pending.data?.data.length : it.count === 'holds' ? holds.data?.meta.total : 0;
    return (
      <Link href={it.href} onClick={onClose} title={lang === 'ar' ? it.ar : it.en} className={cn('group relative flex h-10 items-center gap-3 rounded-sm px-3 text-body font-medium transition-colors', on ? 'bg-navy-light text-white' : 'text-onnavy-secondary hover:bg-navy-hover hover:text-white', 'md:justify-center xl:justify-start')}>
        {on && <span className="absolute inset-y-[10px] start-0 w-1 rounded-e-full bg-gold" />}
        <Icon name={it.icon} size={20} className={on ? 'text-gold' : 'text-onnavy-subtle group-hover:text-white'} />
        <span className={cn(L, 'flex-1 truncate')}>{lang === 'ar' ? it.ar : it.en}</span>
        {n ? <span className={cn('num h-5 min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-5 md:absolute md:end-1 md:top-1 md:h-4 md:min-w-4 md:px-1 md:leading-4 xl:static xl:h-5 xl:min-w-5 xl:px-1.5 xl:leading-5', it.count === 'holds' ? 'bg-danger-bg text-danger' : 'bg-gold text-navy')}>{n}</span> : null}
      </Link>
    );
  };
  return (
    <>
      <div className="flex items-center gap-3 px-4 pb-4 pt-6 md:justify-center xl:justify-start">
        <Link href="/app" className="flex items-center gap-3" onClick={onClose}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold text-[15px] font-extrabold text-navy">AQ</span>
          <span className={cn(L, 'leading-tight')}><b className="block text-[17px] font-bold text-white">AutocQuick</b><span className="text-[11px] font-semibold tracking-[0.12em] text-gold">ERP</span></span></Link>
        <button onClick={onClose} className="ms-auto rounded-xs p-1 text-onnavy-muted md:hidden" aria-label="Close menu"><X size={20} /></button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-4 pb-4 [scrollbar-color:#1D3B5C_transparent]" aria-label="Sections">
        {GROUPS.map((g) => (
          <div key={g.en}><p className={cn(L, 'overline mb-2 px-3 text-onnavy-subtle')}>{lang === 'ar' ? g.ar : g.en}</p><div className="space-y-0.5">{g.items.map((it) => <Item key={it.href} it={it} />)}</div></div>
        ))}
        <div><p className={cn(L, 'overline mb-2 px-3 text-onnavy-subtle')}>{t('All modules')}</p>
          <details className="group/d" open={Object.values(more).some(Boolean)}><summary className="flex h-10 cursor-pointer list-none items-center gap-3 rounded-sm px-3 text-body font-medium text-onnavy-secondary hover:bg-navy-hover hover:text-white md:justify-center xl:justify-start"><Icon name="layout-grid" size={20} className="text-onnavy-subtle" /><span className={cn(L, 'flex-1')}>{t('Dashboards & modules')}</span><ChevronDown size={15} className="hidden group-open/d:rotate-180 xl:block" /></summary>
            <div className="mt-1 space-y-0.5 md:hidden xl:block">
              <SubGroup id="dash" title={t('Dashboards')} open={more} set={setMore}>{DASH.map(([k, en, ar]) => <Sub key={k} href={`/app/dashboards/${k}`} label={lang === 'ar' ? ar : en} on={path === `/app/dashboards/${k}`} close={onClose} />)}</SubGroup>
              <SubGroup id="rep" title={t('Reports')} open={more} set={setMore}>{REPORTS.map(([k, en, ar]) => <Sub key={k} href={`/app/reports/${k}`} label={lang === 'ar' ? ar : en} on={path === `/app/reports/${k}`} close={onClose} />)}</SubGroup>
              {modules.map((m) => <SubGroup key={m.key} id={m.key} title={lang === 'ar' ? m.ar : m.en} open={more} set={setMore} badge={m.release !== 'R1' ? m.release : undefined}>{m.items.map((r) => <Sub key={r.slug} href={`/app/${r.slug}`} label={lang === 'ar' ? r.arPlural : r.enPlural} on={path.startsWith(`/app/${r.slug}`)} close={onClose} />)}</SubGroup>)}
            </div></details></div>
        <div className="space-y-0.5">{ADMIN.map((a) => <Item key={a.href} it={a} />)}</div>
      </nav>
      <div className="space-y-3 p-4">
        {tAmt > 0 && <div className="rounded-lg bg-navy-hover p-4 md:hidden xl:block"><div className="flex items-center justify-between text-caption"><span className="font-semibold text-onnavy-muted">{t('Monthly target')}</span><span className="num font-bold text-white">{Math.round((aAmt / tAmt) * 100)}%</span></div><Progress value={(aAmt / tAmt) * 100} className="mt-2.5 !bg-navy" /><p className="num mt-2 text-caption text-onnavy-muted">{fmtMoney(aAmt, lang)} / {fmtMoney(tAmt, lang)}</p></div>}
        <div className="flex items-center gap-3 rounded-lg px-1 md:justify-center xl:justify-start"><Avatar name={me?.name} size={36} dark /><div className={cn(L, 'min-w-0 flex-1')}><p className="truncate text-small font-semibold text-white">{me?.name}</p><p className="truncate text-caption text-onnavy-muted">{company ? (lang === 'ar' ? company.nameAr ?? company.name : company.name) : me?.role}</p></div>
          <button onClick={logout} className={cn(L, 'rounded-xs p-1.5 text-onnavy-subtle hover:bg-navy-hover hover:text-white')} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={17} /></button></div>
      </div>
    </>
  );
}
function SubGroup({ id, title, open, set, children, badge }: { id: string; title: string; open: Record<string, boolean>; set: (v: any) => void; children: ReactNode; badge?: string }) {
  const o = !!open[id];
  return <div><button onClick={() => set({ ...open, [id]: !o })} aria-expanded={o} className="flex h-9 w-full items-center gap-2 rounded-sm px-3 text-small font-semibold text-onnavy-muted hover:text-white"><span className="flex-1 text-start">{title}</span>{badge && <span className="rounded-full bg-navy-light px-1.5 text-[10px] font-semibold text-gold">{badge}</span>}<ChevronDown size={14} className={cn('transition', o && 'rotate-180')} /></button>{o && <div className="ms-3 space-y-0.5 border-s border-navy-light ps-2">{children}</div>}</div>;
}
const Sub = ({ href, label, on, close }: { href: string; label: string; on: boolean; close: () => void }) => <Link href={href} onClick={close} className={cn('block truncate rounded-xs px-3 py-1.5 text-small transition', on ? 'bg-navy-light font-semibold text-white' : 'text-onnavy-muted hover:bg-navy-hover hover:text-white')}>{label}</Link>;

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { t, lang, setLang } = useT(); const { can } = useAuth(); const router = useRouter(); const title = usePageTitle();
  const switchLang = () => { const n = lang === 'ar' ? 'en' : 'ar'; setLang(n); api('/api/v1/auth/preferences', { method: 'PATCH', body: { locale: n } }).catch(() => null); };
  const now = new Date();
  return (
    <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card px-4 py-3.5 sm:px-9">
      <Button variant="ghost" size="sm" className="md:hidden" onClick={onMenu} aria-label="Menu"><Menu size={20} /></Button>
      <div className="min-w-0 shrink-0"><h2 className="truncate text-[17px] font-bold leading-6 sm:text-[19px]">{title}</h2><p className="hidden truncate text-caption text-muted sm:block">{fmtDate(now, 'en').replace(/^/, '')} · <span lang="ar">{fmtHijri(now, 'ar')}</span></p></div>
      <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2"><div className="hidden w-full max-w-[340px] sm:block"><GlobalSearch /></div>
        <Button variant="secondary" size="sm" onClick={switchLang} aria-label={t('Language')} className="h-10 px-3 text-small">{lang === 'ar' ? 'English' : 'عربي'}</Button>
        <NotificationBell />
        {can({ mod: 'sales', slug: 'request' }, 'create') && <Button icon="plus" onClick={() => router.push('/app/request/new')} className="hidden sm:inline-flex">{t('New request')}</Button>}</div>
    </header>
  );
}

function GlobalSearch() {
  const { t } = useT(); const router = useRouter(); const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const dq = useDebounced(q, 250); const box = useRef<HTMLDivElement>(null); const inp = useRef<HTMLInputElement>(null);
  const r = useQuery({ queryKey: ['search', dq], enabled: dq.trim().length >= 2, queryFn: () => api<{ data: any[] }>('/api/v1/search', { query: { q: dq } }) });
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.current?.focus(); setOpen(true); } }; document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, []);
  return (
    <div ref={box} className="relative w-full">
      <Search size={17} className="pointer-events-none absolute start-3.5 top-3 text-strong" /><Input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={t('Search anything...')} className="ps-10 pe-12" aria-label={t('Search anything...')} />
      <kbd className="pointer-events-none absolute end-3 top-2.5 hidden rounded-xs border border-line bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted lg:block">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute z-40 mt-2 max-h-[70vh] w-[min(92vw,420px)] overflow-y-auto rounded-2xl border border-line bg-card p-2 shadow-pop animate-in">
          {r.isLoading ? <div className="space-y-2 p-3"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-2/3" /></div> : r.isError ? <p className="p-3 text-small text-danger">{(r.error as any).message}</p> : r.data!.data.length === 0 ? <p className="p-4 text-center text-small text-muted">{t('No results found')}</p> : r.data!.data.map((g) => (
            <div key={g.type} className="mb-1"><p className="overline px-2.5 pb-1 pt-2 text-muted">{g.label}</p>{g.items.map((i: any) => <button key={i.id} onClick={() => { router.push(`/app/${g.slug}/${i.id}`); setOpen(false); setQ(''); }} className="flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-start text-body hover:bg-soft"><span className="truncate font-medium">{i.label}</span><span className="truncate text-caption text-muted">{i.sub}</span></button>)}</div>
          ))}
        </div>)}
    </div>
  );
}

function NotificationBell() {
  const { t, lang } = useT(); const qc = useQueryClient(); const router = useRouter(); const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  const count = useQuery({ queryKey: ['notif-count'], queryFn: () => api<{ count: number }>('/api/v1/notifications/unread-count'), refetchInterval: 45000 });
  const list = useQuery({ queryKey: ['notifs'], enabled: open, queryFn: () => api<{ data: any[] }>('/api/v1/notifications/mine', { query: { limit: 15 } }) });
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  useEffect(() => {
    const token = getToken(); if (!token) return; const es = new EventSource(`${API_URL}/api/v1/stream?access_token=${encodeURIComponent(token)}`);
    es.addEventListener('notification', (e: MessageEvent) => { const n = JSON.parse(e.data); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); toast(n.title, { description: n.body, action: n.link ? { label: t('Open'), onClick: () => router.push(n.link) } : undefined }); });
    return () => es.close(); // eslint-disable-next-line
  }, []);
  const read = async (ids?: string[]) => { await api('/api/v1/notifications/read', { method: 'POST', body: ids ? { ids } : { all: true } }); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); };
  const n = count.data?.count ?? 0;
  return (
    <div ref={box} className="relative">
      <Button variant="secondary" size="sm" onClick={() => setOpen(!open)} aria-label={`${t('Notifications')}${n ? ` (${n})` : ''}`} className="relative h-10 w-10 !px-0"><Bell size={18} />{n > 0 && <span className="absolute end-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-gold" />}</Button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-[min(92vw,380px)] rounded-2xl border border-line bg-card shadow-pop animate-in">
          <div className="flex items-center justify-between px-5 py-4"><b className="text-card-title">{t('Notifications')}</b>{n > 0 && <button className="text-small font-semibold text-navy hover:underline" onClick={() => read()}>{t('Mark all read')}</button>}</div>
          <div className="max-h-96 overflow-y-auto border-t border-line">{list.isLoading ? <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : list.isError ? <p className="p-4 text-small text-danger">{(list.error as any).message}</p> : list.data!.data.length === 0 ? <EmptyState icon="bell-off" title={t('No notifications')} desc={t('You are all caught up')} /> : list.data!.data.map((x) => (
            <button key={x.id} onClick={() => { read([x.id]); if (x.link) router.push(x.link); setOpen(false); }} className={cn('flex w-full gap-3 border-b border-line px-5 py-3.5 text-start last:border-0 hover:bg-soft', !x.read && 'bg-gold-light/50')}><span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.severity === 'critical' ? 'bg-danger' : x.severity === 'warning' ? 'bg-warn' : 'bg-info', x.read && 'opacity-30')} /><span className="min-w-0"><b className="block truncate text-body">{x.title}</b>{x.body && <span className="block truncate text-small text-muted">{x.body}</span>}<span className="text-caption text-muted">{timeAgo(x.createdAt, lang)}</span></span></button>))}</div>
        </div>)}
    </div>
  );
}
void Plus;
