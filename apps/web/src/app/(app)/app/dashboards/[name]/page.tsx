'use client';
import { use, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { ArrowUpRight, Calendar, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { BarCard, GOLD, LineCard, NAVY, PieCard, Sparkline } from '@/components/charts';
import { Chip, DashHeader, Hero, Kpi, ROW1, th } from '@/components/erp/dash';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Icon, Input, Progress, Select, Skeleton, SkeletonBlock, SkeletonCards, StatusBadge, cn } from '@/components/ui';

const NAV_TABS: { key: string; en: string; ar: string; icon: string; descEn: string; descAr: string }[] = [
  { key: 'executive', en: 'Executive', ar: 'التنفيذية', icon: 'layout-dashboard', descEn: 'Company-wide revenue, margin, cash and working capital.', descAr: 'نظرة شاملة على الإيرادات والهوامش والنقد ورأس المال العامل.' },
  { key: 'sales', en: 'Sales', ar: 'المبيعات', icon: 'trending-up', descEn: 'Quote conversion, target attainment and sales mix.', descAr: 'تحويل العروض وتحقيق الأهداف وتوزيع المبيعات.' },
  { key: 'profitability', en: 'Profitability', ar: 'الربحية', icon: 'percent', descEn: 'Gross margin performance by customer, supplier and category.', descAr: 'أداء هامش الربح حسب العميل والمورد والفئة.' },
  { key: 'expenses', en: 'Expenses', ar: 'المصروفات', icon: 'receipt', descEn: 'Posted spend by category, cost centre and budget variance.', descAr: 'المصروفات المرحّلة حسب الفئة ومركز التكلفة والميزانية.' },
  { key: 'receivables', en: 'Receivables', ar: 'الذمم المدينة', icon: 'hand-coins', descEn: 'DSO, ageing buckets, overdue accounts and credit limits.', descAr: 'متوسط التحصيل وأعمار الديون والمتأخرات وحدود الائتمان.' },
  { key: 'procurement', en: 'Procurement', ar: 'المشتريات', icon: 'shopping-bag', descEn: 'Supplier spend, delivery punctuality, quote speed and pricing.', descAr: 'إنفاق الموردين والالتزام بالتسليم وزمن الرد والأسعار.' },
  { key: 'operations', en: 'Operations', ar: 'العمليات', icon: 'activity', descEn: 'Live workload across requests, approvals, holds and deliveries.', descAr: 'حجم العمل المباشر في الطلبات والاعتمادات والتسليمات.' },
  { key: 'history', en: 'History', ar: 'التاريخ', icon: 'history', descEn: 'Multi-year financial trends with transaction drill-down.', descAr: 'الاتجاهات المالية متعددة السنوات مع تفاصيل المعاملات.' },
  { key: 'branch', en: 'Branches', ar: 'الفروع', icon: 'store', descEn: 'Branch sales, POS terminals, workshop performance and stock.', descAr: 'مبيعات الفروع ونقاط البيع وأداء الورشة والمخزون.' },
];

const BY_KEY = Object.fromEntries(NAV_TABS.map((x) => [x.key, x]));

const Money = ({ v, big, compact }: { v: any; big?: boolean; compact?: boolean }) => {
  const { lang } = useT();
  return (
    <span className="num">
      <span className="me-1.5 text-[0.5em] font-semibold tracking-wide text-current opacity-55">{lang === 'ar' ? 'ر.س' : 'SAR'}</span>
      {compact ? fmtCompact(v) : fmtNum(v, lang, big ? 0 : 2)}
    </span>
  );
};

function Range({ from, to, set, onRefresh, refreshing }: { from: string; to: string; set: (f: string, t: string) => void; onRefresh: () => void; refreshing?: boolean }) {
  const { t } = useT();
  const applyPreset = (kind: 'mtd' | '30d' | 'qtd' | 'ytd') => {
    const now = new Date();
    const s = new Date(now);
    if (kind === 'mtd') s.setDate(1);
    else if (kind === '30d') s.setDate(s.getDate() - 29);
    else if (kind === 'qtd') {
      s.setMonth(Math.floor(s.getMonth() / 3) * 3, 1);
    } else {
      s.setMonth(0, 1);
    }
    set(toInputDate(s), toInputDate(now));
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-sm border border-line bg-card p-0.5">
        {([
          ['mtd', 'MTD'],
          ['30d', '30D'],
          ['qtd', 'QTD'],
          ['ytd', 'YTD'],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => applyPreset(k)}
            className="rounded-xs px-2.5 py-1 text-[11px] font-semibold text-strong transition-colors hover:bg-soft hover:text-navy"
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 rounded-sm border border-line bg-card px-2.5 py-1">
        <Calendar size={13} className="shrink-0 text-muted" />
        <Input type="date" value={from} onChange={(e) => set(e.target.value, to)} className="!h-7 !w-[130px] !border-0 !bg-transparent !px-1 text-caption" dir="ltr" aria-label={t('From')} />
        <span className="text-caption text-muted">–</span>
        <Input type="date" value={to} onChange={(e) => set(from, e.target.value)} className="!h-7 !w-[130px] !border-0 !bg-transparent !px-1 text-caption" dir="ltr" aria-label={t('To')} />
      </div>
      <Button variant="secondary" size="sm" onClick={onRefresh} aria-label={t('Refresh')} className="!h-9 w-9 !px-0">
        <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
      </Button>
    </div>
  );
}

interface Col {
  key: string;
  label: string;
  align?: 'start' | 'end';
  fmt?: (v: any, r: any) => ReactNode;
}

function DataTable({ title, sub, cols, rows, empty, icon = 'table-2' }: { title: string; sub?: string; cols: Col[]; rows: any[]; empty?: string; icon?: string }) {
  const { t } = useT();
  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader
        title={title}
        sub={sub}
        actions={rows.length > 0 ? <Badge tone="muted">{rows.length}</Badge> : undefined}
      />
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center gap-3 px-6 py-10 text-small text-muted">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-soft text-muted">
            <Icon name={icon} size={18} />
          </span>
          <span>{empty ?? t('Nothing here yet')}</span>
        </div>
      ) : (
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          <table className="w-full min-w-[380px] text-small">
            <thead>
              <tr className="bg-soft text-caption font-semibold text-strong">
                {cols.map((c, i, a) => (
                  <th
                    key={c.key}
                    className={cn(
                      th,
                      c.align === 'end' && 'text-end',
                      i === 0 && 'rounded-s-sm',
                      i === a.length - 1 && 'rounded-e-sm'
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={i} className="transition-colors hover:bg-soft/45">
                  {cols.map((c, j) => (
                    <td
                      key={c.key}
                      className={cn(
                        'px-4 py-3',
                        j === 0 && 'font-semibold text-fg',
                        c.align === 'end' && 'num text-end'
                      )}
                    >
                      {c.fmt ? c.fmt(r[c.key], r) : r[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function HeroArea({ data, dataKey = 'v' }: { data: any[]; dataKey?: string }) {
  if (!data.length) return null;
  return (
    <div className="h-full" dir="ltr" aria-hidden>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: 0, right: 0, top: 6, bottom: 0 }}>
          <defs>
            <linearGradient id="dash-hero-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.42} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="name" hide />
          <Tooltip
            cursor={false}
            content={({ active, payload }: any) =>
              active && payload?.length ? (
                <div className="rounded-xs bg-white px-2 py-1 text-caption font-semibold text-navy shadow-pop">
                  <span className="num">{fmtCompact(payload[0].value)}</span>
                </div>
              ) : null
            }
          />
          <Area type="monotone" dataKey={dataKey} stroke={GOLD} strokeWidth={2.5} fill="url(#dash-hero-grad)" dot={false} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function DashboardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const { t, lang, el } = useT();
  const month = useMemo(() => {
    const m = new Date();
    m.setDate(1);
    return toInputDate(m);
  }, []);
  const [range, setRange] = useState({ from: month, to: toInputDate(new Date()) });
  const ranged = ['sales', 'profitability', 'expenses', 'branch'].includes(name);
  const [hist, setHist] = useState({ metric: 'sales', group: 'month', years: '3' });
  const [period, setPeriod] = useState<string | null>(null);

  const meta = BY_KEY[name];
  const q = useQuery({
    queryKey: ['dash', name, ranged ? range : name === 'history' ? hist : null],
    queryFn: ({ signal }) =>
      name === 'history'
        ? api<any>('/api/v1/reports/history', { query: hist, signal })
        : api<any>(`/api/v1/dashboards/${name}`, { query: ranged ? range : undefined, signal }),
    enabled: !!meta,
    refetchInterval: name === 'operations' ? 30000 : false,
  });

  const dr = useQuery({
    queryKey: ['history-drill', hist.metric, period],
    enabled: !!period && name === 'history',
    queryFn: () => api<any>('/api/v1/reports/history/drill', { query: { metric: hist.metric, period } }),
  });

  if (!meta) return <EmptyState icon="file-question" title={t('Page not found')} />;

  const d = q.data;
  const money = (v: any) => fmtMoney(v, lang);
  const title = lang === 'ar' ? meta.ar : meta.en;
  const desc = lang === 'ar' ? meta.descAr : meta.descEn;

  let body: ReactNode = null;

  if (q.isLoading) {
    body = (
      <div className="space-y-5">
        <SkeletonCards n={4} />
        <div className="grid gap-5 lg:grid-cols-2">
          <SkeletonBlock />
          <SkeletonBlock />
        </div>
      </div>
    );
  } else if (q.isError) {
    body = <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  } else if (name === 'executive') {
    const k = d.kpis;
    const series: any[] = d.series ?? [];
    const delta = k.salesPrev ? ((k.salesMtd - k.salesPrev) / Math.abs(k.salesPrev)) * 100 : null;
    const overduePct = k.receivables ? (k.overdue / k.receivables) * 100 : 0;
    const heroSeries = series.map((s) => ({ name: s.month.slice(5), v: s.revenue }));
    const sparkMargin = series.map((s) => (s.revenue ? (s.grossProfit / s.revenue) * 100 : 0));
    const sparkAr: number[] = d.trends?.receivables ?? [];
    const sparkNet = series.map((s) => s.netProfit);

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="wallet"
            label={t('Sales (this month)')}
            value={<Money v={k.salesMtd} big />}
            delta={
              delta != null ? (
                <span className={cn('inline-flex h-6 items-center gap-1 rounded-xs bg-navy-hover px-2.5 text-caption font-semibold', delta >= 0 ? 'text-positive' : 'text-[#FCA5A5]')}>
                  {delta >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                  {fmtNum(Math.abs(delta), lang, 1)}%
                </span>
              ) : undefined
            }
            stats={[
              [t('Gross profit'), money(k.grossMargin)],
              [t('Net profit'), money(k.netProfit)],
              [t('Cash'), money(k.cash)],
            ]}
            aside={<HeroArea data={heroSeries} />}
          />
          <Kpi
            icon="percent"
            tone="primary"
            label={t('Gross margin')}
            value={`${fmtNum(k.grossMarginPct, lang, 1)}%`}
            chip={<Chip tone={k.grossMarginPct >= 18 ? 'success' : 'gold'}>{t('Target')} 18%</Chip>}
            spark={<Sparkline data={sparkMargin} color={GOLD} h={42} />}
          />
          <Kpi
            icon="hand-coins"
            tone="danger"
            label={t('Receivables')}
            value={<Money v={k.receivables} compact />}
            chip={k.overdue > 0 ? <Chip tone="danger">{fmtCompact(k.overdue)} {t('overdue')}</Chip> : <Chip tone="success">{t('No overdue')}</Chip>}
            spark={<Sparkline data={sparkAr} color={NAVY} h={42} />}
          />
          <Kpi
            icon="landmark"
            tone={k.netProfit >= 0 ? 'success' : 'danger'}
            label={t('Net profit')}
            value={<Money v={k.netProfit} compact />}
            chip={<Chip tone={overduePct > 20 ? 'warn' : 'muted'}>{t('Payables')} {fmtCompact(k.payables)}</Chip>}
            spark={<Sparkline data={sparkNet} color={GOLD} h={42} />}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <LineCard
            title={t('Revenue vs profit (12 months)')}
            sub={t('Last 12 months')}
            data={series}
            series={[
              { key: 'revenue', label: t('Revenue') },
              { key: 'grossProfit', label: t('Gross profit') },
              { key: 'netProfit', label: t('Net profit') },
            ]}
          />
          <BarCard title={t('Top customers (this month)')} sub={t('By invoiced revenue')} data={d.topCustomers} />
        </div>
      </div>
    );
  } else if (name === 'sales') {
    const byCustomer: any[] = d.byCustomer ?? [];
    const totalSales = byCustomer.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const tg: any[] = d.targets ?? [];
    const tgTotal = tg.reduce((s, x) => s + Number(x.target ?? 0), 0);
    const tgDone = tg.reduce((s, x) => s + Number(x.achieved ?? 0), 0);
    const tgPct = tgTotal ? (tgDone / tgTotal) * 100 : 0;

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="trending-up"
            label={t('Period sales')}
            value={<Money v={totalSales} big />}
            delta={<span className="inline-flex h-6 items-center rounded-xs bg-navy-hover px-2.5 text-caption font-semibold text-gold">{fmtNum(d.conversion.rate, lang, 1)}% {t('conversion')}</span>}
            stats={[
              [t('Quotations sent'), d.conversion.sent],
              [t('Approved'), d.conversion.approved],
              [t('Lost'), d.conversion.lost ?? 0],
            ]}
          />
          <Kpi
            icon="send"
            tone="info"
            label={t('Quotations sent')}
            value={d.conversion.sent}
            chip={<Chip tone="success">{d.conversion.approved} {t('Approved')}</Chip>}
          />
          <Kpi
            icon="percent"
            tone="primary"
            label={t('Quote → order conversion')}
            value={`${fmtNum(d.conversion.rate, lang, 1)}%`}
            chip={<Chip tone={d.conversion.rate >= 40 ? 'success' : 'warn'}>{d.conversion.rate >= 40 ? t('Healthy') : t('Needs focus')}</Chip>}
          />
          <Kpi
            icon="target"
            tone={tgPct >= 80 ? 'success' : 'warn'}
            label={t('Target achievement')}
            value={tgTotal ? `${fmtNum(tgPct, lang, 0)}%` : '—'}
            chip={tgTotal ? <Chip tone="gold">{fmtCompact(tgDone)} / {fmtCompact(tgTotal)}</Chip> : <Chip tone="muted">{t('No target set')}</Chip>}
          />
        </section>

        <DataTable
          title={t('Sales targets (achievement)')}
          icon="target"
          cols={[
            { key: 'scope', label: t('Scope'), fmt: (v: string) => <Badge tone="muted">{el(v)}</Badge> },
            { key: 'name', label: t('Name') },
            { key: 'target', label: t('Target'), align: 'end', fmt: money },
            { key: 'achieved', label: t('Achieved'), align: 'end', fmt: money },
            {
              key: 'pct',
              label: t('Progress'),
              align: 'end',
              fmt: (v: number) => (
                <div className="inline-flex items-center justify-end gap-2.5">
                  <div className="hidden w-20 sm:block">
                    <Progress value={v} tone={v >= 100 ? 'gold' : 'navy'} />
                  </div>
                  <Badge tone={v >= 100 ? 'success' : v >= 60 ? 'warn' : 'danger'}>{fmtNum(v, lang, 0)}%</Badge>
                </div>
              ),
            },
          ]}
          rows={tg}
          empty={t('No targets set for this period')}
        />

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard title={t('By customer')} data={byCustomer} />
          <BarCard title={t('By sales rep')} data={d.byRep} />
          <PieCard title={t('By category')} data={d.byCategory} />
          <BarCard title={t('By brand')} data={d.byBrand} />
          <BarCard title={t('By vehicle make')} data={d.byMake} />
          <PieCard title={t('Lost-sale reasons')} data={d.lostReasons} />
        </div>
      </div>
    );
  } else if (name === 'profitability') {
    const byCat: any[] = d.byCategory ?? [];
    const totRev = byCat.reduce((s, x) => s + Number(x.revenue ?? 0), 0);
    const totCost = byCat.reduce((s, x) => s + Number(x.cost ?? 0), 0);
    const totGp = totRev - totCost;
    const totMargin = totRev ? (totGp / totRev) * 100 : 0;
    const trend: any[] = d.trend ?? [];
    const sparkMargin = trend.map((x) => Number(x.marginPct ?? 0));
    const latestMargin = trend.length ? trend[trend.length - 1].marginPct : 0;
    const cols: Col[] = [
      { key: 'name', label: t('Name') },
      { key: 'revenue', label: t('Revenue'), align: 'end', fmt: money },
      { key: 'cost', label: t('Cost'), align: 'end', fmt: money },
      {
        key: 'marginPct',
        label: t('Margin'),
        align: 'end',
        fmt: (v: number) => <Badge tone={v < 10 ? 'danger' : v < 20 ? 'warn' : 'success'}>{fmtNum(v, lang, 1)}%</Badge>,
      },
    ];

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="percent"
            label={t('Gross profit')}
            value={<Money v={totGp} big />}
            delta={<span className="inline-flex h-6 items-center rounded-xs bg-navy-hover px-2.5 text-caption font-semibold text-gold">{fmtNum(totMargin, lang, 1)}%</span>}
            stats={[
              [t('Revenue'), money(totRev)],
              [t('Cost'), money(totCost)],
              [t('Below-target deals'), d.belowTarget?.length ?? 0],
            ]}
            aside={<HeroArea data={trend.map((x) => ({ name: x.month, v: x.marginPct }))} />}
          />
          <Kpi
            icon="trending-up"
            tone="primary"
            label={t('Latest month margin')}
            value={`${fmtNum(latestMargin, lang, 1)}%`}
            chip={<Chip tone={latestMargin >= 18 ? 'success' : 'warn'}>{t('Target')} 18%</Chip>}
            spark={<Sparkline data={sparkMargin} color={GOLD} h={42} />}
          />
          <Kpi
            icon="wallet"
            tone="success"
            label={t('Period revenue')}
            value={<Money v={totRev} compact />}
            chip={<Chip tone="muted">{t('Cost')} {fmtCompact(totCost)}</Chip>}
          />
          <Kpi
            icon="alert-triangle"
            tone={d.belowTarget?.length ? 'danger' : 'success'}
            label={t('Below-target deals')}
            value={d.belowTarget?.length ?? 0}
            chip={<Chip tone={d.belowTarget?.length ? 'danger' : 'success'}>{d.belowTarget?.length ? t('Needs review') : t('All clear')}</Chip>}
          />
        </section>

        <LineCard title={t('Margin trend')} sub={t('Last 12 months')} data={trend} series={[{ key: 'marginPct', label: t('Margin %'), color: GOLD }]} h={250} area />

        <div className="grid gap-5 lg:grid-cols-2">
          <DataTable title={t('By customer')} cols={cols} rows={d.byCustomer ?? []} />
          <DataTable title={t('By supplier')} cols={cols} rows={d.bySupplier ?? []} />
          <DataTable title={t('By category')} cols={cols} rows={byCat} />
          <DataTable title={t('By order')} cols={cols} rows={d.byOrder ?? []} />
        </div>

        <DataTable
          title={t('Below-target deals')}
          icon="alert-triangle"
          cols={[
            { key: 'number', label: t('Quotation'), fmt: (v: string) => <span className="mono text-navy">{v}</span> },
            { key: 'customer', label: t('Customer') },
            { key: 'margin', label: t('Margin'), align: 'end', fmt: (v: number) => <Badge tone="danger">{fmtNum(v, lang, 1)}%</Badge> },
            { key: 'value', label: t('Value'), align: 'end', fmt: money },
            { key: 'status', label: t('Status'), fmt: (v: string) => <StatusBadge value={v} /> },
          ]}
          rows={d.belowTarget ?? []}
          empty={t('No below-target deals in this period')}
        />
      </div>
    );
  } else if (name === 'expenses') {
    const cats: any[] = d.byCategory ?? [];
    const budgets: any[] = d.budgetVsActual ?? [];
    const trend: any[] = d.trend ?? [];
    const totalSpent = cats.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const totalBudget = budgets.reduce((s, x) => s + Number(x.budget ?? 0), 0);
    const overruns = budgets.filter((b) => b.overrun).length;
    const budgetPct = totalBudget ? (totalSpent / totalBudget) * 100 : 0;

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="receipt"
            label={t('Total expenses')}
            value={<Money v={totalSpent} big />}
            delta={totalBudget > 0 ? <span className={cn('inline-flex h-6 items-center rounded-xs bg-navy-hover px-2.5 text-caption font-semibold', budgetPct > 100 ? 'text-[#FCA5A5]' : 'text-positive')}>{fmtNum(budgetPct, lang, 0)}% {t('of budget')}</span> : undefined}
            stats={[
              [t('Budget'), totalBudget ? money(totalBudget) : '—'],
              [t('Categories'), cats.length],
              [t('Overruns'), overruns],
            ]}
            aside={<HeroArea data={trend.map((x) => ({ name: x.month, v: x.value }))} />}
          />
          <Kpi
            icon="pie-chart"
            tone="primary"
            label={t('Top category')}
            value={cats[0] ? <Money v={cats[0].value} compact /> : '—'}
            chip={cats[0] ? <Chip tone="gold">{cats[0].name}</Chip> : undefined}
          />
          <Kpi
            icon="scale"
            tone={overruns ? 'danger' : 'success'}
            label={t('Budget overruns')}
            value={overruns}
            chip={<Chip tone={overruns ? 'danger' : 'success'}>{overruns ? t('Over budget') : t('Within budget')}</Chip>}
          />
          <Kpi
            icon="trending-up"
            tone="info"
            label={t('Monthly trend')}
            value={trend.length ? <Money v={trend[trend.length - 1].value} compact /> : '—'}
            spark={<Sparkline data={trend.map((x) => x.value)} color={NAVY} h={42} />}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <PieCard title={t('By category')} data={cats} />
          <BarCard title={t('By cost centre')} data={d.byCostCenter} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard
            title={t('Budget vs actual')}
            data={budgets}
            series={[
              { key: 'budget', label: t('Budget'), color: NAVY },
              { key: 'spent', label: t('Spent'), color: GOLD },
            ]}
          />
          <LineCard title={t('Monthly trend')} data={trend} h={280} area />
        </div>
      </div>
    );
  } else if (name === 'receivables') {
    const tt = d.ageing.totals ?? {};
    const totalAr = Number(tt.total ?? 0);
    const overdue = Number(tt.b1 ?? 0) + Number(tt.b2 ?? 0) + Number(tt.b3 ?? 0) + Number(tt.b4 ?? 0);
    const overdueShare = totalAr ? (overdue / totalAr) * 100 : 0;
    const cols: Col[] = [
      { key: 'name', label: t('Customer') },
      { key: 'current', label: t('Current'), align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b1', label: '1–30', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b2', label: '31–60', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b3', label: '61–90', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b4', label: '90+', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'total', label: t('Total'), align: 'end', fmt: (v) => <b>{fmtNum(v, lang)}</b> },
    ];

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="hand-coins"
            label={t('Total receivables')}
            value={<Money v={totalAr} big />}
            delta={overdue > 0 ? <span className="inline-flex h-6 items-center rounded-xs bg-navy-hover px-2.5 text-caption font-semibold text-[#FCA5A5]">{fmtNum(overdueShare, lang, 0)}% {t('overdue')}</span> : <span className="inline-flex h-6 items-center rounded-xs bg-navy-hover px-2.5 text-caption font-semibold text-positive">{t('All current')}</span>}
            stats={[
              [t('Current'), money(tt.current ?? 0)],
              [`1–30 ${t('days')}`, money(tt.b1 ?? 0)],
              [`30+ ${t('days')}`, money((tt.b2 ?? 0) + (tt.b3 ?? 0) + (tt.b4 ?? 0))],
            ]}
          />
          <Kpi
            icon="calendar-clock"
            tone={d.dso > 60 ? 'danger' : d.dso > 45 ? 'warn' : 'primary'}
            label="DSO"
            value={`${fmtNum(d.dso, lang, 0)} ${t('days')}`}
            chip={<Chip tone={d.dso <= 45 ? 'success' : 'warn'}>{d.dso <= 45 ? t('Healthy') : t('Watch')}</Chip>}
          />
          <Kpi
            icon="gauge"
            tone="success"
            label={t('Collection effectiveness')}
            value={`${fmtNum(d.collectionEffectiveness, lang, 0)}%`}
            chip={<Chip tone={d.collectionEffectiveness >= 70 ? 'success' : 'warn'}>{t('Last 30 days')}</Chip>}
          />
          <Kpi
            icon="alert-triangle"
            tone={overdue > 0 ? 'danger' : 'success'}
            label={t('Overdue amount')}
            value={<Money v={overdue} compact />}
            chip={<Chip tone={overdue > 0 ? 'danger' : 'success'}>{d.overdueByCustomer?.length ?? 0} {t('accounts')}</Chip>}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard
            title={t('Ageing')}
            data={
              totalAr
                ? [
                    { name: t('Current'), value: tt.current ?? 0 },
                    { name: '1–30', value: tt.b1 ?? 0 },
                    { name: '31–60', value: tt.b2 ?? 0 },
                    { name: '61–90', value: tt.b3 ?? 0 },
                    { name: '90+', value: tt.b4 ?? 0 },
                  ]
                : []
            }
          />
          <BarCard title={t('Overdue by customer')} data={d.overdueByCustomer} />
        </div>

        <DataTable title={t('Ageing by customer')} cols={cols} rows={d.ageing.rows ?? []} />
        <DataTable
          title={t('Credit utilisation')}
          cols={[
            { key: 'name', label: t('Customer') },
            { key: 'limit', label: t('Limit'), align: 'end', fmt: money },
            { key: 'exposure', label: t('Exposure'), align: 'end', fmt: money },
            {
              key: 'pct',
              label: t('Utilisation'),
              align: 'end',
              fmt: (v: number) => (
                <div className="inline-flex items-center justify-end gap-2.5">
                  <div className="hidden w-20 sm:block">
                    <Progress value={v} tone={v > 80 ? 'gold' : 'navy'} />
                  </div>
                  <Badge tone={v > 100 ? 'danger' : v > 80 ? 'warn' : 'success'}>{fmtNum(v, lang, 0)}%</Badge>
                </div>
              ),
            },
          ]}
          rows={d.creditUtilisation ?? []}
        />
      </div>
    );
  } else if (name === 'procurement') {
    const spendList: any[] = d.spendBySupplier ?? [];
    const totalSpend = spendList.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const onTimeList: any[] = d.onTimeRates ?? [];
    const avgOnTime = onTimeList.length ? onTimeList.reduce((s, x) => s + Number(x.pct ?? 0), 0) / onTimeList.length : 0;
    const respList: any[] = d.responseTimes ?? [];
    const avgReply = respList.length ? respList.reduce((s, x) => s + Number(x.hours ?? 0), 0) / respList.length : 0;
    const series = Object.values(
      (d.priceTrends as any[]).reduce((a, r) => {
        (a[r.month] ??= { month: r.month })[r.part] = r.price;
        return a;
      }, {} as any)
    );
    const parts = [...new Set((d.priceTrends as any[]).map((r) => r.part))] as string[];

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="shopping-bag"
            label={t('Supplier spend (90 days)')}
            value={<Money v={totalSpend} big />}
            stats={[
              [t('Awaiting receipt'), d.pos.awaiting],
              [t('Late POs'), d.pos.late],
              [t('Pending approval'), d.pos.pending],
            ]}
          />
          <Kpi
            icon="package"
            tone="info"
            label={t('Awaiting receipt')}
            value={d.pos.awaiting}
            chip={d.pos.late ? <Chip tone="danger">{d.pos.late} {t('Late')}</Chip> : <Chip tone="success">{t('On schedule')}</Chip>}
          />
          <Kpi
            icon="truck"
            tone={avgOnTime >= 90 ? 'success' : 'warn'}
            label={t('On-time delivery %')}
            value={onTimeList.length ? `${fmtNum(avgOnTime, lang, 0)}%` : '—'}
            chip={<Chip tone="muted">{onTimeList.length} {t('suppliers')}</Chip>}
          />
          <Kpi
            icon="timer"
            tone="primary"
            label={t('Avg reply time')}
            value={respList.length ? `${fmtNum(avgReply, lang, 1)} ${t('h')}` : '—'}
            chip={<Chip tone="gold">{t('Last 90 days')}</Chip>}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard title={t('Supplier spend (90 days)')} data={spendList} />
          <BarCard title={t('On-time delivery %')} data={onTimeList} series={[{ key: 'pct', label: '%' }]} />
          <BarCard title={t('Response time (hours)')} data={respList} series={[{ key: 'hours', label: t('Hours') }]} />
          <LineCard title={t('Price trends')} data={series as any[]} series={parts.map((p) => ({ key: p, label: p }))} />
        </div>
      </div>
    );
  } else if (name === 'operations') {
    const reqByStatus = (d.requestsByStatus ?? []).map((r: any) => ({ name: el(String(r.name)), value: r.value }));
    const openReqs = reqByStatus.reduce((s: number, r: any) => s + Number(r.value ?? 0), 0);

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="activity"
            label={t('Active requests')}
            value={openReqs}
            delta={<span className="inline-flex h-6 items-center gap-1.5 rounded-xs bg-navy-hover px-2.5 text-caption font-semibold text-positive"><span className="h-1.5 w-1.5 rounded-full bg-positive" />{t('Live')}</span>}
            stats={[
              [t('Deliveries today'), d.deliveries.today],
              [t('Tomorrow'), d.deliveries.tomorrow ?? 0],
              [t('Late'), d.deliveries.late],
            ]}
          />
          <Kpi
            icon="check-circle"
            tone={d.pendingApprovals ? 'warn' : 'success'}
            label={t('Pending approvals')}
            value={d.pendingApprovals}
            chip={<Chip tone={d.pendingApprovals ? 'warn' : 'success'}>{d.pendingApprovals ? t('Action needed') : t('All clear')}</Chip>}
          />
          <Kpi
            icon="octagon-alert"
            tone={d.creditHolds ? 'danger' : 'success'}
            label={t('Credit holds')}
            value={d.creditHolds}
            chip={<Chip tone={d.creditHolds ? 'danger' : 'success'}>{d.creditHolds ? t('Held') : t('All clear')}</Chip>}
          />
          <Kpi
            icon="clock"
            tone={d.partialDeliveries ? 'warn' : 'info'}
            label={t('Open back-orders')}
            value={d.partialDeliveries}
            chip={<Chip tone="info">{t('Receiving due')} {d.receivingDue ?? 0}</Chip>}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard title={t('Requests by status')} data={reqByStatus} h={260} />
          <DataTable
            title={t('SLA breaches')}
            icon="timer"
            cols={[
              {
                key: 'number',
                label: t('Request'),
                fmt: (v: string) => (
                  <Link className="mono text-navy hover:underline" href={`/app/request?q=${v}`}>
                    {v}
                  </Link>
                ),
              },
              { key: 'customer', label: t('Customer') },
              { key: 'slaDueAt', label: t('Due'), align: 'end', fmt: (v: string) => fmtDate(v, lang) },
            ]}
            rows={d.slaBreaches ?? []}
            empty={t('No SLA breaches')}
          />
        </div>
      </div>
    );
  } else if (name === 'branch') {
    const branchSales = (d.salesByBranch ?? []).reduce((s: number, x: any) => s + Number(x.value ?? 0), 0);
    const posSales = (d.posByTerminal ?? []).reduce((s: number, x: any) => s + Number(x.value ?? 0), 0);
    const stockRows: any[] = d.stock ?? [];
    const stockValue = stockRows.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const stockParts = stockRows.reduce((s, x) => s + Number(x.parts ?? 0), 0);
    const totalCombined = branchSales + Number(d.service.revenue ?? 0);
    const jobPct = d.service.total ? (d.service.done / d.service.total) * 100 : 0;

    body = (
      <div className="space-y-5">
        <section className={ROW1}>
          <Hero
            icon="store"
            label={t('Branch & workshop revenue')}
            value={<Money v={totalCombined} big />}
            stats={[
              [t('Branch sales'), money(branchSales)],
              [t('POS sales'), money(posSales)],
              [t('Workshop revenue'), money(d.service.revenue)],
            ]}
          />
          <Kpi
            icon="wrench"
            tone="primary"
            label={t('Jobs completed')}
            value={`${d.service.done}/${d.service.total}`}
            chip={<Chip tone={jobPct >= 80 ? 'success' : 'gold'}>{fmtNum(jobPct, lang, 0)}%</Chip>}
          />
          <Kpi
            icon="timer"
            tone="info"
            label={t('Avg job time')}
            value={`${fmtNum(d.service.avgMinutes, lang, 0)} ${t('min')}`}
            chip={<Chip tone="muted">{t('Workshop')}</Chip>}
          />
          <Kpi
            icon="package"
            tone="success"
            label={t('Stock value')}
            value={<Money v={stockValue} compact />}
            chip={<Chip tone="muted">{stockParts} {t('Parts')}</Chip>}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard title={t('Sales by branch')} sub={t('Invoiced subtotal')} data={d.salesByBranch} />
          <BarCard title={t('POS by terminal')} sub={t('Paid counter sales')} data={d.posByTerminal} />
          <PieCard title={t('POS category mix')} data={d.categoryMix} />
          <DataTable
            title={t('Stock by warehouse')}
            icon="warehouse"
            cols={[
              { key: 'warehouse', label: t('Warehouse') },
              { key: 'parts', label: t('Parts'), align: 'end', fmt: (v: number) => fmtNum(v, lang, 0) },
              { key: 'value', label: t('Value'), align: 'end', fmt: money },
            ]}
            rows={stockRows}
          />
        </div>

        <DataTable
          title={t('Recent shifts (cash-up)')}
          icon="clock"
          cols={[
            { key: 'terminal', label: t('Terminal') },
            { key: 'cashier', label: t('Cashier') },
            { key: 'openedAt', label: t('Opened'), fmt: (v: string) => fmtDate(v, lang) },
            {
              key: 'variance',
              label: t('Variance'),
              align: 'end',
              fmt: (v: number) => <Badge tone={v ? 'danger' : 'success'}>{fmtNum(v ?? 0, lang)}</Badge>,
            },
            { key: 'status', label: t('Status'), fmt: (v: string) => <StatusBadge value={v} /> },
          ]}
          rows={d.shifts ?? []}
        />
      </div>
    );
  } else if (name === 'history') {
    const series: any[] = d.series ?? [];
    const totalVal = series.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const totalCount = series.reduce((s, x) => s + Number(x.count ?? 0), 0);
    const best = series.reduce((a, b) => (b.value > (a?.value ?? -Infinity) ? b : a), null as any);

    body = (
      <div className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={hist.metric} onChange={(e) => { setHist({ ...hist, metric: e.target.value }); setPeriod(null); }} className="h-9 w-44">
              {['sales', 'margin', 'collections', 'purchases'].map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </Select>
            <Select value={hist.group} onChange={(e) => { setHist({ ...hist, group: e.target.value }); setPeriod(null); }} className="h-9 w-36">
              {['month', 'quarter', 'year'].map((m) => (
                <option key={m} value={m}>
                  {t(m)}
                </option>
              ))}
            </Select>
            <Select value={hist.years} onChange={(e) => { setHist({ ...hist, years: e.target.value }); setPeriod(null); }} className="h-9 w-32">
              {[1, 2, 3, 5].map((m) => (
                <option key={m} value={m}>
                  {m} {t('years')}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-small">
            <div>
              <span className="text-caption text-muted">{t('Total')}: </span>
              <b className="num text-fg">{money(totalVal)}</b>
            </div>
            <div>
              <span className="text-caption text-muted">{t('Transactions')}: </span>
              <b className="num text-fg">{fmtNum(totalCount, lang, 0)}</b>
            </div>
            {best && (
              <div>
                <span className="text-caption text-muted">{t('Peak')}: </span>
                <b className="num text-navy">{best.period}</b>
              </div>
            )}
          </div>
        </Card>

        <LineCard title={t('Trend')} sub={`${t(hist.metric)} · ${hist.years} ${t('years')}`} data={series} xKey="period" area h={270} />

        <Card>
          <CardHeader title={t('Click a period to drill down to the transactions')} sub={period ? `${t('Selected')}: ${period}` : undefined} />
          <div className="grid gap-2.5 p-5 pt-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {series.length === 0 ? (
              <p className="col-span-full text-small text-muted">{t('No data for this period')}</p>
            ) : (
              series.map((s: any) => {
                const on = period === s.period;
                return (
                  <button
                    key={s.period}
                    type="button"
                    onClick={() => setPeriod(s.period)}
                    className={cn(
                      'rounded-md border p-3 text-start transition-colors',
                      on
                        ? 'border-navy bg-navy text-white shadow-card'
                        : 'border-line bg-soft/40 hover:border-gold-border hover:bg-card'
                    )}
                  >
                    <div className="flex items-center justify-between text-caption">
                      <b className={cn('num', on ? 'text-gold' : 'text-muted')}>{s.period}</b>
                      <span className={cn('num', on ? 'text-onnavy-muted' : 'text-muted')}>{s.count}</span>
                    </div>
                    <p className="num mt-1.5 text-small font-bold">{money(s.value)}</p>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        {period && (
          <Card className="overflow-hidden">
            <CardHeader
              title={`${t('Transactions')} — ${period}`}
              actions={
                <Button variant="secondary" size="sm" onClick={() => setPeriod(null)}>
                  {t('Close')}
                </Button>
              }
            />
            {dr.isLoading ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-full" />
              </div>
            ) : dr.isError ? (
              <ErrorState error={dr.error} compact onRetry={() => dr.refetch()} />
            ) : (
              <ul className="divide-y divide-line border-t border-line">
                {dr.data.rows.map((r: any) => (
                  <li key={r.id}>
                    <Link href={`/app/${dr.data.slug}/${r.id}`} className="flex items-center justify-between gap-4 px-5 py-3 text-small transition-colors hover:bg-soft/60">
                      <span className="mono font-semibold text-navy">{r.label}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{r.sub}</span>
                      <span className="num font-semibold text-fg">{money(r.value)}</span>
                      <ArrowUpRight size={14} className="shrink-0 text-muted rtl:-scale-x-100" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-lg border border-navy bg-gradient-to-br from-[#0F294D] via-[#0B1F3A] to-[#08172E] p-5 text-white shadow-[0_8px_24px_rgba(11,31,58,0.16)] md:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,rgba(214,161,58,0.22),transparent_50%)]" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-gold/30 bg-white/5 text-gold"><Icon name={NAV_TABS.find((x) => x.key === name)?.icon ?? 'layout-dashboard'} size={24} /></span>
            <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gold">{t('Analytics')}</p><h1 className="text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1><p className="mt-1 max-w-2xl text-sm text-onnavy-secondary">{desc}</p></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-fg">
            {ranged ? <Range from={range.from} to={range.to} set={(f, to) => setRange({ from: f, to })} onRefresh={() => q.refetch()} refreshing={q.isFetching} /> : (
              <Button variant="secondary" size="sm" onClick={() => q.refetch()} aria-label={t('Refresh')} className="!h-9 gap-1.5"><RefreshCw size={14} className={cn(q.isFetching && 'animate-spin')} /><span>{t('Refresh')}</span></Button>
            )}
          </div>
        </div>
        <nav aria-label={t('Dashboards')} className="relative mt-5 flex flex-wrap gap-1.5">
          {NAV_TABS.map((tab) => {
            const active = tab.key === name;
            return (
              <Link key={tab.key} href={`/app/dashboards/${tab.key}`} aria-current={active ? 'page' : undefined}
                className={cn('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-all', active ? 'bg-gold text-navy shadow-md' : 'bg-white/10 text-onnavy-secondary hover:bg-white/20 hover:text-white')}>
                <Icon name={tab.icon} size={15} /><span>{lang === 'ar' ? tab.ar : tab.en}</span>
              </Link>
            );
          })}
        </nav>
      </section>

      {body}
    </div>
  );
}
