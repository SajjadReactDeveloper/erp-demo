'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  CreditCard,
  Minus,
  MonitorSmartphone,
  Plus,
  ReceiptText,
  ScanLine,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtMoney, fmtNum } from '@/lib/format';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  NoAccess,
  PageHeader,
  Select,
  Skeleton,
  SkeletonRows,
  Star,
  StatusBadge,
  cn,
  toast,
} from '@/components/ui';
import { RefPicker, useDebounced } from '@/components/erp/fields';

interface Line { partId: string; label: string; qty: number; unitPrice: number }
const METHODS = ['cash', 'mada', 'card', 'voucher', 'points'];
const FLOATS = ['0', '500', '1000', '2000'];

export default function PosPage() {
  const { t, lang, el } = useT();
  const { me, can, ready } = useAuth();
  const qc = useQueryClient();

  const terms = useQuery({ queryKey: ['pos-terminals'], queryFn: () => api<{ data: any[] }>('/api/v1/r/pos-terminal', { query: { limit: 20 } }) });
  const [terminalId, setTerminal] = useState('');
  useEffect(() => {
    if (!terminalId && terms.data?.data[0]) setTerminal(terms.data.data[0].id);
  }, [terms.data, terminalId]);

  const activeTerm = terms.data?.data.find((x) => x.id === terminalId);
  const shift = useQuery({
    queryKey: ['pos-shift', terminalId],
    enabled: !!terminalId,
    queryFn: () => api<{ data: any[] }>('/api/v1/r/pos-shift', { query: { 'f.terminalId': terminalId, 'f.status': 'open', limit: 1 } }),
  });
  const recentShifts = useQuery({
    queryKey: ['pos-shifts-recent', terminalId],
    enabled: !!terminalId,
    queryFn: () => api<{ data: any[] }>('/api/v1/r/pos-shift', { query: { 'f.terminalId': terminalId, limit: 5, sort: 'openedAt:desc' } }),
  });

  const open = shift.data?.data[0];
  const [openCash, setOpenCash] = useState('0');
  const [closing, setClosing] = useState(false);
  const [counted, setCounted] = useState('');

  const openShift = useMutation({
    mutationFn: () => api('/api/v1/r/pos-shift', { method: 'POST', body: { terminalId, openingCash: openCash || '0' } }),
    onSuccess: () => {
      toast.success(t('Shift opened'));
      qc.invalidateQueries({ queryKey: ['pos-shift'] });
      qc.invalidateQueries({ queryKey: ['pos-shifts-recent'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const closeShift = useMutation({
    mutationFn: () => api<any>(`/api/v1/r/pos-shift/${open.id}/actions/close`, { method: 'POST', body: { countedCash: Number(counted) } }),
    onSuccess: (r) => {
      toast.success(r.message);
      setClosing(false);
      setCounted('');
      qc.invalidateQueries({ queryKey: ['pos-shift'] });
      qc.invalidateQueries({ queryKey: ['pos-shifts-recent'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [cart, setCart] = useState<Line[]>([]);
  const [customerId, setCustomer] = useState<string | null>(null);
  const [pays, setPays] = useState<{ method: string; amount: string; reference: string }[]>([{ method: 'cash', amount: '', reference: '' }]);
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const scan = useRef<HTMLInputElement>(null);

  const found = useQuery({
    queryKey: ['pos-search', dq],
    enabled: dq.length >= 2,
    queryFn: () => api<{ data: any[] }>('/api/v1/r/part', { query: { q: dq, limit: 8, 'f.status': 'active' } }),
  });

  const total = cart.reduce((s, l) => s + l.qty * l.unitPrice * 1.15, 0);
  const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const add = (p: any) => {
    setCart((c) => {
      const i = c.findIndex((x) => x.partId === p.id);
      if (i >= 0) return c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x));
      return [...c, { partId: p.id, label: `${p.partNumber} — ${p.name}`, qty: 1, unitPrice: Number(p.marketCeiling ?? 0) }];
    });
    setQ('');
    scan.current?.focus();
  };

  const onScan = async (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter' || !q.trim()) return;
    const r = await api<{ data: any[] }>('/api/v1/r/part', { query: { q: q.trim(), limit: 1 } }).catch(() => null);
    if (r?.data[0]) add(r.data[0]);
    else toast.error(t('Item not found'));
  };

  const sale = useMutation({
    mutationFn: async () => {
      const s = await api<any>('/api/v1/r/pos-sale', {
        method: 'POST',
        body: {
          terminalId,
          customerId,
          children: {
            PosSaleLine: cart.map((l) => ({ partId: l.partId, qty: l.qty, unitPrice: l.unitPrice })),
            PosPayment: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: p.amount, reference: p.reference || undefined })),
          },
        },
      });
      return api<any>(`/api/v1/r/pos-sale/${s.data.id}/actions/pay`, { method: 'POST', body: {} });
    },
    onSuccess: (r) => {
      toast.success(r.message, {
        action: r.result?.invoiceId ? { label: t('Receipt'), onClick: () => openDoc(`/api/v1/docs/invoice/${r.result.invoiceId}`) } : undefined,
        duration: 10000,
      });
      setCart([]);
      setPays([{ method: 'cash', amount: '', reference: '' }]);
      setCustomer(null);
      scan.current?.focus();
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (ready && !can({ mod: 'pos', slug: 'pos-sale' })) return <NoAccess />;
  if (terms.isLoading) return <Skeleton className="h-96 w-full" />;
  if (terms.isError) return <ErrorState error={terms.error} onRetry={() => terms.refetch()} />;

  const shiftsList = recentShifts.data?.data ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Point of sale')}
        sub={open ? `${activeTerm?.name ?? ''} · ${t('Shift open')}` : t('Counter checkout, split payments and instant ZATCA receipts.')}
        actions={
          <>
            <Select value={terminalId} onChange={(e) => setTerminal(e.target.value)} className="w-48">
              {terms.data!.data.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </Select>
            {open && (
              <Button variant="secondary" icon="log-out" onClick={() => setClosing(true)}>
                {t('Close shift')}
              </Button>
            )}
          </>
        }
      />

      {shift.isLoading ? (
        <Skeleton className="h-80 w-full" />
      ) : !open ? (
        <div className="space-y-5">
          {/* Split Navy Hero + Shift Open Card */}
          <Card className="overflow-hidden">
            <div className="grid lg:grid-cols-[1.2fr_1fr]">
              {/* Left Navy visual panel */}
              <div className="relative flex flex-col justify-between overflow-hidden bg-[#0B1F3A] p-6 text-white sm:p-8">
                <Star size={190} className="pointer-events-none absolute -bottom-16 -start-12 text-gold opacity-[0.06]" />
                <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">
                    <MonitorSmartphone size={12} />
                    <span>{t('Counter terminal')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-xs bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-onnavy-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                    {t('Shift closed')}
                  </span>
                </div>

                <div className="relative z-10 mt-4">
                  <h2 className="text-[22px] font-bold leading-tight tracking-tight sm:text-[24px]">
                    {activeTerm?.name ?? t('Point of sale')}
                  </h2>
                  <p className="mt-1.5 max-w-md text-small leading-relaxed text-onnavy-secondary">
                    {t('Open a shift with the opening cash in the drawer to start selling.')}
                  </p>
                </div>

                {/* Custom POS editorial illustration */}
                <div className="relative my-5 overflow-hidden rounded-md">
                  <img
                    src="/images/pos-hero.jpg"
                    alt=""
                    aria-hidden
                    className="mx-auto max-h-[200px] w-full object-contain"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-transparent to-[#0B1F3A]/40" />
                </div>

                <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-caption text-onnavy-muted">
                  <span className="inline-flex items-center gap-1.5">
                    <ScanLine size={14} className="text-gold" />
                    <span>{t('Barcode & part search')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <CreditCard size={14} className="text-gold" />
                    <span>{t('Split payments')}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <ReceiptText size={14} className="text-gold" />
                    <span>{t('Instant ZATCA receipt')}</span>
                  </span>
                </div>
              </div>

              {/* Right shift-opening form panel */}
              <div className="flex flex-col justify-between bg-card p-6 sm:p-8">
                <div>
                  <p className="overline text-muted">{t('Start selling')}</p>
                  <h3 className="mt-1 text-[19px] font-bold text-fg">{t('Open a new shift')}</h3>
                  <p className="mt-1 text-small text-muted">
                    {t('Count the cash float in the drawer and enter it below to activate this counter.')}
                  </p>

                  {/* Counter & cashier summary */}
                  <div className="mt-5 grid grid-cols-2 divide-x divide-line border border-line bg-soft/45 rtl:divide-x-reverse">
                    <div className="px-3.5 py-2.5">
                      <p className="text-[11px] font-medium text-muted">{t('Terminal')}</p>
                      <p className="mt-0.5 truncate text-small font-semibold text-fg">{activeTerm?.name ?? '—'}</p>
                    </div>
                    <div className="px-3.5 py-2.5">
                      <p className="text-[11px] font-medium text-muted">{t('Cashier')}</p>
                      <p className="mt-0.5 truncate text-small font-semibold text-fg">{me?.name ?? '—'}</p>
                    </div>
                  </div>

                  {/* Opening float form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      openShift.mutate();
                    }}
                    className="mt-5 space-y-4"
                  >
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label htmlFor="pos-open-cash" className="text-small font-semibold text-fg">
                          {t('Opening cash')}
                        </label>
                        <span className="text-caption text-muted">{t('Quick presets')}</span>
                      </div>
                      <div className="mb-2.5 grid grid-cols-4 gap-1.5">
                        {FLOATS.map((amt) => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => setOpenCash(amt)}
                            className={cn(
                              'num h-8 rounded-xs border text-caption font-semibold transition-colors',
                              openCash === amt
                                ? 'border-navy bg-navy text-white'
                                : 'border-line bg-soft/60 text-strong hover:border-gold-border hover:bg-card'
                            )}
                          >
                            {lang === 'ar' ? `${amt} ر.س` : `SAR ${amt}`}
                          </button>
                        ))}
                      </div>
                      <div className="relative" dir="ltr">
                        <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-caption font-semibold text-muted">
                          {lang === 'ar' ? 'ر.س' : 'SAR'}
                        </span>
                        <Input
                          id="pos-open-cash"
                          type="number"
                          min="0"
                          step="any"
                          value={openCash}
                          onChange={(e) => setOpenCash(e.target.value)}
                          dir="ltr"
                          className="num ps-12 text-base font-semibold"
                        />
                      </div>
                    </div>

                    <Button type="submit" size="lg" className="w-full" loading={openShift.isPending}>
                      {t('Open shift')}
                    </Button>
                  </form>
                </div>

                <div className="mt-6 flex items-start gap-2 border-t border-line pt-4 text-caption text-muted">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0 text-success" />
                  <span>{t('Any difference is sent to a manager for approval before it is posted.')}</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Bottom informative row: recent shifts + counter readiness */}
          <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
            <Card className="overflow-hidden">
              <CardHeader
                title={t('Recent shifts')}
                sub={activeTerm?.name}
                actions={
                  <Link href="/app/pos-shift" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">
                    {t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" />
                  </Link>
                }
              />
              {recentShifts.isLoading ? (
                <SkeletonRows rows={3} cols={4} />
              ) : shiftsList.length === 0 ? (
                <div className="flex items-center gap-3 px-6 py-8 text-small text-muted">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-soft text-muted">
                    <Banknote size={18} />
                  </span>
                  <div>
                    <p className="font-semibold text-fg">{t('No previous shifts on this terminal')}</p>
                    <p className="text-caption text-muted">{t('Completed cash-ups and drawer counts will appear here.')}</p>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto px-3 pb-3 pt-2">
                  <table className="w-full min-w-[460px] text-small">
                    <thead>
                      <tr className="bg-soft text-caption font-semibold text-strong">
                        <th className="rounded-s-sm px-4 py-2.5 text-start">{t('Cashier')}</th>
                        <th className="px-4 py-2.5 text-start">{t('Opened')}</th>
                        <th className="px-4 py-2.5 text-end">{t('Opening cash')}</th>
                        <th className="px-4 py-2.5 text-end">{t('Counted')}</th>
                        <th className="rounded-e-sm px-4 py-2.5 text-start">{t('Status')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {shiftsList.map((s: any) => (
                        <tr key={s.id} className="hover:bg-soft/40">
                          <td className="px-4 py-3 font-medium text-fg">{s._refs?.cashierId?.label ?? '—'}</td>
                          <td className="num px-4 py-3 text-caption text-muted">{fmtDateTime(s.openedAt ?? s.createdAt, lang)}</td>
                          <td className="num px-4 py-3 text-end font-semibold">{fmtMoney(s.openingCash, lang)}</td>
                          <td className="num px-4 py-3 text-end text-muted">{s.countedCash != null ? fmtMoney(s.countedCash, lang) : '—'}</td>
                          <td className="px-4 py-3">
                            <StatusBadge value={s.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card className="flex flex-col justify-between p-5">
              <div>
                <p className="overline text-muted">{t('Counter readiness')}</p>
                <ul className="mt-3 space-y-2.5">
                  {[
                    [t('Verify cash float'), t('Match physical notes & coins with the opening amount.')],
                    [t('Barcode scanner ready'), t('Press Enter after scanning any part number or SKU.')],
                    [t('ZATCA simplified invoice'), t('Every completed sale issues a printable tax receipt.')],
                  ].map(([title, desc]) => (
                    <li key={title} className="flex items-start gap-2.5">
                      <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-gold-text" />
                      <div className="min-w-0">
                        <p className="text-small font-semibold text-fg">{title}</p>
                        <p className="text-caption text-muted">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <p className="overline mb-2 text-muted">{t('Accepted payments')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {METHODS.map((m) => (
                    <Badge key={m} tone="muted">
                      {el(m)}
                    </Badge>
                  ))}
                </div>
              </div>
            </Card>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <Card className="p-4">
              <div className="relative">
                <ScanLine size={18} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-primary" />
                <Input
                  ref={scan}
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onKeyDown={onScan}
                  placeholder={t('Scan a barcode or search by part number / name')}
                  className="h-12 ps-10 text-base"
                  aria-label={t('Scan or type a barcode')}
                />
              </div>
              {dq.length >= 2 && (
                <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-md border border-line">
                  {found.isLoading ? (
                    <li className="p-3">
                      <Skeleton className="h-4 w-full" />
                    </li>
                  ) : found.data!.data.length === 0 ? (
                    <li className="p-4 text-center text-sm text-muted">{t('No results found')}</li>
                  ) : (
                    found.data!.data.map((p) => (
                      <li key={p.id}>
                        <button onClick={() => add(p)} className="flex w-full items-center justify-between gap-3 p-3 text-start hover:bg-primary/5">
                          <span className="min-w-0">
                            <b className="num block truncate text-sm">{p.partNumber}</b>
                            <span className="block truncate text-xs text-muted">{p.name}</span>
                          </span>
                          <span className="num text-sm font-semibold">{p.marketCeiling ? fmtMoney(p.marketCeiling, lang) : ''}</span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t('Cart')} sub={`${cart.length} ${t('lines')}`} />
              {cart.length === 0 ? (
                <EmptyState icon="shopping-cart" title={t('The cart is empty')} desc={t('Scan or search an item to add it.')} />
              ) : (
                <ul className="divide-y divide-line">
                  {cart.map((l, i) => (
                    <li key={l.partId} className="flex flex-wrap items-center gap-3 p-3">
                      <span className="min-w-0 flex-1">
                        <b className="block truncate text-sm">{l.label}</b>
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="secondary" aria-label="-" onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}>
                          <Minus size={14} />
                        </Button>
                        <span className="num w-8 text-center font-bold">{l.qty}</span>
                        <Button size="sm" variant="secondary" aria-label="+" onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}>
                          <Plus size={14} />
                        </Button>
                      </div>
                      <Input
                        type="number"
                        step="any"
                        value={l.unitPrice}
                        onChange={(e) => setCart(cart.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                        className="h-9 w-28"
                        dir="ltr"
                        aria-label={t('Unit price')}
                      />
                      <span className="num w-24 text-end font-bold">{fmtNum(l.qty * l.unitPrice * 1.15, lang)}</span>
                      <button onClick={() => setCart(cart.filter((_, j) => j !== i))} className="rounded-sm p-1.5 text-danger hover:bg-danger/10" aria-label={t('Remove')}>
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
            <Field label={t('Customer (optional)')}>
              <RefPicker resKey="Customer" value={customerId} onChange={setCustomer} placeholder={t('Walk-in customer')} />
            </Field>
            <div className="space-y-1 rounded-md bg-line/40 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted">{t('Subtotal')}</span>
                <span className="num">{fmtNum(total / 1.15, lang)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">VAT 15%</span>
                <span className="num">{fmtNum(total - total / 1.15, lang)}</span>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-xl font-extrabold">
                <span>{t('Total')}</span>
                <span className="num text-primary">{fmtMoney(total, lang)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-bold text-muted">{t('Payments (split allowed)')}</p>
              {pays.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <Select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} className="w-28">
                    {METHODS.map((m) => (
                      <option key={m} value={m}>
                        {el(m)}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="any"
                    placeholder={fmtNum(Math.max(0, total - paid + (Number(p.amount) || 0)), lang)}
                    value={p.amount}
                    onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
                    dir="ltr"
                    aria-label={t('Amount')}
                  />
                  {['voucher', 'card', 'mada'].includes(p.method) && (
                    <Input
                      placeholder={p.method === 'voucher' ? t('Code') : t('Ref')}
                      value={p.reference}
                      onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))}
                      className="w-24"
                      dir="ltr"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" icon="plus" onClick={() => setPays([...pays, { method: 'cash', amount: '', reference: '' }])}>
                  {t('Split payment')}
                </Button>
                <Button size="sm" variant="soft" onClick={() => setPays([{ method: pays[0].method, amount: String(total.toFixed(2)), reference: '' }])}>
                  {t('Exact amount')}
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{t('Change')}</span>
              <Badge tone={paid >= total ? 'success' : 'warn'}>{fmtMoney(Math.max(0, paid - total), lang)}</Badge>
            </div>
            <Button size="lg" className="w-full" disabled={!cart.length || paid + 0.005 < total} loading={sale.isPending} onClick={() => sale.mutate()}>
              {t('Complete sale')} · {fmtMoney(total, lang)}
            </Button>
          </Card>
        </div>
      )}

      <Modal
        open={closing}
        onClose={() => setClosing(false)}
        title={t('Close shift (cash-up)')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setClosing(false)}>
              {t('Cancel')}
            </Button>
            <Button loading={closeShift.isPending} disabled={counted === ''} onClick={() => closeShift.mutate()}>
              {t('Close shift')}
            </Button>
          </>
        }
      >
        <Field label={t('Counted cash in the drawer')} required>
          <Input type="number" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} dir="ltr" autoFocus />
        </Field>
        <p className="mt-2 text-xs text-muted">{t('Any difference is sent to a manager for approval before it is posted.')}</p>
      </Modal>
    </div>
  );
}
