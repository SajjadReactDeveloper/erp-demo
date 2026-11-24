'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_SLUG, MODULES, RESOURCES } from '@erp/shared';
import { Bell, Calendar, ChevronDown, Globe, LogOut, Menu, Search, X } from 'lucide-react';
import { API_URL, api, getToken } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth, useRequireAuth } from '@/lib/auth';
import { fmtDate, fmtHijri, fmtMoney, timeAgo } from '@/lib/format';
import { Avatar, Button, EmptyState, Icon, Input, Progress, Skeleton, Spinner, cn, toast } from '@/components/ui';
import { BrandMark } from '@/components/ui/brand';
import { useDebounced } from './fields';
import { BaseProvider } from './base';

export type ShellKind = 'staff' | 'customer' | 'supplier';
type NavItem = { href: string; icon: string; en: string; ar: string; slug?: string; count?: 'approvals' | 'holds' };
type Group = { en: string; ar: string; items: NavItem[] };
const I = (href: string, icon: string, en: string, ar: string, extra: Partial<NavItem> = {}): NavItem => ({ href, icon, en, ar, ...extra });

const STAFF: Group[] = [
  { en: 'Main', ar: 'الرئيسية', items: [I('/app', 'layout-dashboard', 'Dashboard', 'لوحة المعلومات'), I('/app/request', 'inbox', 'Customer requests', 'طلبات العملاء', { slug: 'request' }), I('/app/quotation', 'file-text', 'Quotations', 'عروض الأسعار', { slug: 'quotation' }), I('/app/sales-order', 'shopping-bag', 'Sales orders', 'أوامر البيع', { slug: 'sales-order' }), I('/app/approvals', 'check-circle-2', 'Approvals', 'الاعتمادات', { count: 'approvals' })] },
  { en: 'Operations', ar: 'العمليات', items: [I('/app/rfq', 'send', 'Purchasing & RFQs', 'المشتريات وطلبات الأسعار', { slug: 'rfq' }), I('/app/delivery-note', 'truck', 'Logistics', 'الخدمات اللوجستية', { slug: 'delivery-note' }), I('/app/customer', 'users', 'Customers & suppliers', 'العملاء والموردون', { slug: 'customer' }), I('/app/pos', 'monitor-smartphone', 'Point of sale', 'نقطة البيع', { slug: 'pos-sale' })] },
  { en: 'Finance', ar: 'المالية', items: [I('/app/journal-entry', 'book-open-check', 'Accounting', 'المحاسبة', { slug: 'journal-entry' }), I('/app/collections', 'wallet', 'Credit & collections', 'الائتمان والتحصيل', { slug: 'promise-to-pay', count: 'holds' }), I('/app/invoice', 'receipt-text', 'ZATCA invoices', 'فواتير زاتكا', { slug: 'invoice' }), I('/app/receipt', 'hand-coins', 'Receipts', 'سندات القبض', { slug: 'receipt' }), I('/app/reports/pnl', 'bar-chart-3', 'Reports', 'التقارير', { slug: 'journal-entry' })] },
  { en: 'Intelligence', ar: 'الذكاء', items: [I('/app/dashboards/executive', 'chart-no-axes-combined', 'Analytics', 'التحليلات', { slug: 'invoice' }), I('/app/assistant', 'sparkles', 'Assistant', 'المساعد الذكي'), I('/app/forecast', 'trending-up', 'Forecasting', 'التوقعات', { slug: 'forecast' })] },
];
const CUSTOMER: Group[] = [
  { en: 'Main', ar: 'الرئيسية', items: [I('/portal', 'layout-dashboard', 'Dashboard', 'لوحة المعلومات'), I('/portal/request', 'inbox', 'Requests', 'الطلبات'), I('/portal/quotation', 'file-text', 'Quotations', 'عروض الأسعار'), I('/portal/sales-order', 'shopping-bag', 'Orders', 'الأوامر')] },
  { en: 'Billing', ar: 'الفواتير', items: [I('/portal/invoice', 'receipt-text', 'Invoices', 'الفواتير'), I('/portal/statement', 'scroll-text', 'Statement', 'كشف الحساب'), I('/portal/return-auth', 'undo-2', 'Returns', 'المرتجعات')] },
  { en: 'Account', ar: 'الحساب', items: [I('/portal/vehicles', 'car', 'Vehicles', 'المركبات'), I('/portal/service-booking', 'calendar-check', 'Bookings', 'الحجوزات'), I('/portal/customer-address', 'map-pin', 'Addresses', 'العناوين')] },
];
const SUPPLIER: Group[] = [
  { en: 'Main', ar: 'الرئيسية', items: [I('/supplier', 'layout-dashboard', 'Dashboard', 'لوحة المعلومات'), I('/supplier/rfqs', 'send', 'RFQs', 'طلبات الأسعار'), I('/supplier/supplier-quote', 'file-input', 'My quotes', 'عروضي')] },
  { en: 'Orders & billing', ar: 'الأوامر والفواتير', items: [I('/supplier/purchase-order', 'shopping-basket', 'Purchase orders', 'أوامر الشراء'), I('/supplier/supplier-bill', 'receipt', 'Bills', 'الفواتير')] },
  { en: 'Catalogue', ar: 'الكتالوج', items: [I('/supplier/catalogue-item', 'book-open', 'Catalogue', 'الكتالوج'), I('/supplier/availability-feed', 'rss', 'Feeds', 'الخلاصات')] },
];
const NAV: Record<ShellKind, { base: string; groups: Group[]; label: [string, string] }> = {
  staff: { base: '/app', groups: STAFF, label: ['ERP', 'نظام ERP'] }, customer: { base: '/portal', groups: CUSTOMER, label: ['Customer portal', 'بوابة العملاء'] }, supplier: { base: '/supplier', groups: SUPPLIER, label: ['Supplier portal', 'بوابة الموردين'] },
};
export const DASH = [['executive', 'Executive', 'التنفيذية'], ['sales', 'Sales', 'المبيعات'], ['profitability', 'Profitability', 'الربحية'], ['expenses', 'Expenses', 'المصروفات'], ['receivables', 'Receivables', 'الذمم المدينة'], ['procurement', 'Procurement', 'المشتريات'], ['operations', 'Operations', 'العمليات'], ['history', 'History', 'التاريخ'], ['branch', 'Branches', 'الفروع']];
export const REPORTS = [['trial-balance', 'Trial balance', 'ميزان المراجعة'], ['pnl', 'Profit & loss', 'قائمة الدخل'], ['balance-sheet', 'Balance sheet', 'الميزانية العمومية'], ['cash-flow', 'Cash flow', 'التدفقات النقدية'], ['vat', 'VAT', 'ضريبة القيمة المضافة'], ['ageing', 'Ageing', 'أعمار الديون'], ['supplier-performance', 'Supplier performance', 'أداء الموردين']];
const ADMIN = [I('/app/users', 'users-round', 'Users', 'المستخدمون', { slug: 'user' }), I('/app/roles', 'shield-check', 'Roles & permissions', 'الأدوار والصلاحيات', { slug: 'role' }), I('/app/settings', 'sliders-horizontal', 'Settings', 'الإعدادات', { slug: 'setting' }), I('/app/integrations', 'plug', 'Integrations', 'التكاملات'), I('/app/imports', 'upload', 'Import data', 'استيراد البيانات')];

const TITLES: Record<string, [string, string]> = { company: ['Organisation', 'المنشأة'], 'report-schedule': ['Scheduled reports', 'التقارير المجدولة'], template: ['Document templates', 'قوالب المستندات'], 'notification-rule': ['Notification rules', 'قواعد الإشعارات'], modules: ['All modules', 'كل الوحدات'] };
function usePageTitle(kind: ShellKind) {
  const { lang, rl } = useT(); const path = usePathname();
  return useMemo(() => {
    const { base, groups } = NAV[kind]; const seg = path.split('/').filter(Boolean); const k = seg[1];
    if (!k) return lang === 'ar' ? 'لوحة المعلومات' : 'Dashboard';
    if (k === 'dashboards') return lang === 'ar' ? 'لوحات المعلومات' : 'Dashboards'; if (k === 'reports') return lang === 'ar' ? 'التقارير' : 'Reports';
    const hit = [...groups.flatMap((g) => g.items), ...(kind === 'staff' ? ADMIN : [])].find((i) => i.href === `${base}/${k}`); if (hit) return lang === 'ar' ? hit.ar : hit.en;
    if (kind === 'staff' && TITLES[k]) return lang === 'ar' ? TITLES[k][1] : TITLES[k][0];
    const res = BY_SLUG[k]; return res ? rl(res, true) : '';
  }, [path, lang, rl, kind]);
}

/** One shell for the staff app and both portals: same sidebar, topbar and content frame. */
export function Shell({ kind = 'staff', children }: { kind?: ShellKind; children: ReactNode }) {
  const { me, ready } = useRequireAuth(kind);
  const { t, dir } = useT(); const path = usePathname(); const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  if (!ready || !me) return <ShellSkeleton />;
  return (
    <BaseProvider value={NAV[kind].base}>
      <div className="min-h-screen md:flex md:h-screen md:overflow-hidden">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:m-2 focus:rounded-sm focus:bg-gold focus:p-2 focus:text-navy">{t('Skip to content')}</a>
        {open && <div className="fixed inset-0 z-30 bg-navy/50 backdrop-blur-[1px] md:hidden" onClick={() => setOpen(false)} />}
        <aside aria-label="Main navigation" className={cn('no-print fixed inset-y-0 z-40 flex w-sidebar flex-col border-white/5 bg-gradient-to-b from-navy to-[#091A33] transition-transform md:sticky md:top-0 md:z-20 md:h-screen md:w-rail md:translate-x-0 xl:w-sidebar', dir === 'rtl' ? 'right-0 border-s' : 'left-0 border-e', open ? 'translate-x-0' : dir === 'rtl' ? 'translate-x-full md:translate-x-0' : '-translate-x-full md:translate-x-0')}>
          <Sidebar kind={kind} onClose={() => setOpen(false)} />
        </aside>
        <div className="min-w-0 flex-1 md:flex md:h-screen md:flex-col">
          <Topbar kind={kind} onMenu={() => setOpen(true)} />
          <main id="main" className="w-full px-4 pb-6 pt-5 sm:px-6 sm:pt-6 md:min-h-0 md:flex-1 md:overflow-y-auto">{children}</main>
        </div>
      </div>
    </BaseProvider>
  );
}

/** Placeholder frame shown while the session loads: same geometry as the real shell. */
function ShellSkeleton() {
  const bar = 'rounded-md bg-white/10';
  return (
    <div className="min-h-screen md:flex" role="status" aria-label="Loading">
      <aside className="hidden w-rail flex-col gap-3 bg-gradient-to-b from-navy to-[#091A33] p-4 md:flex xl:w-sidebar">
        <div className="mb-4 flex items-center gap-3"><div className={`h-10 w-10 ${bar}`} /><div className="hidden flex-1 space-y-2 xl:block"><div className={`h-3.5 w-28 ${bar}`} /><div className={`h-2.5 w-16 ${bar}`} /></div></div>
        {Array.from({ length: 11 }).map((_, i) => <div key={i} className={`h-9 ${bar}`} style={{ opacity: 1 - i * 0.06 }} />)}
      </aside>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between border-b border-line bg-card px-4 py-3 sm:px-6"><div className="space-y-2"><Skeleton className="h-5 w-32" /><Skeleton className="h-3 w-44" /></div><div className="flex gap-2"><Skeleton className="hidden h-10 w-[340px] sm:block" /><Skeleton className="h-10 w-10" /></div></div>
        <div className="space-y-5 px-4 pt-5 sm:px-6 sm:pt-6">
          <div className="space-y-2"><Skeleton className="h-7 w-56" /><Skeleton className="h-3.5 w-80 max-w-full" /></div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[200px] space-y-3 rounded-2xl border border-line bg-card p-5"><Skeleton className="h-11 w-11 rounded-md" /><Skeleton className="h-3 w-24" /><Skeleton className="h-8 w-36" /></div>)}</div>
          <div className="grid gap-4 xl:grid-cols-[2fr_1fr]"><div className="h-[300px] rounded-2xl border border-line bg-card p-5"><Skeleton className="h-5 w-40" /><Skeleton className="mt-6 h-[200px] w-full" /></div><div className="h-[300px] rounded-2xl border border-line bg-card p-5"><Skeleton className="h-5 w-32" /></div></div>
        </div>
      </div>
    </div>
  );
}

function Sidebar({ kind, onClose }: { kind: ShellKind; onClose: () => void }) {
  const { lang, t } = useT(); const { me, company, can, logout } = useAuth(); const path = usePathname();
  const staff = kind === 'staff'; const { base, groups, label } = NAV[kind];
  const L = 'inline md:hidden xl:inline'; // labels hide in the 76px rail (tablet widths)
  const active = (h: string) => (h === base ? path === base : path === h || path.startsWith(h + '/') || (h === '/app/reports/pnl' && path.startsWith('/app/reports')));
  const pending = useQuery({ queryKey: ['approvals', 'count'], queryFn: () => api<{ data: any[] }>('/api/v1/approvals/inbox'), refetchInterval: 60000, enabled: staff && can({ mod: 'platform', slug: 'approval-request' }) });
  const holds = useQuery({ queryKey: ['holds-count'], queryFn: () => api<{ meta: { total: number } }>('/api/v1/r/credit-hold', { query: { limit: 1, 'f.status': 'held' } }), refetchInterval: 90000, enabled: staff && can({ mod: 'credit', slug: 'credit-hold' }) });
  const [openKey, setOpenKey] = useState<string | null>(null);
  const childKeys = useMemo(() => new Set(RESOURCES.flatMap((r) => r.children.map((c) => c.key))), []);
  // Setup & data: first-release areas only, without screens the main menu already links to.
  const inMain = useMemo(() => new Set(groups.flatMap((g) => g.items.map((i) => i.slug)).filter(Boolean) as string[]), [groups]);
  const SKIP = useMemo(() => new Set(['approval-request', 'user', 'role', 'setting', 'import-job', 'integration-message', 'attachment', 'notification', 'ai-log', 'outbox-event', 'branch', 'warehouse', 'cost-center']), []);
  const RELABEL: Record<string, [string, string]> = useMemo(() => ({ company: ['Organisation', 'المنشأة'], 'report-schedule': ['Scheduled reports', 'التقارير المجدولة'] }), []);
  const RENAME: Record<string, [string, string]> = useMemo(() => ({ platform: ['Configuration', 'التهيئة'] }), []);
  const areas = useMemo(() => MODULES.filter((m) => m.release === 'R1' && !['finance', 'logistics'].includes(m.key)).map((m) => ({ key: m.key, icon: m.icon, en: RENAME[m.key]?.[0] ?? m.en, ar: RENAME[m.key]?.[1] ?? m.ar, links: RESOURCES.filter((r) => r.mod === m.key && !r.sys && r.release === 'R1' && !childKeys.has(r.key) && !inMain.has(r.slug) && !SKIP.has(r.slug) && can(r, 'read')).map((r) => ({ href: `/app/${r.slug}`, en: RELABEL[r.slug]?.[0] ?? r.enPlural, ar: RELABEL[r.slug]?.[1] ?? r.arPlural })) })).filter((x) => x.links.length), [childKeys, can, inMain, SKIP, RENAME, RELABEL]);
  const Item = ({ it }: { it: NavItem }) => {
    if (staff && it.slug && !can({ mod: 'x', slug: it.slug } as any) && !me?.permissions.includes('*') && !RESOURCES.find((r) => r.slug === it.slug && can(r, 'read'))) return null;
    const on = active(it.href); const n = it.count === 'approvals' ? pending.data?.data.length : it.count === 'holds' ? holds.data?.meta.total : 0;
    return (
      <Link href={it.href} onClick={onClose} title={lang === 'ar' ? it.ar : it.en} aria-current={on ? 'page' : undefined} className={cn('group relative flex h-10 items-center gap-3 rounded-sm px-3 text-[13.5px] font-medium transition-colors', on ? 'bg-white/[0.09] text-white' : 'text-onnavy-secondary hover:bg-white/[0.05] hover:text-white', 'md:justify-center xl:justify-start')}>
        {on && <span className="absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-gold" />}
        <Icon name={it.icon} size={19} className={cn('shrink-0 transition-colors', on ? 'text-gold' : 'text-onnavy-subtle group-hover:text-white')} />
        <span className={cn(L, 'flex-1 truncate')}>{lang === 'ar' ? it.ar : it.en}</span>
        {n ? <span className={cn('num h-5 min-w-5 rounded-xs px-1.5 text-center text-[11px] font-bold leading-5 md:absolute md:end-1.5 md:top-0.5 md:h-4 md:min-w-4 md:px-1 md:leading-4 xl:static xl:h-5 xl:min-w-5 xl:px-1.5 xl:leading-5', it.count === 'holds' ? 'bg-danger-bg text-danger' : 'bg-gold text-navy')}>{n}</span> : null}
      </Link>
    );
  };
  return (
    <>
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-[18px] md:justify-center xl:justify-start">
        <Link href={base} className="flex min-w-0 items-center gap-3" onClick={onClose}><BrandMark size={38} className="drop-shadow-[0_4px_12px_rgba(214,161,58,0.28)]" />
          <span className={cn(L, 'min-w-0 leading-tight')}><b className="block truncate text-[17px] font-extrabold tracking-tight text-white">Autoc<span className="text-gold">Quick</span></b><span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-onnavy-muted">{lang === 'ar' ? label[1] : label[0]}</span></span></Link>
        <button onClick={onClose} className="ms-auto rounded-xs p-1 text-onnavy-muted md:hidden" aria-label="Close menu"><X size={20} /></button>
      </div>
      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto px-3 pb-4 pt-5 [mask-image:linear-gradient(to_bottom,transparent,#000_12px,#000_calc(100%-16px),transparent)]" aria-label="Sections">
        {groups.map((g) => (
          <div key={g.en}><p className={cn(L, 'overline mb-1.5 px-3 text-onnavy-subtle/80')}>{lang === 'ar' ? g.ar : g.en}</p><hr className="mx-3 mb-2 hidden border-white/[0.06] md:block xl:hidden" /><div className="space-y-1">{g.items.map((it) => <Item key={it.href} it={it} />)}</div></div>
        ))}
        {staff && areas.length > 0 && <div className="md:hidden xl:block"><p className="overline mb-1.5 px-3 text-onnavy-subtle/80">{t('Setup & data')}</p><div className="space-y-0.5">{areas.map((a) => {
          const here = a.links.some((l) => path === l.href || path.startsWith(l.href + '/')); const o = openKey === a.key || (openKey === null && here);
          return (<div key={a.key}>
            <button onClick={() => setOpenKey(o ? '' : a.key)} aria-expanded={o} className={cn('group flex h-[38px] w-full items-center gap-3 rounded-sm px-3 text-[13.5px] font-medium transition-colors', here ? 'text-white' : 'text-onnavy-secondary hover:bg-white/[0.05] hover:text-white')}>
              <Icon name={a.icon} size={19} className={cn('shrink-0 transition-colors', here ? 'text-gold' : 'text-onnavy-subtle group-hover:text-white')} /><span className="flex-1 truncate text-start">{lang === 'ar' ? a.ar : a.en}</span><ChevronDown size={15} className={cn('shrink-0 text-onnavy-subtle transition-transform', o && 'rotate-180')} /></button>
            {o && <div className="relative mb-1.5 mt-0.5 space-y-px before:absolute before:inset-y-1 before:start-[21px] before:w-px before:bg-white/10">{a.links.map((l) => { const on = path === l.href || path.startsWith(l.href + '/'); return <Link key={l.href} href={l.href} onClick={onClose} className={cn('flex h-8 items-center truncate rounded-sm pe-3 ps-[43px] text-[13px] transition-colors', on ? 'bg-white/[0.09] font-semibold text-white' : 'text-onnavy-muted hover:bg-white/[0.05] hover:text-white')}><span className="truncate">{lang === 'ar' ? l.ar : l.en}</span></Link>; })}</div>}
          </div>);
        })}</div></div>}
        {staff && <div><p className={cn(L, 'overline mb-1.5 px-3 text-onnavy-subtle/80')}>{t('Administration')}</p><div className="space-y-0.5">{ADMIN.map((a) => <Item key={a.href} it={a} />)}</div></div>}
      </nav>
      <div className="border-t border-white/[0.06] p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.05] p-2.5 md:justify-center xl:justify-start"><Avatar name={me?.name} size={34} dark /><div className={cn(L, 'min-w-0 flex-1')}><p className="truncate text-small font-semibold leading-5 text-white" title={me?.name}>{me?.name}</p><p className="truncate text-caption text-onnavy-muted">{company ? (lang === 'ar' ? company.nameAr ?? company.name : company.name) : me?.role}</p></div>
          <button onClick={logout} className={cn(L, 'rounded-xs p-1.5 text-onnavy-subtle transition-colors hover:bg-white/10 hover:text-white')} aria-label={t('Sign out')} title={t('Sign out')}><LogOut size={17} className="rtl:-scale-x-100" /></button></div>
      </div>
    </>
  );
}

function Topbar({ kind, onMenu }: { kind: ShellKind; onMenu: () => void }) {
  const { t, lang, setLang } = useT(); const { can } = useAuth(); const router = useRouter(); const title = usePageTitle(kind);
  const switchLang = () => { const n = lang === 'ar' ? 'en' : 'ar'; setLang(n); api('/api/v1/auth/preferences', { method: 'PATCH', body: { locale: n } }).catch(() => null); };
  const now = new Date(); const cta = kind === 'staff' ? (can({ mod: 'sales', slug: 'request' }, 'create') ? '/app/request/new' : null) : kind === 'customer' ? '/portal/request/new' : null;
  return (
    <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
      <Button variant="ghost" size="sm" className="md:hidden" onClick={onMenu} aria-label="Menu"><Menu size={20} /></Button>
      <div className="min-w-0 shrink-0">
        <h2 className="truncate text-[17px] font-bold leading-tight tracking-tight text-fg sm:text-[18px]">{title}</h2>
        <p className="num mt-0.5 hidden items-center gap-2 truncate text-caption text-muted sm:flex">
          <Calendar size={12} className="shrink-0 text-muted/75" aria-hidden />
          <span>{fmtDate(now, lang)}</span>
          <span className="h-3 w-px shrink-0 bg-line" aria-hidden />
          <span>{fmtHijri(now, lang)}</span>
        </p>
      </div>
      <div className="ms-auto flex min-w-0 flex-1 items-center justify-end gap-2">{kind === 'staff' && <div className="hidden w-full max-w-[360px] sm:block"><GlobalSearch /></div>}
        <Button variant="secondary" onClick={switchLang} aria-label={t('Language')} className="gap-1.5 !px-3 !font-medium">
          <Globe size={15} className="shrink-0 text-muted" />
          <span lang={lang === 'ar' ? 'en' : 'ar'} dir={lang === 'ar' ? 'ltr' : 'rtl'} className={lang === 'ar' ? 'font-sans text-[13px] leading-none' : 'font-arabic pb-[1px] text-[13px] leading-none'}>{lang === 'ar' ? 'English' : 'العربية'}</span>
        </Button>
        <NotificationBell />
        {cta && <Button icon="plus" onClick={() => router.push(cta)} className="hidden sm:inline-flex">{t('New request')}</Button>}</div>
    </header>
  );
}

function GlobalSearch() {
  const { t } = useT(); const router = useRouter(); const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const dq = useDebounced(q, 250); const box = useRef<HTMLDivElement>(null); const inp = useRef<HTMLInputElement>(null);
  const r = useQuery({ queryKey: ['search', dq], enabled: dq.trim().length >= 2, queryFn: () => api<{ data: any[] }>('/api/v1/search', { query: { q: dq } }) });
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); inp.current?.focus(); setOpen(true); } }; document.addEventListener('mousedown', h); document.addEventListener('keydown', k); return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); }; }, []);
  return (
    <div ref={box} className="relative w-full">
      <Search size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-strong" /><Input ref={inp} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={t('Search anything...')} className="!h-10 !rounded-sm ps-10 pe-16" aria-label={t('Search anything...')} />
      <kbd className="pointer-events-none absolute end-2.5 top-1/2 hidden -translate-y-1/2 items-center rounded-xs border border-line bg-card px-1.5 py-1 font-mono text-[10px] font-medium leading-none text-muted lg:inline-flex">Ctrl K</kbd>
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
    es.addEventListener('delivery', () => qc.invalidateQueries({ queryKey: ['order-track'] }));
    es.addEventListener('notification', (e: MessageEvent) => { const n = JSON.parse(e.data); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); toast(n.title, { description: n.body, action: n.link ? { label: t('Open'), onClick: () => router.push(n.link) } : undefined }); });
    return () => es.close(); // eslint-disable-next-line
  }, []);
  const read = async (ids?: string[]) => { await api('/api/v1/notifications/read', { method: 'POST', body: ids ? { ids } : { all: true } }); qc.invalidateQueries({ queryKey: ['notif-count'] }); qc.invalidateQueries({ queryKey: ['notifs'] }); };
  const n = count.data?.count ?? 0;
  return (
    <div ref={box} className="relative">
      <Button variant="secondary" onClick={() => setOpen(!open)} aria-label={`${t('Notifications')}${n ? ` (${n})` : ''}`} className="relative w-10 !px-0"><Bell size={18} />{n > 0 && <span className="absolute end-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-card bg-gold" />}</Button>
      {open && (
        <div className="absolute end-0 z-40 mt-2 w-[min(92vw,380px)] rounded-2xl border border-line bg-card shadow-pop animate-in">
          <div className="flex items-center justify-between px-5 py-4"><b className="text-card-title">{t('Notifications')}</b>{n > 0 && <button className="text-small font-semibold text-navy hover:underline" onClick={() => read()}>{t('Mark all read')}</button>}</div>
          <div className="max-h-96 overflow-y-auto border-t border-line">{list.isLoading ? <div className="space-y-3 p-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : list.isError ? <p className="p-4 text-small text-danger">{(list.error as any).message}</p> : list.data!.data.length === 0 ? <EmptyState icon="bell-off" title={t('No notifications')} desc={t('You are all caught up')} /> : list.data!.data.map((x) => (
            <button key={x.id} onClick={() => { read([x.id]); if (x.link) router.push(x.link); setOpen(false); }} className={cn('flex w-full gap-3 border-b border-line px-5 py-3.5 text-start last:border-0 hover:bg-soft', !x.read && 'bg-gold-light/50')}><span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', x.severity === 'critical' ? 'bg-danger' : x.severity === 'warning' ? 'bg-warn' : 'bg-info', x.read && 'opacity-30')} /><span className="min-w-0"><b className="block truncate text-body">{x.title}</b>{x.body && <span className="block truncate text-small text-muted">{x.body}</span>}<span className="text-caption text-muted">{timeAgo(x.createdAt, lang)}</span></span></button>))}</div>
        </div>)}
    </div>
  );
}
