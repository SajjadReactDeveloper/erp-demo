'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BY_KEY, type Field, type ResourceDef } from '@erp/shared';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtInt, fmtMoney, fmtNum, toInputDate, toInputDateTime } from '@/lib/format';
import { Badge, Checkbox, Input, Select, Spinner, StatusBadge, Textarea, cn } from '@/components/ui';
import { useBase } from './base';

export const useDebounced = <T,>(v: T, ms = 300) => { const [d, setD] = useState(v); useEffect(() => { const h = setTimeout(() => setD(v), ms); return () => clearTimeout(h); }, [v, ms]); return d; };

/** Searchable reference picker backed by /r/:slug/options. Supports single and multiple selection. */
export function RefPicker({ resKey, value, onChange, filter, disabled, placeholder, invalid, multiple }: { resKey: string; value: any; onChange: (v: any) => void; filter?: Record<string, string>; disabled?: boolean; placeholder?: string; invalid?: boolean; multiple?: boolean }) {
  const { t, rl } = useT(); const res = BY_KEY[resKey];
  const [open, setOpen] = useState(false); const [q, setQ] = useState(''); const dq = useDebounced(q, 250);
  const box = useRef<HTMLDivElement>(null);
  const ids: string[] = multiple ? (value ?? []) : value ? [value] : [];
  const opts = useQuery({ queryKey: ['options', resKey, dq, filter], enabled: open, queryFn: () => api<{ data: { id: string; label: string }[] }>(`/api/v1/r/${res.slug}/options`, { query: { q: dq, limit: 20, ...Object.fromEntries(Object.entries(filter ?? {}).map(([k, v]) => [`f.${k}`, v])) } }), staleTime: 15000 });
  const labels = useQuery({ queryKey: ['option-labels', resKey, ids.join(',')], enabled: ids.length > 0, queryFn: () => api<{ data: { id: string; label: string }[] }>(`/api/v1/r/${res.slug}/options`, { query: { ids: ids.join(','), limit: 50 } }), staleTime: 60000 });
  useEffect(() => { const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, []);
  const labelOf = (id: string) => labels.data?.data.find((x) => x.id === id)?.label ?? opts.data?.data.find((x) => x.id === id)?.label ?? '…';
  const pick = (id: string) => { if (multiple) onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]); else { onChange(id); setOpen(false); } };
  return (
    <div ref={box} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}
        className={cn('flex min-h-10 w-full items-center justify-between gap-2 rounded-xl border border-line bg-card px-3 py-1.5 text-start text-sm hover:border-muted/50 disabled:cursor-not-allowed disabled:bg-line/30', invalid && 'border-danger')}>
        <span className="flex flex-1 flex-wrap gap-1">
          {ids.length === 0 ? <span className="text-muted/70">{placeholder ?? `${t('Select...')} ${rl(res)}`}</span> : multiple ? ids.map((id) => <Badge key={id} tone="primary">{labelOf(id)}<X size={12} className="cursor-pointer" onClick={(e) => { e.stopPropagation(); pick(id); }} /></Badge>) : <span className="truncate">{labelOf(ids[0])}</span>}
        </span>
        <span className="flex items-center gap-1">{!multiple && value && !disabled && <X size={14} className="text-muted hover:text-fg" onClick={(e) => { e.stopPropagation(); onChange(null); }} />}<ChevronDown size={16} className="text-muted" /></span>
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-56 rounded-xl border border-line bg-card p-2 shadow-2xl animate-in">
          <div className="relative mb-2"><Search size={14} className="pointer-events-none absolute start-2.5 top-3 text-muted" /><Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Type to search...')} className="ps-8" /></div>
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {opts.isLoading && <li className="grid place-items-center py-4"><Spinner /></li>}
            {opts.isError && <li className="px-2 py-3 text-xs text-danger">{(opts.error as any)?.message}</li>}
            {opts.data?.data.length === 0 && <li className="px-2 py-3 text-center text-xs text-muted">{t('No results found')}</li>}
            {opts.data?.data.map((o) => (
              <li key={o.id} role="option" aria-selected={ids.includes(o.id)} onClick={() => pick(o.id)} className="flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm hover:bg-primary/10">
                <span className="truncate">{o.label}</span>{ids.includes(o.id) && <Check size={14} className="text-primary" />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const isListJson = (v: any) => Array.isArray(v) && v.every((x) => typeof x === 'string');
export function FieldInput({ field, res, value, onChange, error, disabled, filter }: { field: Field; res: ResourceDef; value: any; onChange: (v: any) => void; error?: string; disabled?: boolean; filter?: Record<string, string> }) {
  const { el, t } = useT(); const inv = !!error;
  switch (field.type) {
    case 'string': return <Input value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} invalid={inv} maxLength={500} dir={/email|url|iban|vat|phone|vin|number|code/i.test(field.name) ? 'ltr' : undefined} />;
    case 'text': return <Textarea value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} invalid={inv} />;
    case 'int': return <Input type="number" step="1" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} disabled={disabled} invalid={inv} dir="ltr" />;
    case 'decimal': return <Input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)} disabled={disabled} invalid={inv} dir="ltr" />;
    case 'bool': return <Checkbox checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} label={t(value ? 'Yes' : 'No')} />;
    case 'date': return <Input type="date" value={toInputDate(value)} onChange={(e) => onChange(e.target.value || null)} disabled={disabled} invalid={inv} dir="ltr" />;
    case 'datetime': return <Input type="datetime-local" value={toInputDateTime(value)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} disabled={disabled} invalid={inv} dir="ltr" />;
    case 'enum': return <Select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} invalid={inv}>{!field.required && <option value="" />}{field.values!.map((v) => <option key={v} value={v}>{el(v)}</option>)}</Select>;
    case 'ref': return <RefPicker resKey={field.ref!} value={value} onChange={onChange} disabled={disabled} invalid={inv} filter={filter} />;
    case 'json': return res.key === 'ApprovalRule' && field.name === 'steps' ? <ApprovalStepsInput value={value} onChange={onChange} disabled={disabled} /> : <JsonInput value={value} onChange={onChange} disabled={disabled} invalid={inv} />;
  }
}
/** Ordered approver chain: who approves, and how many hours they have before it escalates. */
function ApprovalStepsInput({ value, onChange, disabled }: { value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const { t } = useT(); const steps: { role: string; slaHours: number }[] = Array.isArray(value) ? value : [];
  const roles = useQuery({ queryKey: ['role-options'], queryFn: () => api<{ data: any[] }>('/api/v1/r/role', { query: { limit: 100 } }), staleTime: 60000 });
  const names = (roles.data?.data ?? []).map((r) => r.name).filter((n) => !['customer', 'supplier'].includes(n));
  const upd = (i: number, patch: any) => onChange(steps.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="space-y-2">
      {steps.length === 0 && <p className="border border-dashed border-line p-3 text-small text-muted">{t('No approvers yet. Add the first approval step.')}</p>}
      {steps.map((st, i) => (
        <div key={i} className="flex items-center gap-2 border border-line bg-soft/50 p-2">
          <span className="num grid h-8 w-8 shrink-0 place-items-center bg-navy text-small font-bold text-gold">{i + 1}</span>
          <Select value={st.role} onChange={(e) => upd(i, { role: e.target.value })} disabled={disabled} aria-label={t('Approver role')} className="h-9 flex-1"><option value="">{t('Select a role')}</option>{[...new Set([...names, st.role].filter(Boolean))].map((n) => <option key={n} value={n}>{n}</option>)}</Select>
          <div className="relative w-28"><Input type="number" min={1} value={st.slaHours ?? 24} onChange={(e) => upd(i, { slaHours: Number(e.target.value) })} disabled={disabled} dir="ltr" className="h-9 pe-9" aria-label={t('Hours to respond')} /><span className="pointer-events-none absolute end-3 top-2 text-caption text-muted">{t('hours')}</span></div>
          {!disabled && <button type="button" onClick={() => onChange(steps.filter((_, j) => j !== i))} className="grid h-8 w-8 shrink-0 place-items-center text-danger transition-colors hover:bg-danger-bg" aria-label={t('Remove')}><X size={16} /></button>}
        </div>))}
      {!disabled && <button type="button" onClick={() => onChange([...steps, { role: names.includes('manager') ? 'manager' : names[0] ?? '', slaHours: 24 }])} className="inline-flex h-9 items-center gap-2 border border-dashed border-line px-3 text-small font-semibold text-navy transition-colors hover:bg-soft">+ {t('Add approval step')}</button>}
    </div>
  );
}

function JsonInput({ value, onChange, disabled, invalid }: { value: any; onChange: (v: any) => void; disabled?: boolean; invalid?: boolean }) {
  const list = value == null || isListJson(value);
  const [raw, setRaw] = useState(() => (list ? (value ?? []).join(', ') : JSON.stringify(value, null, 2)));
  const [bad, setBad] = useState(false);
  if (list) return <Input value={raw} onChange={(e) => { setRaw(e.target.value); onChange(e.target.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean)); }} disabled={disabled} placeholder="a, b, c" invalid={invalid} />;
  return <Textarea value={raw} rows={5} className={cn('font-mono text-xs', (bad || invalid) && 'border-danger')} disabled={disabled} onChange={(e) => { setRaw(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} />;
}

const MONEY = /(total|amount|price|cost|balance|limit|spend|value|debit|credit|subtotal|exposure|overdue|cash|variance|expected|budget|ceiling|salary|fee)/i;
export function FieldValue({ field, row, res, refs }: { field: Field; row: any; res: ResourceDef; refs?: any }) {
  const base = useBase();
  const { lang, t, el } = useT(); const v = row[field.name];
  if (v == null || v === '') return <span className="text-muted/60">—</span>;
  switch (field.type) {
    case 'ref': { const r = (row._refs ?? refs ?? {})[field.name]; return r ? <Link href={`${base}/${BY_KEY[field.ref!].slug}/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-navy hover:underline">{r.label}</Link> : <span className="text-muted/60">—</span>; }
    case 'enum': return field.name === 'status' || /status|type|kind|severity|outcome|result/i.test(field.name) ? <StatusBadge value={v} /> : <Badge>{el(String(v))}</Badge>;
    case 'bool': return v ? <span className="inline-flex items-center gap-1 text-small font-semibold text-success"><Check size={15} />{t('Yes')}</span> : <span className="text-small text-muted">{t('No')}</span>;
    case 'date': return <span className="num">{fmtDate(v, lang)}</span>;
    case 'datetime': return <span className="num">{fmtDateTime(v, lang)}</span>;
    case 'decimal': { const n = Number(v); if (/margin/i.test(field.name) && /pct/i.test(field.name)) return <span className="num">{fmtNum(n * 100, lang, 1)}%</span>; if (/pct$/i.test(field.name)) return <span className="num">{fmtNum(n, lang, 1)}%</span>; return <span className="num">{MONEY.test(field.name) ? fmtMoney(n, lang) : fmtNum(n, lang, 2)}</span>; }
    case 'int': return <span className="num">{fmtInt(v, lang)}</span>;
    case 'json': return Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && 'role' in x) ? <span className="flex flex-wrap items-center gap-1.5">{v.map((x: any, i: number) => <span key={i} className="inline-flex items-center gap-1.5">{i > 0 && <span className="text-muted">→</span>}<Badge tone="gold">{x.role}{x.slaHours ? ` · ${x.slaHours}h` : ''}</Badge></span>)}</span> : isListJson(v) ? <span className="flex flex-wrap gap-1">{v.map((x: string) => <Badge key={x}>{x}</Badge>)}</span> : <code className="rounded bg-line/60 px-1.5 py-0.5 text-[11px]">{JSON.stringify(v).slice(0, 60)}</code>;
    default: return <span className={cn(/^(number|code|vin|partNumber|entryNo|xrefNumber|supplierPartNo|serialNo|batchNo|barcode|trackingNo|iban)$/.test(field.name) && 'font-mono text-[13px] font-semibold text-navy', /email|phone/i.test(field.name) && 'num')} dir={/email|url|vin|iban/i.test(field.name) ? 'ltr' : undefined}>{String(v).length > 120 ? String(v).slice(0, 120) + '…' : String(v)}</span>;
  }
}

export const listFields = (res: ResourceDef) => res.fields.filter((f) => f.list && !f.hidden).slice(0, 7);
export const formFields = (res: ResourceDef, fk?: string) => res.fields.filter((f) => !f.readonly && !f.hidden && f.name !== fk);
export const detailFields = (res: ResourceDef) => res.fields.filter((f) => !f.hidden && f.type !== 'json' || (f.type === 'json' && !f.hidden));
void useMemo;
