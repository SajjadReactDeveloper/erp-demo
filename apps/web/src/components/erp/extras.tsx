'use client';
import { useRef, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY, type ResourceDef } from '@erp/shared';
import { Check, FileText, Printer, QrCode, ShieldAlert } from 'lucide-react';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Icon, Input, Modal, SkeletonCards, SkeletonRows, Stat, StatusBadge, Textarea, cn, toast } from '@/components/ui';
import { BarCard, LineCard, PieCard } from '@/components/charts';
import { RefPicker } from './fields';
import { ResourceList } from './list';
import { SignaturePad, type SigHandle } from './signature';

type OverrideProps = { row: any; res: ResourceDef; onClose: () => void; onDone: () => void };
const useGet = <T,>(key: any[], path: string, query?: any, enabled = true) => useQuery({ queryKey: key, queryFn: () => api<T>(path, { query }), enabled });
const Pending = ({ q, rows = 4 }: { q: any; rows?: number }) => (q.isLoading ? <Card><SkeletonRows rows={rows} cols={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} compact /></Card> : null);

// =============== action overrides ===============
function PodModal({ row, onClose, onDone }: OverrideProps) {
  const { t } = useT(); const sig = useRef<SigHandle>(null); const lines: any[] = row._children?.DeliveryLine ?? [];
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.id, String(Number(l.qty))])));
  const [reason, setReason] = useState<Record<string, string>>({}); const [name, setName] = useState(''); const [idn, setIdn] = useState(''); const [hasInk, setInk] = useState(false); const [photo, setPhoto] = useState<File | null>(null); const [err, setErr] = useState<string>();
  const run = useMutation({
    mutationFn: async () => {
      const pos = await new Promise<GeolocationPosition | null>((res) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 4000 }) : res(null)));
      let photoKeys: string[] = [];
      if (photo) { const fd = new FormData(); fd.append('refType', 'DeliveryNote'); fd.append('refId', row.id); fd.append('kind', 'photo'); fd.append('file', photo); const r = await api<any>('/api/v1/files', { method: 'POST', form: fd }); photoKeys = [r.data.id]; }
      return api(`/api/v1/r/delivery-note/${row.id}/actions/deliver`, { method: 'POST', body: { lines: lines.map((l) => ({ lineId: l.id, deliveredQty: Number(qty[l.id] ?? 0), reason: reason[l.id] })), signatureData: sig.current?.toDataURL(), signerName: name, signerIdNumber: idn, photoKeys, lat: pos?.coords.latitude, lng: pos?.coords.longitude }, idempotencyKey: crypto.randomUUID() });
    },
    onSuccess: (r: any) => { toast.success(r.message ?? t('Delivered')); onDone(); }, onError: (e: any) => setErr(e.message),
  });
  return (
    <Modal open onClose={onClose} wide title={t('Confirm delivery (proof of delivery)')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={run.isPending} disabled={!hasInk || !name.trim()} onClick={() => { setErr(undefined); run.mutate(); }}>{t('Confirm delivery')}</Button></>}>
      <div className="space-y-4">
        <div className="sticky-head rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-2 text-start">{t('Item')}</th><th className="p-2 text-start">{t('Ordered')}</th><th className="p-2 text-start">{t('Delivered')}</th><th className="p-2 text-start">{t('Reason if short')}</th></tr></thead><tbody className="divide-y divide-line">
          {lines.map((l) => { const short = Number(qty[l.id]) < Number(l.qty); return <tr key={l.id}><td className="p-2">{l._refs?.partId?.label}</td><td className="num p-2">{Number(l.qty)}</td><td className="p-2"><Input type="number" min={0} max={Number(l.qty)} step="any" value={qty[l.id]} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} className="h-9 w-24" dir="ltr" /></td><td className="p-2">{short && <Input value={reason[l.id] ?? ''} onChange={(e) => setReason({ ...reason, [l.id]: e.target.value })} placeholder={t('Required')} className="h-9" />}</td></tr>; })}</tbody></table></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label={t('Customer name')} required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label={t('ID number (optional)')}><Input value={idn} onChange={(e) => setIdn(e.target.value)} dir="ltr" /></Field></div>
        <Field label={t('Signature')} required><SignaturePad ref={sig} onChange={setInk} /></Field>
        <Field label={t('Photo (optional)')}><input type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} className="text-sm" /></Field>
        {err && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

function CreditNoteModal({ row, onClose, onDone }: OverrideProps) {
  const { t } = useT(); const lines: any[] = row._children?.InvoiceLine ?? [];
  const [qty, setQty] = useState<Record<string, string>>({}); const [reason, setReason] = useState(''); const [err, setErr] = useState<string>();
  const run = useMutation({ mutationFn: () => api(`/api/v1/r/invoice/${row.id}/actions/credit_note`, { method: 'POST', body: { reason, lines: lines.filter((l) => Number(qty[l.id]) > 0).map((l) => ({ invoiceLineId: l.id, qty: Number(qty[l.id]) })) } }), onSuccess: (r: any) => { toast.success(r.message); onDone(); }, onError: (e: any) => setErr(e.message) });
  return (
    <Modal open onClose={onClose} wide title={t('Create credit note')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={run.isPending} disabled={!reason.trim() || !lines.some((l) => Number(qty[l.id]) > 0)} onClick={() => run.mutate()}>{t('Issue credit note')}</Button></>}>
      <div className="space-y-4"><div className="sticky-head rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-2 text-start">{t('Item')}</th><th className="p-2 text-start">{t('Invoiced')}</th><th className="p-2 text-start">{t('Qty to credit')}</th></tr></thead><tbody className="divide-y divide-line">{lines.map((l) => <tr key={l.id}><td className="p-2">{l.description}</td><td className="num p-2">{Number(l.qty)}</td><td className="p-2"><Input type="number" min={0} max={Number(l.qty)} step="any" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} className="h-9 w-28" dir="ltr" /></td></tr>)}</tbody></table></div>
        <Field label={t('Reason')} required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} /></Field>{err && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}</div>
    </Modal>
  );
}

export function QuotationApproveModal({ row, onClose, onDone }: OverrideProps) {
  const { t } = useT(); const lines: any[] = row._children?.QuotationLine ?? [];
  const prim = lines.filter((l) => !l.isAlternative); const alts = lines.filter((l) => l.isAlternative);
  const [sel, setSel] = useState<Set<string>>(() => new Set(prim.map((p) => p.id))); const [reasons, setReasons] = useState<Record<string, string>>({}); const [err, setErr] = useState<string>();
  const toggle = (id: string, altOf?: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else { n.add(id); if (altOf) n.delete(altOf); else alts.filter((a) => a.alternativeOfId === id).forEach((a) => n.delete(a.id)); } setSel(n); };
  const run = useMutation({ mutationFn: () => api(`/api/v1/r/quotation/${row.id}/actions/approve`, { method: 'POST', body: { lineIds: [...sel], reasons } }), onSuccess: (r: any) => { r.result?.held ? toast.warning(r.message, { duration: 12000 }) : toast.success(r.message ?? t('Quotation approved')); onDone(); }, onError: (e: any) => setErr(e.message) });
  const total = [...sel].reduce((s, id) => { const l = lines.find((x) => x.id === id); return s + (l ? Number(l.lineTotal) : 0); }, 0);
  const lost = (l: any) => !sel.has(l.id) && !alts.some((a) => a.alternativeOfId === l.id && sel.has(a.id));
  return (
    <Modal open onClose={onClose} wide title={t('Review and approve quotation')} footer={<><span className="me-auto text-sm text-muted">{t('Approved total')}: <b className="num text-fg">{fmtMoney(total)}</b></span><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={run.isPending} disabled={sel.size === 0} onClick={() => run.mutate()}>{t('Approve selected')}</Button></>}>
      <div className="space-y-3">{prim.map((p) => (
        <div key={p.id} className="rounded-xl border border-line p-3"><label className="flex cursor-pointer items-center gap-3"><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" /><span className="flex-1 text-sm font-semibold">{p._refs?.partId?.label}</span><span className="num text-sm">{Number(p.qty)} × {fmtNum(p.unitPrice)} = <b>{fmtMoney(p.lineTotal)}</b></span></label>
          {alts.filter((a) => a.alternativeOfId === p.id).map((a) => <label key={a.id} className="mt-2 flex cursor-pointer items-center gap-3 rounded-lg bg-line/30 px-3 py-2 ps-9"><input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id, p.id)} className="h-4 w-4 accent-[hsl(var(--primary))]" /><Badge tone="info">{t('Alternative')}</Badge><span className="flex-1 text-sm">{a._refs?.partId?.label}</span><span className="num text-sm">{fmtMoney(Number(a.unitPrice) * Number(a.qty))}</span></label>)}
          {lost(p) && <div className="mt-2 ps-7"><RefPicker resKey="LostReason" value={reasons[p.id]} onChange={(v) => setReasons({ ...reasons, [p.id]: v })} placeholder={t('Why not? (optional)')} /></div>}
        </div>))}{err && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}</div>
    </Modal>
  );
}

function CaptureModal({ row, onClose, onDone }: OverrideProps) {
  const { t } = useT(); const [file, setFile] = useState<File | null>(null); const [err, setErr] = useState<string>();
  const run = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.append('refType', 'SupplierQuote'); fd.append('refId', row.id); fd.append('kind', 'quotation'); fd.append('file', file!); const up = await api<any>('/api/v1/files', { method: 'POST', form: fd }); return api(`/api/v1/r/supplier-quote/${row.id}/actions/capture`, { method: 'POST', body: { attachmentId: up.data.id } }); },
    onSuccess: (r: any) => { toast.success(r.message ?? t('Done'), { duration: 9000 }); onDone(); }, onError: (e: any) => setErr(e.message),
  });
  return (
    <Modal open onClose={onClose} title={t('AI capture from a supplier file')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={run.isPending} disabled={!file} icon="sparkles" onClick={() => run.mutate()}>{t('Extract lines')}</Button></>}>
      <div className="space-y-3"><p className="text-sm text-muted">{t('Upload the supplier quotation (Excel, CSV or PDF with a text layer). Every extracted line is shown for review before it is used.')}</p><input type="file" accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />{err && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}</div>
    </Modal>
  );
}

function PoConfirmModal({ row, onClose, onDone }: OverrideProps) {
  const { t } = useT(); const lines: any[] = row._children?.PoLine ?? [];
  const [vals, setVals] = useState<Record<string, { qty: string; date: string }>>(() => Object.fromEntries(lines.map((l) => [l.id, { qty: String(Number(l.qty)), date: row.expectedDate?.slice(0, 10) ?? '' }])));
  const run = useMutation({ mutationFn: () => api(`/api/v1/r/purchase-order/${row.id}/actions/confirm`, { method: 'POST', body: { lines: lines.map((l) => ({ id: l.id, qty: Number(vals[l.id].qty), date: vals[l.id].date || undefined })) } }), onSuccess: () => { toast.success(t('Purchase order confirmed')); onDone(); }, onError: (e: any) => toast.error(e.message) });
  return (
    <Modal open onClose={onClose} wide title={t('Confirm purchase order')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={run.isPending} onClick={() => run.mutate()}>{t('Confirm')}</Button></>}>
      <div className="sticky-head rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-2 text-start">{t('Item')}</th><th className="p-2 text-start">{t('Ordered')}</th><th className="p-2 text-start">{t('You can supply')}</th><th className="p-2 text-start">{t('Delivery date')}</th></tr></thead><tbody className="divide-y divide-line">{lines.map((l) => <tr key={l.id}><td className="p-2">{l._refs?.partId?.label}</td><td className="num p-2">{Number(l.qty)}</td><td className="p-2"><Input type="number" step="any" value={vals[l.id].qty} onChange={(e) => setVals({ ...vals, [l.id]: { ...vals[l.id], qty: e.target.value } })} className="h-9 w-24" dir="ltr" /></td><td className="p-2"><Input type="date" value={vals[l.id].date} onChange={(e) => setVals({ ...vals, [l.id]: { ...vals[l.id], date: e.target.value } })} className="h-9" dir="ltr" /></td></tr>)}</tbody></table></div>
    </Modal>
  );
}
export const ACTION_OVERRIDES: Record<string, ComponentType<OverrideProps>> = {
  'DeliveryNote.deliver': PodModal, 'Invoice.credit_note': CreditNoteModal, 'Quotation.approve': QuotationApproveModal, 'SupplierQuote.capture': CaptureModal, 'PurchaseOrder.confirm': PoConfirmModal,
};

// =============== header strips & actions ===============
function PrintBtn({ type, id, label }: { type: string; id: string; label?: string }) { const { t } = useT(); return <Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/${type}/${id}`)}>{label ?? t('Print / PDF')}</Button>; }
function MoneyStrip({ items }: { items: { label: string; value: ReactNode; tone?: string; accent?: boolean }[] }) {
  const cols = items.length === 2 ? 'sm:grid-cols-2' : items.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <Card className="overflow-hidden">
      <dl className={cn('grid divide-y divide-line sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse', cols)}>
        {items.map((i) => (
          <div key={i.label} className={cn('relative px-5 py-4', i.accent && 'bg-gold-light/35 before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gold')}>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{i.label}</dt>
            <dd className={cn('num mt-1.5 text-[20px] font-bold leading-tight tracking-tight text-fg', i.tone)}>{i.value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export const EXTRA_ACTIONS: Record<string, (row: any, res: ResourceDef) => ReactNode> = {
  Quotation: (r) => <PrintBtn type="quotation" id={r.id} />,
  Invoice: (r) => <PrintBtn type="invoice" id={r.id} />,
  PurchaseOrder: (r) => <PrintBtn type="purchase_order" id={r.id} />,
  DeliveryNote: (r) => <><PrintBtn type="delivery_note" id={r.id} /><Button variant="secondary" icon="tag" onClick={() => openDoc(`/api/v1/docs/label/${r.id}`, { kind: 'delivery_note' })}>Label</Button></>,
  Receipt: (r) => <PrintBtn type="receipt" id={r.id} />,
};

export const EXTRA_HEADER: Record<string, (row: any, res: ResourceDef) => ReactNode> = {
  Quotation: (r) => <QuotationStrip r={r} />, Invoice: (r) => <InvoiceStrip r={r} />, Customer: (r) => <CustomerStrip r={r} />,
  ApprovalRequest: (r) => <ApprovalStrip r={r} />,
  Request: (r) => <RequestStrip r={r} />,
};
function QuotationStrip({ r }: { r: any }) {
  const { t, lang } = useT();
  return (<>
    {r.minMarginBreached && <div role="alert" className="flex items-start gap-3 rounded-md border border-warn/40 bg-warn-bg/80 p-4 text-small"><ShieldAlert className="mt-0.5 shrink-0 text-warn" size={18} /><div><b className="text-warn">{t('Below minimum margin')}</b><p className="mt-0.5 text-strong">{t('Some lines are below the minimum margin. Request margin approval before sending.')}</p></div></div>}
    <MoneyStrip items={[{ label: t('Subtotal'), value: fmtMoney(r.subtotal, lang) }, { label: 'VAT', value: fmtMoney(r.vatAmount, lang) }, { label: t('Total'), value: fmtMoney(r.total, lang), tone: 'text-navy', accent: true }, { label: t('Margin'), value: `${fmtNum(Number(r.marginPct) * 100, lang, 1)}%`, tone: r.minMarginBreached ? 'text-danger' : 'text-success' }]} />
  </>);
}
function InvoiceStrip({ r }: { r: any }) {
  const { t, lang } = useT();
  return (<>
    {r.status === 'rejected' && <div role="alert" className="rounded-md border border-danger/40 bg-danger-bg/80 p-4 text-small text-danger"><b>{t('ZATCA rejected this invoice.')}</b> {t('Open the ZATCA tab to see the errors, correct the data and resubmit.')}</div>}
    <MoneyStrip items={[{ label: t('Total'), value: fmtMoney(r.total, lang), tone: 'text-navy', accent: true }, { label: t('Paid'), value: fmtMoney(r.paidAmount, lang), tone: 'text-success' }, { label: t('Balance'), value: fmtMoney(r.balance, lang), tone: Number(r.balance) > 0 && r.dueDate && new Date(r.dueDate) < new Date() ? 'text-danger' : undefined }, { label: 'ZATCA', value: r.zatcaStatus ? <StatusBadge value={r.zatcaStatus} /> : '—' }]} />
  </>);
}
function CustomerStrip({ r }: { r: any }) {
  const { t, lang } = useT(); const q = useGet<{ data: any }>(['exposure', r.id], `/api/v1/credit/exposure/${r.id}`);
  if (q.isLoading) return <div className="mb-4"><SkeletonCards n={4} /></div>; if (q.isError) return null; const e = q.data!.data;
  return <MoneyStrip items={[{ label: t('Credit limit'), value: fmtMoney(e.limit, lang) }, { label: t('Exposure'), value: fmtMoney(e.total, lang), tone: e.total > e.limit ? 'text-danger' : undefined }, { label: t('Available credit'), value: fmtMoney(e.available, lang), tone: e.available < 0 ? 'text-danger' : undefined }, { label: t('Overdue'), value: fmtMoney(e.overdue, lang), tone: e.overdue > 0 ? 'text-danger' : undefined }]} />;
}
function ApprovalStrip({ r }: { r: any }) {
  const { t } = useT(); const slugs: Record<string, string> = { Quotation: 'quotation', PurchaseOrder: 'purchase-order', CreditHold: 'credit-hold', Expense: 'expense', ReturnAuth: 'return-auth', DiscountRequest: 'discount-request' };
  return <Card className="mb-4 flex items-center justify-between p-4"><div className="text-sm"><b>{r.type}</b> · SAR {fmtNum(r.amount)} <p className="text-muted">{r.reason}</p></div>{slugs[r.refType] && <Link className="text-sm font-semibold text-primary hover:underline" href={`/app/${slugs[r.refType]}/${r.refId}`}>{t('Open the record')} →</Link>}</Card>;
}
function RequestStrip({ r }: { r: any }) {
  const { t, lang } = useT(); const late = r.slaDueAt && new Date(r.slaDueAt) < new Date() && ['submitted', 'in_sourcing'].includes(r.status);
  return r.slaDueAt ? <div className={cn('flex items-center gap-3 border px-5 py-3.5 text-small', late ? 'border-danger/30 bg-danger-bg text-danger' : 'border-gold-border bg-gold-light text-gold-text')}><Icon name={late ? 'alarm-clock-off' : 'timer'} size={18} /><span className="font-semibold">{t('Response SLA')}</span><span className="num">{fmtDateTime(r.slaDueAt, lang)}</span>{late && <Badge tone="danger">{t('breached')}</Badge>}</div> : null;
}

// =============== tabs ===============
type Tab = { key: string; label: string; icon?: string; render: ReactNode };
export const EXTRA_TABS: Record<string, (row: any, res: ResourceDef) => Tab[]> = {
  Request: (r) => [{ key: 'ai', label: 'AI matching', icon: 'sparkles', render: <AiMatchPanel row={r} /> }, { key: 'flow', label: 'Sourcing', icon: 'git-branch', render: <SourcingPanel row={r} /> }],
  Rfq: (r) => [{ key: 'compare', label: 'Comparison', icon: 'columns-3', render: <ComparisonPanel rfq={r} /> }],
  Customer: (r) => [{ key: '360', label: 'Customer 360', icon: 'layout-dashboard', render: <Customer360 id={r.id} /> }, { key: 'credit', label: 'Credit', icon: 'wallet', render: <CreditTab id={r.id} /> }, { key: 'vehicles', label: 'Vehicle spend', icon: 'car', render: <VehicleDashboard url={`/api/v1/customers/${r.id}/vehicle-dashboard`} /> }],
  Vehicle: (r) => [{ key: 'dash', label: 'Dashboard', icon: 'gauge', render: <VehicleDashboard url={`/api/v1/vehicles/${r.id}/dashboard`} /> }],
  Invoice: (r) => [{ key: 'zatca', label: 'ZATCA', icon: 'qr-code', render: <ZatcaPanel row={r} /> }, { key: 'lineage', label: 'Lineage', icon: 'git-commit-horizontal', render: <LineagePanel id={r.id} /> }],
  DeliveryNote: (r) => [{ key: 'track', label: 'Tracking & POD', icon: 'map-pin', render: <TrackingPanel row={r} /> }],
  SalesOrder: (r) => [{ key: 'ful', label: 'Fulfilment', icon: 'truck', render: <FulfilmentPanel row={r} /> }],
  Supplier: (r) => [{ key: 'perf', label: 'Performance', icon: 'gauge', render: <ResourceList res={BY_KEY.SupplierScore} embedded baseFilter={{ supplierId: r.id }} limit={10} /> }],
  Part: (r) => [{ key: 'price', label: 'Price history', icon: 'line-chart', render: <PriceHistory partId={r.id} /> }],
};

function AiMatchPanel({ row }: { row: any }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const lines: any[] = row._children?.RequestLine ?? [];
  const vin = useQuery({ queryKey: ['vin', row.vin], enabled: !!row.vin, queryFn: () => api<{ data: any }>('/api/v1/ai/vin-decode', { method: 'POST', body: { vin: row.vin } }) });
  const patch = useMutation({ mutationFn: ({ id, body }: any) => api(`/api/v1/r/request-line/${id}`, { method: 'PATCH', body }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['detail', 'request', row.id] }); toast.success(t('Saved successfully')); }, onError: (e: any) => toast.error(e.message) });
  const match = useMutation({ mutationFn: () => api<any>(`/api/v1/r/request/${row.id}/actions/match`, { method: 'POST', body: {} }), onSuccess: (r) => { toast.success(r.message); qc.invalidateQueries({ queryKey: ['detail', 'request', row.id] }); }, onError: (e: any) => toast.error(e.message) });
  const v = vin.data?.data;
  return (
    <div className="space-y-4">
      {row.vin && <Card className="p-4">{vin.isLoading ? <SkeletonRows rows={1} cols={4} /> : v?.valid ? <div className="flex flex-wrap items-center gap-3 text-sm"><Badge tone="primary">VIN</Badge><b className="num" dir="ltr">{v.vin}</b><span>{[v.make, v.model, v.year, v.engine].filter(Boolean).join(' · ')}</span><Badge tone={v.checksumOk === false ? 'warn' : 'success'}>{v.checksumOk === false ? t('Checksum mismatch') : v.region}</Badge></div> : <p className="text-sm text-danger">{v?.error}</p>}</Card>}
      <Card><CardHeader title={t('Part matching (AI-1)')} sub={t('Suggestions need your confirmation. Low confidence lines are flagged.')} actions={<Button size="sm" icon="sparkles" loading={match.isPending} onClick={() => match.mutate()}>{t('Run AI matching')}</Button>} />
        {lines.length === 0 ? <EmptyState icon="list" title={t('No lines')} /> : <ul className="divide-y divide-line">{lines.map((l) => { const c = Number(l.matchConfidence ?? 0); return (
          <li key={l.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_1.2fr_auto] lg:items-center">
            <div><p className="text-sm font-semibold">{l.customerText}</p><p className="num text-xs text-muted">{l.partNumberText} · {t('Qty')} {Number(l.qty)}</p></div>
            <div className="space-y-1"><RefPicker resKey="Part" value={l.partId} onChange={(v) => patch.mutate({ id: l.id, body: { partId: v } })} />
              {l.partId && <div className="flex items-center gap-2 text-xs"><div className="h-1.5 w-24 overflow-hidden rounded-xs bg-line"><div className={cn('h-full', c >= 0.8 ? 'bg-success' : c >= 0.6 ? 'bg-warn' : 'bg-danger')} style={{ width: `${c * 100}%` }} /></div><span className="num">{Math.round(c * 100)}%</span><StatusBadge value={l.matchStatus} /></div>}</div>
            <div>{l.partId && l.matchStatus !== 'confirmed' && <Button size="sm" variant="soft" icon="check" loading={patch.isPending} onClick={() => patch.mutate({ id: l.id, body: { matchStatus: 'confirmed' } })}>{t('Confirm')}</Button>}{l.matchStatus === 'confirmed' && <Check className="text-success" />}</div>
          </li>); })}</ul>}</Card>
      <p className="text-xs text-muted">{lang === 'ar' ? 'لا يتم استخدام أي اقتراح قبل تأكيدك له.' : 'No suggestion is used until you confirm it.'}</p>
    </div>
  );
}
function SourcingPanel({ row }: { row: any }) {
  return <div className="grid gap-5 lg:grid-cols-2"><ResourceList res={BY_KEY.Rfq} embedded baseFilter={{ requestId: row.id }} limit={5} /><ResourceList res={BY_KEY.Quotation} embedded baseFilter={{ requestId: row.id }} limit={5} /></div>;
}
function FulfilmentPanel({ row }: { row: any }) {
  return <div className="space-y-5"><ResourceList res={BY_KEY.PurchaseOrder} embedded baseFilter={{ salesOrderId: row.id }} limit={5} /><ResourceList res={BY_KEY.DeliveryNote} embedded baseFilter={{ salesOrderId: row.id }} limit={5} /><ResourceList res={BY_KEY.Invoice} embedded baseFilter={{ salesOrderId: row.id }} limit={5} /></div>;
}

export function ComparisonPanel({ rfq }: { rfq: any }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const q = useGet<{ data: any }>(['compare', rfq.id, rfq.updatedAt], `/api/v1/rfqs/${rfq.id}/comparison`);
  const [pick, setPick] = useState<Record<string, string>>({});
  const award = useMutation({
    mutationFn: async () => {
      const lines = (q.data!.data.lines as any[]).map((l) => { const o = l.options.find((x: any) => x.id === (pick[l.rfqLineId] ?? l.recommendedId)); return o ? { rfqLineId: l.rfqLineId, supplierQuoteLineId: o.id, supplierId: o.supplierId, partId: o.partId ?? l.partId, qty: l.qty, unitCost: o.price, score: o.score, reason: pick[l.rfqLineId] && pick[l.rfqLineId] !== l.recommendedId ? 'Manual choice' : `Best value (score ${o.score})` } : null; }).filter(Boolean);
      if (!lines.length) throw new Error(t('No quoted lines to award'));
      const a = await api<any>('/api/v1/r/award', { method: 'POST', body: { rfqId: rfq.id, children: { AwardLine: lines } } });
      return api<any>(`/api/v1/r/award/${a.data.id}/actions/confirm`, { method: 'POST', body: {} });
    },
    onSuccess: (r) => { toast.success(r.message ?? t('Awarded')); qc.invalidateQueries({ queryKey: ['detail', 'rfq', rfq.id] }); qc.invalidateQueries({ queryKey: ['compare', rfq.id] }); }, onError: (e: any) => toast.error(e.message),
  });
  if (q.isLoading) return <Card><SkeletonRows rows={5} cols={6} /></Card>; if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const d = q.data!.data; const awarded = rfq.status === 'awarded'; const total = (d.lines as any[]).reduce((s, l) => { const o = l.options.find((x: any) => x.id === (pick[l.rfqLineId] ?? l.recommendedId)); return s + (o ? o.price * l.qty : 0); }, 0);
  if (!d.lines.length) return <Card><EmptyState icon="columns-3" title={t('No lines')} /></Card>;
  return (
    <div className="space-y-4">
      {d.lines.map((l: any) => (
        <Card key={l.rfqLineId} className="overflow-hidden"><CardHeader title={l.part ?? '—'} sub={`${t('Qty')}: ${l.qty}`} />
          {l.options.length === 0 ? <p className="p-5 text-sm text-muted">{t('No supplier has quoted this item yet.')}</p> : <div className="sticky-head"><table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="w-10 p-2" /><th className="p-2 text-start">{t('Supplier')}</th><th className="p-2 text-start">{t('Price')}</th><th className="p-2 text-start">{t('Lead time')}</th><th className="p-2 text-start">{t('Warranty')}</th><th className="p-2 text-start">{t('Rating')}</th><th className="p-2 text-start">{t('Score')}</th></tr></thead><tbody className="divide-y divide-line">
            {l.options.map((o: any) => { const on = (pick[l.rfqLineId] ?? l.recommendedId) === o.id; return (
              <tr key={o.id} onClick={() => !awarded && setPick({ ...pick, [l.rfqLineId]: o.id })} className={cn('cursor-pointer', on && 'bg-primary/8')}><td className="p-2 text-center"><input type="radio" readOnly checked={on} className="accent-[hsl(var(--primary))]" aria-label={o.supplier} /></td>
                <td className="p-2 font-semibold">{o.supplier} {o.id === l.recommendedId && <Badge tone="success">{t('Best value')}</Badge>}</td><td className="num p-2">{fmtNum(o.price, lang)}</td><td className="num p-2">{o.leadDays} {t('days')}</td><td className="p-2">{o.warranty ?? '—'}</td><td className="num p-2">{fmtNum(o.supplierRating, lang, 1)}</td>
                <td className="p-2"><div className="flex items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-xs bg-line"><div className="h-full bg-primary" style={{ width: `${o.score * 100}%` }} /></div><span className="num text-xs">{Math.round(o.score * 100)}</span></div></td></tr>); })}</tbody></table></div>}
        </Card>))}
      {!awarded && <div className="sticky bottom-3 flex items-center justify-between rounded-2xl border border-line bg-card/90 p-3 shadow-soft backdrop-blur"><span className="text-sm text-muted">{t('Total cost')}: <b className="num text-fg">{fmtMoney(total, lang)}</b></span><Button loading={award.isPending} icon="award" onClick={() => award.mutate()}>{t('Confirm award')}</Button></div>}
    </div>
  );
}

function Customer360({ id }: { id: string }) {
  const { t, lang } = useT(); const q = useGet<{ data: any }>(['360', id], `/api/v1/customers/${id}/360`);
  if (q.isLoading) return <SkeletonCards n={4} />; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />; const d = q.data!.data;
  const sec = (title: string, slug: string, rows: any[], fmt: (r: any) => ReactNode) => <Card><CardHeader title={title} actions={<Link href={`/app/${slug}?q=${encodeURIComponent(d.customer.name)}`} className="text-xs font-semibold text-primary">{t('View all')}</Link>} />{rows.length === 0 ? <p className="p-5 text-sm text-muted">{t('Nothing here yet')}</p> : <ul className="divide-y divide-line">{rows.map((r) => <li key={r.id}><Link href={`/app/${slug}/${r.id}`} className="flex items-center justify-between gap-2 px-5 py-2.5 text-sm hover:bg-primary/5">{fmt(r)}</Link></li>)}</ul>}</Card>;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label={t('Requests')} value={d.counts.requests} icon="inbox" /><Stat label={t('Quotations')} value={d.counts.quotations} icon="file-text" /><Stat label={t('Orders')} value={d.counts.orders} icon="shopping-bag" /><Stat label={t('Invoices')} value={d.counts.invoices} icon="receipt" /></div>
      {d.credit.holds.length > 0 && <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3.5 text-sm text-danger"><b>{t('Credit hold active')}</b> — {d.credit.holds.map((h: any) => h.reason).join(', ')}</div>}
      <div className="grid gap-5 lg:grid-cols-2">
        {sec(t('Requests'), 'request', d.requests, (r) => <><b>{r.number}</b><StatusBadge value={r.status} /></>)}
        {sec(t('Quotations'), 'quotation', d.quotations, (r) => <><b>{r.number}</b><span className="num">{fmtMoney(r.total, lang)}</span><StatusBadge value={r.status} /></>)}
        {sec(t('Orders'), 'sales-order', d.orders, (r) => <><b>{r.number}</b><span className="num">{fmtMoney(r.total, lang)}</span><StatusBadge value={r.status} /></>)}
        {sec(t('Deliveries'), 'delivery-note', d.deliveries, (r) => <><b>{r.number}</b><span className="num text-xs text-muted">{fmtDate(r.plannedDate, lang)}</span><StatusBadge value={r.status} /></>)}
        {sec(t('Invoices'), 'invoice', d.invoices, (r) => <><b>{r.number ?? 'Draft'}</b><span className="num">{fmtMoney(r.balance, lang)}</span><StatusBadge value={r.status} /></>)}
        {sec(t('Payments'), 'receipt', d.receipts, (r) => <><b>{r.number}</b><span className="num">{fmtMoney(r.amount, lang)}</span><StatusBadge value={r.status} /></>)}
        {sec(t('Vehicles'), 'vehicle', d.vehicles, (r) => <><b className="num" dir="ltr">{r.vin}</b><span>{r.make} {r.model} {r.year}</span></>)}
        {sec(t('Activities & notes'), 'activity', d.activities, (r) => <><b>{r.subject}</b><StatusBadge value={r.status} /></>)}
      </div>
      <div className="flex gap-2"><Link href={`/app/request/new?customerId=${id}`}><Button icon="plus">{t('New request')}</Button></Link><Link href={`/app/activity/new?customerId=${id}`}><Button variant="secondary" icon="phone">{t('Log activity')}</Button></Link></div>
    </div>
  );
}
function CreditTab({ id }: { id: string }) {
  return <div className="space-y-5"><ResourceList res={BY_KEY.CreditProfile} embedded baseFilter={{ customerId: id }} limit={5} /><ResourceList res={BY_KEY.CreditHold} embedded baseFilter={{ customerId: id }} limit={10} /><ResourceList res={BY_KEY.PromiseToPay} embedded baseFilter={{ customerId: id }} limit={10} /><ResourceList res={BY_KEY.CollectionActivity} embedded baseFilter={{ customerId: id }} limit={10} /></div>;
}

export function VehicleDashboard({ url }: { url: string }) {
  const { t, lang } = useT(); const q = useGet<{ data: any }>(['veh-dash', url], url);
  if (q.isLoading) return <div className="space-y-4"><SkeletonCards n={3} /></div>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />; const d = q.data!.data;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3"><Stat label={t('Total spend (12 months)')} value={fmtMoney(d.totals.spend, lang)} icon="wallet" /><Stat label={t('Vehicles')} value={d.totals.vehicles} icon="car" /><Stat label={t('Upcoming services')} value={d.upcoming.length} icon="wrench" tone="warn" /></div>
      <div className="grid gap-5 lg:grid-cols-2"><PieCard title={t('Spend by category')} data={d.byCategory} h={260} /><LineCard title={t('Spend by month')} data={d.byMonth} xKey="name" area h={260} /></div>
      {d.byVehicle.length > 1 && <BarCard title={t('Spend per vehicle')} data={d.byVehicle} h={240} />}
      <Card><CardHeader title={t('Upcoming service needs')} />{d.upcoming.length === 0 ? <p className="p-5 text-sm text-muted">{t('No service is due soon.')}</p> : <ul className="divide-y divide-line">{d.upcoming.map((u: any) => <li key={u.id} className="flex items-center justify-between px-5 py-3 text-sm"><div><b>{u.service}</b><p className="text-xs text-muted">{u.vehicle}</p></div><div className="text-end text-xs"><p className="num">{u.dueDate ? fmtDate(u.dueDate, lang) : ''} {u.dueMileage ? `· ${u.dueMileage} km` : ''}</p><StatusBadge value={u.status} /></div></li>)}</ul>}</Card>
      <Card><CardHeader title={t('Maintenance & purchase history')} />{d.history.length === 0 ? <EmptyState icon="history" title={t('No history yet')} /> : <div className="sticky-head"><table className="w-full min-w-[640px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="p-2.5 text-start">{t('Date')}</th><th className="p-2.5 text-start">{t('Vehicle')}</th><th className="p-2.5 text-start">{t('Item')}</th><th className="p-2.5 text-start">{t('Category')}</th><th className="p-2.5 text-start">{t('Amount')}</th></tr></thead><tbody className="divide-y divide-line">{d.history.map((h: any, i: number) => <tr key={i}><td className="num p-2.5">{fmtDate(h.date, lang)}</td><td className="p-2.5">{h.vehicle}</td><td className="p-2.5">{h.description}</td><td className="p-2.5"><Badge>{h.category}</Badge></td><td className="num p-2.5">{fmtMoney(h.amount, lang)}</td></tr>)}</tbody></table></div>}</Card>
    </div>
  );
}

function ZatcaPanel({ row }: { row: any }) {
  const { t, lang } = useT();
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]"><Card className="p-5"><dl className="grid gap-4 sm:grid-cols-2 text-sm">{[['UUID', row.zatcaUuid], ['ICV', row.zatcaIcv], ['Hash', row.zatcaHash], ['PIH', row.zatcaPih], [t('Status'), row.zatcaStatus]].map(([k, v]) => <div key={String(k)} className="min-w-0"><dt className="text-xs font-semibold text-muted">{k}</dt><dd className="num break-all" dir="ltr">{v ?? '—'}</dd></div>)}</dl></Card>
        {row.zatcaQr && <Card className="grid place-items-center p-5"><QrCode size={42} className="text-primary" /><p className="mt-2 text-center text-xs text-muted">{t('QR is embedded in the printed invoice')}</p></Card>}</div>
      <ResourceList res={BY_KEY.ZatcaSubmission} embedded baseFilter={{ invoiceId: row.id }} limit={10} />
      <p className="text-xs text-muted">{lang === 'ar' ? 'الوضع الحالي: محاكاة. للربط الفعلي يلزم رمز CSID الإنتاجي من هيئة الزكاة.' : 'Current mode: simulation. Live clearance needs the production CSID issued by ZATCA.'}</p>
    </div>
  );
}
function LineagePanel({ id }: { id: string }) {
  const { t } = useT(); const q = useGet<{ data: any }>(['lineage', id], `/api/v1/finance/lineage/${id}`);
  if (q.isLoading) return <Card><SkeletonRows rows={3} cols={5} /></Card>; if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} compact /></Card>; const d = q.data!.data;
  return (
    <div className="space-y-4"><div className={cn('rounded-xl border p-3.5 text-sm', d.singleEntry ? 'border-success/40 bg-success/10 text-success' : 'border-warn/40 bg-warn/10 text-warn')}>{d.singleEntry ? t('Single entry confirmed: every line traces back to its customer request with no re-keying.') : t('Some lines are not fully linked (manual or POS invoice).')}</div>
      {d.lines.map((l: any) => <Card key={l.invoiceLineId} className="p-4"><p className="mb-3 text-sm font-semibold">{l.description}</p><ol className="flex flex-wrap items-center gap-2">{l.chain.map((c: any, i: number) => <li key={c.stage} className="flex items-center gap-2"><span className={cn('rounded-xl border px-3 py-1.5 text-xs', c.ok ? 'border-primary/30 bg-primary/10' : 'border-line text-muted')}><b>{c.stage}</b><br />{c.number ?? '—'}</span>{i < l.chain.length - 1 && <span className="text-muted">→</span>}</li>)}</ol></Card>)}</div>
  );
}
function TrackingPanel({ row }: { row: any }) {
  const { t, lang } = useT(); const ev = useGet<{ data: any[] }>(['dn-events', row.id], '/api/v1/r/delivery-event', { 'f.deliveryNoteId': row.id, sort: 'at:asc', limit: 50 });
  const pod = useGet<{ data: any[] }>(['dn-pod', row.id], '/api/v1/r/proof-of-delivery', { 'f.deliveryNoteId': row.id, limit: 1 });
  const p = pod.data?.data[0];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card><CardHeader title={t('Delivery timeline')} />{ev.isLoading ? <SkeletonRows rows={3} cols={2} /> : ev.isError ? <ErrorState error={ev.error} compact onRetry={() => ev.refetch()} /> : !ev.data!.data.length ? <EmptyState icon="map-pin" title={t('No events yet')} /> : <ol className="space-y-0 p-5">{ev.data!.data.map((e) => <li key={e.id} className="relative ps-6 pb-4 last:pb-0"><span className="absolute start-0 top-1.5 h-2.5 w-2.5 rounded-xs bg-primary" /><div className="flex items-center gap-2 text-sm"><StatusBadge value={e.kind} /><span className="text-xs text-muted">{fmtDateTime(e.at, lang)}</span></div>{e.note && <p className="mt-0.5 text-xs text-muted">{e.note}</p>}</li>)}</ol>}</Card>
      <Card><CardHeader title={t('Proof of delivery')} />{pod.isLoading ? <SkeletonRows rows={2} cols={2} /> : !p ? <EmptyState icon="signature" title={t('Not delivered yet')} /> : <div className="space-y-3 p-5 text-sm"><div className="grid h-28 place-items-center rounded-xl border border-line bg-white">{p.signatureData && <img src={p.signatureData} alt="signature" className="max-h-24" />}</div><p><b>{p.signerName}</b> · {fmtDateTime(p.capturedAt, lang)}</p>{p.lat && <p className="num text-xs text-muted" dir="ltr">GPS {Number(p.lat).toFixed(5)}, {Number(p.lng).toFixed(5)}</p>}<p className="break-all text-[11px] text-muted" dir="ltr">SHA-256 {p.hash}</p></div>}</Card>
    </div>
  );
}
function PriceHistory({ partId }: { partId: string }) {
  const { t, lang } = useT(); const q = useGet<{ data: any[] }>(['ph', partId], '/api/v1/r/price-history', { 'f.partId': partId, sort: 'recordedAt:asc', limit: 100 });
  if (q.isLoading) return <SkeletonCards n={1} />; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const rows = q.data!.data; const by = new Map<string, any>();
  for (const r of rows) { const d = new Date(r.recordedAt).toISOString().slice(0, 10); const x = by.get(d) ?? { date: d }; x[r.kind] = Number(r.price); by.set(d, x); }
  return <LineCard title={t('Supplier cost vs selling price')} data={[...by.values()]} xKey="date" series={[{ key: 'supplier', label: t('Supplier cost') }, { key: 'selling', label: t('Selling price') }]} h={300} />;
}
void FileText; void Printer; void Check; void useAuth; void fmtDate; void cn; void Link;
