'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY, type ActionDef, type Field, type ResourceDef } from '@erp/shared';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Copy, FileText, Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { ApiError, api, download, fieldErrors, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDateTime, fmtMoney, timeAgo } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field as FieldWrap, Icon, Input, Modal, PageHeader, Select, Skeleton, SkeletonRows, StatusBadge, Tabs, Textarea, cn, toast } from '@/components/ui';
import { FieldInput, FieldValue, formFields } from './fields';
import { ResourceList } from './list';
import { EXTRA_ACTIONS, EXTRA_TABS, EXTRA_HEADER, ACTION_OVERRIDES } from './extras';
import { useBase } from './base';

// ---- which statuses allow editing header + lines ----
const EDITABLE: Record<string, string[]> = {
  Quotation: ['draft', 'pending_margin_approval'], Request: ['draft', 'submitted', 'in_sourcing'], PurchaseOrder: ['draft'], SalesOrder: ['draft'], Invoice: ['draft'], Rfq: ['draft'], Award: ['draft'],
  SupplierQuote: ['draft', 'captured_review'], SupplierBill: ['draft', 'variance'], GoodsReceipt: ['draft'], Receipt: ['draft'], Payment: ['draft'], Expense: ['draft'], DeliveryNote: ['planned', 'assigned'],
  StockCount: ['open', 'counting'], ReturnAuth: ['requested', 'approved'], JobCard: ['checked_in', 'inspection', 'awaiting_approval', 'approved', 'in_progress'], PosSale: ['open'], Transfer: ['draft'], DiscountRequest: ['pending'],
  CustomerApplication: ['submitted', 'under_review'], VendorApplication: ['submitted', 'under_review'], BankStatement: [], PosShift: [],
};
export function isEditable(res: ResourceDef, row: any) {
  if (res.immutable || res.sys) return false;
  if (!res.statusField || !res.actions.length) return true;
  return (EDITABLE[res.key] ?? [res.fields.find((f) => f.name === res.statusField)!.values![0]]).includes(row[res.statusField]);
}

// ---- generic forms for actions that need input ----
type AF = { name: string; type: 'text' | 'textarea' | 'ref' | 'refs' | 'date' | 'number' | 'select' | 'datetime'; ref?: string; required?: boolean; options?: string[]; label: string; filter?: Record<string, string> };
const ACTION_FORMS: Record<string, AF[]> = {
  'ApprovalRequest.reject': [{ name: 'note', type: 'textarea', required: true, label: 'Reason for rejecting' }], 'ApprovalRequest.approve': [{ name: 'note', type: 'textarea', label: 'Comment (optional)' }],
  'ApprovalRequest.delegate': [{ name: 'toUserId', type: 'ref', ref: 'User', required: true, label: 'Delegate to', filter: { kind: 'staff' } }],
  'Request.assign': [{ name: 'userId', type: 'ref', ref: 'User', required: true, label: 'Assign to', filter: { kind: 'staff' } }],
  'Rfq.select_suppliers': [{ name: 'supplierIds', type: 'refs', ref: 'Supplier', required: true, label: 'Suppliers', filter: { status: 'active' } }, { name: 'channel', type: 'select', options: ['whatsapp', 'email', 'portal'], label: 'Channel' }],
  'Part.merge': [{ name: 'intoId', type: 'ref', ref: 'Part', required: true, label: 'Merge into part' }],
  'Quotation.send': [{ name: 'channel', type: 'select', options: ['portal', 'whatsapp', 'email'], label: 'Send via' }],
  'Quotation.create_order': [{ name: 'poNumber', type: 'text', label: 'Customer PO number (optional)' }],
  'Quotation.reject': [{ name: 'reasonId', type: 'ref', ref: 'LostReason', label: 'Reason' }],
  'CreditHold.release': [{ name: 'reason', type: 'textarea', required: true, label: 'Reason for releasing' }],
  'DeliveryNote.assign': [{ name: 'driverId', type: 'ref', ref: 'User', required: true, label: 'Driver', filter: { kind: 'staff' } }, { name: 'plannedDate', type: 'date', label: 'Planned date' }, { name: 'routeArea', type: 'text', label: 'Route / area' }],
  'DeliveryNote.fail': [{ name: 'reason', type: 'textarea', required: true, label: 'Why did the delivery fail?' }], 'DeliveryNote.reschedule': [{ name: 'plannedDate', type: 'date', label: 'New date' }],
  'JournalEntry.reverse': [{ name: 'reason', type: 'text', label: 'Reason' }], 'PosShift.close': [{ name: 'countedCash', type: 'number', required: true, label: 'Counted cash in drawer' }],
  'BatteryUnit.register_warranty': [{ name: 'soldAt', type: 'date', label: 'Sold on' }, { name: 'customerId', type: 'ref', ref: 'Customer', label: 'Customer' }],
  'ServiceBooking.check_in': [{ name: 'mileageIn', type: 'number', label: 'Odometer (km)' }], 'Receipt.reverse': [], 'SupplierQuote.capture': [],
  'ReturnAuth.reject': [], 'Rfq.close': [],
};
const RESULT_LINKS: Record<string, string> = { rfqId: 'rfq', salesOrderId: 'sales-order', deliveryNoteId: 'delivery-note', creditNoteId: 'invoice', invoiceId: 'invoice', jobCardId: 'job-card', supplierId: 'supplier', customerId: 'customer', debitNoteId: 'supplier-bill', purchaseOrderId: 'purchase-order' };

export function ActionBar({ res, row, onDone }: { res: ResourceDef; row: any; onDone?: () => void }) {
  const base = useBase();
  const { t, lang } = useT(); const router = useRouter(); const qc = useQueryClient();
  const [active, setActive] = useState<ActionDef | null>(null); const [form, setForm] = useState<Record<string, any>>({}); const [err, setErr] = useState<string>();
  const avail: string[] = row._actions ?? [];
  const run = useMutation({
    mutationFn: (a: { key: string; body: any }) => api<{ data: any; result?: any; message?: string }>(`/api/v1/r/${res.slug}/${row.id}/actions/${a.key}`, { method: 'POST', body: a.body ?? {} }),
    onSuccess: (r) => {
      setActive(null); setForm({}); setErr(undefined);
      qc.invalidateQueries({ queryKey: ['detail', res.slug, row.id] }); qc.invalidateQueries({ queryKey: ['list', res.slug] }); qc.invalidateQueries({ queryKey: ['approvals'] });
      const open = Object.entries(r.result ?? {}).find(([k, v]) => RESULT_LINKS[k] && typeof v === 'string') as [string, string] | undefined;
      const url = (r.result as any)?.url as string | undefined;
      toast.success(r.message ?? t('Saved successfully'), { action: open ? { label: t('Open'), onClick: () => router.push(`${base}/${RESULT_LINKS[open[0]]}/${open[1]}`) } : url ? { label: t('Open'), onClick: () => openDoc(url) } : undefined, duration: open || url ? 9000 : 4500 });
      if ((r.result as any)?.tempPassword) toast.info(`${t('Temporary password')}: ${(r.result as any).tempPassword}`, { duration: 30000 });
      if (url && !open) openDoc(url);
      onDone?.();
    },
    onError: (e: any) => { const m = e?.message ?? 'Failed'; if (active && (ACTION_FORMS[`${res.key}.${active.key}`]?.length ?? 0) > 0) setErr(m); else { setActive(null); toast.error(m); } },
  });
  const [override, setOverride] = useState<string | null>(null);
  const act = (a: ActionDef) => { setErr(undefined); if (ACTION_OVERRIDES[`${res.key}.${a.key}`]) { setOverride(a.key); return; } const f = ACTION_FORMS[`${res.key}.${a.key}`]; if ((f && f.length) || a.confirm || a.danger) setActive(a); else run.mutate({ key: a.key, body: {} }); };
  const defs = res.actions.filter((a) => avail.includes(a.key));
  if (!defs.length) return null;
  const Override = override ? ACTION_OVERRIDES[`${res.key}.${override}`] : null;
  const fields = active ? ACTION_FORMS[`${res.key}.${active.key}`] ?? [] : [];
  const missing = fields.some((f) => f.required && (form[f.name] == null || form[f.name] === '' || (Array.isArray(form[f.name]) && !form[f.name].length)));
  return (
    <>
      {Override && <Override row={row} res={res} onClose={() => setOverride(null)} onDone={() => { setOverride(null); qc.invalidateQueries({ queryKey: ['detail', res.slug, row.id] }); qc.invalidateQueries({ queryKey: ['list', res.slug] }); onDone?.(); }} />}
      {defs.map((a, i) => <Button key={a.key} size="md" variant={a.danger ? 'secondary' : i === 0 ? 'primary' : 'secondary'} className={a.danger ? 'text-danger' : ''} loading={run.isPending && run.variables?.key === a.key} onClick={() => act(a)}>{lang === 'ar' ? a.ar : a.en}</Button>)}
      <Modal open={!!active} onClose={() => setActive(null)} title={active ? (lang === 'ar' ? active.ar : active.en) : ''} footer={<><Button variant="secondary" onClick={() => setActive(null)}>{t('Cancel')}</Button><Button variant={active?.danger ? 'danger' : 'primary'} loading={run.isPending} disabled={missing} onClick={() => active && run.mutate({ key: active.key, body: form })}>{t('Confirm')}</Button></>}>
        <div className="space-y-4">
          {fields.length === 0 && <p className="text-sm text-muted">{active?.danger ? t('This cannot be undone.') : t('Are you sure?')}</p>}
          {fields.map((f) => (
            <FieldWrap key={f.name} label={t(f.label)} required={f.required}>
              {f.type === 'ref' ? <FieldInput field={{ name: f.name, type: 'ref', ref: f.ref, required: !!f.required } as any} res={res} value={form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} filter={f.filter} />
                : f.type === 'refs' ? <RefMulti resKey={f.ref!} value={form[f.name]} onChange={(v) => setForm({ ...form, [f.name]: v })} filter={f.filter} />
                : f.type === 'select' ? <Select className="h-10 bg-card text-sm" value={form[f.name] ?? f.options![0]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</Select>
                : f.type === 'textarea' ? <Textarea rows={3} className="bg-card" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                : <Input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} className="h-10 bg-card" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />}
            </FieldWrap>
          ))}
          {err && <p role="alert" className="rounded-md border border-danger/25 bg-danger-bg p-3 text-small text-danger">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
import { RefPicker } from './fields';
const SupplierChecklist = ({ value, onChange }: { value: any; onChange: (v: any) => void }) => {
  const { t } = useT(); const sel: string[] = value ?? [];
  const q = useQuery({ queryKey: ['suppliers-pick'], queryFn: () => api<any>('/api/v1/r/supplier', { query: { limit: 100, 'f.status': 'active', sort: 'name:asc' } }) });
  if (q.isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  const rows: any[] = q.data?.data ?? []; const all = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: string) => onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-small text-muted"><span>{sel.length} {t('selected')}</span><button type="button" className="font-semibold text-navy hover:underline" onClick={() => onChange(all ? [] : rows.map((r) => r.id))}>{all ? t('Clear all') : t('Select all')}</button></div>
      <ul className="max-h-[46vh] space-y-2 overflow-y-auto pe-1">{rows.map((r) => { const on = sel.includes(r.id); const brands: string[] = Array.isArray(r.brands) ? r.brands.slice(0, 4) : [];
        return (<li key={r.id}><button type="button" onClick={() => toggle(r.id)} aria-pressed={on} className={cn('flex w-full items-center gap-3 rounded-lg border p-3 text-start transition-all', on ? 'border-gold bg-gold-light shadow-sm' : 'border-line bg-card hover:border-gold-border')}>
          <span className={cn('grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 transition-colors', on ? 'border-navy bg-navy text-white' : 'border-line bg-card text-transparent')}><Check size={14} /></span>
          <span className="min-w-0 flex-1"><b className="block truncate text-sm text-navy">{r.name}</b><span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">{r.code && <span className="num">{r.code}</span>}{r.rating != null && <span>★ {Number(r.rating).toFixed(1)}</span>}{r.onTimePct != null && <span>{Math.round(Number(r.onTimePct))}% {t('on time')}</span>}{r.leadTimeDays != null && <span>{r.leadTimeDays} {t('days')}</span>}</span>{brands.length > 0 && <span className="mt-1.5 flex flex-wrap gap-1">{brands.map((b) => <Badge key={b} tone="muted">{b}</Badge>)}</span>}</span>
        </button></li>); })}</ul>
    </div>
  );
};
const RefMulti = (p: { resKey: string; value: any; onChange: (v: any) => void; filter?: any }) => p.resKey === 'Supplier' ? <SupplierChecklist value={p.value} onChange={p.onChange} /> : <RefPicker {...p} multiple />;

// ---- inline lines editor ----
export function LinesEditor({ parent, child, rows, onChange, readOnly, errors }: { parent: ResourceDef; child: { key: string; fk: string }; rows: any[]; onChange: (r: any[]) => void; readOnly?: boolean; errors?: Record<string, string> }) {
  const { t, lang, fl, rl } = useT(); const cres = BY_KEY[child.key];
  const cols = formFields(cres, child.fk).filter((f) => f.type !== 'json').slice(0, 9);
  const upd = (i: number, name: string, v: any) => onChange(rows.map((r, j) => (j === i ? { ...r, [name]: v } : r)));
  const totalKey = cols.find((f) => f.name === 'lineTotal' || f.name === 'total' || f.name === 'amount')?.name;
  const sum = readOnly && totalKey && rows.length > 0 ? rows.reduce((s, r) => s + (Number(r[totalKey]) || 0), 0) : null;
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={rl(cres, true)}
        sub={`${rows.length} ${rows.length === 1 ? t('line') : t('lines')}`}
        actions={
          !readOnly ? (
            <Button size="sm" variant="soft" icon="plus" onClick={() => onChange([...rows, Object.fromEntries(cres.fields.filter((f) => f.type === 'enum' && f.required === false).map((f) => [f.name, undefined]))])}>
              {t('Add line')}
            </Button>
          ) : sum != null ? (
            <div className="rounded-sm border border-line bg-soft/60 px-3 py-1 text-caption">
              <span className="me-1.5 text-muted">{t('Total')}:</span>
              <span className="num font-bold text-navy">{fmtMoney(sum, lang)}</span>
            </div>
          ) : undefined
        }
      />
      {rows.length === 0 ? <EmptyState icon={cres.icon} title={t('Nothing here yet')} desc={readOnly ? undefined : t('Add the first line to get started.')} /> : (
        <div className="sticky-head px-3 pb-3 pt-2">
          <table className="w-full min-w-[720px] text-small">
            <thead>
              <tr className="bg-soft text-caption font-semibold text-strong">
                <th className="w-10 rounded-s-sm px-3 py-2.5 text-center">#</th>
                {cols.map((f, idx) => (
                  <th
                    key={f.name}
                    className={cn(
                      'px-3 py-2.5 font-semibold',
                      isNum(f) && readOnly ? 'text-end' : 'text-start',
                      readOnly && idx === cols.length - 1 && 'rounded-e-sm'
                    )}
                  >
                    {fl(cres, f)}{!readOnly && f.required && <span className="text-danger"> *</span>}
                  </th>
                ))}
                {!readOnly && <th className="w-10 rounded-e-sm" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r, i) => (
                <tr key={r.id ?? i} className="transition-colors hover:bg-soft/45">
                  <td className="num px-3 py-2.5 text-center text-caption font-medium text-muted">{i + 1}</td>
                  {cols.map((f) => (
                    <td key={f.name} className={cn('min-w-28 px-3 py-2.5', isNum(f) && readOnly && 'num text-end font-semibold')}>
                      {readOnly ? <FieldValue field={f} row={r} res={cres} /> : <FieldInput field={f} res={cres} value={r[f.name]} onChange={(v) => upd(i, f.name, v)} error={errors?.[`${child.key}.${i}.${f.name}`]} />}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-2 text-center">
                      <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-sm p-1.5 text-danger transition-colors hover:bg-danger-bg" aria-label={t('Remove')}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---- header form (create + edit) ----
export function ResourceForm({ res, initial, childrenInitial, mode, onSaved, onCancel }: { res: ResourceDef; initial?: any; childrenInitial?: Record<string, any[]>; mode: 'create' | 'edit'; onSaved: (row: any) => void; onCancel: () => void }) {
  const { t, fl, rl } = useT(); const qc = useQueryClient();
  const [vals, setVals] = useState<Record<string, any>>(() => ({ ...(initial ?? {}) }));
  const [kids, setKids] = useState<Record<string, any[]>>(() => ({ ...(childrenInitial ?? Object.fromEntries(res.children.map((c) => [c.key, []]))) }));
  const [errs, setErrs] = useState<Record<string, string>>({}); const [formErr, setFormErr] = useState<string>();
  const fields = formFields(res).filter((f) => !(res.actions.length && f.name === res.statusField));
  const save = useMutation({
    mutationFn: () => {
      const clean = (o: any, r: ResourceDef) => Object.fromEntries(r.fields.filter((f) => !f.readonly && o[f.name] !== undefined).map((f) => [f.name, o[f.name] === '' ? null : o[f.name]]));
      const body: any = clean(vals, res);
      if (mode === 'edit') body.version = initial?.version;
      if (res.children.length) body.children = Object.fromEntries(res.children.map((c) => [c.key, (kids[c.key] ?? []).map((k) => ({ ...(k.id ? { id: k.id } : {}), ...clean(k, BY_KEY[c.key]) }))]));
      return mode === 'create' ? api<{ data: any }>(`/api/v1/r/${res.slug}`, { method: 'POST', body }) : api<{ data: any }>(`/api/v1/r/${res.slug}/${initial.id}`, { method: 'PATCH', body });
    },
    onSuccess: (r) => { toast.success(mode === 'create' ? t('Created') : t('Saved successfully')); qc.invalidateQueries({ queryKey: ['list', res.slug] }); qc.invalidateQueries({ queryKey: ['detail', res.slug] }); onSaved(r.data); },
    onError: (e: any) => { setErrs(fieldErrors(e)); setFormErr(e instanceof ApiError && e.status === 409 && e.code === 'version_conflict' ? t('Someone else changed this record. Reload and try again.') : e.message); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  });
  const submit = (e: React.FormEvent) => { e.preventDefault(); setErrs({}); setFormErr(undefined); save.mutate(); };
  return (
    <form onSubmit={submit} className="space-y-5">
      {formErr && <div role="alert" className="rounded-xl border border-danger/30 bg-danger/10 p-3.5 text-sm text-danger">{formErr}</div>}
      {groupFields(fields).map((g) => <Section key={g.key} title={g.title} icon={g.icon}><div className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
        {g.items.map((f) => <FieldWrap key={f.name} label={fl(res, f)} required={f.required} error={errs[f.name]} className={f.type === 'text' || f.type === 'json' ? 'sm:col-span-2 xl:col-span-3' : ''}><FieldInput field={f} res={res} value={vals[f.name]} onChange={(v) => setVals({ ...vals, [f.name]: v })} error={errs[f.name]} /></FieldWrap>)}
      </div></Section>)}
      {res.children.map((c) => <LinesEditor key={c.key} parent={res} child={c} rows={kids[c.key] ?? []} onChange={(r) => setKids({ ...kids, [c.key]: r })} errors={errs} />)}
      <div className="sticky bottom-0 z-10 -mx-4 flex justify-end gap-2 border-t border-line bg-card/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"><Button type="button" variant="secondary" onClick={onCancel}>{t('Cancel')}</Button><Button type="submit" loading={save.isPending}>{mode === 'create' ? `${t('Create')} ${rl(res)}` : t('Save')}</Button></div>
    </form>
  );
}

// ---- attachments (PLT-08) ----
export function AttachmentsPanel({ refType, refId, canUpload = true, kind = 'document' }: { refType: string; refId: string; canUpload?: boolean; kind?: string }) {
  const { t, lang } = useT(); const qc = useQueryClient(); const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false);
  const q = useQuery({ queryKey: ['files', refType, refId], queryFn: () => api<{ data: any[] }>(`/api/v1/files/by-ref/${refType}/${refId}`) });
  const upload = async (file: File) => {
    setBusy(true);
    try { const fd = new FormData(); fd.append('refType', refType); fd.append('refId', refId); fd.append('kind', kind); fd.append('file', file); await api('/api/v1/files', { method: 'POST', form: fd }); toast.success(t('Uploaded')); qc.invalidateQueries({ queryKey: ['files', refType, refId] }); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  };
  const del = useMutation({ mutationFn: (id: string) => api(`/api/v1/files/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success(t('Deleted')); qc.invalidateQueries({ queryKey: ['files', refType, refId] }); }, onError: (e: any) => toast.error(e.message) });
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title={t('Attachments')}
        sub={q.data?.data.length ? `${q.data.data.length} ${t('files')}` : undefined}
        actions={canUpload && <><input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><Button size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => input.current?.click()}>{t('Upload')}</Button></>}
      />
      {q.isLoading ? <SkeletonRows rows={3} cols={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : q.data!.data.length === 0 ? <EmptyState icon="paperclip" title={t('No attachments')} desc={t('PDF, Excel, CSV, images up to 15 MB.')} action={canUpload ? <Button size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => input.current?.click()}>{t('Upload')}</Button> : undefined} /> : (
        <ul className="mt-2 divide-y divide-line border-t border-line">{q.data!.data.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-soft/45">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-gold-light text-gold-text"><FileText size={16} /></span>
              <div className="min-w-0">
                <p className="truncate text-small font-semibold text-fg">{f.fileName}</p>
                <p className="num text-caption text-muted">{(f.size / 1024).toFixed(0)} KB · {fmtDateTime(f.createdAt, lang)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button size="sm" variant="secondary" icon="download" onClick={() => download(`/api/v1/files/${f.id}`, f.fileName).catch((e) => toast.error(e.message))}>{t('Download')}</Button>
              <button type="button" onClick={() => del.mutate(f.id)} className="rounded-sm p-2 text-danger transition-colors hover:bg-danger-bg" aria-label={t('Delete')}><Trash2 size={15} /></button>
            </div>
          </li>
        ))}</ul>
      )}
    </Card>
  );
}

function HistoryPanel({ res, id }: { res: ResourceDef; id: string }) {
  const { t, lang, el, fl } = useT();
  const q = useQuery({ queryKey: ['history', res.slug, id], queryFn: () => api<{ data: any[] }>(`/api/v1/r/${res.slug}/${id}/history`) });
  if (q.isLoading) return <Card><SkeletonRows rows={4} cols={3} /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} compact /></Card>;
  const items = q.data!.data;
  if (!items.length) return <Card><EmptyState icon="history" title={t('No history yet')} /></Card>;
  const diff = (b: any, a: any) => Object.keys({ ...(a ?? {}), ...(b ?? {}) }).filter((k) => !['updatedAt', 'version', 'createdAt'].includes(k) && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).slice(0, 6);
  const fmtVal = (k: string, v: any) => {
    if (v == null || v === '') return '—';
    const f = res.fields.find((x) => x.name === k);
    return f?.type === 'enum' || k === 'status' ? el(String(v)) : String(v).slice(0, 40);
  };
  return (
    <Card>
      <ol className="p-5">
        {items.map((h, i) => (
          <li key={h.id} className="relative flex gap-3.5 pb-5 last:pb-0">
            <div className="relative flex w-3 shrink-0 flex-col items-center">
              <span className="mt-[7px] h-2.5 w-2.5 shrink-0 rounded-full bg-navy ring-4 ring-card" />
              {i < items.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                  <Badge
                    tone={h.action === 'delete' || h.action === 'deny' ? 'danger' : h.action === 'create' ? 'success' : 'info'}
                    className="min-w-[68px] justify-center"
                  >
                    {el(h.action)}
                  </Badge>
                  <span className="truncate text-small font-semibold text-fg">{h.userName ?? '—'}</span>
                </div>
                <span className="num text-caption text-muted">{fmtDateTime(h.createdAt, lang)}</span>
              </div>
              {h.action === 'update' && (
                <ul className="mt-2 space-y-1 text-caption text-muted">
                  {diff(h.before, h.after).map((k) => (
                    <li key={k} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-strong">{fl(res, k)}:</span>
                      <s className="opacity-65">{fmtVal(k, h.before?.[k])}</s>
                      <span aria-hidden>→</span>
                      <span className="font-medium text-fg">{fmtVal(k, h.after?.[k])}</span>
                    </li>
                  ))}
                </ul>
              )}
              {h.action === 'action' && h.after?.status && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-caption">
                  {h.before?.status && (
                    <>
                      <span className="inline-flex h-6 items-center rounded-xs bg-soft px-2 font-medium text-muted">{el(String(h.before.status))}</span>
                      <span className="text-muted" aria-hidden>→</span>
                    </>
                  )}
                  <StatusBadge value={String(h.after.status)} />
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---- layout building blocks shared by detail + form ----
const isDate = (f: Field) => f.type === 'date' || f.type === 'datetime';
const isNum = (f: Field) => f.type === 'decimal' || f.type === 'int';
/** Split a resource's fields into readable groups instead of one long grid. */
export function groupFields(fields: Field[]) {
  return [
    { key: 'general', title: 'Overview', icon: 'layout-list', items: fields.filter((f) => !isDate(f) && !isNum(f)) },
    { key: 'amounts', title: 'Figures', icon: 'calculator', items: fields.filter(isNum) },
    { key: 'dates', title: 'Dates & timing', icon: 'calendar-clock', items: fields.filter(isDate) },
  ].filter((g) => g.items.length);
}
export function Section({ title, icon, count, children }: { title: string; icon: string; count?: number; children: ReactNode }) {
  const { t } = useT();
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2.5 border-b border-line bg-soft/55 px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-sm bg-gold-light text-gold-text"><Icon name={icon} size={15} /></span>
          <h3 className="text-small font-bold text-fg">{t(title)}</h3>
        </div>
        {count != null && <span className="num rounded-xs border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">{count}</span>}
      </div>
      <div className="overflow-hidden">{children}</div>
    </Card>
  );
}
const Cell = ({ label, children, prominent }: { label: ReactNode; children: ReactNode; prominent?: boolean }) => (
  <div className="min-w-0">
    <dt className="text-[11.5px] font-medium text-muted">{label}</dt>
    <dd className={cn('mt-1 min-h-[22px] break-words text-fg', prominent ? 'num text-[17px] font-bold text-navy' : 'text-body font-medium')}>{children}</dd>
  </div>
);

function RecordRail({ res, row, id, onHistory }: { res: ResourceDef; row: any; id: string; onHistory?: () => void }) {
  const { t, lang, el } = useT();
  const [copied, setCopied] = useState(false);
  const q = useQuery({ queryKey: ['history', res.slug, id], queryFn: () => api<{ data: any[] }>(`/api/v1/r/${res.slug}/${id}/history`), retry: false });
  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(String(row.id));
      setCopied(true);
      toast.success(t('Copied'));
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore clipboard errors
    }
  };
  const rows: [string, ReactNode][] = [
    [t('Created'), fmtDateTime(row.createdAt, lang)],
    [t('Last updated'), fmtDateTime(row.updatedAt ?? row.createdAt, lang)],
    [t('Version'), <Badge key="v" tone="muted">v{row.version ?? 1}</Badge>],
    [
      t('Record ID'),
      <button key="i" type="button" onClick={copyId} title={String(row.id)} className="inline-flex items-center gap-1.5 rounded-xs border border-line bg-soft/60 px-2 py-0.5 font-mono text-[11.5px] text-navy transition-colors hover:border-gold-border hover:bg-card">
        <span>{String(row.id).slice(0, 8)}</span>
        {copied ? <Check size={11} className="text-success" /> : <Copy size={11} className="text-muted" />}
      </button>,
    ],
  ];
  const hist = q.data?.data.slice(0, 5) ?? [];
  return (
    <aside className="space-y-5">
      <Card className="overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line bg-soft/55 px-5 py-3">
          <span className="grid h-6 w-6 place-items-center rounded-sm bg-navy/10 text-navy"><Icon name="info" size={13} /></span>
          <h3 className="text-small font-bold">{t('Record')}</h3>
        </div>
        <dl className="divide-y divide-line">
          {rows.map(([l, v]) => (
            <div key={l} className="flex items-center justify-between gap-3 px-5 py-3 text-small">
              <dt className="text-muted">{l}</dt>
              <dd className="num font-semibold text-fg">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line bg-soft/55 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center rounded-sm bg-gold-light text-gold-text"><Icon name="history" size={13} /></span>
            <h3 className="text-small font-bold">{t('Recent activity')}</h3>
          </div>
          {onHistory && hist.length > 0 && (
            <button type="button" onClick={onHistory} className="text-caption font-semibold text-navy hover:underline">
              {t('View all')}
            </button>
          )}
        </div>
        {q.isLoading ? (
          <SkeletonRows rows={3} cols={1} />
        ) : !hist.length ? (
          <p className="p-5 text-small text-muted">{t('No history yet')}</p>
        ) : (
          <ol className="p-5">
            {hist.map((h, i) => (
              <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                <div className="flex w-2.5 shrink-0 flex-col items-center">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold" />
                  {i < hist.length - 1 && <span className="mt-1 w-px flex-1 bg-line" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-small font-semibold text-fg">
                    {el(h.action)}
                    {h.action === 'action' && h.after?.status ? ` → ${el(String(h.after.status))}` : ''}
                  </p>
                  <p className="text-caption text-muted">
                    {h.userName ?? '—'} · {timeAgo(h.createdAt, lang)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </aside>
  );
}

const TERMINAL_BAD = new Set(['cancelled', 'rejected', 'lost', 'expired', 'voided', 'failed', 'refunded', 'bounced', 'declined', 'revoked', 'rolled_back', 'no_show']);
function WorkflowBar({ res, status }: { res: ResourceDef; status?: string }) {
  const { el } = useT();
  const sf = res.statusField ? res.fields.find((f) => f.name === res.statusField && f.type === 'enum') : null;
  if (!sf?.values || sf.values.length < 3 || !status) return null;
  const steps = sf.values.filter((v) => !TERMINAL_BAD.has(v));
  const cur = steps.indexOf(status);
  if (steps.length < 3 || steps.length > 7) return null;
  return (
    <div className="no-scrollbar flex items-center gap-1 overflow-x-auto border-t border-line bg-soft/30 px-5 py-2.5">
      {steps.map((step, i) => {
        const done = cur >= 0 && i < cur;
        const active = i === cur;
        return (
          <div key={step} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-xs px-2 py-0.5 text-[11px] font-semibold transition-colors',
                active
                  ? 'bg-navy text-white'
                  : done
                    ? 'bg-success-bg/80 text-success'
                    : 'text-muted'
              )}
            >
              {done ? <CheckCircle2 size={11} /> : <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-gold' : 'bg-line')} />}
              <span>{el(step)}</span>
            </span>
            {i < steps.length - 1 && <span className={cn('h-px w-4 shrink-0', done ? 'bg-success/50' : 'bg-line')} aria-hidden />}
          </div>
        );
      })}
    </div>
  );
}

// ---- the generic detail page ----
export function ResourceDetail({ res, id }: { res: ResourceDef; id: string }) {
  const base = useBase();
  const { t, lang, rl, fl } = useT(); const { can, me } = useAuth(); const router = useRouter(); const qc = useQueryClient();
  const [tab, setTab] = useState('details'); const [editing, setEditing] = useState(false); const [del, setDel] = useState(false);
  const q = useQuery({ queryKey: ['detail', res.slug, id], queryFn: ({ signal }) => api<{ data: any }>(`/api/v1/r/${res.slug}/${id}`, { signal }) });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/r/${res.slug}/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success(t('Deleted')); qc.invalidateQueries({ queryKey: ['list', res.slug] }); router.replace(`${base}/${res.slug}`); }, onError: (e: any) => { setDel(false); toast.error(e.message); } });
  if (q.isLoading) return (
    <div className="space-y-5">
      <Card className="p-5"><div className="flex items-center gap-3.5"><Skeleton className="h-10 w-10" /><Skeleton className="h-12 w-12" /><div className="space-y-2"><Skeleton className="h-3 w-36" /><Skeleton className="h-6 w-56" /></div></div></Card>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]"><Card className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}</Card><Card className="space-y-3 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</Card></div>
    </div>
  );
  if (q.isError) { const e: any = q.error; return e?.status === 404 ? <EmptyState icon="file-question" title={`${rl(res)} ${t('not found')}`} action={<Button onClick={() => router.push(`${base}/${res.slug}`)}>{t('Back')}</Button>} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />; }
  const row = q.data!.data; const kids: Record<string, any[]> = row._children ?? {};
  const editable = can(res, 'update') && isEditable(res, row);
  const title = res.fields.find((f) => f.name === res.label) ? (row[res.label] ?? row.number ?? row.id.slice(0, 8)) : row.id.slice(0, 8);
  const refTitle = row._refs?.[res.label]?.label ?? title;
  const STAFF_ONLY = new Set(['Request:ai', 'Rfq:compare']); // customers and suppliers must not see AI matching or supplier price comparison
  const extras = (EXTRA_TABS[res.key]?.(row, res) ?? []).filter((x) => me?.kind === 'staff' || !STAFF_ONLY.has(`${res.key}:${x.key}`));
  const tabs = [{ key: 'details', label: t('Details'), icon: 'file-text' }, ...res.children.map((c) => ({ key: `c:${c.key}`, label: rl(c.key, true), count: kids[c.key]?.length, icon: BY_KEY[c.key].icon })), ...extras.map((x) => ({ key: `x:${x.key}`, label: x.label, icon: x.icon })), { key: 'files', label: t('Attachments'), icon: 'paperclip' }, ...(can(res, 'read') ? [{ key: 'history', label: t('History'), icon: 'history' }] : [])];

  if (editing) return (
    <>
      <PageHeader title={`${t('Edit')} ${rl(res)}`} sub={String(refTitle)} back={() => setEditing(false)} />
      <ResourceForm res={res} mode="edit" initial={row} childrenInitial={kids} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
    </>
  );
  const vis = res.fields.filter((f) => !f.hidden); const B = lang === 'ar' ? ArrowRight : ArrowLeft;
  // headline facts: up to two linked records, one amount, one date
  const facts = [...vis.filter((f) => f.type === 'ref').slice(0, 2), ...vis.filter(isNum).slice(0, 1), ...vis.filter(isDate).filter((f) => !/created|updated/i.test(f.name)).slice(0, 1)].filter((f) => f.name !== res.label && row[f.name] != null && row[f.name] !== '').slice(0, 4);
  const factCols = facts.length === 1 ? 'grid-cols-1' : facts.length === 2 ? 'sm:grid-cols-2' : facts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';
  return (
    <div className="space-y-5">
      <Card className="relative overflow-hidden before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-gradient-to-r before:from-navy before:via-navy-light before:to-gold">
        <div className="flex flex-wrap items-center justify-between gap-4 p-5 pt-6">
          <div className="flex min-w-0 items-center gap-3.5">
            <button onClick={() => router.push(`${base}/${res.slug}`)} aria-label={t('Back')} className="grid h-10 w-10 shrink-0 place-items-center rounded-sm border border-line bg-card text-muted transition-colors hover:border-navy/40 hover:bg-soft hover:text-fg"><B size={16} /></button>
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-gold/25 bg-gradient-to-br from-[#132E54] to-[#0B1F3A] text-gold shadow-sm"><Icon name={res.icon} size={22} /></span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link href={`${base}/${res.slug}`} className="overline text-muted transition-colors hover:text-navy">{rl(res)}</Link>
                <span className="h-3 w-px shrink-0 bg-line" aria-hidden />
                <span className="text-caption text-muted">{t('Created')} <span className="num">{fmtDateTime(row.createdAt, lang)}</span></span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-2.5"><h1 className="truncate text-page-title tracking-tight">{String(refTitle)}</h1>{res.statusField && <StatusBadge value={row[res.statusField]} />}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ActionBar res={res} row={row} />
            {EXTRA_ACTIONS[res.key]?.(row, res)}
            {editable && <Button variant="secondary" icon="pencil" onClick={() => setEditing(true)}>{t('Edit')}</Button>}
            {can(res, 'delete') && !res.noDelete && !res.immutable && <Button variant="ghost" className="text-danger hover:bg-danger-bg/60" icon="trash-2" onClick={() => setDel(true)} aria-label={t('Delete')} />}
          </div>
        </div>
        {res.statusField && <WorkflowBar res={res} status={row[res.statusField]} />}
        {facts.length > 0 && (
          <dl className={cn('grid divide-y divide-line border-t border-line bg-soft/40 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse', factCols)}>
            {facts.map((f) => (
              <div key={f.name} className="min-w-0 px-5 py-3.5">
                <dt className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{fl(res, f)}</dt>
                <dd className={cn('mt-1 truncate text-[15px] font-semibold text-fg', isNum(f) && 'num text-[17px] font-bold text-navy')}>
                  <FieldValue field={f} row={row} res={res} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        <div className="border-t border-line px-3"><Tabs tabs={tabs} value={tab as any} onChange={setTab as any} /></div>
      </Card>
      <div className="space-y-5 empty:hidden [&>*]:!mb-0">{EXTRA_HEADER[res.key]?.(row, res)}</div>
      {tab === 'details' && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-5">
            {groupFields(vis).map((g) => {
              const isWide = (f: Field) => f.type === 'text' && /note|desc|reason|comment|address/i.test(f.name);
              const regular = g.items.filter((f) => !isWide(f));
              const wideItems = g.items.filter(isWide);
              const figCols = regular.length === 1 ? 'grid-cols-1' : regular.length === 2 ? 'sm:grid-cols-2' : regular.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-3';
              return (
                <Section key={g.key} title={g.title} icon={g.icon} count={g.items.length}>
                  {g.key === 'amounts' ? (
                    <dl className={cn('grid divide-y divide-line sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse', figCols)}>
                      {regular.map((f) => (
                        <div key={f.name} className={cn('min-w-0 px-5 py-4', /^total$/i.test(f.name) && 'bg-gold-light/30')}>
                          <dt className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{fl(res, f)}</dt>
                          <dd className="num mt-1.5 text-[18px] font-bold leading-tight text-fg">
                            <FieldValue field={f} row={row} res={res} />
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <>
                      {regular.length > 0 && (
                        <dl className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-3">
                          {regular.map((f) => (
                            <Cell key={f.name} label={fl(res, f)}>
                              <FieldValue field={f} row={row} res={res} />
                            </Cell>
                          ))}
                        </dl>
                      )}
                      {wideItems.length > 0 && (
                        <dl className="divide-y divide-line border-t border-line bg-soft/25">
                          {wideItems.map((f) => (
                            <div key={f.name} className="px-5 py-4">
                              <dt className="text-[11.5px] font-medium text-muted">{fl(res, f)}</dt>
                              <dd className="mt-1 whitespace-pre-wrap break-words text-body leading-relaxed text-fg">
                                <FieldValue field={f} row={row} res={res} />
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </>
                  )}
                </Section>
              );
            })}
          </div>
          <RecordRail res={res} row={row} id={id} onHistory={can(res, 'read') ? () => setTab('history') : undefined} />
        </div>
      )}
      {tab.startsWith('c:') && <LinesEditor parent={res} child={res.children.find((c) => `c:${c.key}` === tab)!} rows={kids[tab.slice(2)] ?? []} onChange={() => null} readOnly />}
      {tab.startsWith('x:') && extras.find((x) => `x:${x.key}` === tab)?.render}
      {tab === 'files' && <AttachmentsPanel refType={res.key} refId={id} canUpload={can(res, 'update') || can(res, 'read')} />}
      {tab === 'history' && <HistoryPanel res={res} id={id} />}
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} danger title={`${t('Delete')} ${rl(res)}`} message={t('This cannot be undone.')} confirmText={t('Delete')} />
    </div>
  );
}
void Link; void Plus; void Upload; void Paperclip; void Icon; void useEffect; void useMemo; void cn;
export type { ReactNode };
