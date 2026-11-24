'use client';
import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, MonitorSmartphone, Plus, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, timeAgo } from '@/lib/format';
import { Gauge, GOLD, KpiMeter, KpiSplitBar, NAVY, PALETTE, SalesOverviewChart, Sparkline } from '@/components/charts';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Icon, Segmented, Skeleton, SkeletonRows, Star, StatusBadge, cn, toast } from '@/components/ui';
import { Chip, Kpi, ROW2, th } from '@/components/erp/dash';

/** A dashboard section loads independently; a 403 means "not for this role" and the card is simply not shown. */
function useSection<T = any>(key: string, path: string, query?: any, enabled = true) {
  const q = useQuery({ queryKey: ['home', key, query], queryFn: () => api<T>(path, { query }), enabled, retry: false, staleTime: 30000 });
  return { ...q, denied: q.isError && (q.error as ApiError)?.status === 403 };
}

/** Currency is a small muted prefix so the figure itself carries the weight. */
const Money = ({ v, big, compact }: { v: any; big?: boolean; compact?: boolean }) => {
  const { lang } = useT();
  return (
    <span className="num">
      <span className="me-1.5 text-[0.5em] font-semibold tracking-wide text-current opacity-55">{lang === 'ar' ? 'ر.س' : 'SAR'}</span>
      {compact ? fmtCompact(v) : fmtNum(v, lang, big ? 0 : 2)}
    </span>
  );
};

export default function Home() {
  const { me, can } = useAuth();
  const { t, lang } = useT();
  const hour = new Date().getHours();
  const greet =
    hour < 12
      ? lang === 'ar'
        ? 'صباح الخير'
        : 'Good morning'
      : hour < 18
        ? lang === 'ar'
          ? 'مساء الخير'
          : 'Good afternoon'
        : lang === 'ar'
          ? 'مساء النور'
          : 'Good evening';

  const monthStart = useMemo(() => {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString();
  }, []);

  const exec = useSection<any>('exec', '/api/v1/dashboards/executive');
  const sales = useSection<any>('sales', '/api/v1/dashboards/sales');
  const orders = useSection<any>('orders', '/api/v1/r/sales-order', { limit: 1, 'f.createdAt.gte': monthStart });
  const reqs = useSection<any>('reqs', '/api/v1/r/request', { limit: 6, sort: 'createdAt:desc' });
  const appr = useSection<any>('appr', '/api/v1/approvals/inbox');
  const recv = useSection<any>('recv', '/api/v1/dashboards/receivables');
  const sup = useSection<any>('sup', '/api/v1/dashboards/procurement');
  const ops = useSection<any>('ops', '/api/v1/dashboards/operations');

  const [seg, setSeg] = useState<'revenue' | 'grossProfit' | 'netProfit'>('revenue');
  const k = exec.data?.kpis;
  const series: any[] = exec.data?.series ?? [];
  const fmtMonth = (ym: string) => {
    const dt = new Date(`${ym}-01T00:00:00Z`);
    return isNaN(dt.getTime()) ? ym.slice(5) : new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(dt);
  };

  const delta = k && k.salesPrev ? ((k.salesMtd - k.salesPrev) / Math.abs(k.salesPrev)) * 100 : null;
  const tg = (sales.data?.targets ?? []) as any[];
  const tTotal = tg.reduce((s, x) => s + x.target, 0);
  const tDone = tg.reduce((s, x) => s + x.achieved, 0);
  const tRem = Math.max(0, tTotal - tDone);
  const tPct = tTotal ? (tDone / tTotal) * 100 : 0;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);
  const monthPace = (dayOfMonth / daysInMonth) * 100;
  const dailyNeed = daysLeft > 0 ? tRem / daysLeft : tRem;
  const conv = sales.data?.conversion as { sent: number; approved: number; lost: number; rate: number } | undefined;
  const cats = ((sales.data?.byCategory ?? []) as any[]).slice(0, 5);
  const catTotal = cats.reduce((s, c) => s + c.value, 0) || 1;
  const hasFinance = !exec.denied;
  const segData = series.map((s) => ({ name: fmtMonth(s.month), value: s[seg] }));
  const segTotal = series.reduce((a, s) => a + s[seg], 0);
  const bestItem = series.reduce((best, s) => (s[seg] > (best?.[seg] ?? -Infinity) ? s : best), null as any);
  const sparkSales = series.map((s) => Number(s.revenue ?? 0));
  const sparkMonths = series.map((s) => fmtMonth(s.month));
  const peakSales = Math.max(...sparkSales, 0);
  const marginPoints = series.filter((s) => Number(s.revenue ?? 0) > 0).map((s) => (Number(s.grossProfit ?? 0) / Number(s.revenue)) * 100);
  const avgMargin12m = marginPoints.length ? marginPoints.reduce((a, b) => a + b, 0) / marginPoints.length : Number(k?.grossMarginPct ?? 0);
  const ageTot = recv.data?.ageing?.totals;
  const arSegments = ageTot
    ? [
        { key: 'cur', label: t('Current'), value: Number(ageTot.current ?? 0), color: NAVY },
        { key: 'b1', label: '1–30d', value: Number(ageTot.b1 ?? 0), color: GOLD },
        { key: 'b2', label: '31–60d', value: Number(ageTot.b2 ?? 0), color: '#EA580C' },
        { key: 'b3', label: '60d+', value: Number(ageTot.b3 ?? 0) + Number(ageTot.b4 ?? 0), color: '#B91C1C' },
      ]
    : k
      ? [
          { key: 'cur', label: t('Current'), value: Math.max(0, Number(k.receivables ?? 0) - Number(k.overdue ?? 0)), color: NAVY },
          { key: 'ov', label: t('Overdue'), value: Number(k.overdue ?? 0), color: '#B91C1C' },
        ]
      : [];
  const arTotal = arSegments.reduce((s, x) => s + x.value, 0);
  const arCurrentPct = arTotal > 0 ? Math.round(((arSegments[0]?.value ?? 0) / arTotal) * 100) : 100;
  const arSevere = ageTot ? Number(ageTot.b2 ?? 0) + Number(ageTot.b3 ?? 0) + Number(ageTot.b4 ?? 0) : Number(k?.overdue ?? 0);
  const arSeverePct = arTotal > 0 ? Math.round((arSevere / arTotal) * 100) : 0;
  const marginDiff = k ? Number(k.grossMarginPct ?? 0) - 18 : 0;
  const rtqHours = Number(k?.requestToQuoteHours ?? 0);
  const rtqDiff = rtqHours - 4;
  const orderCount = orders.data?.meta?.total ?? 0;
  const monthLabel = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' }).format(now);
  const openAlerts = ops.data
    ? (ops.data.deliveries?.late ?? 0) + (ops.data.slaBreaches?.length ?? 0) + (ops.data.creditHolds ?? 0) + (ops.data.receivingDue ?? 0) + (ops.data.partialDeliveries ?? 0)
    : 0;

  return (
    <div className="space-y-5">
      {/* Sleek Editorial Executive Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-navy bg-[#08162B] text-white shadow-[0_10px_28px_rgba(11,31,58,0.16)]">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[52%] object-cover object-[50%_46%] opacity-85 md:block rtl:-scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B] via-[#08162B]/95 via-[50%] to-[#08162B]/15 rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/70 via-transparent to-[#08162B]/40" />
        <Star className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.06]" size={190} />

        <div className="relative z-10 max-w-2xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <span>{monthLabel}</span>
            </span>
            {openAlerts > 0 && (
              <a
                href="#attention"
                className="inline-flex items-center gap-1 text-caption font-medium text-onnavy-secondary transition-colors hover:text-gold"
              >
                <span>{openAlerts} {t('open items')}</span>
                <ArrowUpRight size={12} className="rtl:-scale-x-100" />
              </a>
            )}
          </div>

          <h1 className="mt-3.5 text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {greet}, {me?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1.5 max-w-lg text-small leading-relaxed text-onnavy-secondary">
            {t('Here is what is happening across sales, sourcing and cash today.')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            {can({ mod: 'sales', slug: 'request' }, 'create') && (
              <Link href="/app/request/new">
                <Button variant="accent" size="sm" className="!h-9 gap-1.5 !px-4 shadow-[0_4px_14px_rgba(214,161,58,0.28)]">
                  <Plus size={14} />
                  <span>{t('New request')}</span>
                </Button>
              </Link>
            )}
            <Link href="/app/assistant">
              <Button
                variant={can({ mod: 'sales', slug: 'request' }, 'create') ? 'ghost' : 'accent'}
                size="sm"
                className={cn(
                  '!h-9 gap-1.5 !px-3.5',
                  can({ mod: 'sales', slug: 'request' }, 'create')
                    ? '!border-white/15 !bg-white/[0.08] !text-white hover:!border-gold/45 hover:!bg-white/[0.14]'
                    : 'shadow-[0_4px_14px_rgba(214,161,58,0.28)]'
                )}
              >
                <Sparkles size={14} className={can({ mod: 'sales', slug: 'request' }, 'create') ? 'text-gold' : ''} />
                <span>{t('Ask Assistant')}</span>
              </Button>
            </Link>
            {can({ mod: 'pos', slug: 'pos-sale' }) && (
              <Link href="/app/pos">
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.12]"
                >
                  <MonitorSmartphone size={14} className="text-onnavy-secondary" />
                  <span>{t('Point of sale')}</span>
                </button>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Row 2: warm champagne-gold flagship Total Sales + 3 crisp architectural KPI cards */}
      {hasFinance && (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
          <Kpi
            featured
            loading={exec.isLoading}
            icon="wallet"
            tone="primary"
            label={t('Total sales')}
            sub={k ? `${orderCount} ${t('Orders')} · ${t('Gross profit')} ${fmtCompact(k.grossMargin)}` : undefined}
            href="/app/dashboards/executive"
            value={k ? <Money v={k.salesMtd} big /> : undefined}
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
                  <span className="num truncate">{t('Prev mo')} {k ? fmtCompact(k.salesPrev) : '—'}</span>
                  <span className="num shrink-0 font-semibold text-gold-text">{t('Peak')} {fmtCompact(peakSales)}</span>
                </div>
              </div>
            }
          />
          <Kpi
            loading={exec.isLoading}
            icon="percent"
            tone="success"
            label={t('Gross margin')}
            sub={k ? `${t('Net profit')} ${fmtCompact(k.netProfit)}` : undefined}
            href="/app/dashboards/profitability"
            value={k ? `${fmtNum(k.grossMarginPct, lang, 1)}%` : undefined}
            chip={<Chip tone="gold">{t('Target')} 18%</Chip>}
            spark={
              <KpiMeter
                value={Number(k?.grossMarginPct ?? 0)}
                target={18}
                max={Math.max(35, Math.ceil(Number(k?.grossMarginPct ?? 0) * 1.35))}
                color={marginDiff >= 0 ? '#15803D' : GOLD}
                left={`${t('12m avg')} ${fmtNum(avgMargin12m, lang, 1)}%`}
                right={`${marginDiff >= 0 ? '+' : ''}${fmtNum(marginDiff, lang, 1)} ${t('pp')}`}
                rightTone={marginDiff >= 0 ? 'success' : 'danger'}
              />
            }
          />
          <Kpi
            loading={exec.isLoading}
            icon="hand-coins"
            tone="danger"
            label={t('Receivables')}
            sub={k && k.receivables ? `${fmtNum((k.overdue / k.receivables) * 100, lang, 0)}% ${t('overdue share')}` : t('No overdue')}
            href="/app/dashboards/receivables"
            value={k ? <Money v={k.receivables} compact /> : undefined}
            chip={k && k.overdue > 0 ? <Chip tone="danger">{fmtCompact(k.overdue)} {t('overdue')}</Chip> : <Chip tone="success">{t('No overdue')}</Chip>}
            spark={
              <KpiSplitBar
                segments={arSegments}
                left={`${t('Current')} ${arCurrentPct}%`}
                right={arTotal > 0 ? (arSeverePct > 0 ? `${t('30d+')} ${arSeverePct}%` : t('On track')) : t('No overdue')}
                rightTone={arSeverePct > 0 ? 'danger' : 'success'}
              />
            }
          />
          <Kpi
            loading={exec.isLoading}
            icon="timer"
            tone="info"
            label={t('Request to quote')}
            sub={t('Average over the last 30 days')}
            href="/app/request"
            value={k ? `${fmtNum(k.requestToQuoteHours, lang, 1)} ${t('h')}` : undefined}
            chip={<Chip tone={k && k.requestToQuoteHours <= 4 ? 'success' : 'warn'}>{k && k.requestToQuoteHours <= 4 ? t('Within SLA') : t('Above SLA')}</Chip>}
            spark={
              <KpiMeter
                value={rtqHours}
                target={4}
                max={Math.max(10, Math.ceil(rtqHours * 1.35))}
                color={rtqHours <= 4 ? '#15803D' : '#C2410C'}
                left={`${t('SLA')} 4 ${t('h')}`}
                right={
                  rtqDiff <= 0
                    ? `-${fmtNum(Math.abs(rtqDiff), lang, 1)} ${t('h')}`
                    : `+${fmtNum(rtqDiff, lang, 1)} ${t('h')}`
                }
                rightTone={rtqDiff <= 0 ? 'success' : 'warn'}
              />
            }
          />
        </section>
      )}

      {/* Row 3: Sales overview + Midnight Navy Monthly target */}
      {hasFinance && (
        <section className={ROW2}>
          <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
            <CardHeader
              title={t('Sales overview')}
              sub={t('Last 12 months')}
              actions={
                <div className="flex flex-wrap items-center gap-3">
                  <Segmented
                    label={t('Metric')}
                    value={seg}
                    onChange={(k) => setSeg(k as typeof seg)}
                    options={[
                      { key: 'revenue', label: t('Sales') },
                      { key: 'grossProfit', label: t('Gross profit') },
                      { key: 'netProfit', label: t('Net profit') },
                    ]}
                  />
                  <Link href="/app/dashboards/executive" className="hidden items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text xl:inline-flex">
                    {t('Analytics')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                  </Link>
                </div>
              }
            />
            {/* Seamless borderless editorial summary ribbon (no nested box) */}
            <div className="grid divide-y divide-line/70 border-y border-line/70 bg-soft/35 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x rtl:lg:divide-x-reverse">
              <div className="px-6 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('12-month total')}</p>
                <div className="num mt-1 text-[20px] font-bold leading-6 tracking-tight text-navy">
                  {exec.isLoading ? <Skeleton className="h-6 w-24" /> : <Money v={segTotal} />}
                </div>
              </div>
              <div className="px-6 py-3.5">
                <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  <span>{t('This month')}</span>
                </p>
                <div className="num mt-1 text-[20px] font-bold leading-6 tracking-tight text-navy">
                  {exec.isLoading ? <Skeleton className="h-6 w-24" /> : <Money v={series[series.length - 1]?.[seg] ?? 0} />}
                </div>
              </div>
              <div className="px-6 py-3.5">
                <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">{t('Monthly avg')}</p>
                <div className="num mt-1 text-[20px] font-bold leading-6 tracking-tight text-navy">
                  {exec.isLoading ? <Skeleton className="h-6 w-24" /> : <Money v={series.length ? segTotal / series.length : 0} />}
                </div>
              </div>
              <div className="px-6 py-3.5">
                <p className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                  <span>{t('Best month')}</span>
                  {bestItem && (
                    <span className="rounded-xs bg-gold-light px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-gold-text">
                      {fmtMonth(bestItem.month)}
                    </span>
                  )}
                </p>
                <div className="num mt-1 text-[20px] font-bold leading-6 tracking-tight text-navy">
                  {exec.isLoading ? <Skeleton className="h-6 w-24" /> : <Money v={bestItem?.[seg] ?? 0} />}
                </div>
              </div>
            </div>
            <div className="flex-1 px-2 pt-2">
              <SalesOverviewChart data={segData} h={272} loading={exec.isLoading} avgLabel={t('Avg')} />
            </div>
          </Card>

          <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
            {/* Airy Pearl-to-White Target Chamber (no heavy dark block) */}
            <div className="relative overflow-hidden bg-gradient-to-b from-[#F4F7FC] via-[#FAFBFD] to-white px-6 pb-5 pt-5">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#3B669C] via-gold to-gold/30" aria-hidden />
              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-card-title text-navy">{t('Monthly target')}</h2>
                  {tTotal > 0 && (
                    <p className="mt-0.5 truncate text-caption text-muted">
                      {tRem > 0
                        ? `${fmtMoney(tRem, lang)} ${t('to go')} · ${daysLeft > 1 ? `${daysLeft} ${t('days left')}` : daysLeft === 1 ? `1 ${t('day left')}` : t('Last day')}`
                        : t('Target met')}
                    </p>
                  )}
                </div>
                {tTotal > 0 && (
                  <Badge tone={tPct >= 100 ? 'success' : tPct >= monthPace * 0.85 ? 'gold' : 'warn'} dot>
                    {tPct >= 100 ? t('Target met') : tPct >= monthPace * 0.85 ? t('On pace') : t('Behind pace')}
                  </Badge>
                )}
              </div>

              <div className="relative mt-4">
                {sales.isLoading ? (
                  <div className="space-y-4 py-2">
                    <Skeleton className="mx-auto h-28 w-52" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : tTotal ? (
                  <>
                    <Gauge
                      value={tPct}
                      label={`${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(tDone)} / ${fmtCompact(tTotal)}`}
                      size={212}
                      marker={monthPace}
                      showBounds
                    />
                    <div className="mt-4 grid grid-cols-3 divide-x divide-line/80 border-t border-line/80 pt-3.5 rtl:divide-x-reverse">
                      {[
                        [t('Achieved'), `${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(tDone)}`],
                        [t('Target'), `${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(tTotal)}`],
                        [
                          tRem > 0 && daysLeft > 0 ? t('Daily needed') : t('Remaining'),
                          tRem > 0 && daysLeft > 0 ? `${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(dailyNeed)}` : `${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(tRem)}`,
                        ],
                      ].map(([l, v]) => (
                        <div key={String(l)} className="px-2 text-center first:ps-0 last:pe-0">
                          <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{l}</p>
                          <p className="num mt-1 truncate text-[13.5px] font-bold text-navy">{v}</p>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <EmptyState
                    icon="target"
                    title={t('No target set')}
                    desc={t('Set sales targets to track monthly progress.')}
                    action={
                      can({ mod: 'sales', slug: 'sales-target' }, 'create') ? (
                        <Link href="/app/sales-target/new">
                          <Button size="sm" variant="secondary">
                            {t('Set a target')}
                          </Button>
                        </Link>
                      ) : undefined
                    }
                  />
                )}
              </div>
            </div>

            {/* Bottom Crisp White Category & Conversion Chamber */}
            <div className="flex flex-1 flex-col border-t border-line/80 bg-card px-6 py-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="overline text-muted">{t('Sales by category')}</p>
                <Link href="/app/dashboards/sales" className="inline-flex items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text">
                  {t('Details')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                </Link>
              </div>
              <div className="space-y-3 pb-3">
                {sales.isLoading ? (
                  <SkeletonRows rows={3} cols={1} />
                ) : cats.length === 0 ? (
                  <p className="text-small text-muted">{t('No sales yet this period.')}</p>
                ) : (
                  cats.map((c, i) => {
                    const share = (c.value / catTotal) * 100;
                    const barColor = i === 0 ? '#3B669C' : i === 1 ? GOLD : PALETTE[i % PALETTE.length];
                    return (
                      <div key={c.name}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-small">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: barColor }} />
                            <span className="truncate font-semibold text-fg">{c.name}</span>
                          </span>
                          <span className="num flex shrink-0 items-center gap-2 text-caption">
                            <span className="font-semibold text-navy">{fmtMoney(c.value, lang)}</span>
                            <span className="rounded-xs bg-soft px-1.5 py-0.5 text-[11px] font-semibold text-strong">{fmtNum(share, lang, 0)}%</span>
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-xs bg-soft">
                          <div className="h-full rounded-xs" style={{ width: `${Math.max(2, share)}%`, background: barColor }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              {conv && conv.sent > 0 && (
                <div className="mt-auto flex items-center justify-between border-t border-line/80 pt-3 text-caption">
                  <span className="inline-flex items-center gap-1.5 font-medium text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" />
                    <span>{t('Quote conversion')}</span>
                  </span>
                  <span className="num font-bold text-navy">
                    {fmtNum(conv.rate, lang, 0)}% <span className="font-normal text-muted">({conv.approved}/{conv.sent})</span>
                  </span>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      {/* Row 4: Operational attention radar */}
      {ops.data && <Attention d={ops.data} />}

      {/* Row 5: Recent customer requests + Pending approvals */}
      <section className={ROW2}>
        {!reqs.denied && (
          <Card>
            <CardHeader
              title={t('Recent customer requests')}
              sub={t('Latest incoming parts requests')}
              actions={
                <Link href="/app/request" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">
                  {t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" />
                </Link>
              }
            />
            {reqs.isLoading ? (
              <SkeletonRows rows={5} cols={5} />
            ) : !reqs.data?.data.length ? (
              <EmptyState
                icon="inbox"
                title={t('No requests yet')}
                desc={t('New customer requests will appear here.')}
                action={
                  can({ mod: 'sales', slug: 'request' }, 'create') ? (
                    <Link href="/app/request/new">
                      <Button size="sm">{t('New request')}</Button>
                    </Link>
                  ) : undefined
                }
              />
            ) : (
              <div className="overflow-x-auto px-3 pb-3 pt-2">
                <table className="w-full min-w-[620px] text-body">
                  <thead>
                    <tr className="bg-soft text-caption font-semibold text-strong">
                      {[t('Request'), t('Customer'), t('Vehicle'), t('Status'), t('Owner')].map((h, i, a) => (
                        <th key={h} className={cn(th, i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {reqs.data.data.map((r: any) => (
                      <tr key={r.id} className="group cursor-pointer transition-colors hover:bg-soft/50" onClick={() => (location.href = `/app/request/${r.id}`)}>
                        <td className="px-4 py-3.5">
                          <Link href={`/app/request/${r.id}`} className="mono font-semibold text-navy group-hover:underline">
                            {r.number}
                          </Link>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-2.5">
                            <Avatar name={r._refs?.customerId?.label} size={26} />
                            <span className="font-semibold text-fg">{r._refs?.customerId?.label}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-muted">
                          <span className="mono rounded-xs bg-soft px-1.5 py-0.5 text-[11px]" dir="ltr">
                            {r.vin ? r.vin.slice(-8) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <StatusBadge value={r.status} />
                        </td>
                        <td className="px-4 py-3.5">
                          {r._refs?.assignedToId ? (
                            <span className="inline-flex items-center gap-2">
                              <Avatar name={r._refs.assignedToId.label} />
                              <span className="hidden text-small text-strong 2xl:inline">{r._refs.assignedToId.label}</span>
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
        {!appr.denied && <Approvals q={appr} />}
      </section>

      {/* Row 6: Ageing + Supplier performance */}
      <section className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
        {!recv.denied && <Ageing q={recv} />}
        {!sup.denied && <Suppliers q={sup} />}
      </section>
    </div>
  );
}

/** Approval reasons arrive as one string ("Who: what happened: details"); split it so each part gets its own weight. */
function parseReason(r: string, lang: 'en' | 'ar') {
  const [who, what, ...rest] = String(r ?? '').split(': ');
  if (!what) return { title: who, what: '', detail: '' };
  const detail = rest.join(': ').replace(/\d{1,3}(?:,?\d{3})*\.\d{2}/g, (n) => fmtNum(n.replace(/,/g, ''), lang, 2));
  return { title: who, what, detail };
}

function Approvals({ q }: { q: any }) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const router = useRouter();
  const act = useMutation({
    mutationFn: ({ id, action, note }: any) => api<any>(`/api/v1/r/approval-request/${id}/actions/${action}`, { method: 'POST', body: { note } }),
    onSuccess: (r) => {
      toast.success(r.message ?? t('Done'));
      qc.invalidateQueries({ queryKey: ['home', 'appr'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });
  const rows: any[] = q.data?.data ?? [];
  const [top, ...rest] = [...rows].sort((a, b) => Number(b.overdue) - Number(a.overdue) || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const ICON: Record<string, string> = { margin: 'percent', credit: 'octagon-alert', purchase_order: 'shopping-basket', discount: 'badge-percent', expense: 'wallet', return: 'undo-2' };
  const Chev = lang === 'ar' ? ChevronLeft : ChevronRight;
  return (
    <Card>
      <CardHeader title={t('Pending approvals')} sub={rows.length ? t('Action required') : undefined} actions={rows.length ? <Badge tone="gold">{rows.length}</Badge> : undefined} />
      <div className="space-y-2 p-6 pt-4">
        {q.isLoading ? (
          <SkeletonRows rows={3} cols={1} />
        ) : !top ? (
          <EmptyState icon="check-circle-2" title={t('Nothing to approve')} desc={t('Approval requests will appear here.')} />
        ) : (
          <>
            <div className="rounded-lg border border-gold-border bg-gold-light p-4">
              <div className="flex items-center justify-between">
                <Badge tone="gold" className="!bg-white/75 capitalize">
                  {top.type.replace('_', ' ')}
                </Badge>
                <span className="text-caption text-gold-text">{timeAgo(top.createdAt, lang)}</span>
              </div>
              {(() => {
                const r = parseReason(top.reason, lang);
                return (
                  <div className="mt-3">
                    <p className="break-words text-[15px] font-bold leading-snug">{r.title}</p>
                    {r.what && <p className="mt-0.5 text-small font-semibold text-gold-text">{r.what}</p>}
                    {r.detail && <p className="num mt-2 text-caption leading-5 text-strong">{r.detail}</p>}
                  </div>
                );
              })()}
              <p className="mt-3 flex items-center justify-between border-t border-gold-border pt-2.5 text-caption text-gold-text">
                <span className="num text-small font-bold text-fg">{fmtMoney(top.amount, lang)}</span>
                <span>{top.requestedBy}</span>
              </p>
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" className="bg-white" loading={act.isPending && act.variables?.action === 'reject'} onClick={() => router.push(`/app/approval-request/${top.id}`)}>
                  {t('Decline')}
                </Button>
                <Button size="sm" loading={act.isPending && act.variables?.id === top.id && act.variables?.action === 'approve'} onClick={() => act.mutate({ id: top.id, action: 'approve' })}>
                  {t('Approve')}
                </Button>
              </div>
            </div>
            {rest.slice(0, 3).map((a) => (
              <Link key={a.id} href={`/app/approval-request/${a.id}`} className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-soft">
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-sm bg-soft text-navy">
                  <Icon name={ICON[a.type] ?? 'check-circle-2'} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-body font-semibold" title={a.reason}>
                    {parseReason(a.reason, lang).title}
                  </b>
                  <span className="block truncate text-caption text-strong">{parseReason(a.reason, lang).what}</span>
                  <span className="text-caption text-muted">
                    <span className="num">{fmtMoney(a.amount, lang)}</span> · {a.requestedBy}
                  </span>
                </span>
                <span className="grid h-8 w-8 place-items-center rounded-xs text-muted">
                  <Chev size={16} />
                </span>
              </Link>
            ))}
            {rows.length > 4 && (
              <Link href="/app/approvals" className="block pt-1 text-center text-small font-semibold text-navy hover:underline">
                {t('View all')} ({rows.length})
              </Link>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function Ageing({ q }: { q: any }) {
  const { t, lang } = useT();
  const tt = q.data?.ageing?.totals ?? {};
  const b = [
    { k: 'current', l: t('Current'), v: tt.current ?? 0, c: NAVY },
    { k: 'b1', l: `1–30 ${t('days')}`, v: tt.b1 ?? 0, c: GOLD },
    { k: 'b2', l: `31–60 ${t('days')}`, v: tt.b2 ?? 0, c: '#C2410C' },
    { k: 'b3', l: `60+ ${t('days')}`, v: (tt.b3 ?? 0) + (tt.b4 ?? 0), c: '#B91C1C' },
  ];
  const sum = b.reduce((x, y) => x + y.v, 0);
  const total = sum || 1;
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={t('Receivables ageing')}
        actions={
          <Link href="/app/dashboards/receivables" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">
            {t('Details')} <ArrowUpRight size={14} className="rtl:-scale-x-100" />
          </Link>
        }
      />
      <div className="flex flex-1 flex-col p-6 pt-4">
        {q.isLoading ? (
          <SkeletonRows rows={4} cols={1} />
        ) : !sum ? (
          <EmptyState icon="hand-coins" title={t('No open receivables')} />
        ) : (
          <>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-caption font-medium text-muted">{t('Total outstanding')}</p>
                <p className="mt-0.5 text-kpi">
                  <Money v={sum} />
                </p>
              </div>
              {b[2].v + b[3].v > 0 && <Badge tone="danger">{fmtNum(((b[2].v + b[3].v) / total) * 100, lang, 0)}% {t('over 30 days')}</Badge>}
            </div>
            <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-xs bg-soft" role="img" aria-label="Ageing distribution">
              {b.map((x) => x.v > 0 && <div key={x.k} style={{ width: `${(x.v / total) * 100}%`, background: x.c }} />)}
            </div>
            <ul className="mt-2 flex-1 divide-y divide-line">
              {b.map((x) => (
                <li key={x.k} className="flex items-center gap-3 py-3">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.c }} />
                  <span className="flex-1 text-small font-medium">{x.l}</span>
                  <span className="num text-small text-muted">{fmtNum((x.v / total) * 100, lang, 0)}%</span>
                  <span className="num w-24 text-end text-small font-semibold">{fmtMoney(x.v, lang)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  );
}

function Suppliers({ q }: { q: any }) {
  const { t, lang } = useT();
  const resp = (q.data?.responseTimes ?? []) as any[];
  const ontime = (q.data?.onTimeRates ?? []) as any[];
  const names = [...new Set([...resp.map((r) => r.name), ...ontime.map((r) => r.name)])];
  const rows = names
    .map((n) => ({
      name: n,
      hours: resp.find((r) => r.name === n)?.hours,
      rate: resp.find((r) => r.name === n)?.responseRate,
      onTime: ontime.find((r) => r.name === n)?.pct,
    }))
    .slice(0, 6);
  return (
    <Card>
      <CardHeader
        title={t('Supplier performance')}
        actions={
          <Link href="/app/reports/supplier-performance" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">
            {t('Details')} <ArrowUpRight size={14} className="rtl:-scale-x-100" />
          </Link>
        }
      />
      {q.isLoading ? (
        <SkeletonRows rows={4} cols={4} />
      ) : rows.length === 0 ? (
        <EmptyState icon="factory" title={t('No supplier activity yet')} desc={t('Send an RFQ to see response times and delivery rates.')} />
      ) : (
        <div className="overflow-x-auto px-3 pb-3 pt-2">
          <table className="w-full min-w-[420px] text-body">
            <thead>
              <tr className="bg-soft text-caption font-semibold text-strong">
                {[t('Supplier'), t('Reply time'), t('Response rate'), t('On-time')].map((h, i, a) => (
                  <th key={h} className={cn(th, i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.name} className="transition-colors hover:bg-soft/45">
                  <td className="px-4 py-3.5 font-semibold">{r.name}</td>
                  <td className="num px-4 py-3.5">{r.hours != null ? `${fmtNum(r.hours, lang, 1)} ${t('h')}` : '—'}</td>
                  <td className="num px-4 py-3.5">
                    {r.rate != null ? (
                      <div className="inline-flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-xs bg-soft">
                          <div className="h-full bg-navy" style={{ width: `${Math.min(100, Math.max(0, r.rate))}%` }} />
                        </div>
                        <span>{fmtNum(r.rate, lang, 0)}%</span>
                      </div>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {r.onTime != null ? <Badge tone={r.onTime >= 90 ? 'success' : r.onTime >= 75 ? 'warn' : 'danger'}>{fmtNum(r.onTime, lang, 0)}%</Badge> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Attention({ d }: { d: any }) {
  const { t } = useT();
  const Chev = useT().lang === 'ar' ? ChevronLeft : ChevronRight;
  const items = [
    { n: d.deliveries?.late ?? 0, label: t('Late deliveries'), href: '/app/delivery-note', icon: 'truck', tone: 'warn' },
    { n: d.slaBreaches?.length ?? 0, label: t('SLA breaches'), href: '/app/request', icon: 'timer', tone: 'danger' },
    { n: d.creditHolds ?? 0, label: t('Credit holds'), href: '/app/credit-hold', icon: 'octagon-alert', tone: 'danger' },
    { n: d.receivingDue ?? 0, label: t('Receiving due'), href: '/app/purchase-order', icon: 'package-check', tone: 'info' },
    { n: d.partialDeliveries ?? 0, label: t('Open back-orders'), href: '/app/sales-order', icon: 'clock', tone: 'warn' },
  ];
  const total = items.reduce((x, i) => x + i.n, 0);
  const TONE: any = {
    warn: ['bg-warn-bg text-warn', 'before:bg-warn', 'bg-warn-bg/20'],
    danger: ['bg-danger-bg text-danger', 'before:bg-danger', 'bg-danger-bg/20'],
    info: ['bg-info-bg text-info', 'before:bg-info', 'bg-info-bg/20'],
  };
  return (
    <Card id="attention">
      <CardHeader
        title={t('Needs your attention')}
        sub={total ? `${total} ${t('open items across operations')}` : t('Everything is on track')}
        actions={total ? <Badge tone="danger">{total}</Badge> : <Badge tone="success">{t('All clear')}</Badge>}
      />
      <ul className="grid gap-3 p-6 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {items.map((a) => {
          const on = a.n > 0;
          return (
            <li key={a.label}>
              <Link
                href={a.href}
                className={cn(
                  'group relative flex h-full flex-col gap-3 overflow-hidden rounded-md border border-line p-4 transition-all before:absolute before:inset-y-0 before:start-0 before:w-[3px] hover:border-gold-border hover:shadow-card',
                  on ? cn(TONE[a.tone][1], TONE[a.tone][2], 'hover:bg-card') : 'bg-card before:hidden hover:bg-soft/40'
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('grid h-9 w-9 place-items-center rounded-sm', on ? TONE[a.tone][0] : 'bg-soft text-muted')}>
                    <Icon name={a.icon} size={18} />
                  </span>
                  {on ? (
                    <Chev size={16} className="text-muted opacity-50 transition-all group-hover:translate-x-0.5 group-hover:opacity-100 rtl:group-hover:-translate-x-0.5" />
                  ) : (
                    <CheckCircle2 size={15} className="text-success/65" />
                  )}
                </div>
                <div>
                  <b className={cn('num block text-kpi leading-none', !on && 'text-muted/70')}>{a.n}</b>
                  <span className="mt-1.5 block text-small font-medium text-strong">{a.label}</span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

void fmtDate;
