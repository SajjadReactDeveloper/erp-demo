'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY, type ActionDef, type Field, type ResourceDef } from '@erp/shared';
import { Paperclip, Plus, Trash2, Upload } from 'lucide-react';
import { ApiError, api, download, fieldErrors, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, CardHeader, ConfirmDialog, EmptyState, ErrorState, Field as FieldWrap, Icon, Modal, PageHeader, Skeleton, SkeletonRows, StatusBadge, Tabs, cn, toast } from '@/components/ui';
import { FieldInput, FieldValue, formFields } from './fields';
import { ResourceList } from './list';
import { EXTRA_TABS, EXTRA_HEADER, ACTION_OVERRIDES } from './extras';
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
                : f.type === 'select' ? <select className="h-10 w-full rounded-xl border border-line bg-card px-3 text-sm" value={form[f.name] ?? f.options![0]} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}>{f.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
                : f.type === 'textarea' ? <textarea rows={3} className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: e.target.value })} />
                : <input type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} className="h-10 w-full rounded-xl border border-line bg-card px-3 text-sm" value={form[f.name] ?? ''} onChange={(e) => setForm({ ...form, [f.name]: f.type === 'number' ? Number(e.target.value) : e.target.value })} />}
            </FieldWrap>
          ))}
          {err && <p role="alert" className="rounded-lg bg-danger/10 p-3 text-sm text-danger">{err}</p>}
        </div>
      </Modal>
    </>
  );
}
import { RefPicker } from './fields';
const RefMulti = (p: { resKey: string; value: any; onChange: (v: any) => void; filter?: any }) => <RefPicker {...p} multiple />;

// ---- inline lines editor ----
export function LinesEditor({ parent, child, rows, onChange, readOnly, errors }: { parent: ResourceDef; child: { key: string; fk: string }; rows: any[]; onChange: (r: any[]) => void; readOnly?: boolean; errors?: Record<string, string> }) {
  const { t, fl, rl } = useT(); const cres = BY_KEY[child.key];
  const cols = formFields(cres, child.fk).filter((f) => f.type !== 'json').slice(0, 9);
  const upd = (i: number, name: string, v: any) => onChange(rows.map((r, j) => (j === i ? { ...r, [name]: v } : r)));
  return (
    <Card className="overflow-hidden">
      <CardHeader title={rl(cres, true)} sub={`${rows.length}`} actions={!readOnly && <Button size="sm" variant="soft" icon="plus" onClick={() => onChange([...rows, Object.fromEntries(cres.fields.filter((f) => f.type === 'enum' && f.required === false).map((f) => [f.name, undefined]))])}>{t('Add line')}</Button>} />
      {rows.length === 0 ? <EmptyState icon={cres.icon} title={t('Nothing here yet')} desc={readOnly ? undefined : t('Add the first line to get started.')} /> : (
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-line bg-line/25 text-xs text-muted"><th className="w-8 px-2 py-2">#</th>{cols.map((f) => <th key={f.name} className="px-2 py-2 text-start font-semibold">{fl(cres, f)}{f.required && <span className="text-danger"> *</span>}</th>)}{!readOnly && <th className="w-10" />}</tr></thead>
          <tbody className="divide-y divide-line">{rows.map((r, i) => (
            <tr key={r.id ?? i}><td className="num px-2 py-1.5 text-center text-xs text-muted">{i + 1}</td>
              {cols.map((f) => <td key={f.name} className="min-w-32 px-2 py-1.5">{readOnly ? <FieldValue field={f} row={r} res={cres} /> : <FieldInput field={f} res={cres} value={r[f.name]} onChange={(v) => upd(i, f.name, v)} error={errors?.[`${child.key}.${i}.${f.name}`]} />}</td>)}
              {!readOnly && <td className="px-2"><button onClick={() => onChange(rows.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-danger hover:bg-danger/10" aria-label={t('Remove')}><Trash2 size={15} /></button></td>}
            </tr>))}</tbody></table></div>
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
      <Card className="p-5"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => <FieldWrap key={f.name} label={fl(res, f)} required={f.required} error={errs[f.name]} className={f.type === 'text' || f.type === 'json' ? 'sm:col-span-2 lg:col-span-3' : ''}><FieldInput field={f} res={res} value={vals[f.name]} onChange={(v) => setVals({ ...vals, [f.name]: v })} error={errs[f.name]} /></FieldWrap>)}
      </div></Card>
      {res.children.map((c) => <LinesEditor key={c.key} parent={res} child={c} rows={kids[c.key] ?? []} onChange={(r) => setKids({ ...kids, [c.key]: r })} errors={errs} />)}
      <div className="sticky bottom-3 z-10 flex justify-end gap-2 rounded-2xl border border-line bg-card/90 p-3 shadow-soft backdrop-blur"><Button type="button" variant="secondary" onClick={onCancel}>{t('Cancel')}</Button><Button type="submit" loading={save.isPending}>{mode === 'create' ? `${t('Create')} ${rl(res)}` : t('Save')}</Button></div>
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
    <Card>
      <CardHeader title={t('Attachments')} actions={canUpload && <><input ref={input} type="file" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><Button size="sm" variant="soft" icon="upload" loading={busy} onClick={() => input.current?.click()}>{t('Upload')}</Button></>} />
      {q.isLoading ? <SkeletonRows rows={3} cols={3} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} compact /> : q.data!.data.length === 0 ? <EmptyState icon="paperclip" title={t('No attachments')} desc={t('PDF, Excel, CSV, images up to 15 MB.')} /> : (
        <ul className="divide-y divide-line">{q.data!.data.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 px-5 py-3"><div className="flex min-w-0 items-center gap-3"><Paperclip size={16} className="text-muted" /><div className="min-w-0"><p className="truncate text-sm font-semibold">{f.fileName}</p><p className="num text-xs text-muted">{(f.size / 1024).toFixed(0)} KB · {fmtDateTime(f.createdAt, lang)}</p></div></div>
            <div className="flex gap-1"><Button size="sm" variant="ghost" icon="download" onClick={() => download(`/api/v1/files/${f.id}`, f.fileName).catch((e) => toast.error(e.message))}>{t('Download')}</Button><button onClick={() => del.mutate(f.id)} className="rounded-lg p-2 text-danger hover:bg-danger/10" aria-label={t('Delete')}><Trash2 size={15} /></button></div></li>))}</ul>
      )}
    </Card>
  );
}

function HistoryPanel({ res, id }: { res: ResourceDef; id: string }) {
  const { t, lang, el } = useT();
  const q = useQuery({ queryKey: ['history', res.slug, id], queryFn: () => api<{ data: any[] }>(`/api/v1/r/${res.slug}/${id}/history`) });
  if (q.isLoading) return <Card><SkeletonRows rows={4} cols={3} /></Card>;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} compact /></Card>;
  if (!q.data!.data.length) return <Card><EmptyState icon="history" title={t('No history yet')} /></Card>;
  const diff = (b: any, a: any) => Object.keys({ ...(a ?? {}), ...(b ?? {}) }).filter((k) => !['updatedAt', 'version', 'createdAt'].includes(k) && JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])).slice(0, 6);
  return (
    <Card><ol className="relative space-y-0 p-5">{q.data!.data.map((h) => (
      <li key={h.id} className="relative ps-6 pb-5 last:pb-0"><span className="absolute start-0 top-1.5 h-2.5 w-2.5 rounded-full bg-primary" /><span className="absolute start-[4px] top-4 h-full w-px bg-line" />
        <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={h.action === 'delete' || h.action === 'deny' ? 'danger' : h.action === 'create' ? 'success' : 'info'}>{el(h.action)}</Badge><b>{h.userName ?? '—'}</b><span className="text-xs text-muted">{fmtDateTime(h.createdAt, lang)}</span></div>
        {h.action === 'update' && <ul className="mt-1.5 space-y-0.5 text-xs text-muted">{diff(h.before, h.after).map((k) => <li key={k}><b className="text-fg">{k}</b>: <s className="opacity-60">{String(h.before?.[k] ?? '—').slice(0, 40)}</s> → {String(h.after?.[k] ?? '—').slice(0, 40)}</li>)}</ul>}
        {h.action === 'action' && h.after?.status && <p className="mt-1 text-xs text-muted">{String(h.before?.status ?? '')} → <b className="text-fg">{String(h.after.status)}</b></p>}
      </li>))}</ol></Card>
  );
}

// ---- the generic detail page ----
export function ResourceDetail({ res, id }: { res: ResourceDef; id: string }) {
  const base = useBase();
  const { t, lang, rl, fl } = useT(); const { can } = useAuth(); const router = useRouter(); const qc = useQueryClient();
  const [tab, setTab] = useState('details'); const [editing, setEditing] = useState(false); const [del, setDel] = useState(false);
  const q = useQuery({ queryKey: ['detail', res.slug, id], queryFn: ({ signal }) => api<{ data: any }>(`/api/v1/r/${res.slug}/${id}`, { signal }) });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/r/${res.slug}/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success(t('Deleted')); qc.invalidateQueries({ queryKey: ['list', res.slug] }); router.replace(`${base}/${res.slug}`); }, onError: (e: any) => { setDel(false); toast.error(e.message); } });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Card className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</Card></div>;
  if (q.isError) { const e: any = q.error; return e?.status === 404 ? <EmptyState icon="file-question" title={`${rl(res)} ${t('not found')}`} action={<Button onClick={() => router.push(`${base}/${res.slug}`)}>{t('Back')}</Button>} /> : <ErrorState error={q.error} onRetry={() => q.refetch()} />; }
  const row = q.data!.data; const kids: Record<string, any[]> = row._children ?? {};
  const editable = can(res, 'update') && isEditable(res, row);
  const title = res.fields.find((f) => f.name === res.label) ? (row[res.label] ?? row.number ?? row.id.slice(0, 8)) : row.id.slice(0, 8);
  const refTitle = row._refs?.[res.label]?.label ?? title;
  const extras = EXTRA_TABS[res.key]?.(row, res) ?? [];
  const tabs = [{ key: 'details', label: t('Details'), icon: 'file-text' }, ...res.children.map((c) => ({ key: `c:${c.key}`, label: rl(c.key, true), count: kids[c.key]?.length, icon: BY_KEY[c.key].icon })), ...extras.map((x) => ({ key: `x:${x.key}`, label: x.label, icon: x.icon })), { key: 'files', label: t('Attachments'), icon: 'paperclip' }, ...(can(res, 'read') ? [{ key: 'history', label: t('History'), icon: 'history' }] : [])];

  if (editing) return (
    <>
      <PageHeader title={`${t('Edit')} ${rl(res)}`} sub={String(refTitle)} back={() => setEditing(false)} />
      <ResourceForm res={res} mode="edit" initial={row} childrenInitial={kids} onCancel={() => setEditing(false)} onSaved={() => setEditing(false)} />
    </>
  );
  return (
    <>
      <PageHeader back={() => router.push(`${base}/${res.slug}`)} title={String(refTitle)} sub={rl(res)} badge={res.statusField ? <StatusBadge value={row[res.statusField]} /> : undefined}
        actions={<>
          <ActionBar res={res} row={row} />
          {editable && <Button variant="secondary" icon="pencil" onClick={() => setEditing(true)}>{t('Edit')}</Button>}
          {can(res, 'delete') && !res.noDelete && !res.immutable && <Button variant="ghost" className="text-danger" icon="trash-2" onClick={() => setDel(true)} aria-label={t('Delete')} />}
        </>} />
      {EXTRA_HEADER[res.key]?.(row, res)}
      <Tabs tabs={tabs} value={tab as any} onChange={setTab as any} />
      <div className="mt-5 space-y-5">
        {tab === 'details' && (
          <Card><dl className="grid gap-x-8 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">{res.fields.filter((f) => !f.hidden).map((f) => <div key={f.name} className="min-w-0"><dt className="mb-1 text-xs font-semibold text-muted">{fl(res, f)}</dt><dd className="text-sm"><FieldValue field={f} row={row} res={res} /></dd></div>)}
            <div><dt className="mb-1 text-xs font-semibold text-muted">{t('Created')}</dt><dd className="num text-sm">{fmtDateTime(row.createdAt, lang)}</dd></div></dl></Card>
        )}
        {tab.startsWith('c:') && <LinesEditor parent={res} child={res.children.find((c) => `c:${c.key}` === tab)!} rows={kids[tab.slice(2)] ?? []} onChange={() => null} readOnly />}
        {tab.startsWith('x:') && extras.find((x) => `x:${x.key}` === tab)?.render}
        {tab === 'files' && <AttachmentsPanel refType={res.key} refId={id} canUpload={can(res, 'update') || can(res, 'read')} />}
        {tab === 'history' && <HistoryPanel res={res} id={id} />}
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} onConfirm={() => remove.mutate()} loading={remove.isPending} danger title={`${t('Delete')} ${rl(res)}`} message={t('This cannot be undone.')} confirmText={t('Delete')} />
    </>
  );
}
void Link; void Plus; void Upload; void Icon; void useEffect; void useMemo; void cn;
export type { ReactNode };
