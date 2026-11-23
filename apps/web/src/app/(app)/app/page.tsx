'use client';
import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowUpRight, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, timeAgo } from '@/lib/format';
import { BarCard, Gauge, GOLD, NAVY, Sparkline } from '@/components/charts';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Icon, Progress, Segmented, Skeleton, SkeletonRows, Star, StatusBadge, cn, toast } from '@/components/ui';

/** A dashboard section loads independently; a 403 means "not for this role" and the card is simply not shown. */
function useSection<T = any>(key: string, path: string, query?: any, enabled = true) {
  const q = useQuery({ queryKey: ['home', key, query], queryFn: () => api<T>(path, { query }), enabled, retry: false, staleTime: 30000 });
  return { ...q, denied: q.isError && (q.error as ApiError)?.status === 403 };
}
const Money = ({ v, big }: { v: any; big?: boolean }) => { const { lang } = useT(); return <span className="num">{big ? <><span className="me-1.5 text-[0.45em] font-semibold opacity-60">{lang === 'ar' ? 'ر.س' : 'SAR'}</span>{fmtNum(v, lang, 0)}</> : fmtMoney(v, lang)}</span>; };
const Chip = ({ tone, children }: { tone: 'success' | 'warn' | 'danger' | 'info' | 'gold' | 'muted'; children: ReactNode }) => <Badge tone={tone}>{children}</Badge>;

export default function Home() {
  const { me, can } = useAuth(); const { t, lang } = useT();
  const hour = new Date().getHours(); const greet = hour < 12 ? (lang === 'ar' ? 'صباح الخير' : 'Good morning') : hour < 18 ? (lang === 'ar' ? 'مساء الخير' : 'Good afternoon') : (lang === 'ar' ? 'مساء النور' : 'Good evening');
  const monthStart = useMemo(() => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString(); }, []);
  const exec = useSection<any>('exec', '/api/v1/dashboards/executive');
  const sales = useSection<any>('sales', '/api/v1/dashboards/sales');
  const orders = useSection<any>('orders', '/api/v1/r/sales-order', { limit: 1, 'f.createdAt.gte': monthStart });
  const reqs = useSection<any>('reqs', '/api/v1/r/request', { limit: 6, sort: 'createdAt:desc' });
  const appr = useSection<any>('appr', '/api/v1/approvals/inbox');
  const recv = useSection<any>('recv', '/api/v1/dashboards/receivables');
  const sup = useSection<any>('sup', '/api/v1/dashboards/procurement');
  const ops = useSection<any>('ops', '/api/v1/dashboards/operations');
  const [seg, setSeg] = useState<'revenue' | 'grossProfit' | 'netProfit'>('revenue');
  const k = exec.data?.kpis; const series: any[] = exec.data?.series ?? [];
  const cum = useMemo(() => { let c = 0; return series.map((s) => ({ month: s.month.slice(5), v: (c += s.revenue) })); }, [series]);
  const delta = k && k.salesPrev ? ((k.salesMtd - k.salesPrev) / Math.abs(k.salesPrev)) * 100 : null;
  const tg = (sales.data?.targets ?? []) as any[]; const tTotal = tg.reduce((s, x) => s + x.target, 0), tDone = tg.reduce((s, x) => s + x.achieved, 0);
  const cats = ((sales.data?.byCategory ?? []) as any[]).slice(0, 5); const catMax = Math.max(1, ...cats.map((c) => c.value));
  const hasFinance = !exec.denied;
  const segData = series.map((s) => ({ name: s.month.slice(5), value: s[seg] }));
  const segTotal = series.reduce((a, s) => a + s[seg], 0);
  const sparkMargin = series.map((s) => (s.revenue ? (s.grossProfit / s.revenue) * 100 : 0));

  return (
    <div className="space-y-6">
      <div><h1 className="text-page-title">{greet}, {me?.name?.split(' ')[0]}</h1><p className="text-small text-muted">{t('Here is what is happening across sales, sourcing and cash today.')}</p></div>

      {/* Row 1: featured card + KPI cards */}
      {hasFinance && <section aria-label="Key figures" className="grid gap-5 xl:grid-cols-[2fr_1fr_1fr_1fr] [&>*]:min-w-0">
        <Card className="relative overflow-hidden border-navy bg-navy p-6 text-white xl:col-span-1">
          <Star className="pointer-events-none absolute -end-10 -top-10 text-gold opacity-10" size={190} />
          <div className="relative flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-md bg-navy-light text-gold"><Icon name="wallet" size={22} /></span>{exec.isLoading ? <Skeleton className="h-6 w-20 !bg-navy-light" /> : delta != null && <span className={cn('inline-flex h-6 items-center gap-1 rounded-full bg-navy-hover px-2.5 text-caption font-semibold', delta >= 0 ? 'text-positive' : 'text-[#FCA5A5]')}>{delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{fmtNum(Math.abs(delta), lang, 1)}%</span>}</div>
          <p className="relative mt-4 text-small text-onnavy-muted">{t('Total sales')} · <span lang="ar">إجمالي المبيعات</span></p>
          {exec.isLoading ? <Skeleton className="mt-2 h-10 w-48 !bg-navy-light" /> : <p className="relative text-display"><Money v={k?.salesMtd} big /></p>}
          <div className="relative mt-4 grid grid-cols-3 gap-3">{[[t('Gross profit'), k ? fmtMoney(k.grossMargin, lang) : '—'], [t('Orders'), orders.data?.meta?.total ?? '—'], [t('Avg order'), k && orders.data?.meta?.total ? fmtMoney(k.salesMtd / orders.data.meta.total, lang) : '—']].map(([l, v]) => <div key={String(l)}><p className="text-caption text-onnavy-muted">{l}</p><p className="num text-small font-semibold">{v}</p></div>)}</div>
          <div className="relative mt-3 h-[96px]" dir="ltr" aria-hidden><ResponsiveContainer><AreaChart data={cum} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}><defs><linearGradient id="feat" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={GOLD} stopOpacity={0.4} /><stop offset="100%" stopColor={GOLD} stopOpacity={0} /></linearGradient></defs><XAxis dataKey="month" hide /><Tooltip cursor={false} content={({ active, payload }: any) => active && payload?.length ? <div className="rounded-xs bg-white px-2 py-1 text-caption font-semibold text-navy shadow-pop"><span className="num">{fmtCompact(payload[0].value)}</span></div> : null} /><Area type="monotone" dataKey="v" stroke={GOLD} strokeWidth={2.5} fill="url(#feat)" dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>
        </Card>
        <Kpi loading={exec.isLoading} icon="percent" tone="primary" label={t('Gross margin')} value={k ? `${fmtNum(k.grossMarginPct, lang, 1)}%` : undefined} chip={<Chip tone="gold">{t('Target')} 18%</Chip>} spark={<Sparkline data={sparkMargin} color={GOLD} />} />
        <Kpi loading={exec.isLoading} icon="hand-coins" tone="danger" label={t('Receivables')} value={k ? <span className="num">{lang === "ar" ? "ر.س" : "SAR"} {fmtCompact(k.receivables)}</span> : undefined} chip={k && k.overdue > 0 ? <Chip tone="danger">{fmtCompact(k.overdue)} {t('overdue')}</Chip> : <Chip tone="success">{t('No overdue')}</Chip>} spark={k && k.receivables > 0 ? <div className="pt-2"><Progress value={(k.overdue / k.receivables) * 100} tone="navy" className="!h-2" /><p className="mt-1.5 text-caption text-muted">{fmtNum((k.overdue / k.receivables) * 100, lang, 0)}% {t('overdue share')}</p></div> : undefined} />
        <Kpi loading={exec.isLoading} icon="timer" tone="success" label={t('Request to quote')} value={k ? `${fmtNum(k.requestToQuoteHours, lang, 1)} ${t('h')}` : undefined} chip={<Chip tone={k && k.requestToQuoteHours <= 4 ? 'success' : 'warn'}>{k && k.requestToQuoteHours <= 4 ? t('Within SLA') : t('Above SLA')}</Chip>} spark={<p className="pt-2 text-caption text-muted">{t('Average over the last 30 days')}</p>} />
      </section>}

      {/* Row 2: sales overview + monthly target */}
      {hasFinance && <section className="grid gap-5 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        <Card>
          <CardHeader title={<>{t('Sales overview')} <span className="text-small font-medium text-muted" lang="ar">· نظرة على المبيعات</span></>} sub={t('Last 12 months')} actions={<Segmented label={t('Metric')} value={seg} onChange={(k) => setSeg(k as typeof seg)} options={[{ key: 'revenue', label: t('Sales') }, { key: 'grossProfit', label: t('Gross profit') }, { key: 'netProfit', label: t('Net profit') }]} />} />
          <div className="grid gap-4 px-6 pt-3 sm:grid-cols-3">{[[t('12-month total'), fmtMoney(segTotal, lang)], [t('This month'), fmtMoney(series[series.length - 1]?.[seg] ?? 0, lang)], [t('Best month'), fmtMoney(Math.max(0, ...series.map((s) => s[seg])), lang)]].map(([l, v]) => <div key={String(l)}><p className="text-caption text-muted">{l}</p><p className="num text-metric">{exec.isLoading ? <Skeleton className="h-7 w-28" /> : v}</p></div>)}</div>
          <BarCard bare title="" data={segData} h={250} loading={exec.isLoading} />
        </Card>
        <Card className="flex flex-col">
          <CardHeader title={t('Monthly target')} sub={tTotal ? `${fmtMoney(Math.max(0, tTotal - tDone), lang)} ${t('to go')}` : undefined} />
          <div className="px-6 pt-4">{sales.isLoading ? <Skeleton className="mx-auto h-24 w-48" /> : tTotal ? <Gauge value={(tDone / tTotal) * 100} label={`${fmtCompact(tDone)} / ${fmtCompact(tTotal)}`} /> : <EmptyState icon="target" title={t('No target set')} desc={t('Set sales targets to track monthly progress.')} action={can({ mod: 'sales', slug: 'sales-target' }, 'create') ? <Link href="/app/sales-target/new"><Button size="sm" variant="secondary">{t('Set a target')}</Button></Link> : undefined} />}</div>
          <div className="mt-auto space-y-3.5 p-6 pt-5"><p className="overline text-muted">{t('Sales by category')}</p>{sales.isLoading ? <SkeletonRows rows={3} cols={1} /> : cats.length === 0 ? <p className="text-small text-muted">{t('No sales yet this period.')}</p> : cats.map((c, i) => <div key={c.name}><div className="mb-1.5 flex justify-between text-small"><span className="font-medium">{c.name}</span><span className="num text-muted">{fmtCompact(c.value)}</span></div><Progress value={(c.value / catMax) * 100} tone={i === cats.length - 1 && cats.length > 2 ? 'gold' : 'navy'} /></div>)}</div>
        </Card>
      </section>}

      {/* Row 3: recent requests + approvals */}
      <section className="grid gap-5 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0">
        {!reqs.denied && <Card>
          <CardHeader title={t('Recent customer requests')} actions={<Link href="/app/request" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
          {reqs.isLoading ? <SkeletonRows rows={5} cols={5} /> : !reqs.data?.data.length ? <EmptyState icon="inbox" title={t('No requests yet')} desc={t('New customer requests will appear here.')} action={can({ mod: 'sales', slug: 'request' }, 'create') ? <Link href="/app/request/new"><Button size="sm">{t('New request')}</Button></Link> : undefined} /> : (
            <div className="overflow-x-auto px-3 pb-3 pt-2"><table className="w-full min-w-[620px] text-body"><thead><tr className="bg-soft text-caption font-semibold text-strong">{[t('Request'), t('Customer'), t('Vehicle'), t('Status'), t('Owner')].map((h, i, a) => <th key={h} className={cn('px-4 py-2.5 text-start', i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{reqs.data.data.map((r: any) => (
                <tr key={r.id} className="cursor-pointer transition-colors hover:bg-[#F8FAFC]" onClick={() => (location.href = `/app/request/${r.id}`)}><td className="px-4 py-3.5"><Link href={`/app/request/${r.id}`} className="mono text-navy hover:underline">{r.number}</Link></td><td className="px-4 py-3.5 font-semibold">{r._refs?.customerId?.label}</td><td className="px-4 py-3.5 text-muted"><span className="mono" dir="ltr">{r.vin ? r.vin.slice(-8) : '—'}</span></td><td className="px-4 py-3.5"><StatusBadge value={r.status} /></td><td className="px-4 py-3.5">{r._refs?.assignedToId ? <span className="inline-flex items-center gap-2"><Avatar name={r._refs.assignedToId.label} /><span className="hidden text-small text-strong 2xl:inline">{r._refs.assignedToId.label}</span></span> : <span className="text-muted">—</span>}</td></tr>))}</tbody></table></div>)}
        </Card>}
        {!appr.denied && <Approvals q={appr} />}
      </section>

      {/* Row 4: ageing + supplier performance */}
      <section className="grid gap-5 xl:grid-cols-2 [&>*]:min-w-0">
        {!recv.denied && <Ageing q={recv} />}
        {!sup.denied && <Suppliers q={sup} />}
      </section>
      {ops.data && <Attention d={ops.data} />}
    </div>
  );
}

function Kpi({ loading, icon, tone, label, value, chip, spark }: { loading: boolean; icon: string; tone: 'primary' | 'danger' | 'success'; label: string; value?: ReactNode; chip?: ReactNode; spark?: ReactNode }) {
  const TILE = { primary: 'bg-gold-light text-gold-text', danger: 'bg-danger-bg text-danger', success: 'bg-success-bg text-success' }[tone];
  if (loading) return <Card className="space-y-3 p-[22px]"><Skeleton className="h-11 w-11 rounded-md" /><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-28" /></Card>;
  return <Card className="flex flex-col p-[22px] animate-in"><div className="flex items-start justify-between"><span className={cn('grid h-11 w-11 place-items-center rounded-md', TILE)}><Icon name={icon} size={22} /></span>{chip}</div><p className="mt-4 text-small text-muted">{label}</p><p className="num text-kpi">{value ?? '—'}</p><div className="mt-auto pt-2">{spark}</div></Card>;
}

function Approvals({ q }: { q: any }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const router = useRouter();
  const act = useMutation({ mutationFn: ({ id, action, note }: any) => api<any>(`/api/v1/r/approval-request/${id}/actions/${action}`, { method: 'POST', body: { note } }), onSuccess: (r) => { toast.success(r.message ?? t('Done')); qc.invalidateQueries({ queryKey: ['home', 'appr'] }); qc.invalidateQueries({ queryKey: ['approvals'] }); }, onError: (e: any) => toast.error(e.message) });
  const rows: any[] = q.data?.data ?? []; const [top, ...rest] = [...rows].sort((a, b) => Number(b.overdue) - Number(a.overdue) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const ICON: Record<string, string> = { margin: 'percent', credit: 'octagon-alert', purchase_order: 'shopping-basket', discount: 'badge-percent', expense: 'wallet', return: 'undo-2' };
  const Chev = lang === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <Card>
      <CardHeader title={t('Pending approvals')} actions={rows.length ? <Badge tone="gold">{rows.length}</Badge> : undefined} />
      <div className="space-y-2 p-6 pt-4">
        {q.isLoading ? <SkeletonRows rows={3} cols={1} /> : !top ? <EmptyState icon="check-circle-2" title={t('Nothing to approve')} desc={t('Approval requests will appear here.')} /> : <>
          <div className="rounded-lg border border-gold-border bg-gold-light p-4"><div className="flex items-center justify-between"><Badge tone="gold" className="!bg-white/70">{top.type.replace('_', ' ')}</Badge><span className="text-caption text-gold-text">{timeAgo(top.createdAt, lang)}</span></div>
            <p className="mt-2.5 break-words text-[15px] font-bold leading-snug">{top.reason}</p><p className="mt-1 text-caption text-gold-text"><span className="num">{fmtMoney(top.amount, lang)}</span> · {top.requestedBy}</p>
            <div className="mt-3.5 grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" className="bg-white" loading={act.isPending && act.variables?.action === 'reject'} onClick={() => router.push(`/app/approval-request/${top.id}`)}>{t('Decline')}</Button><Button size="sm" loading={act.isPending && act.variables?.id === top.id && act.variables?.action === 'approve'} onClick={() => act.mutate({ id: top.id, action: 'approve' })}>{t('Approve')}</Button></div></div>
          {rest.slice(0, 3).map((a) => <Link key={a.id} href={`/app/approval-request/${a.id}`} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-soft"><span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-sm bg-soft text-navy"><Icon name={ICON[a.type] ?? 'check-circle-2'} size={18} /></span><span className="min-w-0 flex-1"><b className="block truncate text-body font-semibold" title={a.reason}>{a.reason}</b><span className="text-caption text-muted"><span className="num">{fmtMoney(a.amount, lang)}</span> · {a.requestedBy}</span></span><span className="grid h-8 w-8 place-items-center rounded-xs text-muted"><Chev size={16} /></span></Link>)}
          {rows.length > 4 && <Link href="/app/approvals" className="block pt-1 text-center text-small font-semibold text-navy hover:underline">{t('View all')} ({rows.length})</Link>}</>}
      </div>
    </Card>
  );
}

function Ageing({ q }: { q: any }) {
  const { t, lang } = useT(); const tt = q.data?.ageing?.totals ?? {};
  const b = [{ k: 'current', l: t('Current'), v: tt.current ?? 0, c: NAVY, bg: 'bg-soft', fg: 'text-fg' }, { k: 'b1', l: '1–30', v: tt.b1 ?? 0, c: GOLD, bg: 'bg-gold-light', fg: 'text-gold-text' }, { k: 'b2', l: '31–60', v: tt.b2 ?? 0, c: '#C2410C', bg: 'bg-warn-bg', fg: 'text-warn' }, { k: 'b3', l: '60+', v: (tt.b3 ?? 0) + (tt.b4 ?? 0), c: '#B91C1C', bg: 'bg-danger-bg', fg: 'text-danger' }];
  const total = b.reduce((s, x) => s + x.v, 0) || 1;
  return (
    <Card><CardHeader title={<>{t('Receivables ageing')} <span className="text-small font-medium text-muted" lang="ar">· أعمار الديون</span></>} actions={<Link href="/app/dashboards/receivables" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('Details')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
      <div className="space-y-4 p-6 pt-4">{q.isLoading ? <SkeletonRows rows={3} cols={1} /> : total <= 1 && !tt.total ? <EmptyState icon="hand-coins" title={t('No open receivables')} /> : <>
        <div className="flex h-3.5 overflow-hidden rounded-full bg-soft" role="img" aria-label="Ageing distribution">{b.map((x) => x.v > 0 && <div key={x.k} style={{ width: `${(x.v / total) * 100}%`, background: x.c }} />)}</div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{b.map((x) => <div key={x.k} className={cn('rounded-md p-3.5', x.bg)}><p className={cn('text-caption font-semibold', x.fg)}>{x.l} {t('days')}</p><p className={cn('num mt-1 text-metric', x.fg)}>{fmtCompact(x.v)}</p></div>)}</div></>}</div>
    </Card>
  );
}

function Suppliers({ q }: { q: any }) {
  const { t, lang } = useT();
  const resp = (q.data?.responseTimes ?? []) as any[]; const ontime = (q.data?.onTimeRates ?? []) as any[];
  const names = [...new Set([...resp.map((r) => r.name), ...ontime.map((r) => r.name)])];
  const rows = names.map((n) => ({ name: n, hours: resp.find((r) => r.name === n)?.hours, rate: resp.find((r) => r.name === n)?.responseRate, onTime: ontime.find((r) => r.name === n)?.pct })).slice(0, 6);
  return (
    <Card><CardHeader title={<>{t('Supplier performance')} <span className="text-small font-medium text-muted" lang="ar">· أداء الموردين</span></>} actions={<Link href="/app/reports/supplier-performance" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('Details')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
      {q.isLoading ? <SkeletonRows rows={4} cols={4} /> : rows.length === 0 ? <EmptyState icon="factory" title={t('No supplier activity yet')} desc={t('Send an RFQ to see response times and delivery rates.')} /> : (
        <div className="overflow-x-auto px-3 pb-3 pt-2"><table className="w-full min-w-[420px] text-body"><thead><tr className="bg-soft text-caption font-semibold text-strong">{[t('Supplier'), t('Reply time'), t('Response rate'), t('On-time')].map((h, i, a) => <th key={h} className={cn('px-4 py-2.5 text-start', i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r.name}><td className="px-4 py-3.5 font-semibold">{r.name}</td><td className="num px-4 py-3.5">{r.hours != null ? `${fmtNum(r.hours, lang, 1)} ${t('h')}` : '—'}</td><td className="num px-4 py-3.5">{r.rate != null ? `${fmtNum(r.rate, lang, 0)}%` : '—'}</td><td className="px-4 py-3.5">{r.onTime != null ? <Badge tone={r.onTime >= 90 ? 'success' : r.onTime >= 75 ? 'warn' : 'danger'}>{fmtNum(r.onTime, lang, 0)}%</Badge> : '—'}</td></tr>)}</tbody></table></div>)}
    </Card>
  );
}

function Attention({ d }: { d: any }) {
  const { t } = useT();
  const items = [{ n: d.deliveries?.late, label: t('Late deliveries'), href: '/app/delivery-note', icon: 'truck', tone: 'warn' }, { n: d.slaBreaches?.length, label: t('SLA breaches'), href: '/app/request', icon: 'timer', tone: 'danger' }, { n: d.creditHolds, label: t('Credit holds'), href: '/app/credit-hold', icon: 'octagon-alert', tone: 'danger' }, { n: d.receivingDue, label: t('Receiving due'), href: '/app/purchase-order', icon: 'package-check', tone: 'info' }, { n: d.partialDeliveries, label: t('Open back-orders'), href: '/app/sales-order', icon: 'clock', tone: 'warn' }].filter((x) => x.n > 0);
  if (!items.length) return null;
  const TONE: any = { warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger', info: 'bg-info-bg text-info' };
  return <Card><CardHeader title={t('Needs your attention')} /><ul className="grid gap-3 p-6 pt-4 sm:grid-cols-2 xl:grid-cols-5">{items.map((a) => <li key={a.label}><Link href={a.href} className="flex items-center gap-3 rounded-md border border-line p-3.5 transition-colors hover:bg-soft"><span className={cn('grid h-10 w-10 place-items-center rounded-sm', TONE[a.tone])}><Icon name={a.icon} size={20} /></span><span className="flex-1 text-small font-semibold">{a.label}</span><b className="num text-metric">{a.n}</b></Link></li>)}</ul></Card>;
}
void fmtDate;
