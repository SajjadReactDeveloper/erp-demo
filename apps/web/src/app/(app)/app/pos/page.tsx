'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, ScanLine, Trash2 } from 'lucide-react';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtMoney, fmtNum } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Input, Modal, NoAccess, PageHeader, Select, Skeleton, cn, toast } from '@/components/ui';
import { RefPicker, useDebounced } from '@/components/erp/fields';

interface Line { partId: string; label: string; qty: number; unitPrice: number }
const METHODS = ['cash', 'mada', 'card', 'voucher', 'points'];

export default function PosPage() {
  const { t, lang } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient();
  const terms = useQuery({ queryKey: ['pos-terminals'], queryFn: () => api<{ data: any[] }>('/api/v1/r/pos-terminal', { query: { limit: 20 } }) });
  const [terminalId, setTerminal] = useState(''); useEffect(() => { if (!terminalId && terms.data?.data[0]) setTerminal(terms.data.data[0].id); }, [terms.data, terminalId]);
  const shift = useQuery({ queryKey: ['pos-shift', terminalId], enabled: !!terminalId, queryFn: () => api<{ data: any[] }>('/api/v1/r/pos-shift', { query: { 'f.terminalId': terminalId, 'f.status': 'open', limit: 1 } }) });
  const open = shift.data?.data[0];
  const [openCash, setOpenCash] = useState('0'); const [closing, setClosing] = useState(false); const [counted, setCounted] = useState('');
  const openShift = useMutation({ mutationFn: () => api('/api/v1/r/pos-shift', { method: 'POST', body: { terminalId, openingCash: openCash } }), onSuccess: () => { toast.success(t('Shift opened')); qc.invalidateQueries({ queryKey: ['pos-shift'] }); }, onError: (e: any) => toast.error(e.message) });
  const closeShift = useMutation({ mutationFn: () => api<any>(`/api/v1/r/pos-shift/${open.id}/actions/close`, { method: 'POST', body: { countedCash: Number(counted) } }), onSuccess: (r) => { toast.success(r.message); setClosing(false); setCounted(''); qc.invalidateQueries({ queryKey: ['pos-shift'] }); }, onError: (e: any) => toast.error(e.message) });

  const [cart, setCart] = useState<Line[]>([]); const [customerId, setCustomer] = useState<string | null>(null); const [pays, setPays] = useState<{ method: string; amount: string; reference: string }[]>([{ method: 'cash', amount: '', reference: '' }]);
  const [q, setQ] = useState(''); const dq = useDebounced(q, 250); const scan = useRef<HTMLInputElement>(null);
  const found = useQuery({ queryKey: ['pos-search', dq], enabled: dq.length >= 2, queryFn: () => api<{ data: any[] }>('/api/v1/r/part', { query: { q: dq, limit: 8, 'f.status': 'active' } }) });
  const total = cart.reduce((s, l) => s + l.qty * l.unitPrice * 1.15, 0); const paid = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const add = (p: any) => { setCart((c) => { const i = c.findIndex((x) => x.partId === p.id); if (i >= 0) return c.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)); return [...c, { partId: p.id, label: `${p.partNumber} — ${p.name}`, qty: 1, unitPrice: Number(p.marketCeiling ?? 0) }]; }); setQ(''); scan.current?.focus(); };
  const onScan = async (e: React.KeyboardEvent) => { if (e.key !== 'Enter' || !q.trim()) return; const r = await api<{ data: any[] }>('/api/v1/r/part', { query: { q: q.trim(), limit: 1 } }).catch(() => null); if (r?.data[0]) add(r.data[0]); else toast.error(t('Item not found')); };
  const sale = useMutation({
    mutationFn: async () => { const s = await api<any>('/api/v1/r/pos-sale', { method: 'POST', body: { terminalId, customerId, children: { PosSaleLine: cart.map((l) => ({ partId: l.partId, qty: l.qty, unitPrice: l.unitPrice })), PosPayment: pays.filter((p) => Number(p.amount) > 0).map((p) => ({ method: p.method, amount: p.amount, reference: p.reference || undefined })) } } }); return api<any>(`/api/v1/r/pos-sale/${s.data.id}/actions/pay`, { method: 'POST', body: {} }); },
    onSuccess: (r) => { toast.success(r.message, { action: r.result?.invoiceId ? { label: t('Receipt'), onClick: () => openDoc(`/api/v1/docs/invoice/${r.result.invoiceId}`) } : undefined, duration: 10000 }); setCart([]); setPays([{ method: 'cash', amount: '', reference: '' }]); setCustomer(null); scan.current?.focus(); },
    onError: (e: any) => toast.error(e.message),
  });
  if (ready && !can({ mod: 'pos', slug: 'pos-sale' })) return <NoAccess />;
  if (terms.isLoading) return <Skeleton className="h-96 w-full" />; if (terms.isError) return <ErrorState error={terms.error} onRetry={() => terms.refetch()} />;
  return (
    <>
      <PageHeader title={t('Point of sale')} actions={<><Select value={terminalId} onChange={(e) => setTerminal(e.target.value)} className="w-48">{terms.data!.data.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>{open && <Button variant="secondary" icon="log-out" onClick={() => setClosing(true)}>{t('Close shift')}</Button>}</>} />
      {shift.isLoading ? <Skeleton className="h-64 w-full" /> : !open ? (
        <Card><EmptyState icon="clock" title={t('No open shift on this terminal')} desc={t('Open a shift with the opening cash in the drawer to start selling.')} action={<div className="flex items-end gap-2"><Field label={t('Opening cash')}><Input type="number" value={openCash} onChange={(e) => setOpenCash(e.target.value)} dir="ltr" className="w-36" /></Field><Button loading={openShift.isPending} onClick={() => openShift.mutate()}>{t('Open shift')}</Button></div>} /></Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <Card className="p-4"><div className="relative"><ScanLine size={18} className="pointer-events-none absolute start-3 top-3 text-primary" /><Input ref={scan} autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onScan} placeholder={t('Scan a barcode or search by part number / name')} className="h-12 ps-10 text-base" aria-label={t('Scan or type a barcode')} /></div>
              {dq.length >= 2 && <ul className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line">{found.isLoading ? <li className="p-3"><Skeleton className="h-4 w-full" /></li> : found.data!.data.length === 0 ? <li className="p-4 text-center text-sm text-muted">{t('No results found')}</li> : found.data!.data.map((p) => <li key={p.id}><button onClick={() => add(p)} className="flex w-full items-center justify-between gap-3 p-3 text-start hover:bg-primary/5"><span className="min-w-0"><b className="num block truncate text-sm">{p.partNumber}</b><span className="block truncate text-xs text-muted">{p.name}</span></span><span className="num text-sm font-semibold">{p.marketCeiling ? fmtMoney(p.marketCeiling, lang) : ''}</span></button></li>)}</ul>}</Card>
            <Card><CardHeader title={t('Cart')} sub={`${cart.length} ${t('lines')}`} />{cart.length === 0 ? <EmptyState icon="shopping-cart" title={t('The cart is empty')} desc={t('Scan or search an item to add it.')} /> : <ul className="divide-y divide-line">{cart.map((l, i) => <li key={l.partId} className="flex flex-wrap items-center gap-3 p-3"><span className="min-w-0 flex-1"><b className="block truncate text-sm">{l.label}</b></span>
              <div className="flex items-center gap-1"><Button size="sm" variant="secondary" aria-label="-" onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, qty: Math.max(1, x.qty - 1) } : x)))}><Minus size={14} /></Button><span className="num w-8 text-center font-bold">{l.qty}</span><Button size="sm" variant="secondary" aria-label="+" onClick={() => setCart(cart.map((x, j) => (j === i ? { ...x, qty: x.qty + 1 } : x)))}><Plus size={14} /></Button></div>
              <Input type="number" step="any" value={l.unitPrice} onChange={(e) => setCart(cart.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))} className="h-9 w-28" dir="ltr" aria-label={t('Unit price')} /><span className="num w-24 text-end font-bold">{fmtNum(l.qty * l.unitPrice * 1.15, lang)}</span><button onClick={() => setCart(cart.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-danger hover:bg-danger/10" aria-label={t('Remove')}><Trash2 size={15} /></button></li>)}</ul>}</Card>
          </div>
          <Card className="h-fit space-y-4 p-5 lg:sticky lg:top-20">
            <Field label={t('Customer (optional)')}><RefPicker resKey="Customer" value={customerId} onChange={setCustomer} placeholder={t('Walk-in customer')} /></Field>
            <div className="space-y-1 rounded-xl bg-line/40 p-4"><div className="flex justify-between text-sm"><span className="text-muted">{t('Subtotal')}</span><span className="num">{fmtNum(total / 1.15, lang)}</span></div><div className="flex justify-between text-sm"><span className="text-muted">VAT 15%</span><span className="num">{fmtNum(total - total / 1.15, lang)}</span></div><div className="flex justify-between border-t border-line pt-2 text-xl font-extrabold"><span>{t('Total')}</span><span className="num text-primary">{fmtMoney(total, lang)}</span></div></div>
            <div className="space-y-2"><p className="text-xs font-bold text-muted">{t('Payments (split allowed)')}</p>{pays.map((p, i) => <div key={i} className="flex gap-2"><Select value={p.method} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, method: e.target.value } : x)))} className="w-28">{METHODS.map((m) => <option key={m} value={m}>{m}</option>)}</Select><Input type="number" step="any" placeholder={fmtNum(Math.max(0, total - paid + (Number(p.amount) || 0)), lang)} value={p.amount} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} dir="ltr" aria-label={t('Amount')} />{['voucher', 'card', 'mada'].includes(p.method) && <Input placeholder={p.method === 'voucher' ? t('Code') : t('Ref')} value={p.reference} onChange={(e) => setPays(pays.map((x, j) => (j === i ? { ...x, reference: e.target.value } : x)))} className="w-24" dir="ltr" />}</div>)}
              <div className="flex gap-2"><Button size="sm" variant="ghost" icon="plus" onClick={() => setPays([...pays, { method: 'cash', amount: '', reference: '' }])}>{t('Split payment')}</Button><Button size="sm" variant="soft" onClick={() => setPays([{ method: pays[0].method, amount: String(total.toFixed(2)), reference: '' }])}>{t('Exact amount')}</Button></div></div>
            <div className="flex items-center justify-between text-sm"><span className="text-muted">{t('Change')}</span><Badge tone={paid >= total ? 'success' : 'warn'}>{fmtMoney(Math.max(0, paid - total), lang)}</Badge></div>
            <Button size="lg" className="w-full" disabled={!cart.length || paid + 0.005 < total} loading={sale.isPending} onClick={() => sale.mutate()}>{t('Complete sale')} · {fmtMoney(total, lang)}</Button>
          </Card>
        </div>)}
      <Modal open={closing} onClose={() => setClosing(false)} title={t('Close shift (cash-up)')} footer={<><Button variant="secondary" onClick={() => setClosing(false)}>{t('Cancel')}</Button><Button loading={closeShift.isPending} disabled={counted === ''} onClick={() => closeShift.mutate()}>{t('Close shift')}</Button></>}><Field label={t('Counted cash in the drawer')} required><Input type="number" step="any" value={counted} onChange={(e) => setCounted(e.target.value)} dir="ltr" autoFocus /></Field><p className="mt-2 text-xs text-muted">{t('Any difference is sent to a manager for approval before it is posted.')}</p></Modal>
    </>
  );
}
void cn;
