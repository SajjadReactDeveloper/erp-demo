'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Receipt,
  Send,
  ShoppingBasket,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtDate, fmtMoney, fmtNum, timeAgo } from '@/lib/format';
import { Sparkline } from '@/components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Segmented, SkeletonRows, Star, StatusBadge } from '@/components/ui';
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

export default function SupplierHome() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const [tab, setTab] = useState<'rfqs' | 'pos' | 'bills'>('rfqs');

  const q = useQuery({ queryKey: ['supplier-dash'], queryFn: () => api<any>('/api/v1/portal/supplier/dashboard') });
  const rfqs = useQuery({
    queryKey: ['supplier-recent-rfqs'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/portal/supplier/rfqs', { query: { limit: 6 } }),
    retry: false,
  });
  const pos = useQuery({
    queryKey: ['supplier-recent-pos'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/purchase-order', { query: { limit: 6, sort: 'createdAt:desc' } }),
    retry: false,
  });
  const bills = useQuery({
    queryKey: ['supplier-recent-bills'],
    queryFn: () => api<{ data: any[]; meta?: { total?: number } }>('/api/v1/r/supplier-bill', { query: { limit: 6, sort: 'createdAt:desc' } }),
    retry: false,
  });

  const d = q.data;
  const rfqRows = rfqs.data?.data ?? [];
  const poRows = pos.data?.data ?? [];
  const billRows = bills.data?.data ?? [];
  const recentPoTotal = poRows.reduce((s, p) => s + Number(p.total ?? 0), 0);
  const poSpark = [...poRows].reverse().map((p) => Number(p.total ?? 0));
  const poSparkLabels = [...poRows].reverse().map((p) => p.number);

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

  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const activeList = tab === 'rfqs' ? rfqRows : tab === 'pos' ? poRows : billRows;
  const activeLoading = tab === 'rfqs' ? rfqs.isLoading : tab === 'pos' ? pos.isLoading : bills.isLoading;
  const activeHref = tab === 'rfqs' ? '/supplier/rfqs' : tab === 'pos' ? '/supplier/purchase-order' : '/supplier/supplier-bill';

  return (
    <div className="space-y-5">
      {/* Row 1: Editorial Midnight Navy Supplier Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-navy bg-[#08162B] text-white shadow-[0_10px_28px_rgba(11,31,58,0.16)]">
        <img
          src="/images/login-hero.jpg"
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-y-0 end-0 hidden h-full w-[52%] object-cover object-[50%_46%] opacity-80 md:block rtl:-scale-x-100"
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#08162B] via-[#08162B]/95 via-[52%] to-[#08162B]/20 rtl:bg-gradient-to-l" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/70 via-transparent to-[#08162B]/35" />
        <Star className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.06]" size={190} />

        <div className="relative z-10 max-w-2xl px-6 py-7 sm:px-8 sm:py-8">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-positive" />
              <span>{t('Supplier portal')} · {monthLabel}</span>
            </span>
            {(d?.openRfqs ?? 0) > 0 && (
              <Link href="/supplier/rfqs" className="inline-flex items-center gap-1 text-caption font-semibold text-gold hover:underline">
                <span>{d.openRfqs} {t('Open RFQs to quote')}</span>
                <ArrowUpRight size={12} className="rtl:-scale-x-100" />
              </Link>
            )}
            {(d?.posToConfirm ?? 0) > 0 && (
              <Link href="/supplier/purchase-order" className="inline-flex items-center gap-1 text-caption font-semibold text-onnavy-secondary hover:text-gold">
                <span>{d.posToConfirm} {t('POs to confirm')}</span>
                <ArrowUpRight size={12} className="rtl:-scale-x-100" />
              </Link>
            )}
          </div>

          <h1 className="mt-3.5 text-[24px] font-extrabold leading-tight tracking-tight sm:text-[28px]">
            {greet}, {me?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1.5 max-w-lg text-small leading-relaxed text-onnavy-secondary">
            {t('Here is what needs your attention on requests, orders and payments.')}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <Link href="/supplier/rfqs">
              <Button variant="accent" size="sm" className="!h-9 gap-1.5 !px-4 shadow-[0_4px_14px_rgba(214,161,58,0.28)]">
                <Send size={14} />
                <span>{t('Browse open RFQs')}</span>
              </Button>
            </Link>
            <Link href="/supplier/purchase-order">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.08] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-gold/45 hover:bg-white/[0.14]"
              >
                <ShoppingBasket size={14} className="text-gold" />
                <span>{t('Purchase orders')}</span>
              </button>
            </Link>
            <Link href="/supplier/catalogue-item">
              <button
                type="button"
                className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.06] px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.12]"
              >
                <BookOpen size={14} className="text-onnavy-secondary" />
                <span>{t('Catalogue')}</span>
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
          label={t('Awaiting payment')}
          sub={t('Posted bills pending settlement')}
          href="/supplier/supplier-bill"
          value={d ? <Money v={d.unpaid} /> : undefined}
          chip={<Chip tone={Number(d?.unpaid ?? 0) > 0 ? 'gold' : 'success'}>{Number(d?.unpaid ?? 0) > 0 ? t('Pending payout') : t('Settled')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none text-muted">
              <span className="num truncate">{t('Recent PO volume')} <b className="font-semibold text-strong">{fmtCompact(recentPoTotal)}</b></span>
              <span className="num shrink-0 font-semibold text-gold-text">{t('Open claims')} {d?.openClaims ?? 0}</span>
            </div>
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="send"
          tone="warn"
          label={t('Open RFQs to quote')}
          sub={t('Awaiting your pricing')}
          href="/supplier/rfqs"
          value={d?.openRfqs ?? 0}
          chip={d?.openRfqs ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('All quoted')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Total RFQs')} <b className="font-semibold text-strong">{rfqs.data?.meta?.total ?? rfqRows.length}</b>
              </span>
              <span className="font-semibold text-navy">{t('Submit quote')} ↗</span>
            </div>
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="shopping-basket"
          tone="info"
          label={t('POs to confirm')}
          sub={t('Awarded purchase orders')}
          href="/supplier/purchase-order"
          value={d?.posToConfirm ?? 0}
          chip={d?.posToConfirm ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('Up to date')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Total POs')} <b className="font-semibold text-strong">{pos.data?.meta?.total ?? poRows.length}</b>
              </span>
              <span className="font-semibold text-navy">{t('View orders')} ↗</span>
            </div>
          }
        />

        <Kpi
          loading={q.isLoading}
          icon="file-input"
          tone="primary"
          label={t('Draft quotes')}
          sub={t('Saved before submission')}
          href="/supplier/supplier-quote"
          value={d?.draftQuotes ?? 0}
          chip={<Chip tone={d?.draftQuotes ? 'gold' : 'muted'}>{d?.draftQuotes ? t('Drafts') : t('None saved')}</Chip>}
          spark={
            <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
              <span className="num text-muted">
                {t('Open claims')} <b className="font-semibold text-strong">{d?.openClaims ?? 0}</b>
              </span>
              <span className="font-semibold text-navy">{t('My quotes')} ↗</span>
            </div>
          }
        />
      </section>

      {/* Row 3: Interactive RFQ & Orders Hub (2/3) + PO Volume Pulse & Latest POs (1/3) */}
      <section className={ROW2}>
        <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <CardHeader
            title={t('Recent activity')}
            sub={t('Respond to incoming RFQs, confirm purchase orders and review bills')}
            actions={
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  label={t('Section')}
                  value={tab}
                  onChange={(k) => setTab(k as typeof tab)}
                  options={[
                    { key: 'rfqs', label: `${t('RFQs')} (${rfqs.data?.meta?.total ?? rfqRows.length})` },
                    { key: 'pos', label: `${t('Purchase orders')} (${pos.data?.meta?.total ?? poRows.length})` },
                    { key: 'bills', label: `${t('Bills')} (${bills.data?.meta?.total ?? billRows.length})` },
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
                icon={tab === 'rfqs' ? 'send' : tab === 'pos' ? 'shopping-basket' : 'receipt'}
                title={tab === 'rfqs' ? t('No RFQs yet') : tab === 'pos' ? t('No purchase orders yet') : t('No bills yet')}
                desc={tab === 'rfqs' ? t('Requests for quotation will appear here.') : undefined}
              />
            ) : (
              <div className="divide-y divide-line/80">
                {activeList.map((row: any) => {
                  const href =
                    tab === 'rfqs'
                      ? `/supplier/rfqs/${row.id}`
                      : tab === 'pos'
                        ? `/supplier/purchase-order/${row.id}`
                        : `/supplier/supplier-bill/${row.id}`;
                  const statusVal = tab === 'rfqs' ? row.quote?.status ?? row.invitation : row.status;
                  const dateVal = tab === 'rfqs' ? row.deadline : row.createdAt;
                  const amount = row.total ?? row.amount;
                  return (
                    <Link
                      key={row.id}
                      href={href}
                      className="group flex items-center justify-between gap-4 rounded-sm px-3 py-3.5 transition-colors hover:bg-soft/65"
                    >
                      <div className="flex min-w-0 items-center gap-3.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-soft text-navy transition-colors group-hover:bg-gold-light group-hover:text-gold-text">
                          {tab === 'rfqs' ? <Send size={15} /> : tab === 'pos' ? <ShoppingBasket size={16} /> : <Receipt size={16} />}
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="mono text-[13px] font-semibold text-navy group-hover:text-gold-text">{row.number}</span>
                            <StatusBadge value={statusVal} />
                          </div>
                          <p className="mt-1 flex items-center gap-1.5 truncate text-caption text-muted">
                            <Calendar size={11} className="shrink-0" />
                            <span>{tab === 'rfqs' ? `${t('Deadline')}: ` : ''}</span>
                            <span className="num">{dateVal ? fmtDate(dateVal, lang) : '—'}</span>
                            {row.sentAt && <span>· {timeAgo(row.sentAt, lang)}</span>}
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

        {/* Right 1/3: Pearl-to-White PO Volume Pulse + Latest Purchase Orders */}
        <Card className="flex flex-col overflow-hidden shadow-[0_1px_2px_rgba(11,31,58,0.03)]">
          <div className="relative overflow-hidden border-b border-line/80 bg-gradient-to-b from-[#F4F7FC] via-[#FAFBFD] to-white px-6 pb-4 pt-5">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-[#3B669C] via-gold to-gold/30" aria-hidden />
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-card-title text-navy">{t('Latest purchase orders')}</h2>
                <p className="mt-0.5 text-caption text-muted">{t('Recent PO volume')}</p>
              </div>
              <Link href="/supplier/purchase-order" className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold text-navy hover:text-gold-text">
                {t('View all')} <ArrowUpRight size={13} className="rtl:-scale-x-100" />
              </Link>
            </div>

            {poRows.length > 0 && (
              <div className="mt-4 space-y-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="num text-[24px] font-bold leading-none tracking-tight text-navy">
                    <Money v={recentPoTotal} />
                  </p>
                  <Badge tone="gold">{poRows.length} {t('Orders')}</Badge>
                </div>
                <Sparkline data={poSpark} labels={poSparkLabels} color="#3B669C" h={28} format={(v) => fmtMoney(v, lang)} />
              </div>
            )}
          </div>

          <div className="flex-1 bg-card px-4 py-3">
            {pos.isLoading ? (
              <SkeletonRows rows={4} cols={2} />
            ) : poRows.length === 0 ? (
              <EmptyState icon="shopping-basket" title={t('No purchase orders yet')} />
            ) : (
              <ul className="divide-y divide-line/75">
                {poRows.slice(0, 5).map((p: any) => (
                  <li key={p.id}>
                    <Link
                      href={`/supplier/purchase-order/${p.id}`}
                      className="group flex items-center justify-between gap-3 rounded-sm px-2 py-3 transition-colors hover:bg-soft/65"
                    >
                      <div className="min-w-0">
                        <span className="mono block truncate text-[13px] font-semibold text-navy group-hover:text-gold-text">{p.number}</span>
                        <span className="num mt-0.5 block text-caption text-muted">{fmtDate(p.createdAt, lang)}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="num rounded-xs bg-soft px-2 py-1 text-caption font-bold text-navy group-hover:bg-gold-light group-hover:text-gold-text">
                          {fmtMoney(p.total, lang)}
                        </span>
                        <Chev size={14} className="text-muted group-hover:text-navy" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </section>

      {/* Row 4: 3-Column Supplier Quick Actions */}
      <section className="grid gap-4 sm:grid-cols-3">
        {[
          {
            href: '/supplier/rfqs',
            icon: Send,
            title: t('Browse open RFQs'),
            desc: t('Review vehicle specs and submit competitive pricing'),
            accent: true,
          },
          {
            href: '/supplier/catalogue-item',
            icon: BookOpen,
            title: t('Manage parts catalogue'),
            desc: t('Keep part availability, lead times and pricing current'),
            accent: false,
          },
          {
            href: '/supplier/supplier-bill',
            icon: Receipt,
            title: t('Bills & payouts'),
            desc: t('Track posted supplier bills and payment status'),
            accent: false,
          },
        ].map((item) => {
          const IconCmp = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center justify-between gap-3 rounded-md border border-line/90 bg-card p-4 shadow-[0_1px_2px_rgba(11,31,58,0.03)] transition-all hover:border-gold-border hover:shadow-[0_8px_20px_rgba(11,31,58,0.06)]"
            >
              <div className="flex min-w-0 items-center gap-3.5">
                <span
                  className={
                    item.accent
                      ? 'grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-gold-light text-gold-text'
                      : 'grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-soft text-navy transition-colors group-hover:bg-gold-light group-hover:text-gold-text'
                  }
                >
                  <IconCmp size={17} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-small font-bold text-navy">{item.title}</p>
                  <p className="mt-0.5 truncate text-caption text-muted">{item.desc}</p>
                </div>
              </div>
              <ArrowUpRight size={15} className="shrink-0 text-muted/60 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-navy rtl:-scale-x-100" />
            </Link>
          );
        })}
      </section>
    </div>
  );
}
