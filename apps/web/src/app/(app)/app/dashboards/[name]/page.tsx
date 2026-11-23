'use client';
import { use, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtMoney, fmtNum, fmtDate, toInputDate } from '@/lib/format';
import { BarCard, LineCard, PieCard } from '@/components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonBlock, SkeletonCards, Stat, StatusBadge, cn } from '@/components/ui';

const TITLES: Record<string, [string, string]> = { executive: ['Executive dashboard', 'لوحة الإدارة التنفيذية'], sales: ['Sales dashboard', 'لوحة المبيعات'], profitability: ['Profitability', 'لوحة الربحية'], expenses: ['Expenses', 'لوحة المصروفات'], receivables: ['Receivables', 'لوحة الذمم المدينة'], procurement: ['Procurement', 'لوحة المشتريات'], operations: ['Operations', 'لوحة العمليات'], history: ['Historical analysis', 'التحليل التاريخي'], branch: ['Branch & POS', 'الفروع ونقاط البيع'] };

function Range({ from, to, set }: { from: string; to: string; set: (f: string, t: string) => void }) {
  const { t } = useT();
  return <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-muted">{t('From')}</span><Input type="date" value={from} onChange={(e) => set(e.target.value, to)} className="h-9 w-40" dir="ltr" /><span className="text-xs font-semibold text-muted">{t('To')}</span><Input type="date" value={to} onChange={(e) => set(from, e.target.value)} className="h-9 w-40" dir="ltr" /></div>;
}
function Table({ title, cols, rows, empty }: { title: string; cols: { key: string; label: string; fmt?: (v: any, r: any) => ReactNode }[]; rows: any[]; empty?: string }) {
  const { t } = useT();
  return <Card><CardHeader title={title} />{rows.length === 0 ? <p className="p-5 text-sm text-muted">{empty ?? t('Nothing here yet')}</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted">{cols.map((c) => <th key={c.key} className="p-2.5 text-start font-semibold">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-line">{rows.map((r, i) => <tr key={i}>{cols.map((c) => <td key={c.key} className="num p-2.5">{c.fmt ? c.fmt(r[c.key], r) : r[c.key]}</td>)}</tr>)}</tbody></table></div>}</Card>;
}

export default function DashboardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params); const { t, lang } = useT();
  const month = new Date(); month.setDate(1);
  const [range, setRange] = useState({ from: toInputDate(month), to: toInputDate(new Date()) });
  const ranged = ['sales', 'profitability', 'expenses', 'branch'].includes(name);
  const [hist, setHist] = useState({ metric: 'sales', group: 'month', years: '3' });
  const q = useQuery({ queryKey: ['dash', name, ranged ? range : name === 'history' ? hist : null], queryFn: ({ signal }) => name === 'history' ? api<any>('/api/v1/reports/history', { query: hist, signal }) : api<any>(`/api/v1/dashboards/${name}`, { query: ranged ? range : undefined, signal }), enabled: !!TITLES[name], refetchInterval: name === 'operations' ? 30000 : false });
  const drill = useQuery({ queryKey: ['drill', hist, 'x'], enabled: false, queryFn: async () => null });
  void drill;
  const [period, setPeriod] = useState<string | null>(null);
  const dr = useQuery({ queryKey: ['history-drill', hist.metric, period], enabled: !!period, queryFn: () => api<any>('/api/v1/reports/history/drill', { query: { metric: hist.metric, period } }) });
  if (!TITLES[name]) return <EmptyState icon="file-question" title={t('Page not found')} />;
  const d = q.data; const money = (v: any) => fmtMoney(v, lang);
  const title = TITLES[name][lang === 'ar' ? 1 : 0];
  let body: ReactNode = null;
  if (q.isLoading) body = <div className="space-y-5"><SkeletonCards n={4} /><div className="grid gap-5 lg:grid-cols-2"><SkeletonBlock /><SkeletonBlock /></div></div>;
  else if (q.isError) body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  else if (name === 'executive') {
    const k = d.kpis; const delta = (a: number, b: number) => (b ? `${a >= b ? '▲' : '▼'} ${fmtNum((Math.abs(a - b) / Math.abs(b)) * 100, lang, 1)}%` : '');
    body = (<div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label={t('Sales (this month)')} value={money(k.salesMtd)} sub={`${t('vs last month')} ${delta(k.salesMtd, k.salesPrev)} · ${t('vs last year')} ${delta(k.salesMtd, k.salesYoy)}`} icon="trending-up" /><Stat label={t('Gross margin')} value={money(k.grossMargin)} sub={`${fmtNum(k.grossMarginPct, lang, 1)}%`} icon="percent" tone="success" /><Stat label={t('Net profit')} value={money(k.netProfit)} sub={`${t('last month')} ${money(k.netProfitPrev)}`} icon="wallet" tone={k.netProfit >= 0 ? 'success' : 'danger'} /><Stat label={t('Cash')} value={money(k.cash)} icon="landmark" /></div>
      <div className="grid gap-3 sm:grid-cols-3"><Stat label={t('Receivables')} value={money(k.receivables)} sub={`${t('Overdue')} ${money(k.overdue)}`} icon="hand-coins" tone="warn" /><Stat label={t('Payables')} value={money(k.payables)} icon="credit-card" /><Stat label={t('Overdue share')} value={`${k.receivables ? fmtNum((k.overdue / k.receivables) * 100, lang, 0) : 0}%`} icon="alert-triangle" tone={k.overdue ? 'danger' : 'success'} /></div>
      <div className="grid gap-5 lg:grid-cols-2"><LineCard title={t('Revenue vs profit (12 months)')} data={d.series} series={[{ key: 'revenue', label: t('Revenue') }, { key: 'grossProfit', label: t('Gross profit') }, { key: 'netProfit', label: t('Net profit') }]} /><BarCard title={t('Top customers (this month)')} data={d.topCustomers} /></div></div>);
  } else if (name === 'sales') {
    body = (<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Stat label={t('Quotations sent')} value={d.conversion.sent} icon="send" /><Stat label={t('Approved')} value={d.conversion.approved} icon="check" tone="success" /><Stat label={t('Quote → order conversion')} value={`${fmtNum(d.conversion.rate, lang, 1)}%`} icon="percent" /></div>
      <Table title={t('Sales targets (achievement)')} cols={[{ key: 'scope', label: t('Scope') }, { key: 'name', label: t('Name') }, { key: 'target', label: t('Target'), fmt: money }, { key: 'achieved', label: t('Achieved'), fmt: money }, { key: 'pct', label: '%', fmt: (v: number) => <Badge tone={v >= 100 ? 'success' : v >= 60 ? 'warn' : 'danger'}>{fmtNum(v, lang, 0)}%</Badge> }]} rows={d.targets ?? []} empty={t('No targets set for this period')} />
      <div className="grid gap-5 lg:grid-cols-2"><BarCard title={t('By customer')} data={d.byCustomer} /><BarCard title={t('By sales rep')} data={d.byRep} /><PieCard title={t('By category')} data={d.byCategory} /><BarCard title={t('By brand')} data={d.byBrand} /><BarCard title={t('By vehicle make')} data={d.byMake} /><PieCard title={t('Lost-sale reasons')} data={d.lostReasons} /></div></div>);
  } else if (name === 'profitability') {
    const cols = [{ key: 'name', label: t('Name') }, { key: 'revenue', label: t('Revenue'), fmt: money }, { key: 'cost', label: t('Cost'), fmt: money }, { key: 'marginPct', label: t('Margin'), fmt: (v: number) => <Badge tone={v < 10 ? 'danger' : v < 20 ? 'warn' : 'success'}>{fmtNum(v, lang, 1)}%</Badge> }];
    body = (<div className="space-y-5"><LineCard title={t('Margin trend')} data={d.trend} series={[{ key: 'marginPct', label: t('Margin %') }]} h={240} />
      <div className="grid gap-5 lg:grid-cols-2"><Table title={t('By customer')} cols={cols} rows={d.byCustomer} /><Table title={t('By supplier')} cols={cols} rows={d.bySupplier} /><Table title={t('By category')} cols={cols} rows={d.byCategory} /><Table title={t('By order')} cols={cols} rows={d.byOrder} /></div>
      <Table title={t('Below-target deals')} cols={[{ key: 'number', label: t('Quotation') }, { key: 'customer', label: t('Customer') }, { key: 'margin', label: t('Margin'), fmt: (v: number) => <Badge tone="danger">{fmtNum(v, lang, 1)}%</Badge> }, { key: 'value', label: t('Value'), fmt: money }, { key: 'status', label: t('Status'), fmt: (v: string) => <StatusBadge value={v} /> }]} rows={d.belowTarget} empty={t('No below-target deals in this period')} /></div>);
  } else if (name === 'expenses') {
    body = (<div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><PieCard title={t('By category')} data={d.byCategory} /><BarCard title={t('By cost centre')} data={d.byCostCenter} /></div><BarCard title={t('Budget vs actual')} data={d.budgetVsActual} series={[{ key: 'budget', label: t('Budget') }, { key: 'spent', label: t('Spent') }]} /><LineCard title={t('Monthly trend')} data={d.trend} h={220} area /></div>);
  } else if (name === 'receivables') {
    const cols = [['name', t('Customer')], ['current', t('Current')], ['b1', '1–30'], ['b2', '31–60'], ['b3', '61–90'], ['b4', '90+'], ['total', t('Total')]].map(([k, l]) => ({ key: k, label: l, fmt: k === 'name' ? undefined : (v: any) => fmtNum(v, lang) }));
    body = (<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Stat label="DSO" value={`${fmtNum(d.dso, lang, 0)} ${t('days')}`} icon="calendar-clock" /><Stat label={t('Collection effectiveness')} value={`${fmtNum(d.collectionEffectiveness, lang, 0)}%`} icon="gauge" tone="success" /><Stat label={t('Total receivables')} value={money(d.ageing.totals?.total)} icon="hand-coins" /></div>
      <div className="grid gap-5 lg:grid-cols-2"><BarCard title={t('Ageing')} data={d.ageing.totals?.total ? [{ name: t('Current'), value: d.ageing.totals.current }, { name: '1–30', value: d.ageing.totals.b1 }, { name: '31–60', value: d.ageing.totals.b2 }, { name: '61–90', value: d.ageing.totals.b3 }, { name: '90+', value: d.ageing.totals.b4 }] : []} /><BarCard title={t('Overdue by customer')} data={d.overdueByCustomer} /></div>
      <Table title={t('Ageing by customer')} cols={cols} rows={d.ageing.rows} /><Table title={t('Credit utilisation')} cols={[{ key: 'name', label: t('Customer') }, { key: 'limit', label: t('Limit'), fmt: money }, { key: 'exposure', label: t('Exposure'), fmt: money }, { key: 'pct', label: '%', fmt: (v: number) => <Badge tone={v > 100 ? 'danger' : v > 80 ? 'warn' : 'success'}>{fmtNum(v, lang, 0)}%</Badge> }]} rows={d.creditUtilisation} /></div>);
  } else if (name === 'procurement') {
    const series = Object.values((d.priceTrends as any[]).reduce((a, r) => { (a[r.month] ??= { month: r.month })[r.part] = r.price; return a; }, {} as any));
    const parts = [...new Set((d.priceTrends as any[]).map((r) => r.part))] as string[];
    body = (<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Stat label={t('Awaiting receipt')} value={d.pos.awaiting} icon="package" /><Stat label={t('Late POs')} value={d.pos.late} icon="alarm-clock" tone={d.pos.late ? 'danger' : 'success'} /><Stat label={t('Pending approval')} value={d.pos.pending} icon="check-circle" tone="warn" /></div>
      <div className="grid gap-5 lg:grid-cols-2"><BarCard title={t('Supplier spend (90 days)')} data={d.spendBySupplier} /><BarCard title={t('On-time delivery %')} data={d.onTimeRates} series={[{ key: 'pct', label: '%' }]} /><BarCard title={t('Response time (hours)')} data={d.responseTimes} series={[{ key: 'hours', label: t('Hours') }]} /><LineCard title={t('Price trends')} data={series as any[]} series={parts.map((p) => ({ key: p, label: p }))} /></div></div>);
  } else if (name === 'operations') {
    body = (<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label={t('Pending approvals')} value={d.pendingApprovals} icon="check-circle" tone="warn" /><Stat label={t('Credit holds')} value={d.creditHolds} icon="octagon-alert" tone={d.creditHolds ? 'danger' : 'success'} /><Stat label={t('Deliveries today')} value={d.deliveries.today} sub={`${t('Late')} ${d.deliveries.late}`} icon="truck" /><Stat label={t('Open back-orders')} value={d.partialDeliveries} icon="clock" tone="warn" /></div>
      <div className="grid gap-5 lg:grid-cols-2"><BarCard title={t('Requests by status')} data={d.requestsByStatus} h={240} /><Table title={t('SLA breaches')} cols={[{ key: 'number', label: t('Request'), fmt: (v: string, r: any) => <Link className="font-semibold text-primary hover:underline" href={`/app/request?q=${v}`}>{v}</Link> }, { key: 'customer', label: t('Customer') }, { key: 'slaDueAt', label: t('Due'), fmt: (v: string) => fmtDate(v, lang) }]} rows={d.slaBreaches} empty={t('No SLA breaches')} /></div></div>);
  } else if (name === 'branch') {
    body = (<div className="space-y-5"><div className="grid gap-3 sm:grid-cols-3"><Stat label={t('Jobs completed')} value={`${d.service.done}/${d.service.total}`} icon="wrench" /><Stat label={t('Workshop revenue')} value={money(d.service.revenue)} icon="wallet" /><Stat label={t('Avg job time')} value={`${fmtNum(d.service.avgMinutes, lang, 0)} ${t('min')}`} icon="timer" /></div>
      <div className="grid gap-5 lg:grid-cols-2"><BarCard title={t('Sales by branch')} data={d.salesByBranch} /><BarCard title={t('POS by terminal')} data={d.posByTerminal} /><PieCard title={t('POS category mix')} data={d.categoryMix} /><Table title={t('Stock by warehouse')} cols={[{ key: 'warehouse', label: t('Warehouse') }, { key: 'parts', label: t('Parts') }, { key: 'value', label: t('Value'), fmt: money }]} rows={d.stock} /></div>
      <Table title={t('Recent shifts (cash-up)')} cols={[{ key: 'terminal', label: t('Terminal') }, { key: 'cashier', label: t('Cashier') }, { key: 'openedAt', label: t('Opened'), fmt: (v: string) => fmtDate(v, lang) }, { key: 'variance', label: t('Variance'), fmt: (v: number) => <Badge tone={v ? 'danger' : 'success'}>{fmtNum(v ?? 0, lang)}</Badge> }, { key: 'status', label: t('Status'), fmt: (v: string) => <StatusBadge value={v} /> }]} rows={d.shifts} /></div>);
  } else if (name === 'history') {
    body = (<div className="space-y-5"><div className="flex flex-wrap gap-2"><Select value={hist.metric} onChange={(e) => setHist({ ...hist, metric: e.target.value })} className="w-44">{['sales', 'margin', 'collections', 'purchases'].map((m) => <option key={m} value={m}>{t(m)}</option>)}</Select><Select value={hist.group} onChange={(e) => setHist({ ...hist, group: e.target.value })} className="w-36">{['month', 'quarter', 'year'].map((m) => <option key={m}>{m}</option>)}</Select><Select value={hist.years} onChange={(e) => setHist({ ...hist, years: e.target.value })} className="w-32">{[1, 2, 3, 5].map((m) => <option key={m} value={m}>{m} {t('years')}</option>)}</Select></div>
      <Card><CardHeader title={t('Click a period to drill down to the transactions')} /><div className="flex flex-wrap gap-2 p-4">{d.series.length === 0 ? <p className="text-sm text-muted">{t('No data for this period')}</p> : d.series.map((s: any) => <button key={s.period} onClick={() => setPeriod(s.period)} className={cn('rounded-xl border px-3 py-2 text-start text-xs hover:border-primary', period === s.period ? 'border-primary bg-primary/10' : 'border-line')}><b className="block">{s.period}</b><span className="num">{money(s.value)}</span> · {s.count}</button>)}</div></Card>
      <LineCard title={t('Trend')} data={d.series} xKey="period" area h={260} />
      {period && <Card><CardHeader title={`${t('Transactions')} — ${period}`} actions={<Button variant="ghost" size="sm" onClick={() => setPeriod(null)}>{t('Close')}</Button>} />{dr.isLoading ? <p className="p-5 text-sm text-muted">{t('Loading')}…</p> : dr.isError ? <ErrorState error={dr.error} compact onRetry={() => dr.refetch()} /> : <ul className="divide-y divide-line">{dr.data.rows.map((r: any) => <li key={r.id}><Link href={`/app/${dr.data.slug}/${r.id}`} className="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-primary/5"><b>{r.label}</b><span className="text-muted">{r.sub}</span><span className="num">{money(r.value)}</span></Link></li>)}</ul>}</Card>}</div>);
  }
  return (
    <>
      <PageHeader title={title} actions={ranged ? <Range from={range.from} to={range.to} set={(f, to) => setRange({ from: f, to })} /> : undefined} />
      {body}
    </>
  );
}
