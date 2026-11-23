'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { BY_KEY, type ResourceDef } from '@erp/shared';
import { ArrowDown, ArrowUp, Download, Plus, Search, X } from 'lucide-react';
import { api, download } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, EmptyState, ErrorState, Icon, Input, PageHeader, Pagination, SkeletonRows, StatusBadge, cn, toast } from '@/components/ui';
import { FieldValue, listFields, useDebounced } from './fields';
import { fmtDate } from '@/lib/format';
import { useBase } from './base';

interface ListProps { res: ResourceDef; baseFilter?: Record<string, string>; embedded?: boolean; title?: string; hideStatusChips?: boolean; newHref?: string; onRow?: (row: any) => void; limit?: number; actionsExtra?: React.ReactNode }

export function ResourceList({ res, baseFilter, embedded, title, hideStatusChips, newHref, onRow, limit: defLimit = 25, actionsExtra }: ListProps) {
  const { t, lang, rl, fl } = useT(); const { can } = useAuth(); const base = useBase();
  const router = useRouter(); const path = usePathname(); const sp = useSearchParams();
  const [local, setLocal] = useState({ page: 1, limit: defLimit, q: '', sort: '', status: '' });
  const get = (k: string, d: string) => (embedded ? (local as any)[k] || d : sp.get(k) ?? d);
  const page = Number(get('page', '1')), limit = Number(get('limit', String(defLimit))), q = get('q', ''), sort = get('sort', ''), status = get('status', '');
  const set = (patch: Record<string, string | number>) => {
    if (embedded) return setLocal((l) => ({ ...l, ...patch }));
    const n = new URLSearchParams(sp.toString()); for (const [k, v] of Object.entries(patch)) (v === '' || v == null ? n.delete(k) : n.set(k, String(v)));
    router.replace(`${path}?${n.toString()}`, { scroll: false });
  };
  const [qInput, setQInput] = useState(q); const dq = useDebounced(qInput, 350);
  useEffect(() => { if (dq !== q) set({ q: dq, page: 1 }); /* eslint-disable-next-line */ }, [dq]);

  const cols = useMemo(() => listFields(res), [res]);
  const params: any = { page, limit, q, sort: sort || undefined, ...(status ? { 'f.status': status } : {}), ...Object.fromEntries(Object.entries(baseFilter ?? {}).map(([k, v]) => [`f.${k}`, v])) };
  const query = useQuery({ queryKey: ['list', res.slug, params], queryFn: ({ signal }) => api<{ data: any[]; meta: any }>(`/api/v1/r/${res.slug}`, { query: params, signal }), placeholderData: keepPreviousData });
  const statusField = res.fields.find((f) => f.name === 'status' && f.type === 'enum');
  const canCreate = can(res, 'create') && !res.sys && !res.immutable;
  const sortBy = (name: string) => { const [f, d] = (sort || '').split(':'); set({ sort: f === name && d === 'asc' ? `${name}:desc` : `${name}:asc`, page: 1 }); };
  const [sf, sd] = (sort || '').split(':');
  const exp = async (format: 'csv' | 'xlsx') => { try { await download(`/api/v1/r/${res.slug}/export`, `${res.slug}.${format}`, { format, q, ...(status ? { 'f.status': status } : {}) }); } catch (e: any) { toast.error(e.message); } };
  const rows = query.data?.data ?? []; const meta = query.data?.meta;
  const filtered = !!(q || status);

  const body = (
    <Card className={cn('overflow-hidden', !embedded && 'md:flex md:min-h-0 md:flex-1 md:flex-col')}>
      {embedded && <div className="flex items-center gap-2.5 border-b border-line bg-soft/60 px-5 py-3"><span className="grid h-7 w-7 place-items-center bg-gold-light text-gold-text"><Icon name={res.icon} size={15} /></span><h3 className="text-small font-bold">{title ?? rl(res, true)}</h3>{meta && <span className="num grid h-5 min-w-5 place-items-center bg-soft px-1.5 text-[11px] font-bold text-strong">{meta.total}</span>}<div className="ms-auto">{canCreate && <Button size="sm" variant="soft" icon="plus" onClick={() => router.push(newHref ?? `${base}/${res.slug}/new`)}>{t('New')}</Button>}</div></div>}
      {(!embedded || (meta?.total ?? 0) > limit || filtered) && <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm"><Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-muted" /><Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t('Search')} className="ps-9 pe-8" aria-label={t('Search')} />{qInput && <button className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted hover:text-fg" onClick={() => { setQInput(''); }} aria-label={t('Clear')}><X size={16} /></button>}</div>
        {statusField && !hideStatusChips && !embedded && (
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => set({ status: '', page: 1 })} className={cn('inline-flex h-9 items-center rounded-xs px-4 text-small font-semibold transition-colors', !status ? 'bg-navy text-white' : 'bg-soft text-strong hover:bg-line')}>{t('All')}</button>
            {statusField.values!.slice(0, 8).map((s) => <button key={s} onClick={() => set({ status: status === s ? '' : s, page: 1 })} className={cn('inline-flex h-9 items-center rounded-xs px-4 text-small font-semibold transition-colors', status === s ? 'bg-navy text-white' : 'bg-soft text-strong hover:bg-line')}><StatusLabel v={s} /></button>)}
          </div>
        )}
        <div className="ms-auto flex gap-1.5">{!embedded && can(res, 'read') && <><Button variant="secondary" size="sm" icon="file-spreadsheet" onClick={() => exp('xlsx')}>XLSX</Button><Button variant="secondary" size="sm" icon="download" onClick={() => exp('csv')}>CSV</Button></>}</div>
      </div>}
      {query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : query.isLoading ? <SkeletonRows cols={cols.length || 4} /> : rows.length === 0 ? (
        filtered ? <EmptyState icon="search-x" title={t('No results found')} desc={t('Try a different search or clear the filters.')} action={<Button variant="secondary" onClick={() => { setQInput(''); set({ q: '', status: '', page: 1 }); }}>{t('Reset')}</Button>} />
          : <EmptyState icon={res.icon} title={t('Nothing here yet')} desc={`${t('No')} ${rl(res, true)}`} action={canCreate ? <Button icon="plus" onClick={() => router.push(newHref ?? `${base}/${res.slug}/new`)}>{t('New ')}{rl(res)}</Button> : undefined} />
      ) : (
        <div className={cn('sticky-head transition-opacity', embedded ? '!max-h-[28rem]' : '!max-h-[calc(100vh-19rem)] min-h-[320px] md:min-h-0 md:flex-1 md:!max-h-none', query.isFetching && 'opacity-60')}>
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="bg-soft text-caption font-semibold text-strong">{cols.map((f) => <th key={f.name} className={cn("whitespace-nowrap px-4 py-2.5 font-semibold", f.type === "decimal" || f.type === "int" ? "text-end" : "text-start")}><button onClick={() => sortBy(f.name)} className="inline-flex items-center gap-1 hover:text-fg">{fl(res, f)}{sf === f.name && (sd === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th>)}<th className="px-4 py-2.5 text-start font-semibold"><button onClick={() => sortBy('createdAt')} className="inline-flex items-center gap-1 hover:text-fg">{t('Created')}{sf === 'createdAt' && (sd === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}</button></th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id} tabIndex={0} onClick={() => (onRow ? onRow(r) : router.push(`${base}/${res.slug}/${r.id}`))} onKeyDown={(e) => e.key === 'Enter' && (onRow ? onRow(r) : router.push(`${base}/${res.slug}/${r.id}`))} className="cursor-pointer transition-colors hover:bg-[#F8FAFC]">
                  {cols.map((f, i) => <td key={f.name} className={cn('px-4 py-3.5', i === 0 ? 'whitespace-nowrap font-semibold' : 'text-fg', (f.type === 'decimal' || f.type === 'int') && 'text-end font-semibold')}><FieldValue field={f} row={r} res={res} /></td>)}
                  <td className="num whitespace-nowrap px-4 py-3.5 text-caption text-muted">{fmtDate(r.createdAt, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {meta && rows.length > 0 && (!embedded || meta.pages > 1) && <Pagination page={meta.page} pages={meta.pages} total={meta.total} limit={meta.limit} onPage={(p) => set({ page: p })} onLimit={(n) => set({ limit: n, page: 1 })} />}
    </Card>
  );
  if (embedded) return body;
  return (
    <div className="flex flex-col md:h-full md:min-h-[420px]">
      <PageHeader title={title ?? rl(res, true)} sub={meta ? `${meta.total} ${t('results')}` : undefined}
        actions={<>{actionsExtra}{canCreate && <Button icon="plus" onClick={() => router.push(newHref ?? `${base}/${res.slug}/new`)}>{t('New ')}{rl(res)}</Button>}</>} />
      {body}
    </div>
  );
}
function StatusLabel({ v }: { v: string }) { const { el } = useT(); return <>{el(v)}</>; }
void Icon; void Plus; void Download; void BY_KEY;
