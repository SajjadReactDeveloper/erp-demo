'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  Car,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  Plus,
  ScrollText,
  Truck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, timeAgo } from '@/lib/format';
import { Gauge, GOLD, KpiMeter } from '@/components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Segmented, Skeleton, SkeletonRows, Star, StatusBadge, cn } from '@/components/ui';
import { Chip, Kpi, ROW2 } from '@/components/erp/dash';

const Money = ({ v, compact }: { v: any; compact?: boolean }) => {
  const { lang } = useT();
  return (
    <span className="num">
      <span className="me-1.5 text-[0.5em] font-semibold tracking-wide text-current opacity-55">{lang === 'ar' ? 'ر.س' : 'SAR'}</span>
      {compact ? fmtCompact(v) : fmtNum(v, lang, 2)}
    </span>
  );
};

export default function PortalHome() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const [tab, setTab] = useState<'requests' | 'quotations' | 'orders'>('requests');

  const q = useQuery({ queryKey: ['portal-dash'], queryFn: () => api<any>('/api/v1/portal/customer/dashboard') });
  const reqs = useQuery({
    queryKey: ['portal-recent-requests'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/request', { query: { limit: 6, sort: 'createdAt:desc' } }),
    retry: false,
  });
  const quotes = useQuery({
    queryKey: ['portal-recent-quotations'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/quotation', { query: { limit: 6, sort: 'createdAt:desc' } }),
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['portal-recent-orders'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/sales-order', { query: { limit: 6, sort: 'createdAt:desc' } }),
    retry: false,
  });
  const vehicles = useQuery({
    queryKey: ['portal-home-vehicles'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/vehicle', { query: { limit: 6 } }),
    retry: false,
  });

  const d = q.data;
  const limit = Number(d?.credit?.limit ?? 0);
  const exposure = Number(d?.credit?.exposure ?? 0);
  const available = Number(d?.credit?.available ?? 0);
  const overdue = Number(d?.credit?.overdue ?? 0);
  const balance = Number(d?.credit?.balance ?? 0);
  const pct = limit > 0 ? Math.min(100, (exposure / limit) * 100) : 0;

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
  const monthLabel = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-GB', { month: 'long', year: 'numeric' }).format(new Date());
  const Chev = lang === 'ar' ? ChevronLeft : ChevronRight;

  const reqRows = reqs.data?.data ?? [];
  const quoteRows = quotes.data?.data ?? [];
  const orderRows = orders.data?.data ?? [];
  const vehicleRows = vehicles.data?.data ?? [];

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const activeList = tab === 'requests' ? reqRows : tab === 'quotations' ? quoteRows : orderRows;
  const activeLoading = tab === 'requests' ? reqs.isLoading : tab === 'quotations' ? quotes.isLoading : orders.isLoading;
  const activeHref = tab === 'requests' ? '/portal/request' : tab === 'quotations' ? '/portal/quotation' : '/portal/sales-order';

  return (
    <div className="space-y-5">
      {/* Row 1: Editorial Midnight Navy Customer Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-navy bg-[#08162B] text-white shadow-[0_10px_28px_rgba(11,31,58,0.16)]">
        <img
          src="/images/signup-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[52%] object-cover object-[50%_42%] opacity-75 md:block rtl:-scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B] via-[#08162B]/95 via-[52%] to-[#08162B]/20 rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/70 via-transparent to-[#08162B]/35" />
        <Star className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.06]" size={190} />

        <div className="relative z-10 max-w-2xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <span>{d?.customer?.code ? `${d.customer.code} · ${monthLabel}` : monthLabel}</span>
            </span>
            {overdue > 0 && (
              <a
                href="#billing"
                className="inline-flex items-center gap-1.5 rounded-xs bg-[#F87171]/15 px-2.5 py-1 text-caption font-semibold text-[#FCA5A5] transition-colors hover:bg-[#F87171]/25"
              >
                <AlertTriangle size={12} />
                <span className="num">{fmtMoney(overdue, lang)} {t('overdue')}</span>
              </a>
            )}
            {(d?.quotationsToReview ?? 0) > 0 && (
              <Link
                href="/portal/quotation"
                className="inline-flex items-center gap-1 text-caption font-semibold text-gold hover:underline"
              >
                <span>{d.quotationsToReview} {t('Quotations to review')}</span>
                <ArrowUpRight size={12} className="rtl:-scale-x-100" />
              </Link>
            )}
          </div>

          <h1 className="mt-3.5 text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {greet}, {me?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1.5 max-w-lg text-small leading-relaxed text-onnavy-secondary">
            {d?.customer?.name
              ? `${d.customer.name} — ${t('Here is what is happening across your requests, orders and payments.')}`
              : t('Here is what is happening across your requests, orders and payments.')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link href="/portal/request/new">
              <Button variant="accent" size="sm" className="!h-9 gap-1.5 !px-4 shadow-[0_4px_14px_rgba(214,161,58,0.28)]">
                <Plus size={14} />
                <span>{t('New request')}</span>
              </Button>
            </Link>
            <Link href="/portal/vehicles">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.08] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-gold/45 hover:bg-white/[0.14]"
              >
                <Car size={14} className="text-gold" />
                <span>{t('My vehicles')}</span>
              </button>
            </Link>
            <Link href="/portal/statement">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.12]"
              >
                <ScrollText size={14} className="text-onnavy-secondary" />
                <span>{t('Statement of account')}</span>
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Row 2: Symmetric 4-Column Executive KPI Rail */}
      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 [&>*]:min-w-0">
        <Kpi
          featured
          loading={q.isLoading}
          icon="wallet"
          tone="primary"
          label={t('Available credit')}
          sub={d ? `${t('Limit')} ${fmtCompact(limit)}` : undefined}
          href="/portal/statement"
          value={d ? <span className={cn(available < 0 && 'text-danger')}><Money v={available} /></span> : undefined}
          chip={
            d ? (
              <Chip tone={pct > 85 ? 'danger' : pct > 60 ? 'warn' : 'gold'}>
                {Math.round(pct)}% {t('used')}
              </Chip>
            ) : undefined
          }
          spark={
            d ? (
              <KpiMeter
                value={exposure}
                target={limit * 0.8}
                max={Math.max(limit, exposure, 1)}
                color={pct > 85 ? '#B91C1C' : GOLD}
                left={`${t('Amount due')} ${fmtCompact(balance)}`}
                right={overdue > 0 ? `${fmtCompact(overdue)} ${t('overdue')}` : t('Healthy')}
                rightTone={overdue > 0 ? 'danger' : 'success'}
              />
            ) : undefined
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="inbox"
          tone="info"
          label={t('Open requests')}
          sub={t('Submitted & sourcing')}
          href="/portal/request"
          value={d?.openRequests ?? 0}
          chip={<Chip tone={d?.openRequests ? 'info' : 'muted'}>{d?.openRequests ? t('In progress') : t('All caught up')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Total requests')} <b className="font-semibold text-strong">{reqs.data?.meta?.total ?? reqRows.length}</b>
              </span>
              <span className="font-semibold text-navy">{t('Request parts')} ↗</span>
            </div>
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="file-text"
          tone="warn"
          label={t('Quotations to review')}
          sub={t('Awaiting your approval')}
          href="/portal/quotation"
          value={d?.quotationsToReview ?? 0}
          chip={d?.quotationsToReview ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('All reviewed')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Quotations')} <b className="font-semibold text-strong">{quotes.data?.meta?.total ?? quoteRows.length}</b>
              </span>
              <span className="font-semibold text-navy">{t('Compare & approve')}</span>
            </div>
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="truck"
          tone="success"
          label={t('Active orders')}
          sub={t('Confirmed & in delivery')}
          href="/portal/sales-order"
          value={d?.activeOrders ?? 0}
          chip={d?.activeOrders ? <Chip tone="success">{t('On the way')}</Chip> : <Chip tone="muted">{t('No open deliveries')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Orders')} <b className="font-semibold text-strong">{orders.data?.meta?.total ?? orderRows.length}</b>
              </span>
              <span className="font-semibold text-navy">{t('Track deliveries')}</span>
            </div>
          }
        />
      </section>

      {/* Row 3: Interactive Activity Hub (2/3) + Credit & Billing Chamber (1/3) */}
      <section className={ROW2}>
        <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <CardHeader
            title={t('Recent activity')}
            sub={t('Track your latest parts requests, supplier quotes and active orders')}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  label={t('Section')}
                  value={tab}
                  onChange={(k) => setTab(k as typeof tab)}
                  options={[
                    { key: 'requests', label: `${t('Requests')} (${reqs.data?.meta?.total ?? reqRows.length})` },
                    { key: 'quotations', label: `${t('Quotations')} (${quotes.data?.meta?.total ?? quoteRows.length})` },
                    { key: 'orders', label: `${t('Orders')} (${orders.data?.meta?.total ?? orderRows.length})` },
                  ]}
                />
                <Link href={activeHref} className="hidden items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text xl:inline-flex">
                  {t('View all')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                </Link>
              </div>
            }
          />

          <div className="flex-1 p-5 pt-2">
            {activeLoading ? (
              <SkeletonRows rows={5} cols={4} />
            ) : activeList.length === 0 ? (
              <EmptyState
                icon={tab === 'requests' ? 'inbox' : tab === 'quotations' ? 'file-text' : 'truck'}
                title={tab === 'requests' ? t('No requests yet') : tab === 'quotations' ? t('No quotations yet') : t('No orders yet')}
                desc={t('Send a request and suppliers will quote it.')}
                action={
                  <Link href="/portal/request/new">
                    <Button size="sm">{t('New request')}</Button>
                  </Link>
                }
              />
            ) : (
              <div className="divide-y divide-line/80">
                {activeList.map((row: any) => {
                  const href =
                    tab === 'requests'
                      ? `/portal/request/${row.id}`
                      : tab === 'quotations'
                        ? `/portal/quotation/${row.id}`
                        : `/portal/sales-order/${row.id}`;
                  const amount = row.total ?? row.grandTotal ?? row.amount;
                  const vehicleLabel = row._refs?.vehicleId?.label ?? row.vehicleSummary ?? row.notes;
                  return (
                    <Link
                      key={row.id}
                      href={href}
                      className="group flex items-center justify-between gap-4 rounded-sm px-3 py-3.5 transition-colors hover:bg-soft/65"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-soft text-navy transition-colors group-hover:bg-gold-light group-hover:text-gold-text">
                          {tab === 'requests' ? <FileText size={16} /> : tab === 'quotations' ? <ScrollText size={16} /> : <Truck size={16} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono text-[13px] font-semibold text-navy group-hover:text-gold-text">{row.number}</span>
                            <StatusBadge value={row.status} />
                          </div>
                          <p className="mt-1 truncate text-caption text-muted">
                            {vehicleLabel ? `${vehicleLabel} · ` : ''}
                            <span className="num">{fmtDate(row.createdAt, lang)}</span> · {timeAgo(row.createdAt, lang)}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {amount != null && Number(amount) > 0 && (
                          <span className="num hidden text-small font-bold text-navy sm:inline">{fmtMoney(amount, lang)}</span>
                        )}
                        <span className="grid h-7 w-7 place-items-center rounded-xs text-muted transition-all group-hover:bg-card group-hover:text-navy">
                          <Chev size={15} />
                        </span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Right 1/3: Airy Pearl-to-White Credit & Next Due Card */}
        <Card id="billing" className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <div className="relative overflow-hidden bg-gradient-to-b from-[#F4F7FC] via-[#FAFBFD] to-white px-6 pb-5 pt-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#3B669C] via-gold to-gold/30" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-card-title text-navy">{t('Credit & billing')}</h2>
                <p className="mt-0.5 truncate text-caption text-muted">
                  {d?.unpaidInvoices ? `${d.unpaidInvoices} ${t('Unpaid invoices').toLowerCase()}` : t('Nothing is due')}
                </p>
              </div>
              <Link href="/portal/statement" className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text">
                {t('View statement')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
              </Link>
            </div>

            <div className="mt-4">
              {q.isLoading ? (
                <div className="space-y-4 py-2">
                  <Skeleton className="mx-auto h-28 w-48" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : limit > 0 ? (
                <>
                  <Gauge
                    value={pct}
                    label={`${lang === 'ar' ? 'ر.س' : 'SAR'} ${fmtCompact(exposure)} / ${fmtCompact(limit)}`}
                    size={200}
                    showBounds
                  />
                  <div className="mt-4 grid grid-cols-3 divide-x divide-line/80 border-t border-line/80 pt-3.5 rtl:divide-x-reverse">
                    <div className="px-2 text-center first:ps-0">
                      <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{t('Limit')}</p>
                      <p className="num mt-1 truncate text-[13px] font-bold text-navy">{lang === 'ar' ? 'ر.س' : 'SAR'} {fmtCompact(limit)}</p>
                    </div>
                    <div className="px-2 text-center">
                      <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{t('Balance')}</p>
                      <p className="num mt-1 truncate text-[13px] font-bold text-navy">{lang === 'ar' ? 'ر.س' : 'SAR'} {fmtCompact(balance)}</p>
                    </div>
                    <div className="px-2 text-center last:pe-0">
                      <p className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-muted">{t('Overdue')}</p>
                      <p className={cn('num mt-1 truncate text-[13px] font-bold', overdue > 0 ? 'text-danger' : 'text-success')}>
                        {lang === 'ar' ? 'ر.س' : 'SAR'} {fmtCompact(overdue)}
                      </p>
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex flex-1 flex-col border-t border-line/80 bg-card px-5 py-4">
            <div className="mb-2.5 flex items-center justify-between px-1">
              <p className="overline text-muted">{t('Next due')}</p>
              {d?.unpaidInvoices > 0 && <Badge tone={overdue > 0 ? 'danger' : 'gold'}>{d.unpaidInvoices}</Badge>}
            </div>

            {q.isLoading ? (
              <SkeletonRows rows={3} cols={2} />
            ) : !d?.nextDue?.length ? (
              <EmptyState icon="party-popper" title={t('Nothing is due')} />
            ) : (
              <ul className="divide-y divide-line/75">
                {d.nextDue.map((inv: any) => {
                  const past = inv.dueDate && new Date(inv.dueDate).getTime() < Date.now();
                  return (
                    <li key={inv.id}>
                      <Link
                        href={`/portal/invoice/${inv.id}`}
                        className="group flex items-center justify-between gap-3 rounded-sm px-2 py-3 transition-colors hover:bg-soft/65"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="mono truncate text-[13px] font-semibold text-navy group-hover:text-gold-text">{inv.number}</span>
                            {past && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />}
                          </div>
                          <p className={cn('num mt-0.5 text-caption', past ? 'font-medium text-danger' : 'text-muted')}>
                            {fmtDate(inv.dueDate, lang)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="num rounded-xs bg-gold-light px-2 py-1 text-caption font-bold text-gold-text">
                            {fmtMoney(inv.balance, lang)}
                          </span>
                          <Chev size={14} className="text-muted group-hover:text-navy" />
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>
      </section>

      {/* Row 4: Fleet Garage Preview (2/3) + Quick Portal Services (1/3) */}
      <section className={ROW2}>
        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <CardHeader
            title={t('Your fleet')}
            sub={t('Saved vehicles ready for instant VIN part requests')}
            actions={
              <Link href="/portal/vehicles" className="inline-flex items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text">
                {t('View all')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
              </Link>
            }
          />
          <div className="p-5 pt-2">
            {vehicles.isLoading ? (
              <SkeletonRows rows={2} cols={3} />
            ) : vehicleRows.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-dashed border-line bg-soft/40 px-5 py-6">
                <div className="flex items-center gap-3.5">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-gold-light text-gold-text">
                    <Car size={19} />
                  </span>
                  <div>
                    <p className="text-small font-bold text-navy">{t('No vehicles yet')}</p>
                    <p className="mt-0.5 text-caption text-muted">{t('Add a vehicle by creating a parts request with its VIN.')}</p>
                  </div>
                </div>
                <Link href="/portal/request/new">
                  <Button size="sm" variant="secondary">
                    {t('New request')}
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vehicleRows.map((v: any) => (
                  <Link
                    key={v.id}
                    href="/portal/vehicles"
                    className="group flex flex-col justify-between rounded-md border border-line/90 bg-soft/30 p-4 transition-all hover:border-gold-border hover:bg-card hover:shadow-[0_6px_18px_rgba(11,31,58,0.06)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-card text-navy ring-1 ring-line transition-colors group-hover:bg-gold-light group-hover:text-gold-text group-hover:ring-gold-border">
                        <Car size={15} />
                      </span>
                      {v.year && <span className="num rounded-xs bg-card px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">{v.year}</span>}
                    </div>
                    <div className="mt-3">
                      <p className="truncate text-small font-bold text-navy">
                        {[v.make, v.model].filter(Boolean).join(' ') || v.plate || v.vin}
                      </p>
                      <p className="mono mt-0.5 truncate text-[11px] text-muted">{v.plate ?? v.vin ?? '—'}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <CardHeader title={t('Quick actions')} sub={t('Common account shortcuts')} />
          <div className="divide-y divide-line/80 px-4 pb-3 pt-1">
            {[
              {
                href: '/portal/request/new',
                icon: Plus,
                title: t('New parts request'),
                desc: t('Submit vehicle VIN and required parts'),
                accent: true,
              },
              {
                href: '/portal/statement',
                icon: CreditCard,
                title: t('Statement of account'),
                desc: t('Review invoices, payments and PDF statement'),
                accent: false,
              },
              {
                href: '/portal/vehicles',
                icon: Car,
                title: t('Vehicles & expenses'),
                desc: t('View spend and parts history per vehicle'),
                accent: false,
              },
            ].map((item) => {
              const IconCmp = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between gap-3 rounded-sm px-2 py-3.5 transition-colors hover:bg-soft/65"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-sm transition-colors',
                        item.accent ? 'bg-gold-light text-gold-text' : 'bg-soft text-navy group-hover:bg-gold-light group-hover:text-gold-text'
                      )}
                    >
                      <IconCmp size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-small font-bold text-navy">{item.title}</p>
                      <p className="mt-0.5 truncate text-caption text-muted">{item.desc}</p>
                    </div>
                  </div>
                  <Chev size={15} className="shrink-0 text-muted group-hover:text-navy" />
                </Link>
              );
            })}
          </div>
        </Card>
      </section>
    </div>
  );
}
