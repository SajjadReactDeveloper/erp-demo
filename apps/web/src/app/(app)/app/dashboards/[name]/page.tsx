'use client';
import { use, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Calendar, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { BarCard, GOLD, KpiMeter, KpiSplitBar, LineCard, NAVY, PALETTE, PieCard, SalesOverviewChart, Sparkline } from '@/components/charts';
import { Chip, Kpi, th } from '@/components/erp/dash';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Icon, Input, Progress, Select, Skeleton, SkeletonBlock, SkeletonCards, Star, StatusBadge, cn } from '@/components/ui';

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

type Preset = 'mtd' | '30d' | 'qtd' | 'ytd' | '1y' | 'custom';

function computePresetRange(kind: Exclude<Preset, 'custom'>) {
  const now = new Date();
  const s = new Date(now);
  if (kind === 'mtd') s.setDate(1);
  else if (kind === '30d') s.setDate(s.getDate() - 29);
  else if (kind === 'qtd') s.setMonth(Math.floor(s.getMonth() / 3) * 3, 1);
  else if (kind === 'ytd') s.setMonth(0, 1);
  else s.setFullYear(s.getFullYear() - 1);
  return { from: toInputDate(s), to: toInputDate(now) };
}

function Range({
  from,
  to,
  preset,
  set,
  onRefresh,
  refreshing,
}: {
  from: string;
  to: string;
  preset: Preset;
  set: (f: string, t: string, p: Preset) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}) {
  const { t } = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex rounded-sm border border-white/15 bg-white/[0.06] p-0.5">
        {([
          ['mtd', 'MTD'],
          ['30d', '30D'],
          ['qtd', 'QTD'],
          ['ytd', 'YTD'],
          ['1y', '1Y'],
        ] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              const r = computePresetRange(k);
              set(r.from, r.to, k);
            }}
            className={cn(
              'rounded-xs px-2.5 py-1 text-[11px] font-semibold transition-colors',
              preset === k ? 'bg-gold text-navy' : 'text-onnavy-secondary hover:bg-white/10 hover:text-white'
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-2.5 py-1 text-white">
        <Calendar size={13} className="shrink-0 text-gold" />
        <Input
          type="date"
          value={from}
          onChange={(e) => set(e.target.value, to, 'custom')}
          className="!h-7 !w-[126px] !border-0 !bg-transparent !px-1 text-caption !text-white [color-scheme:dark]"
          dir="ltr"
          aria-label={t('From')}
        />
        <span className="text-caption text-onnavy-muted">–</span>
        <Input
          type="date"
          value={to}
          onChange={(e) => set(from, e.target.value, 'custom')}
          className="!h-7 !w-[126px] !border-0 !bg-transparent !px-1 text-caption !text-white [color-scheme:dark]"
          dir="ltr"
          aria-label={t('To')}
        />
      </div>
      <button
        type="button"
        onClick={onRefresh}
        aria-label={t('Refresh')}
        className="grid h-9 w-9 place-items-center rounded-sm border border-white/15 bg-white/[0.06] text-white transition-colors hover:border-gold/50 hover:bg-white/10"
      >
        <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
      </button>
    </div>
  );
}

interface Col {
  key: string;
  label: string;
  align?: 'start' | 'end';
  fmt?: (v: any, r: any) => ReactNode;
}

function DataTable({ title, sub, cols, rows, empty, icon = 'table-2', action }: { title: string; sub?: string; cols: Col[]; rows: any[]; empty?: string; icon?: string; action?: ReactNode }) {
  const { t } = useT();
  return (
    <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
      <CardHeader
        title={title}
        sub={sub}
        actions={
          <div className="flex items-center gap-2">
            {rows.length > 0 && <Badge tone="muted">{rows.length}</Badge>}
            {action}
          </div>
        }
      />
      {rows.length === 0 ? (
        <div className="mx-5 mb-5 mt-1 flex flex-1 items-center gap-3 rounded-md border border-dashed border-line bg-soft/35 px-5 py-8 text-small text-muted">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-card text-muted ring-1 ring-line">
            <Icon name={icon} size={16} />
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

/** Ranked horizontal bar leaderboard card — looks rich even with 1–5 rows where a pie/bar looks sparse. */
function RankedBarsCard({
  title,
  sub,
  rows = [],
  fmtVal,
  empty,
  action,
}: {
  title: string;
  sub?: string;
  rows?: { name: string; value: number }[];
  fmtVal: (v: number) => string;
  empty?: string;
  action?: ReactNode;
}) {
  const { t, lang } = useT();
  const clean = rows.filter((r) => Number(r.value ?? 0) > 0);
  const total = clean.reduce((s, r) => s + Number(r.value), 0) || 1;
  return (
    <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
      <CardHeader title={title} sub={sub} actions={action ?? (clean.length > 0 ? <Badge tone="muted">{clean.length}</Badge> : undefined)} />
      <div className="flex-1 px-6 pb-5 pt-2">
        {clean.length === 0 ? (
          <div className="flex items-center gap-3 rounded-md border border-dashed border-line bg-soft/35 px-4 py-8 text-small text-muted">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-card text-muted ring-1 ring-line">
              <Icon name="bar-chart-3" size={16} />
            </span>
            <span>{empty ?? t('No data for this period')}</span>
          </div>
        ) : (
          <div className="space-y-3.5">
            {clean.slice(0, 7).map((r, i) => {
              const share = (Number(r.value) / total) * 100;
              const barColor = i === 0 ? '#3B669C' : i === 1 ? GOLD : PALETTE[i % PALETTE.length];
              return (
                <div key={`${r.name}-${i}`}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-small">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: barColor }} />
                      <span className="truncate font-semibold text-fg">{r.name}</span>
                    </span>
                    <span className="num flex shrink-0 items-center gap-2 text-caption">
                      <span className="font-bold text-navy">{fmtVal(Number(r.value))}</span>
                      <span className="rounded-xs bg-soft px-1.5 py-0.5 text-[11px] font-semibold text-strong">{fmtNum(share, lang, 0)}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-xs bg-soft">
                    <div className="h-full rounded-xs transition-all duration-300" style={{ width: `${Math.max(3, share)}%`, background: barColor }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DashboardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params);
  const { t, lang, el } = useT();
  const initialYtd = useMemo(() => computePresetRange('ytd'), []);
  const [preset, setPreset] = useState<Preset>('ytd');
  const [range, setRange] = useState(initialYtd);
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
  const fmtMonth = (ym: string) => {
    const dt = new Date(`${ym}-01T00:00:00Z`);
    return isNaN(dt.getTime()) ? ym.slice(5) : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(dt);
  };

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
    const overduePct = k.receivables ? Math.round((k.overdue / k.receivables) * 100) : 0;
    const sparkSales = series.map((s) => Number(s.revenue ?? 0));
    const sparkMonths = series.map((s) => fmtMonth(s.month));
    const sparkNet = series.map((s) => Number(s.netProfit ?? 0));
    const peakSales = Math.max(...sparkSales, 0);
    const marginDiff = Number(k.grossMarginPct ?? 0) - 18;
    const workingCapital = Number(k.cash ?? 0) + Number(k.receivables ?? 0) - Number(k.payables ?? 0);

    body = (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="wallet"
            tone="primary"
            label={t('Sales (this month)')}
            sub={`${t('Gross profit')} ${fmtCompact(k.grossMargin)}`}
            value={<Money v={k.salesMtd} big />}
            chip={
              delta != null ? (
                <Chip tone={delta >= 0 ? 'success' : 'danger'}>
                  <span className="inline-flex items-center gap-0.5">
                    {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                    {fmtNum(Math.abs(delta), lang, 1)}%
                  </span>
                </Chip>
              ) : undefined
            }
            spark={
              <div className="space-y-2">
                <Sparkline data={sparkSales} labels={sparkMonths} color="#C89128" h={24} format={(v) => fmtMoney(v, lang)} />
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                  <span className="num truncate">{t('Prev mo')} {fmtCompact(k.salesPrev)}</span>
                  <span className="num shrink-0 font-semibold text-gold-text">{t('Peak')} {fmtCompact(peakSales)}</span>
                </div>
              </div>
            }
          />
          <Kpi
            icon="percent"
            tone="success"
            label={t('Gross margin')}
            sub={`${t('Net profit')} ${fmtCompact(k.netProfit)}`}
            value={`${fmtNum(k.grossMarginPct, lang, 1)}%`}
            chip={<Chip tone={k.grossMarginPct >= 18 ? 'success' : 'gold'}>{t('Target')} 18%</Chip>}
            spark={
              <KpiMeter
                value={Number(k.grossMarginPct ?? 0)}
                target={18}
                max={Math.max(35, Math.ceil(Number(k.grossMarginPct ?? 0) * 1.35))}
                color={marginDiff >= 0 ? '#15803D' : GOLD}
                left={`${t('Target')} 18%`}
                right={`${marginDiff >= 0 ? '+' : ''}${fmtNum(marginDiff, lang, 1)} ${t('pp')}`}
                rightTone={marginDiff >= 0 ? 'success' : 'danger'}
              />
            }
          />
          <Kpi
            icon="hand-coins"
            tone="danger"
            label={t('Receivables')}
            sub={`${overduePct}% ${t('overdue share')}`}
            href="/app/dashboards/receivables"
            value={<Money v={k.receivables} compact />}
            chip={k.overdue > 0 ? <Chip tone="danger">{fmtCompact(k.overdue)} {t('overdue')}</Chip> : <Chip tone="success">{t('No overdue')}</Chip>}
            spark={
              <KpiSplitBar
                segments={[
                  { key: 'cur', label: t('Current'), value: Math.max(0, Number(k.receivables ?? 0) - Number(k.overdue ?? 0)), color: NAVY },
                  { key: 'ov', label: t('Overdue'), value: Number(k.overdue ?? 0), color: '#B91C1C' },
                ]}
                left={`${t('Current')} ${100 - overduePct}%`}
                right={`${t('Overdue')} ${overduePct}%`}
                rightTone={overduePct > 25 ? 'danger' : 'success'}
              />
            }
          />
          <Kpi
            icon="landmark"
            tone={k.netProfit >= 0 ? 'success' : 'danger'}
            label={t('Net profit')}
            sub={`${t('Cash')} ${fmtCompact(k.cash)}`}
            value={<Money v={k.netProfit} compact />}
            chip={<Chip tone="muted">{t('Payables')} {fmtCompact(k.payables)}</Chip>}
            spark={
              <div className="space-y-2">
                <Sparkline data={sparkNet.map((v) => Math.max(0, v))} labels={sparkMonths} color="#3B669C" h={24} format={(v) => fmtMoney(v, lang)} />
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                  <span className="truncate">{t('Working capital')}</span>
                  <span className="num shrink-0 font-semibold text-navy">{fmtCompact(workingCapital)}</span>
                </div>
              </div>
            }
          />
        </section>

        {/* Financial Health Balance Strip */}
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <div className="grid divide-y divide-line/80 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-5 lg:divide-x rtl:lg:divide-x-reverse">
            {[
              [t('Cash'), money(k.cash), 'text-navy'],
              [t('Gross profit'), money(k.grossMargin), 'text-navy'],
              [t('Receivables'), money(k.receivables), 'text-navy'],
              [t('Payables'), money(k.payables), 'text-strong'],
              [t('Net working capital'), money(workingCapital), workingCapital >= 0 ? 'text-success' : 'text-danger'],
            ].map(([l, v, cls]) => (
              <div key={String(l)} className="px-5 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{l}</p>
                <p className={cn('num mt-1 text-[17px] font-bold', cls)}>{v}</p>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <LineCard
            title={t('Revenue vs profit (12 months)')}
            sub={t('Last 12 months')}
            data={series.map((s) => ({ ...s, month: fmtMonth(s.month) }))}
            series={[
              { key: 'revenue', label: t('Revenue'), color: '#3B669C' },
              { key: 'grossProfit', label: t('Gross profit'), color: GOLD },
              { key: 'netProfit', label: t('Net profit'), color: '#15803D' },
            ]}
            area
            h={290}
          />
          <RankedBarsCard
            title={t('Top customers (this month)')}
            sub={t('By invoiced revenue')}
            rows={d.topCustomers ?? []}
            fmtVal={money}
          />
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
    const sent = Number(d.conversion?.sent ?? 0);
    const approved = Number(d.conversion?.approved ?? 0);
    const lost = Number(d.conversion?.lost ?? 0);
    const pendingQ = Math.max(0, sent - approved - lost);

    body = (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="trending-up"
            tone="primary"
            label={t('Period sales')}
            sub={`${byCustomer.length} ${t('Customer')}`}
            value={<Money v={totalSales} big />}
            chip={<Chip tone="gold">{fmtNum(d.conversion.rate, lang, 0)}% {t('conversion')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span className="truncate">{byCustomer[0]?.name ?? t('Top customer')}</span>
                <span className="num shrink-0 font-semibold text-gold-text">{byCustomer[0] ? fmtCompact(byCustomer[0].value) : '—'}</span>
              </div>
            }
          />
          <Kpi
            icon="send"
            tone="info"
            label={t('Quotations sent')}
            sub={`${approved} ${t('Approved')} · ${lost} ${t('Lost')}`}
            value={sent}
            chip={<Chip tone="success">{approved} {t('Approved')}</Chip>}
            spark={
              <KpiSplitBar
                segments={[
                  { key: 'app', label: t('Approved'), value: approved, color: '#15803D' },
                  { key: 'pen', label: t('Pending'), value: pendingQ, color: GOLD },
                  { key: 'lost', label: t('Lost'), value: lost, color: '#B91C1C' },
                ]}
                left={`${t('Approved')} ${sent ? Math.round((approved / sent) * 100) : 0}%`}
                right={`${t('Lost')} ${lost}`}
                rightTone={lost > 0 ? 'danger' : 'muted'}
              />
            }
          />
          <Kpi
            icon="percent"
            tone="primary"
            label={t('Quote → order conversion')}
            sub={t('Approved vs sent quotations')}
            value={`${fmtNum(d.conversion.rate, lang, 1)}%`}
            chip={<Chip tone={d.conversion.rate >= 40 ? 'success' : 'warn'}>{d.conversion.rate >= 40 ? t('Healthy') : t('Needs focus')}</Chip>}
            spark={
              <KpiMeter
                value={Number(d.conversion.rate ?? 0)}
                target={40}
                max={100}
                color={d.conversion.rate >= 40 ? '#15803D' : GOLD}
                left={`${t('Target')} 40%`}
                right={`${approved}/${sent}`}
                rightTone={d.conversion.rate >= 40 ? 'success' : 'warn'}
              />
            }
          />
          <Kpi
            icon="target"
            tone={tgPct >= 80 ? 'success' : 'warn'}
            label={t('Target achievement')}
            sub={tgTotal ? `${fmtCompact(tgDone)} / ${fmtCompact(tgTotal)}` : t('No target set')}
            value={tgTotal ? `${fmtNum(tgPct, lang, 1)}%` : '—'}
            chip={tgTotal ? <Chip tone={tgPct >= 80 ? 'success' : 'gold'}>{tg.length} {t('Target')}</Chip> : <Chip tone="muted">{t('No target set')}</Chip>}
            spark={
              <KpiMeter
                value={tgPct}
                target={100}
                max={Math.max(100, tgPct)}
                color={tgPct >= 80 ? '#15803D' : GOLD}
                left={`${t('Achieved')} ${fmtCompact(tgDone)}`}
                right={`${t('Target')} ${fmtCompact(tgTotal)}`}
                rightTone={tgPct >= 80 ? 'success' : 'muted'}
              />
            }
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-2">
          <RankedBarsCard title={t('By customer')} sub={t('Invoiced sales by account')} rows={byCustomer} fmtVal={money} />
          <RankedBarsCard title={t('By category')} sub={t('Parts category share')} rows={d.byCategory ?? []} fmtVal={money} />
        </div>

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
          <BarCard title={t('By sales rep')} data={d.byRep} />
          <BarCard title={t('By brand')} data={d.byBrand} />
          <BarCard title={t('By vehicle make')} data={d.byMake} />
          <RankedBarsCard title={t('Lost-sale reasons')} rows={d.lostReasons ?? []} fmtVal={(v) => fmtNum(v, lang, 0)} />
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
    const latestMargin = trend.length ? Number(trend[trend.length - 1].marginPct ?? 0) : 0;
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="percent"
            tone="primary"
            label={t('Gross profit')}
            sub={`${t('Revenue')} ${fmtCompact(totRev)} · ${t('Cost')} ${fmtCompact(totCost)}`}
            value={<Money v={totGp} big />}
            chip={<Chip tone={totMargin >= 18 ? 'success' : 'gold'}>{fmtNum(totMargin, lang, 1)}%</Chip>}
            spark={
              <KpiSplitBar
                segments={[
                  { key: 'gp', label: t('Gross profit'), value: Math.max(0, totGp), color: GOLD },
                  { key: 'cost', label: t('Cost of goods'), value: Math.max(0, totCost), color: '#3B669C' },
                ]}
                left={`${t('Margin')} ${fmtNum(totMargin, lang, 1)}%`}
                right={`${t('Cost')} ${totRev ? Math.round((totCost / totRev) * 100) : 0}%`}
              />
            }
          />
          <Kpi
            icon="trending-up"
            tone="success"
            label={t('Latest month margin')}
            sub={t('Last 12 months')}
            value={`${fmtNum(latestMargin, lang, 1)}%`}
            chip={<Chip tone={latestMargin >= 18 ? 'success' : 'warn'}>{t('Target')} 18%</Chip>}
            spark={
              <div className="space-y-2">
                <Sparkline data={sparkMargin} labels={trend.map((x) => fmtMonth(x.month))} color={GOLD} target={18} h={24} format={(v) => `${v.toFixed(1)}%`} />
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                  <span>{t('Target')} 18%</span>
                  <span className={cn('num font-semibold', latestMargin >= 18 ? 'text-success' : 'text-warn')}>
                    {latestMargin >= 18 ? '+' : ''}{fmtNum(latestMargin - 18, lang, 1)} {t('pp')}
                  </span>
                </div>
              </div>
            }
          />
          <Kpi
            icon="wallet"
            tone="info"
            label={t('Period revenue')}
            sub={`${byCat.length} ${t('Categories')}`}
            value={<Money v={totRev} compact />}
            chip={<Chip tone="muted">{t('Cost')} {fmtCompact(totCost)}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span className="truncate">{t('Gross profit')}</span>
                <span className="num shrink-0 font-semibold text-navy">{money(totGp)}</span>
              </div>
            }
          />
          <Kpi
            icon="alert-triangle"
            tone={d.belowTarget?.length ? 'danger' : 'success'}
            label={t('Below-target deals')}
            sub={t('Quotations under margin floor')}
            value={d.belowTarget?.length ?? 0}
            chip={<Chip tone={d.belowTarget?.length ? 'danger' : 'success'}>{d.belowTarget?.length ? t('Needs review') : t('All clear')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Target')} ≥ 18%</span>
                <span className={cn('font-semibold', d.belowTarget?.length ? 'text-danger' : 'text-success')}>
                  {d.belowTarget?.length ? t('Action needed') : t('Healthy')}
                </span>
              </div>
            }
          />
        </section>

        <LineCard
          title={t('Margin trend')}
          sub={t('Last 12 months')}
          data={trend.map((x) => ({ ...x, month: fmtMonth(x.month) }))}
          series={[{ key: 'marginPct', label: t('Margin %'), color: GOLD }]}
          h={250}
          area
        />

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
    const latestExp = trend.length ? Number(trend[trend.length - 1].value ?? 0) : 0;

    body = (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="receipt"
            tone="primary"
            label={t('Total expenses')}
            sub={totalBudget > 0 ? `${t('Budget')} ${fmtCompact(totalBudget)}` : `${cats.length} ${t('Categories')}`}
            value={<Money v={totalSpent} big />}
            chip={
              totalBudget > 0 ? (
                <Chip tone={budgetPct > 100 ? 'danger' : 'gold'}>{fmtNum(budgetPct, lang, 0)}% {t('of budget')}</Chip>
              ) : (
                <Chip tone="muted">{cats.length} {t('Categories')}</Chip>
              )
            }
            spark={
              <KpiMeter
                value={totalSpent}
                target={totalBudget || Math.max(totalSpent, 1)}
                max={Math.max(totalBudget, totalSpent, 1)}
                color={budgetPct > 100 ? '#B91C1C' : GOLD}
                left={`${t('Budget')} ${totalBudget ? fmtCompact(totalBudget) : '—'}`}
                right={overruns ? `${overruns} ${t('Overruns')}` : t('Within budget')}
                rightTone={overruns ? 'danger' : 'success'}
              />
            }
          />
          <Kpi
            icon="pie-chart"
            tone="info"
            label={t('Top category')}
            sub={cats[0]?.name ?? t('No data for this period')}
            value={cats[0] ? <Money v={cats[0].value} compact /> : '—'}
            chip={cats[0] && totalSpent ? <Chip tone="gold">{Math.round((cats[0].value / totalSpent) * 100)}%</Chip> : undefined}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span className="truncate">{cats[0]?.name ?? '—'}</span>
                <span className="num shrink-0 font-semibold text-navy">{cats.length} {t('Categories')}</span>
              </div>
            }
          />
          <Kpi
            icon="scale"
            tone={overruns ? 'danger' : 'success'}
            label={t('Budget overruns')}
            sub={`${budgets.length} ${t('Budget')}`}
            value={overruns}
            chip={<Chip tone={overruns ? 'danger' : 'success'}>{overruns ? t('Over budget') : t('Within budget')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Budget')}</span>
                <span className="num font-semibold text-strong">{totalBudget ? money(totalBudget) : '—'}</span>
              </div>
            }
          />
          <Kpi
            icon="trending-up"
            tone="primary"
            label={t('Monthly trend')}
            sub={t('Latest month spend')}
            value={trend.length ? <Money v={latestExp} compact /> : '—'}
            chip={<Chip tone="muted">{trend.length}m</Chip>}
            spark={
              <div className="space-y-2">
                <Sparkline data={trend.map((x) => Number(x.value ?? 0))} labels={trend.map((x) => fmtMonth(x.month))} color="#3B669C" h={24} format={money} />
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                  <span>{t('Peak')}</span>
                  <span className="num font-semibold text-navy">{fmtCompact(Math.max(...trend.map((x) => Number(x.value ?? 0)), 0))}</span>
                </div>
              </div>
            }
          />
        </section>

        <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
            <CardHeader title={t('Monthly trend')} sub={t('Posted expenses over time')} />
            <div className="px-2 pb-2">
              <SalesOverviewChart data={trend.map((x) => ({ name: fmtMonth(x.month), value: Number(x.value ?? 0) }))} h={260} avgLabel={t('Avg')} />
            </div>
          </Card>
          <RankedBarsCard title={t('By category')} sub={t('Expense share')} rows={cats} fmtVal={money} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard title={t('By cost centre')} data={d.byCostCenter} />
          <BarCard
            title={t('Budget vs actual')}
            data={budgets}
            series={[
              { key: 'budget', label: t('Budget'), color: '#3B669C' },
              { key: 'spent', label: t('Spent'), color: GOLD },
            ]}
          />
        </div>
      </div>
    );
  } else if (name === 'receivables') {
    const tt = d.ageing.totals ?? {};
    const totalAr = Number(tt.total ?? 0);
    const curVal = Number(tt.current ?? 0);
    const b1Val = Number(tt.b1 ?? 0);
    const b2Val = Number(tt.b2 ?? 0);
    const b3Val = Number(tt.b3 ?? 0);
    const b4Val = Number(tt.b4 ?? 0);
    const overdue = b1Val + b2Val + b3Val + b4Val;
    const overdueShare = totalAr ? (overdue / totalAr) * 100 : 0;
    const buckets = [
      { key: 'current', label: t('Current'), value: curVal, color: '#2F598E' },
      { key: 'b1', label: `1–30 ${t('days')}`, value: b1Val, color: GOLD },
      { key: 'b2', label: `31–60 ${t('days')}`, value: b2Val, color: '#EA580C' },
      { key: 'b3', label: `61–90 ${t('days')}`, value: b3Val, color: '#DC2626' },
      { key: 'b4', label: `90+ ${t('days')}`, value: b4Val, color: '#991B1B' },
    ];
    const cols: Col[] = [
      { key: 'name', label: t('Customer') },
      { key: 'current', label: t('Current'), align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b1', label: '1–30', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b2', label: '31–60', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b3', label: '61–90', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'b4', label: '90+', align: 'end', fmt: (v) => fmtNum(v, lang) },
      { key: 'total', label: t('Total'), align: 'end', fmt: (v) => <b className="text-navy">{fmtNum(v, lang)}</b> },
    ];

    body = (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="hand-coins"
            tone="primary"
            label={t('Total receivables')}
            sub={`${t('Current')} ${fmtCompact(curVal)} · ${t('Overdue')} ${fmtCompact(overdue)}`}
            value={<Money v={totalAr} big />}
            chip={overdue > 0 ? <Chip tone="danger">{fmtNum(overdueShare, lang, 0)}% {t('overdue')}</Chip> : <Chip tone="success">{t('All current')}</Chip>}
            spark={
              <KpiSplitBar
                segments={buckets}
                left={`${t('Current')} ${totalAr ? Math.round((curVal / totalAr) * 100) : 100}%`}
                right={`${t('30d+')} ${totalAr ? Math.round(((b2Val + b3Val + b4Val) / totalAr) * 100) : 0}%`}
                rightTone={b2Val + b3Val + b4Val > 0 ? 'danger' : 'success'}
              />
            }
          />
          <Kpi
            icon="calendar-clock"
            tone={d.dso > 60 ? 'danger' : d.dso > 45 ? 'warn' : 'primary'}
            label="DSO"
            sub={t('Average days to collect')}
            value={`${fmtNum(d.dso, lang, 0)} ${t('days')}`}
            chip={<Chip tone={d.dso <= 45 ? 'success' : 'warn'}>{d.dso <= 45 ? t('Healthy') : t('Watch')}</Chip>}
            spark={
              <KpiMeter
                value={Number(d.dso ?? 0)}
                target={45}
                max={Math.max(90, Number(d.dso ?? 0) * 1.25)}
                color={d.dso <= 45 ? '#15803D' : '#C2410C'}
                left={`${t('Target')} 45 ${t('days')}`}
                right={d.dso <= 45 ? t('On track') : `+${Math.round(d.dso - 45)} ${t('days')}`}
                rightTone={d.dso <= 45 ? 'success' : 'warn'}
              />
            }
          />
          <Kpi
            icon="gauge"
            tone="success"
            label={t('Collection effectiveness')}
            sub={t('Last 30 days')}
            value={`${fmtNum(d.collectionEffectiveness, lang, 0)}%`}
            chip={<Chip tone={d.collectionEffectiveness >= 70 ? 'success' : 'warn'}>{d.collectionEffectiveness >= 70 ? t('Healthy') : t('Needs focus')}</Chip>}
            spark={
              <KpiMeter
                value={Number(d.collectionEffectiveness ?? 0)}
                target={75}
                max={100}
                color={d.collectionEffectiveness >= 70 ? '#15803D' : GOLD}
                left={`${t('Target')} 75%`}
                right={`${fmtNum(d.collectionEffectiveness, lang, 0)}%`}
                rightTone={d.collectionEffectiveness >= 70 ? 'success' : 'warn'}
              />
            }
          />
          <Kpi
            icon="alert-triangle"
            tone={overdue > 0 ? 'danger' : 'success'}
            label={t('Overdue amount')}
            sub={`${d.overdueByCustomer?.length ?? 0} ${t('accounts')}`}
            href="/app/collections"
            value={<Money v={overdue} compact />}
            chip={<Chip tone={overdue > 0 ? 'danger' : 'success'}>{overdue > 0 ? t('Action needed') : t('All clear')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span className="num truncate">90+ {fmtCompact(b4Val)}</span>
                <span className="font-semibold text-navy">{t('Open collections')} ↗</span>
              </div>
            }
          />
        </section>

        {/* Visual 5-Bucket Ageing Distribution Strip */}
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/80 px-6 py-4">
            <div>
              <h2 className="text-card-title text-navy">{t('Ageing distribution')}</h2>
              <p className="mt-0.5 text-caption text-muted">{t('Breakdown of open invoices by days past due')}</p>
            </div>
            <Link href="/app/collections" className="inline-flex items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text">
              {t('Open collections')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
            </Link>
          </div>
          <div className="p-6">
            <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-xs bg-soft" dir="ltr">
              {totalAr > 0 ? (
                buckets.map((b) =>
                  b.value > 0 ? (
                    <div
                      key={b.key}
                      title={`${b.label}: ${money(b.value)}`}
                      style={{ width: `${(b.value / totalAr) * 100}%`, backgroundColor: b.color }}
                      className="h-full min-w-[4px]"
                    />
                  ) : null
                )
              ) : (
                <div className="h-full w-full bg-success/30" />
              )}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {buckets.map((b) => {
                const share = totalAr > 0 ? (b.value / totalAr) * 100 : 0;
                return (
                  <div key={b.key} className="rounded-md border border-line/85 bg-soft/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-2 text-caption">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-strong">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} />
                        <span>{b.label}</span>
                      </span>
                      <span className="num text-[11px] font-semibold text-muted">{fmtNum(share, lang, 0)}%</span>
                    </div>
                    <p className="num mt-1.5 text-[16px] font-bold text-navy">{money(b.value)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <BarCard
            title={t('Ageing')}
            data={
              totalAr
                ? [
                    { name: t('Current'), value: curVal },
                    { name: '1–30', value: b1Val },
                    { name: '31–60', value: b2Val },
                    { name: '61–90', value: b3Val },
                    { name: '90+', value: b4Val },
                  ]
                : []
            }
          />
          <RankedBarsCard title={t('Overdue by customer')} sub={t('Highest overdue balances')} rows={d.overdueByCustomer ?? []} fmtVal={money} />
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="shopping-bag"
            tone="primary"
            label={t('Supplier spend (90 days)')}
            sub={`${spendList.length} ${t('Active suppliers')}`}
            value={<Money v={totalSpend} big />}
            chip={<Chip tone="gold">{t('Last 90 days')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span className="truncate">{spendList[0]?.name ?? '—'}</span>
                <span className="num shrink-0 font-semibold text-gold-text">{spendList[0] ? fmtCompact(spendList[0].value) : '—'}</span>
              </div>
            }
          />
          <Kpi
            icon="package"
            tone="info"
            label={t('Awaiting receipt')}
            sub={`${d.pos.pending ?? 0} ${t('Pending approval')}`}
            href="/app/purchase-order"
            value={d.pos.awaiting}
            chip={d.pos.late ? <Chip tone="danger">{d.pos.late} {t('Late')}</Chip> : <Chip tone="success">{t('On schedule')}</Chip>}
            spark={
              <KpiSplitBar
                segments={[
                  { key: 'ok', label: t('On schedule'), value: Math.max(0, Number(d.pos.awaiting ?? 0) - Number(d.pos.late ?? 0)), color: '#15803D' },
                  { key: 'late', label: t('Late'), value: Number(d.pos.late ?? 0), color: '#B91C1C' },
                ]}
                left={`${t('Late POs')} ${d.pos.late ?? 0}`}
                right={`${t('Pending approval')} ${d.pos.pending ?? 0}`}
                rightTone={d.pos.late ? 'danger' : 'muted'}
              />
            }
          />
          <Kpi
            icon="truck"
            tone={avgOnTime >= 90 ? 'success' : 'warn'}
            label={t('On-time delivery %')}
            sub={`${onTimeList.length} ${t('suppliers')}`}
            value={onTimeList.length ? `${fmtNum(avgOnTime, lang, 0)}%` : '—'}
            chip={<Chip tone={avgOnTime >= 90 ? 'success' : 'warn'}>{t('Target')} 90%</Chip>}
            spark={
              <KpiMeter
                value={avgOnTime}
                target={90}
                max={100}
                color={avgOnTime >= 90 ? '#15803D' : GOLD}
                left={`${t('Target')} 90%`}
                right={onTimeList.length ? `${fmtNum(avgOnTime, lang, 0)}%` : '—'}
                rightTone={avgOnTime >= 90 ? 'success' : 'warn'}
              />
            }
          />
          <Kpi
            icon="timer"
            tone="primary"
            label={t('Avg reply time')}
            sub={t('Quote turnaround speed')}
            value={respList.length ? `${fmtNum(avgReply, lang, 1)} ${t('h')}` : '—'}
            chip={<Chip tone={avgReply <= 4 ? 'success' : 'gold'}>{t('SLA')} 4 {t('h')}</Chip>}
            spark={
              <KpiMeter
                value={avgReply}
                target={4}
                max={Math.max(12, avgReply * 1.3)}
                color={avgReply <= 4 ? '#15803D' : '#3B669C'}
                left={`${t('SLA')} 4 ${t('h')}`}
                right={`${respList.length} ${t('suppliers')}`}
                rightTone={avgReply <= 4 ? 'success' : 'muted'}
              />
            }
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <RankedBarsCard title={t('Supplier spend (90 days)')} sub={t('Total PO volume by supplier')} rows={spendList} fmtVal={money} />
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
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="activity"
            tone="primary"
            label={t('Active requests')}
            sub={`${reqByStatus.length} ${t('Status')}`}
            href="/app/request"
            value={openReqs}
            chip={<Chip tone="success">{t('Live')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Deliveries today')} <b className="num font-semibold text-navy">{d.deliveries.today}</b></span>
                <span className={cn('num font-semibold', d.deliveries.late ? 'text-danger' : 'text-success')}>
                  {d.deliveries.late} {t('Late')}
                </span>
              </div>
            }
          />
          <Kpi
            icon="check-circle"
            tone={d.pendingApprovals ? 'warn' : 'success'}
            label={t('Pending approvals')}
            sub={t('Waiting for decision')}
            href="/app/approvals"
            value={d.pendingApprovals}
            chip={<Chip tone={d.pendingApprovals ? 'warn' : 'success'}>{d.pendingApprovals ? t('Action needed') : t('All clear')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('SLA breaches')} {d.slaBreaches?.length ?? 0}</span>
                <span className="font-semibold text-navy">{t('Review')} ↗</span>
              </div>
            }
          />
          <Kpi
            icon="octagon-alert"
            tone={d.creditHolds ? 'danger' : 'success'}
            label={t('Credit holds')}
            sub={t('Orders paused on credit')}
            href="/app/credit-hold"
            value={d.creditHolds}
            chip={<Chip tone={d.creditHolds ? 'danger' : 'success'}>{d.creditHolds ? t('Held') : t('All clear')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Status')}</span>
                <span className={cn('font-semibold', d.creditHolds ? 'text-danger' : 'text-success')}>
                  {d.creditHolds ? t('Needs review') : t('Healthy')}
                </span>
              </div>
            }
          />
          <Kpi
            icon="clock"
            tone={d.partialDeliveries ? 'warn' : 'info'}
            label={t('Open back-orders')}
            sub={t('Partial deliveries & receiving')}
            href="/app/delivery-note"
            value={d.partialDeliveries}
            chip={<Chip tone="info">{t('Receiving due')} {d.receivingDue ?? 0}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Scheduled tomorrow')} {d.deliveries.tomorrow ?? 0}</span>
                <span className="font-semibold text-navy">{t('Track deliveries')} ↗</span>
              </div>
            }
          />
        </section>

        {/* Live Dispatch & Receiving Pipeline Strip */}
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <div className="grid divide-y divide-line/80 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x rtl:lg:divide-x-reverse">
            {[
              { l: t('Deliveries today'), v: d.deliveries.today ?? 0, tone: 'text-navy', icon: 'truck' },
              { l: t('Scheduled tomorrow'), v: d.deliveries.tomorrow ?? 0, tone: 'text-strong', icon: 'calendar' },
              { l: t('Late deliveries'), v: d.deliveries.late ?? 0, tone: d.deliveries.late ? 'text-danger' : 'text-success', icon: 'alert-triangle' },
              { l: t('Receiving due'), v: d.receivingDue ?? 0, tone: d.receivingDue ? 'text-warn' : 'text-navy', icon: 'package' },
            ].map((item) => (
              <div key={item.l} className="flex items-center gap-3.5 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-soft text-navy">
                  <Icon name={item.icon} size={16} />
                </span>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{item.l}</p>
                  <p className={cn('num mt-0.5 text-[22px] font-bold leading-none', item.tone)}>{item.v}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

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
    const workshopRev = Number(d.service.revenue ?? 0);
    const stockRows: any[] = d.stock ?? [];
    const stockValue = stockRows.reduce((s, x) => s + Number(x.value ?? 0), 0);
    const stockParts = stockRows.reduce((s, x) => s + Number(x.parts ?? 0), 0);
    const totalCombined = branchSales + workshopRev;
    const jobPct = d.service.total ? (d.service.done / d.service.total) * 100 : 0;

    body = (
      <div className="space-y-5">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="store"
            tone="primary"
            label={t('Combined revenue')}
            sub={`${t('Branch sales')} + ${t('Workshop revenue')}`}
            value={<Money v={totalCombined} big />}
            chip={<Chip tone="gold">{t('POS sales')} {fmtCompact(posSales)}</Chip>}
            spark={
              <KpiSplitBar
                segments={[
                  { key: 'br', label: t('Branch sales'), value: branchSales, color: '#3B669C' },
                  { key: 'pos', label: t('POS sales'), value: posSales, color: GOLD },
                  { key: 'ws', label: t('Workshop'), value: workshopRev, color: '#15803D' },
                ]}
                left={`${t('Branch sales')} ${fmtCompact(branchSales)}`}
                right={`${t('Workshop')} ${fmtCompact(workshopRev)}`}
              />
            }
          />
          <Kpi
            icon="wrench"
            tone="success"
            label={t('Jobs completed')}
            sub={t('Workshop service orders')}
            value={`${d.service.done}/${d.service.total}`}
            chip={<Chip tone={jobPct >= 80 ? 'success' : 'gold'}>{fmtNum(jobPct, lang, 0)}%</Chip>}
            spark={
              <KpiMeter
                value={jobPct}
                target={85}
                max={100}
                color={jobPct >= 80 ? '#15803D' : GOLD}
                left={`${t('Target')} 85%`}
                right={`${d.service.done}/${d.service.total}`}
                rightTone={jobPct >= 80 ? 'success' : 'muted'}
              />
            }
          />
          <Kpi
            icon="timer"
            tone="info"
            label={t('Avg job time')}
            sub={t('Workshop bay turnaround')}
            value={`${fmtNum(d.service.avgMinutes, lang, 0)} ${t('min')}`}
            chip={<Chip tone="muted">{t('Workshop')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Workshop revenue')}</span>
                <span className="num font-semibold text-navy">{money(workshopRev)}</span>
              </div>
            }
          />
          <Kpi
            icon="package"
            tone="primary"
            label={t('Stock value')}
            sub={`${stockRows.length} ${t('Warehouses')}`}
            value={<Money v={stockValue} compact />}
            chip={<Chip tone="muted">{stockParts} {t('Parts')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Warehouses')} {stockRows.length}</span>
                <span className="num font-semibold text-navy">{fmtNum(stockParts, lang, 0)} {t('Parts')}</span>
              </div>
            }
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <RankedBarsCard title={t('Sales by branch')} sub={t('Invoiced subtotal')} rows={d.salesByBranch ?? []} fmtVal={money} />
          <RankedBarsCard title={t('POS by terminal')} sub={t('Paid counter sales')} rows={d.posByTerminal ?? []} fmtVal={money} />
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
    const avgPeriod = series.length ? totalVal / series.length : 0;
    const best = series.reduce((a, b) => (b.value > (a?.value ?? -Infinity) ? b : a), null as any);

    body = (
      <div className="space-y-5">
        <Card className="flex flex-wrap items-center justify-between gap-3 p-4 shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
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
          <span className="text-caption font-medium text-muted">
            {series.length} {t(hist.group)} · {hist.years} {t('years')}
          </span>
        </Card>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            icon="history"
            tone="primary"
            label={t('Total volume')}
            sub={`${t(hist.metric)} · ${hist.years} ${t('years')}`}
            value={<Money v={totalVal} big />}
            chip={<Chip tone="gold">{series.length} {t(hist.group)}</Chip>}
            spark={
              <div className="space-y-2">
                <Sparkline data={series.map((x) => Number(x.value ?? 0))} labels={series.map((x) => x.period)} color="#C89128" h={24} format={money} />
                <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                  <span>{t('Peak period')}</span>
                  <span className="num font-semibold text-gold-text">{best?.period ?? '—'}</span>
                </div>
              </div>
            }
          />
          <Kpi
            icon="list"
            tone="info"
            label={t('Transactions')}
            sub={t('Recorded entries in window')}
            value={fmtNum(totalCount, lang, 0)}
            chip={<Chip tone="muted">{t(hist.metric)}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Avg')} / {t(hist.group)}</span>
                <span className="num font-semibold text-navy">{series.length ? fmtNum(totalCount / series.length, lang, 1) : 0}</span>
              </div>
            }
          />
          <Kpi
            icon="trending-up"
            tone="success"
            label={t('Period average')}
            sub={`${t('Avg')} / ${t(hist.group)}`}
            value={<Money v={avgPeriod} compact />}
            chip={<Chip tone="success">{hist.years} {t('years')}</Chip>}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Total')}</span>
                <span className="num font-semibold text-navy">{fmtCompact(totalVal)}</span>
              </div>
            }
          />
          <Kpi
            icon="award"
            tone="warn"
            label={t('Peak period')}
            sub={best?.period ?? '—'}
            value={best ? <Money v={best.value} compact /> : '—'}
            chip={best ? <Chip tone="gold">{best.count} {t('Transactions')}</Chip> : undefined}
            spark={
              <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
                <span>{t('Selected')}</span>
                <span className="num font-semibold text-navy">{period ?? best?.period ?? '—'}</span>
              </div>
            }
          />
        </section>

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
      {/* Architectural Editorial Analytics Banner + Sharp Tab Switcher */}
      <section className="relative overflow-hidden rounded-2xl border border-navy bg-[#08162B] text-white shadow-[0_10px_28px_rgba(11,31,58,0.16)]">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[45%] object-cover object-[50%_46%] opacity-55 md:block rtl:-scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B] via-[#08162B]/95 via-[58%] to-[#08162B]/35 rtl:bg-gradient-to-l" />
        <Star className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.055]" size={180} />

        <div className="relative z-10 px-6 pb-4 pt-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-gold/30 bg-gold/10 text-gold">
                <Icon name={meta.icon} size={21} />
              </span>
              <div className="min-w-0">
                <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">{t('Analytics')}</p>
                <h1 className="text-[22px] font-extrabold leading-tight tracking-tight sm:text-[26px]">{title}</h1>
                <p className="mt-0.5 max-w-2xl text-small text-onnavy-secondary">{desc}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {ranged ? (
                <Range
                  from={range.from}
                  to={range.to}
                  preset={preset}
                  set={(f, to, p) => {
                    setRange({ from: f, to });
                    setPreset(p);
                  }}
                  onRefresh={() => q.refetch()}
                  refreshing={q.isFetching}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => q.refetch()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-gold/50 hover:bg-white/10"
                >
                  <RefreshCw size={14} className={cn(q.isFetching && 'animate-spin')} />
                  <span>{t('Refresh')}</span>
                </button>
              )}
            </div>
          </div>

          {/* Sharp Architectural Dashboard Switcher Tabs */}
          <nav aria-label={t('Dashboards')} className="no-scrollbar mt-5 flex items-center gap-1 overflow-x-auto border-t border-white/10 pt-3.5">
            {NAV_TABS.map((tab) => {
              const active = tab.key === name;
              return (
                <Link
                  key={tab.key}
                  href={`/app/dashboards/${tab.key}`}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[12.5px] font-semibold transition-all',
                    active
                      ? 'bg-gold text-navy shadow-[0_4px_12px_rgba(214,161,58,0.28)]'
                      : 'border border-transparent text-onnavy-secondary hover:border-white/15 hover:bg-white/[0.07] hover:text-white'
                  )}
                >
                  <Icon name={tab.icon} size={14} />
                  <span>{lang === 'ar' ? tab.ar : tab.en}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      {body}
    </div>
  );
}
