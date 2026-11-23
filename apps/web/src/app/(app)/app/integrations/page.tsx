'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Play,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtNum } from '@/lib/format';
import { DashHeader } from '@/components/erp/dash';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Icon, NoAccess, Progress, SkeletonBlock, SkeletonCards, Star, cn, toast } from '@/components/ui';

type Cat = 'all' | 'messaging' | 'finance' | 'intelligence';

interface ConnectorMeta {
  key: string;
  nameEn: string;
  nameAr: string;
  descEn: string;
  descAr: string;
  icon: string;
  tone: string;
  cat: Exclude<Cat, 'all'>;
  alwaysSimulated?: boolean;
}

const CONNECTORS: ConnectorMeta[] = [
  {
    key: 'zatca',
    nameEn: 'ZATCA Phase 2',
    nameAr: 'زاتكا المرحلة الثانية',
    descEn: 'Real-time B2B clearance, B2C reporting & QR tax invoices.',
    descAr: 'اعتماد فواتير الأعمال والإبلاغ الفوري ورموز QR الضريبية.',
    icon: 'qr-code',
    tone: 'bg-gold-light text-gold-text border-gold-border/60',
    cat: 'finance',
    alwaysSimulated: true,
  },
  {
    key: 'payment',
    nameEn: 'Payment Gateway',
    nameAr: 'بوابة الدفع الإلكتروني',
    descEn: 'Mada, Visa and Mastercard links for online invoice settlement.',
    descAr: 'روابط الدفع الإلكتروني عبر مدى وفيزا وماستركارد.',
    icon: 'credit-card',
    tone: 'bg-gold-light text-gold-text border-gold-border/60',
    cat: 'finance',
  },
  {
    key: 'daftra',
    nameEn: 'Daftra Accounting',
    nameAr: 'دفترة للمحاسبة',
    descEn: 'Parallel ledger sync during transition to native ERP books.',
    descAr: 'مزامنة متوازية للقيود أثناء الانتقال إلى النظام المحاسبي.',
    icon: 'book-open-check',
    tone: 'bg-warn-bg text-warn border-warn/20',
    cat: 'finance',
  },
  {
    key: 'whatsapp',
    nameEn: 'WhatsApp Business',
    nameAr: 'واتساب للأعمال',
    descEn: 'Customer quote links, order updates & delivery confirmations.',
    descAr: 'إرسال عروض الأسعار وتحديثات الطلبات وتأكيدات التوصيل.',
    icon: 'message-circle',
    tone: 'bg-success-bg text-success border-success/20',
    cat: 'messaging',
  },
  {
    key: 'sms',
    nameEn: 'SMS Gateway',
    nameAr: 'بوابة الرسائل النصية',
    descEn: 'OTP verification, payment reminders & dispatch alerts.',
    descAr: 'رموز التحقق وتذكيرات الدفع وتنبيهات التوصيل.',
    icon: 'smartphone',
    tone: 'bg-info-bg text-info border-info/20',
    cat: 'messaging',
  },
  {
    key: 'email',
    nameEn: 'Transactional Email',
    nameAr: 'البريد الإلكتروني',
    descEn: 'PDF invoices, supplier RFQs & customer portal invitations.',
    descAr: 'إرسال الفواتير وطلبات الأسعار ودعوات البوابات.',
    icon: 'mail',
    tone: 'bg-soft text-navy border-line',
    cat: 'messaging',
  },
  {
    key: 'llm',
    nameEn: 'AI / LLM Engine',
    nameAr: 'محرك الذكاء الاصطناعي',
    descEn: 'Powers part matching, quotation capture & ERP assistant.',
    descAr: 'يشغّل مطابقة القطع وقراءة العروض والمساعد الذكي.',
    icon: 'sparkles',
    tone: 'bg-gold-light text-gold-text border-gold-border/60',
    cat: 'intelligence',
  },
  {
    key: 'vin',
    nameEn: 'VIN Decoder',
    nameAr: 'فك رقم الهيكل VIN',
    descEn: 'Decodes 17-digit vehicle VINs into make, model & fitment.',
    descAr: 'تحليل رقم الهيكل لتحديد الصانع والطراز والقطع المتوافقة.',
    icon: 'car',
    tone: 'bg-info-bg text-info border-info/20',
    cat: 'intelligence',
  },
];

const JOBS: { key: string; icon: string; tone: string; titleEn: string; titleAr: string; descEn: string; descAr: string }[] = [
  { key: 'reminders', icon: 'bell', tone: 'bg-gold-light text-gold-text', titleEn: 'Payment reminders', titleAr: 'تذكيرات الدفع', descEn: 'Notify customers with upcoming or overdue balances.', descAr: 'تنبيه العملاء ذوي الفواتير المستحقة أو المتأخرة.' },
  { key: 'credit-sweep', icon: 'octagon-alert', tone: 'bg-danger-bg text-danger', titleEn: 'Credit sweep', titleAr: 'فحص الائتمان والإيقاف', descEn: 'Evaluate exposures, apply credit holds and risk alerts.', descAr: 'فحص حدود الائتمان وتفعيل الإيقافات وتنبيهات المخاطر.' },
  { key: 'supplier-scores', icon: 'award', tone: 'bg-info-bg text-info', titleEn: 'Supplier scores', titleAr: 'تحديث تقييم الموردين', descEn: 'Recompute reply times, quote rates and on-time delivery.', descAr: 'إعادة حساب سرعة الرد ومعدل الاستجابة والالتزام بالمواعيد.' },
  { key: 'forecast', icon: 'trending-up', tone: 'bg-success-bg text-success', titleEn: 'Refresh forecasts', titleAr: 'تحديث التوقعات', descEn: 'Recalculate demand projections from invoice history.', descAr: 'إعادة احتساب توقعات الطلب من سجل المبيعات.' },
  { key: 'reorder', icon: 'package-plus', tone: 'bg-soft text-navy', titleEn: 'Reorder suggestions', titleAr: 'اقتراحات إعادة الطلب', descEn: 'Generate replenishment quantities for low-stock SKUs.', descAr: 'توليد كميات إعادة التوريد للأصناف المنخفضة المخزون.' },
  { key: 'vehicle-reminders', icon: 'car', tone: 'bg-warn-bg text-warn', titleEn: 'Vehicle service reminders', titleAr: 'تذكيرات صيانة المركبات', descEn: 'Queue upcoming maintenance alerts for fleet vehicles.', descAr: 'جدولة تنبيهات الصيانة الدورية لمركبات الأساطيل.' },
  { key: 'zatca-retry', icon: 'qr-code', tone: 'bg-gold-light text-gold-text', titleEn: 'Retry ZATCA queue', titleAr: 'إعادة إرسال فواتير زاتكا', descEn: 'Re-submit pending or failed e-invoices for clearance.', descAr: 'إعادة إرسال الفواتير الإلكترونية المعلقة أو الفاشلة.' },
];

export default function IntegrationsPage() {
  const { t, lang } = useT();
  const { can, ready } = useAuth();
  const [cut, setCut] = useState(false);
  const [cat, setCat] = useState<Cat>('all');
  const [lastRun, setLastRun] = useState<Record<string, string>>({});

  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api<any>('/api/v1/system/integrations'), refetchInterval: 30000 });
  const daf = useQuery({ queryKey: ['daftra'], queryFn: () => api<{ data: any }>('/api/v1/finance/daftra/reconciliation'), retry: false });

  const job = useMutation({
    mutationFn: (n: string) => api<any>(`/api/v1/admin/jobs/${n}`, { method: 'POST' }),
    onSuccess: (r, n) => {
      const summary =
        typeof r.result === 'object' && r.result
          ? Object.entries(r.result)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')
          : String(r.result ?? t('Done'));
      setLastRun((prev) => ({ ...prev, [n]: summary || t('Completed') }));
      toast.success(`${n}: ${summary || t('Done')}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cutover = useMutation({
    mutationFn: () => api<any>('/api/v1/finance/daftra/cutover', { method: 'POST', body: { confirm: true } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setCut(false);
      daf.refetch();
    },
    onError: (e: any) => {
      setCut(false);
      toast.error(e.message);
    },
  });

  const d = q.data;
  const r = daf.data?.data;

  const items = useMemo(() => {
    if (!d?.live) return [];
    const known = CONNECTORS.map((meta) => ({
      meta,
      live: meta.alwaysSimulated ? false : Boolean(d.live[meta.key]),
      stats: (d.providers ?? []).find((x: any) => x.provider === meta.key),
    }));
    const knownKeys = new Set(CONNECTORS.map((c) => c.key));
    const extra = Object.entries(d.live as Record<string, boolean>)
      .filter(([k]) => !knownKeys.has(k))
      .map(([key, live]) => ({
        meta: {
          key,
          nameEn: key,
          nameAr: key,
          descEn: 'External service connector.',
          descAr: 'رابط خدمة خارجية.',
          icon: 'plug',
          tone: 'bg-soft text-navy border-line',
          cat: 'intelligence' as const,
        },
        live,
        stats: (d.providers ?? []).find((x: any) => x.provider === key),
      }));
    return [...known, ...extra];
  }, [d]);

  const filtered = useMemo(() => (cat === 'all' ? items : items.filter((e) => e.meta.cat === cat)), [items, cat]);
  const liveCount = items.filter((e) => e.live).length;
  const total7dCalls = (d?.providers ?? []).reduce((s: number, p: any) => s + Number(p.ok ?? 0) + Number(p.error ?? 0) + Number(p.retry ?? 0), 0);
  const total7dErrors = (d?.providers ?? []).reduce((s: number, p: any) => s + Number(p.error ?? 0), 0);

  if (ready && !can({ mod: 'platform', slug: 'integration-message' })) return <NoAccess />;

  const syncPct = r && r.issuedInvoices ? Math.min(100, (r.syncedInvoices / r.issuedInvoices) * 100) : 100;

  return (
    <div className="space-y-6">
      <DashHeader
        title={t('Integrations')}
        sub={t('Every external call is logged, retried and replayable.')}
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                q.refetch();
                daf.refetch();
              }}
              className="!h-9 gap-1.5"
            >
              <RefreshCw size={14} className={cn(q.isFetching && 'animate-spin')} />
              <span>{t('Refresh')}</span>
            </Button>
            <Link href="/app/integration-message">
              <Button size="sm" icon="list" className="!h-9">
                {t('Message log')}
              </Button>
            </Link>
          </>
        }
      />

      {q.isLoading ? (
        <div className="space-y-5">
          <SkeletonCards n={4} />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <SkeletonBlock h="h-44" />
            <SkeletonBlock h="h-44" />
            <SkeletonBlock h="h-44" />
            <SkeletonBlock h="h-44" />
          </div>
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        d && (
          <div className="space-y-6">
            {/* Compact Executive Status Bar (no tall empty voids!) */}
            <Card className="relative overflow-hidden border-navy bg-gradient-to-r from-[#0F2A4F] via-[#0B1F3A] to-[#08172E] text-white shadow-[0_8px_24px_rgba(11,31,58,0.14)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_20%,rgba(214,161,58,0.18),transparent_50%)]" aria-hidden />
              <Star className="pointer-events-none absolute -end-10 -top-12 text-gold opacity-[0.06]" size={180} />
              <div className="relative grid divide-y divide-white/10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0 rtl:lg:divide-x-reverse">
                <div className="flex items-center gap-3.5 px-6 py-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gold/25 bg-navy-light/90 text-gold">
                    <Icon name="plug" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Connected services')}</p>
                    <div className="mt-1 flex h-7 items-center gap-2">
                      <span className="num text-[22px] font-bold leading-none">
                        {liveCount}
                        <span className="text-[14px] font-medium text-onnavy-muted"> / {items.length}</span>
                      </span>
                      <span className="inline-flex h-5 items-center rounded-xs bg-gold/15 px-1.5 text-[10.5px] font-semibold leading-none text-gold">
                        {liveCount > 0 ? t('Live') : t('Simulation')}
                      </span>
                    </div>
                  </div>
                </div>

                <Link href="/app/integration-message" className="group flex items-center gap-3.5 px-6 py-4 transition-colors hover:bg-white/[0.04]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-onnavy-secondary">
                    <Icon name="send" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Outbox queue')}</p>
                    <div className="mt-1 flex h-7 items-center gap-2">
                      <span className="num text-[22px] font-bold leading-none">{d.outbox.pending}</span>
                      <span className={cn('inline-flex h-5 items-center rounded-xs px-1.5 text-[10.5px] font-semibold leading-none', d.outbox.failed ? 'bg-[#F87171]/20 text-[#FCA5A5]' : 'bg-positive/15 text-positive')}>
                        {d.outbox.failed ? `${d.outbox.failed} ${t('failed')}` : t('Healthy')}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="shrink-0 text-onnavy-muted opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                </Link>

                <div className="flex items-center gap-3.5 px-6 py-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-gold">
                    <Icon name="activity" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('7-day traffic')}</p>
                    <div className="mt-1 flex h-7 items-center gap-2">
                      <span className="num text-[22px] font-bold leading-none">{fmtNum(total7dCalls, lang, 0)}</span>
                      <span className={cn('num inline-flex h-5 items-center rounded-xs px-1.5 text-[10.5px] font-semibold leading-none', total7dErrors ? 'bg-[#F87171]/20 text-[#FCA5A5]' : 'bg-white/10 text-onnavy-secondary')}>
                        {total7dErrors} {t('Errors')}
                      </span>
                    </div>
                  </div>
                </div>

                <Link href="/app/assistant" className="group flex items-center gap-3.5 px-6 py-4 transition-colors hover:bg-white/[0.04]">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gold/25 bg-gold/10 text-gold">
                    <Icon name="sparkles" size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('AI / LLM Engine')}</p>
                    <div className="mt-1 flex h-7 items-center gap-2">
                      <span className="truncate text-[19px] font-bold leading-none">{d.live.llm ? t('Live') : t('Local rules')}</span>
                      <span className="inline-flex h-5 shrink-0 items-center rounded-xs bg-white/10 px-1.5 text-[10.5px] font-semibold leading-none text-onnavy-secondary">
                        {d.live.llm ? 'API' : t('Built-in')}
                      </span>
                    </div>
                  </div>
                  <ArrowUpRight size={14} className="shrink-0 text-onnavy-muted opacity-0 transition-opacity group-hover:opacity-100 rtl:-scale-x-100" />
                </Link>
              </div>
            </Card>

            {/* Row 2: Clean 4-column Connector Catalog (8 balanced cards!) */}
            <section className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-card-title text-fg">{t('External connectors')}</h2>
                  <p className="text-caption text-muted">{t('Live status and 7-day activity for every external integration')}</p>
                </div>
                <div className="inline-flex rounded-sm border border-line bg-card p-0.5">
                  {([
                    ['all', `${t('All')} (${items.length})`],
                    ['finance', t('Finance')],
                    ['messaging', t('Messaging')],
                    ['intelligence', t('Intelligence')],
                  ] as const).map(([k, l]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setCat(k)}
                      className={cn(
                        'rounded-xs px-3 py-1.5 text-caption font-semibold transition-colors',
                        cat === k ? 'bg-navy text-white' : 'text-strong hover:bg-soft hover:text-fg'
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {filtered.map(({ meta, live, stats }) => {
                  const ok = stats?.ok ?? 0;
                  const err = stats?.error ?? 0;
                  const retry = stats?.retry ?? 0;
                  const calls = ok + err + retry;
                  return (
                    <Card
                      key={meta.key}
                      className={cn(
                        'group relative flex flex-col justify-between overflow-hidden transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-[2px] hover:border-gold-border hover:shadow-[0_10px_24px_rgba(11,31,58,0.07)]',
                        live ? 'before:bg-success' : 'before:bg-gold/70'
                      )}
                    >
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-2">
                          <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-md border', meta.tone)}>
                            <Icon name={meta.icon} size={19} />
                          </span>
                          <Badge tone={live ? 'success' : 'warn'} dot>
                            {live ? t('Live') : t('Simulated')}
                          </Badge>
                        </div>

                        <div className="mt-4">
                          <h3 className="truncate text-[15px] font-bold text-fg">{lang === 'ar' ? meta.nameAr : meta.nameEn}</h3>
                          <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted">{lang === 'ar' ? meta.descAr : meta.descEn}</p>
                        </div>
                      </div>

                      {/* Single crisp footer */}
                      <div className="flex items-center justify-between gap-2 border-t border-line/80 bg-soft/35 px-5 py-2.5 text-[11.5px]">
                        {calls > 0 ? (
                          <span className="num flex min-w-0 items-center gap-2 truncate">
                            <span className="font-semibold text-fg">{calls} {t('calls')}</span>
                            {err > 0 ? (
                              <span className="font-semibold text-danger">· {err} {t('Errors')}</span>
                            ) : (
                              <span className="text-success">· 100% OK</span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted">
                            <Clock size={12} className="shrink-0 opacity-70" />
                            <span>{t('Idle · 7d')}</span>
                          </span>
                        )}
                        <Link
                          href={`/app/integration-message?q=${meta.key}`}
                          title={stats?.last ? `${t('Last call')} ${fmtDateTime(stats.last, lang)}` : undefined}
                          className="inline-flex shrink-0 items-center gap-0.5 font-semibold text-navy transition-colors group-hover:text-gold-text"
                        >
                          <span>{t('Logs')}</span>
                          <ArrowUpRight size={12} className="rtl:-scale-x-100" />
                        </Link>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>

            {/* Row 3: Daftra Transition + Clean Divided Background Jobs List */}
            <div className="grid gap-5 xl:grid-cols-[1fr_1.35fr]">
              {/* Daftra Ledger Transition */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader
                  title={t('Daftra transition')}
                  sub={t('The ERP is the book of record. Daftra stays in sync until cut-over, then becomes a read-only archive.')}
                  actions={
                    r ? (
                      <Badge tone={r.mode === 'push' ? 'warn' : 'success'} dot>
                        {r.mode === 'push' ? t('Parallel sync') : t('Read-only archive')}
                      </Badge>
                    ) : undefined
                  }
                />
                {daf.isLoading ? (
                  <div className="p-5">
                    <SkeletonCards n={2} />
                  </div>
                ) : r ? (
                  <div className="flex flex-1 flex-col gap-5 p-6 pt-4">
                    {/* 3-step visual readiness stepper */}
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        [t('1. Parallel sync'), r.syncedInvoices >= r.issuedInvoices],
                        [t('2. Trial balance'), Boolean(r.trialBalance.balanced)],
                        [t('3. Cut-over'), r.mode !== 'push'],
                      ].map(([label, done]) => (
                        <div
                          key={String(label)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-sm border px-2.5 py-2 text-[11.5px] font-semibold',
                            done ? 'border-success/30 bg-success-bg/60 text-success' : 'border-line bg-soft/40 text-muted'
                          )}
                        >
                          <CheckCircle2 size={13} className={done ? 'shrink-0 text-success' : 'shrink-0 opacity-40'} />
                          <span className="truncate">{label}</span>
                        </div>
                      ))}
                    </div>

                    {/* Sync progress */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between text-caption">
                        <span className="font-medium text-muted">{t('Invoice sync progress')}</span>
                        <span className="num font-semibold text-fg">
                          {r.syncedInvoices} / {r.issuedInvoices} ({fmtNum(syncPct, lang, 0)}%)
                        </span>
                      </div>
                      <Progress value={syncPct} tone={syncPct >= 100 ? 'gold' : 'navy'} />
                    </div>

                    {/* Clean divided metrics */}
                    <dl className="divide-y divide-line border-y border-line text-small">
                      {[
                        [t('Mode'), <span key="m" className="capitalize">{r.mode}</span>],
                        [t('Issued invoices'), r.issuedInvoices],
                        [t('Synced'), r.syncedInvoices],
                        [t('Sync errors'), <span key="e" className={r.syncErrors ? 'text-danger' : 'text-success'}>{r.syncErrors}</span>],
                      ].map(([l, v]) => (
                        <div key={String(l)} className="flex items-center justify-between py-2.5">
                          <dt className="text-muted">{l}</dt>
                          <dd className="num font-semibold text-fg">{v}</dd>
                        </div>
                      ))}
                    </dl>

                    {/* Trial balance verification banner */}
                    <div
                      className={cn(
                        'flex items-center gap-2.5 rounded-md border px-3.5 py-3 text-small font-medium',
                        r.trialBalance.balanced
                          ? 'border-success/30 bg-success-bg/60 text-success'
                          : 'border-danger/30 bg-danger-bg/60 text-danger'
                      )}
                    >
                      {r.trialBalance.balanced ? <CheckCircle2 size={17} className="shrink-0" /> : <AlertTriangle size={17} className="shrink-0" />}
                      <span>{r.trialBalance.balanced ? t('Trial balance is balanced') : t('Trial balance is NOT balanced')}</span>
                    </div>

                    <div className="mt-auto">
                      {r.mode === 'push' ? (
                        <Button variant={r.readyForCutover ? 'primary' : 'secondary'} onClick={() => setCut(true)} icon="flag" className="w-full">
                          {t('Cut over to the ERP ledger')}
                        </Button>
                      ) : (
                        <Badge tone="success" dot>
                          {t('Cut-over done: Daftra is read-only')}
                        </Badge>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="p-6 text-small text-muted">{t('Only finance can see this.')}</p>
                )}
              </Card>

              {/* Background Jobs — sleek divided command list (zero nested boxes!) */}
              <Card className="overflow-hidden">
                <CardHeader
                  title={t('Background jobs')}
                  sub={t('Trigger scheduled maintenance, scoring and compliance jobs on demand.')}
                  actions={<Badge tone="muted">{JOBS.length}</Badge>}
                />
                <ul className="mt-3 divide-y divide-line border-t border-line">
                  {JOBS.map((j) => {
                    const running = job.isPending && job.variables === j.key;
                    const result = lastRun[j.key];
                    return (
                      <li key={j.key} className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-soft/45">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', j.tone)}>
                            <Icon name={j.icon} size={16} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-small font-semibold text-fg">{lang === 'ar' ? j.titleAr : j.titleEn}</p>
                              {result && (
                                <span className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-xs bg-success-bg px-1.5 py-0.5 text-[11px] font-semibold text-success">
                                  <CheckCircle2 size={11} className="shrink-0" />
                                  <span className="truncate">{result}</span>
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-caption text-muted">{lang === 'ar' ? j.descAr : j.descEn}</p>
                          </div>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={running}
                          onClick={() => job.mutate(j.key)}
                          className="shrink-0 gap-1.5"
                        >
                          {!running && <Play size={12} />}
                          <span>{t('Run')}</span>
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>
          </div>
        )
      )}

      <ConfirmDialog
        open={cut}
        onClose={() => setCut(false)}
        onConfirm={() => cutover.mutate()}
        loading={cutover.isPending}
        danger
        title={t('Cut over from Daftra')}
        message={t('Daftra becomes read-only and no more data is pushed to it. This is done once, after the parallel run is reconciled.')}
        confirmText={t('Cut over')}
      />
    </div>
  );
}
