'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Check, Clock, RefreshCw, Search, ShieldCheck, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime, fmtMoney, fmtNum, timeAgo } from '@/lib/format';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Icon, Input, Modal, SkeletonBlock, SkeletonCards, Star, Textarea, cn, toast } from '@/components/ui';
import { DashHeader } from '@/components/erp/dash';

const SLUG: Record<string, string> = {
  Quotation: 'quotation',
  PurchaseOrder: 'purchase-order',
  CreditHold: 'credit-hold',
  Expense: 'expense',
  ReturnAuth: 'return-auth',
  DiscountRequest: 'discount-request',
};

const ICON: Record<string, { icon: string; tone: string }> = {
  margin: { icon: 'percent', tone: 'bg-gold-light text-gold-text' },
  credit: { icon: 'octagon-alert', tone: 'bg-warn-bg text-warn' },
  purchase_order: { icon: 'shopping-basket', tone: 'bg-info-bg text-info' },
  discount: { icon: 'badge-percent', tone: 'bg-gold-light text-gold-text' },
  expense: { icon: 'wallet', tone: 'bg-soft text-navy' },
  return: { icon: 'undo-2', tone: 'bg-danger-bg text-danger' },
};

/** Split structured approval reason ("Who: trigger: numbers") into clean visual tiers. */
function parseReason(r: string, lang: 'en' | 'ar') {
  const [who, what, ...rest] = String(r ?? '').split(': ');
  if (!what) return { title: who, what: '', detail: '' };
  const rawDetail = rest.join(': ').replace(/\d{1,3}(?:,?\d{3})*\.\d{2}/g, (n) => fmtNum(n.replace(/,/g, ''), lang, 2));
  const detail = rawDetail ? rawDetail.charAt(0).toUpperCase() + rawDetail.slice(1) : '';
  return { title: who, what, detail };
}

export default function ApprovalsPage() {
  const { t, lang, el } = useT();
  const qc = useQueryClient();
  const [rej, setRej] = useState<any>(null);
  const [note, setNote] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const q = useQuery({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => api<{ data: any[] }>('/api/v1/approvals/inbox'),
    refetchInterval: 30000,
  });

  const act = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note?: string }) =>
      api<any>(`/api/v1/r/approval-request/${id}/actions/${action}`, { method: 'POST', body: { note } }),
    onSuccess: (r) => {
      toast.success(r.message ?? t('Done'));
      setRej(null);
      setNote('');
      qc.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = q.data?.data ?? [];
  const totalValue = useMemo(() => rows.reduce((s, r) => s + Number(r.amount ?? 0), 0), [rows]);
  const overdueCount = useMemo(() => rows.filter((r) => r.overdue).length, [rows]);
  const escalatedCount = useMemo(() => rows.filter((r) => r.status === 'escalated').length, [rows]);
  const types = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.type, (map.get(r.type) ?? 0) + 1);
    return [...map.entries()];
  }, [rows]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((a) => {
      if (typeFilter === 'overdue' && !a.overdue) return false;
      if (typeFilter !== 'all' && typeFilter !== 'overdue' && a.type !== typeFilter) return false;
      if (!s) return true;
      return `${a.reason ?? ''} ${a.requestedBy ?? ''} ${a.type ?? ''} ${a.stepRole ?? ''}`.toLowerCase().includes(s);
    });
  }, [rows, typeFilter, search]);

  return (
    <div className="space-y-5">
      <DashHeader
        title={t('Approvals')}
        sub={q.data ? (rows.length ? `${rows.length} ${t('waiting for you')}` : t('Everything is on track')) : undefined}
        actions={
          <Button variant="secondary" size="sm" onClick={() => q.refetch()} className="!h-9 gap-1.5">
            <RefreshCw size={14} className={cn(q.isFetching && 'animate-spin')} />
            <span>{t('Refresh')}</span>
          </Button>
        }
      />

      {q.isLoading ? (
        <div className="space-y-4">
          <SkeletonCards n={4} />
          <div className="grid gap-4 xl:grid-cols-2">
            <SkeletonBlock h="h-56" />
            <SkeletonBlock h="h-56" />
          </div>
        </div>
      ) : q.isError ? (
        <Card>
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="check-circle-2" title={t('Nothing to approve')} desc={t('New approval requests will appear here and in your notifications.')} />
        </Card>
      ) : (
        <>
          {/* Compact Midnight Navy Executive Summary Strip */}
          <Card className="relative overflow-hidden border-navy bg-gradient-to-r from-[#0F2A4F] via-[#0B1F3A] to-[#08172E] text-white shadow-[0_8px_24px_rgba(11,31,58,0.14)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_20%,rgba(214,161,58,0.18),transparent_50%)]" aria-hidden />
            <Star className="pointer-events-none absolute -end-10 -top-12 text-gold opacity-[0.06]" size={180} />
            <div className="relative grid divide-y divide-white/10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-y-0 rtl:lg:divide-x-reverse">
              <div className="flex items-center gap-3.5 px-6 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-gold/25 bg-navy-light/90 text-gold">
                  <Icon name="check-circle-2" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Pending approvals')}</p>
                  <div className="mt-1 flex h-7 items-center gap-2">
                    <span className="num text-[22px] font-bold leading-none">{rows.length}</span>
                    <span className="inline-flex h-5 items-center rounded-xs bg-gold/15 px-1.5 text-[10.5px] font-semibold leading-none text-gold">{t('Action required')}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-6 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-gold">
                  <Icon name="wallet" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Total value')}</p>
                  <div className="mt-1 flex h-7 items-center gap-2">
                    <span className="num truncate text-[20px] font-bold leading-none">{fmtMoney(totalValue, lang)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-6 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-onnavy-secondary">
                  <Icon name="clock" size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Overdue')}</p>
                  <div className="mt-1 flex h-7 items-center gap-2">
                    <span className="num text-[22px] font-bold leading-none">{overdueCount}</span>
                    <span className={cn('inline-flex h-5 items-center rounded-xs px-1.5 text-[10.5px] font-semibold leading-none', overdueCount > 0 ? 'bg-[#F87171]/20 text-[#FCA5A5]' : 'bg-positive/15 text-positive')}>
                      {overdueCount > 0 ? t('Urgent') : t('On schedule')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3.5 px-6 py-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-white/10 bg-white/[0.06] text-onnavy-secondary">
                  <ShieldCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-onnavy-muted">{t('Escalated')}</p>
                  <div className="mt-1 flex h-7 items-center gap-2">
                    <span className="num text-[22px] font-bold leading-none">{escalatedCount}</span>
                    <span className="inline-flex h-5 items-center rounded-xs bg-white/10 px-1.5 text-[10.5px] font-semibold leading-none text-onnavy-secondary">
                      {types.length} {types.length === 1 ? t('category') : t('categories')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Filter & Search Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap rounded-sm border border-line bg-card p-0.5">
              <button
                type="button"
                onClick={() => setTypeFilter('all')}
                className={cn(
                  'rounded-xs px-3 py-1.5 text-caption font-semibold transition-colors',
                  typeFilter === 'all' ? 'bg-navy text-white' : 'text-strong hover:bg-soft hover:text-fg'
                )}
              >
                {t('All')} ({rows.length})
              </button>
              {types.map(([typeKey, count]) => (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setTypeFilter(typeKey)}
                  className={cn(
                    'rounded-xs px-3 py-1.5 text-caption font-semibold transition-colors',
                    typeFilter === typeKey ? 'bg-navy text-white' : 'text-strong hover:bg-soft hover:text-fg'
                  )}
                >
                  {el(typeKey)} ({count})
                </button>
              ))}
              {overdueCount > 0 && (
                <button
                  type="button"
                  onClick={() => setTypeFilter('overdue')}
                  className={cn(
                    'rounded-xs px-3 py-1.5 text-caption font-semibold transition-colors',
                    typeFilter === 'overdue' ? 'bg-danger text-white' : 'text-danger hover:bg-danger-bg/60'
                  )}
                >
                  {t('Overdue')} ({overdueCount})
                </button>
              )}
            </div>

            <div className="relative w-full sm:w-64">
              <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Filter approvals...')}
                className="!h-9 bg-card ps-9 pe-8 text-small"
                aria-label={t('Filter approvals...')}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute end-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg"
                  aria-label={t('Clear')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Decision Cards Grid */}
          {visible.length === 0 ? (
            <Card>
              <EmptyState
                icon="search-x"
                title={t('No results found')}
                desc={t('Try a different search or clear the filters.')}
                action={
                  <Button variant="secondary" size="sm" onClick={() => { setTypeFilter('all'); setSearch(''); }}>
                    {t('Reset')}
                  </Button>
                }
              />
            </Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visible.map((a) => {
                const parsed = parseReason(a.reason, lang);
                const meta = ICON[a.type] ?? { icon: 'check-circle-2', tone: 'bg-gold-light text-gold-text' };
                const recordHref = SLUG[a.refType] ? `/app/${SLUG[a.refType]}/${a.refId}` : null;
                const requester = String(a.requestedBy ?? '').replace(/\s*\([^)]*\)/g, '').trim() || a.requestedBy;
                const approving = act.isPending && act.variables?.id === a.id && act.variables?.action === 'approve';
                return (
                  <Card
                    key={a.id}
                    className={cn(
                      'group relative flex flex-col overflow-hidden transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-[2px] hover:border-gold-border hover:shadow-[0_10px_24px_rgba(11,31,58,0.07)]',
                      a.overdue ? 'before:bg-danger' : 'before:bg-gold'
                    )}
                  >
                    {/* Card top header: icon + type badges + amount */}
                    <div className="flex items-start justify-between gap-4 px-5 pb-3 pt-5">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-md', a.overdue ? 'bg-danger-bg text-danger' : meta.tone)}>
                          <Icon name={meta.icon} size={19} />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge tone="gold" className="!h-5 !px-2 !text-[11px] leading-none">{el(a.type)}</Badge>
                            <span className="num inline-flex h-5 items-center rounded-xs border border-line bg-soft/60 px-2 text-[11px] font-semibold leading-none text-muted">
                              {t('Step')} {a.currentStep + 1}/{(a.steps as any[]).length}
                            </span>
                            {a.status === 'escalated' && <Badge tone="danger" className="!h-5 !px-2 !text-[11px] leading-none">{t('Escalated')}</Badge>}
                            {a.overdue && <Badge tone="danger" dot className="!h-5 !px-2 !text-[11px] leading-none">{t('Overdue')}</Badge>}
                          </div>
                          <p className="mt-1 truncate text-caption leading-4 text-muted">
                            {el(String(a.stepRole ?? ''))} · {timeAgo(a.createdAt, lang)}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 text-end">
                        <p className="num flex h-5 items-center justify-end text-[19px] font-bold leading-none tracking-tight text-navy">{fmtMoney(a.amount, lang)}</p>
                        <p className={cn('num mt-1 inline-flex h-4 items-center gap-1 text-[11px] leading-none', a.overdue ? 'font-semibold text-danger' : 'text-muted')}>
                          <Clock size={11} />
                          <span>{fmtDateTime(a.dueAt, lang)}</span>
                        </p>
                      </div>
                    </div>

                    {/* Clean structured reason body */}
                    <div className="flex-1 space-y-2 px-5 pb-4">
                      <div>
                        <h3 className="text-[15.5px] font-bold leading-snug text-fg">{parsed.title}</h3>
                        {parsed.what && (
                          <p className={cn('mt-0.5 text-small font-semibold', a.overdue ? 'text-danger' : 'text-gold-text')}>
                            {parsed.what}
                          </p>
                        )}
                      </div>
                      {parsed.detail && (
                        <p className="num rounded-sm border border-line/80 bg-soft/55 px-3 py-2 text-caption font-medium text-strong">
                          {parsed.detail}
                        </p>
                      )}
                    </div>

                    {/* Requester + Action Footer */}
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line bg-soft/30 px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Button size="sm" className="!h-9 gap-1.5 !px-3.5" loading={approving} onClick={() => act.mutate({ id: a.id, action: 'approve' })}>
                          {!approving && <Check size={14} />}
                          <span>{t('Approve')}</span>
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="!h-9 gap-1.5 !px-3 text-danger hover:border-danger/40 hover:bg-danger-bg/60"
                          onClick={() => setRej(a)}
                        >
                          <X size={14} />
                          <span>{t('Reject')}</span>
                        </Button>
                      </div>

                      <div className="flex items-center gap-3 text-caption">
                        <span className="hidden items-center gap-1.5 text-muted sm:inline-flex" title={a.requestedBy}>
                          <Avatar name={requester} size={22} />
                          <span className="max-w-[140px] truncate font-medium text-strong">{requester}</span>
                        </span>
                        <span className="hidden h-3.5 w-px bg-line sm:inline-block" aria-hidden />
                        <div className="flex items-center gap-2.5">
                          {recordHref && (
                            <Link href={recordHref} className="inline-flex items-center gap-0.5 font-semibold text-navy hover:underline">
                              <span>{t('Record')}</span>
                              <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                            </Link>
                          )}
                          <Link href={`/app/approval-request/${a.id}`} className="font-semibold text-muted transition-colors hover:text-navy hover:underline">
                            {t('Details')}
                          </Link>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      <Modal
        open={!!rej}
        onClose={() => setRej(null)}
        title={t('Reject request')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRej(null)}>
              {t('Cancel')}
            </Button>
            <Button variant="danger" disabled={!note.trim()} loading={act.isPending} onClick={() => act.mutate({ id: rej.id, action: 'reject', note })}>
              {t('Reject')}
            </Button>
          </>
        }
      >
        {rej && (
          <div className="mb-4 rounded-md border border-line bg-soft/50 p-3 text-small">
            <p className="font-semibold text-fg">{parseReason(rej.reason, lang).title}</p>
            <p className="mt-0.5 text-caption text-muted">{parseReason(rej.reason, lang).what} · {fmtMoney(rej.amount, lang)}</p>
          </div>
        )}
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('Reason for rejecting')} autoFocus />
      </Modal>
    </div>
  );
}
