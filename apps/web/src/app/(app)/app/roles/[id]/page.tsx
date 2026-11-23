'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BY_KEY, MODULES, RESOURCES, can as canPerm, type ResourceDef } from '@erp/shared';
import { ChevronDown, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, ConfirmDialog, ErrorState, Field, Icon, Input, NoAccess, Skeleton, Textarea, cn, toast } from '@/components/ui';
import { Banner, DashHeader } from '@/components/erp/dash';

type Role = { id: string; name: string; description?: string; permissions: string[]; isSystem: boolean; users: number };
const BASE = ['read', 'create', 'update', 'delete'] as const;
const BASE_LABEL: Record<string, string> = { read: 'View', create: 'Create', update: 'Edit', delete: 'Delete' };
type Sel = Record<string, Set<string>>;

const childKeys = new Set(RESOURCES.flatMap((r) => r.children.map((c) => c.key)));
const parents = RESOURCES.filter((r) => !r.sys && !childKeys.has(r.key));
const verbsOf = (r: ResourceDef) => [...BASE.filter((v) => !(r.immutable && v !== 'read' && v !== 'create') && !(v === 'delete' && (r.noDelete || r.immutable))), ...r.actions.map((a) => a.key)];

/** Turn any mix of broad patterns (mod:x:*, read:*, verb:approve…) into explicit per-resource ticks. */
function expand(perms: string[]): Sel {
  const sel: Sel = {};
  for (const r of parents) { const s = new Set<string>(); for (const v of verbsOf(r)) if (canPerm(perms, { mod: r.mod, slug: r.slug }, v)) s.add(v); if (s.size) sel[r.slug] = s; }
  return sel;
}
function compile(sel: Sel): string[] {
  const out: string[] = [];
  for (const r of parents) for (const v of sel[r.slug] ?? []) {
    out.push(`res:${r.slug}:${v}`);
    if ((BASE as readonly string[]).includes(v)) for (const c of r.children) out.push(`res:${BY_KEY[c.key].slug}:${v}`); // line items follow their document
  }
  return out;
}

export default function RoleEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const isNew = id === 'new'; const { t, lang, rl } = useT(); const { me, ready } = useAuth(); const router = useRouter(); const qc = useQueryClient(); const from = useSearchParams().get('from');
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<{ data: Role[] }>('/api/v1/admin/roles') });
  const role = roles.data?.data.find((r) => r.id === id); const base = role ?? roles.data?.data.find((r) => r.id === from);
  const [name, setName] = useState(''); const [desc, setDesc] = useState(''); const [full, setFull] = useState(false); const [sel, setSel] = useState<Sel>({}); const [open, setOpen] = useState<Record<string, boolean>>({}); const [q, setQ] = useState(''); const [err, setErr] = useState<string>(); const [del, setDel] = useState(false); const [loaded, setLoaded] = useState(false);
  const readOnly = !!role?.isSystem; const admin = !!me?.permissions.includes('*');
  useEffect(() => { if (loaded || !roles.data) return; if (base) { setFull(base.permissions.includes('*')); setSel(expand(base.permissions)); setDesc(base.description ?? ''); setName(role ? base.name : `${base.name}-copy`); } setLoaded(true); }, [roles.data, base, role, loaded]);
  const save = useMutation({
    mutationFn: () => { const permissions = full ? ['*'] : compile(sel); const body = { name, description: desc || null, permissions }; return isNew ? api<any>('/api/v1/admin/roles', { method: 'POST', body }) : api<any>(`/api/v1/admin/roles/${id}`, { method: 'PATCH', body: readOnly ? { description: desc || null } : body }); },
    onSuccess: () => { toast.success(t('Saved successfully')); qc.invalidateQueries({ queryKey: ['admin-roles'] }); router.push('/app/roles'); }, onError: (e: any) => setErr(e.details?.permissions ? String(e.details.permissions) : e.details?.name ? String(e.details.name) : e.message),
  });
  const remove = useMutation({ mutationFn: () => api(`/api/v1/admin/roles/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success(t('Deleted')); qc.invalidateQueries({ queryKey: ['admin-roles'] }); router.push('/app/roles'); }, onError: (e: any) => { setDel(false); toast.error(e.message); } });
  const toggle = (slug: string, v: string, on?: boolean) => setSel((s) => { const n = new Set(s[slug] ?? []); (on ?? !n.has(v)) ? n.add(v) : n.delete(v); const next = { ...s, [slug]: n }; if (!n.size) delete next[slug]; return next; });
  const setAll = (rs: ResourceDef[], on: boolean) => setSel((s) => { const next = { ...s }; for (const r of rs) { if (on) next[r.slug] = new Set(verbsOf(r)); else delete next[r.slug]; } return next; });
  const modules = useMemo(() => MODULES.map((m) => ({ ...m, items: parents.filter((r) => r.mod === m.key && (!q.trim() || `${r.en} ${r.enPlural} ${r.ar} ${r.arPlural}`.toLowerCase().includes(q.trim().toLowerCase()))) })).filter((m) => m.items.length), [q]);
  const count = Object.values(sel).reduce((a, s) => a + s.size, 0);
  if (ready && !admin) return <NoAccess />;
  if (roles.isError) return <ErrorState error={roles.error} onRetry={() => roles.refetch()} />;
  if (roles.isLoading || !loaded) return <div className="space-y-4"><Skeleton className="h-10 w-64" /><Card className="space-y-3 p-5">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</Card></div>;
  if (!isNew && !role) return <Card><ErrorState error={{ message: t('Role not found') }} /></Card>;
  const nameOk = /^[a-z0-9_-]{2,60}$/i.test(name);
  return (
    <div className="space-y-5">
      <DashHeader title={isNew ? t('New role') : <span className="capitalize">{role!.name}</span>} sub={isNew ? t('Choose what this role can see and do.') : `${role!.users} ${t('active users')}`}
        actions={<>{!isNew && role!.isSystem && <Button variant="secondary" icon="copy" onClick={() => router.push(`/app/roles/new?from=${role!.id}`)}>{t('Duplicate')}</Button>}{!isNew && !role!.isSystem && <Button variant="ghost" className="text-danger" icon="trash-2" onClick={() => setDel(true)}>{t('Delete')}</Button>}<Button variant="secondary" onClick={() => router.push('/app/roles')}>{t('Cancel')}</Button><Button loading={save.isPending} disabled={!nameOk || (!readOnly && !full && count === 0)} onClick={() => { setErr(undefined); save.mutate(); }}>{t('Save')}</Button></>} />
      {readOnly && <Banner tone="info" icon="lock">{t('This is a built-in role, so its permissions are read-only. Duplicate it to create an editable copy.')}</Banner>}
      {err && <Banner tone="danger" icon="octagon-alert">{err}</Banner>}
      <Card className="grid gap-4 p-5 md:grid-cols-[minmax(0,320px)_1fr]">
        <Field label={t('Role name')} required hint={t('Letters, numbers, - or _')}><Input value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} dir="ltr" placeholder="sales-lead" /></Field>
        <Field label={t('Description')}><Textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t('What is this role for?')} /></Field>
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line bg-soft/60 px-5 py-3">
          <div className="flex items-center gap-2.5"><span className="grid h-7 w-7 place-items-center bg-gold-light text-gold-text"><Icon name="shield-check" size={15} /></span><h3 className="text-small font-bold">{t('Permissions')}</h3>{!full && <span className="num bg-soft px-1.5 text-[11px] font-bold text-strong">{count}</span>}</div>
          <label className={cn('ms-auto inline-flex cursor-pointer items-center gap-2 text-small font-semibold', readOnly && 'cursor-not-allowed opacity-70')}><input type="checkbox" className="h-4 w-4 accent-[hsl(var(--navy))]" checked={full} disabled={readOnly} onChange={(e) => setFull(e.target.checked)} />{t('Full access (administrator)')}</label>
          <div className="relative w-full sm:w-64"><Search size={15} className="pointer-events-none absolute start-3 top-3 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search screens...')} className="ps-9" aria-label={t('Search screens...')} /></div>
        </div>
        {full ? <div className="p-8 text-center text-small text-muted"><Icon name="crown" size={28} className="mx-auto mb-2 text-gold" />{t('This role can do everything, including managing users and roles.')}</div> : (
          <div className="divide-y divide-line">{modules.map((m) => { const on = q.trim() ? true : !!open[m.key]; const total = m.items.reduce((a, r) => a + verbsOf(r).length, 0); const have = m.items.reduce((a, r) => a + (sel[r.slug]?.size ?? 0), 0); const all = have === total, some = have > 0 && !all; return (
            <div key={m.key}>
              <div className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-soft/50">
                <input type="checkbox" aria-label={m.en} className="h-4 w-4 accent-[hsl(var(--navy))]" disabled={readOnly} checked={all} ref={(el) => { if (el) el.indeterminate = some; }} onChange={(e) => setAll(m.items, e.target.checked)} />
                <button onClick={() => setOpen({ ...open, [m.key]: !on })} className="flex flex-1 items-center gap-3 text-start"><span className="grid h-8 w-8 place-items-center bg-navy text-gold"><Icon name={m.icon} size={16} /></span><span className="text-body font-semibold">{lang === 'ar' ? m.ar : m.en}</span>{m.release !== 'R1' && <Badge tone="muted">{m.release}</Badge>}<span className="num ms-auto text-caption text-muted">{have}/{total}</span><ChevronDown size={16} className={cn('text-muted transition-transform', on && 'rotate-180')} /></button>
              </div>
              {on && <div className="overflow-x-auto border-t border-line bg-soft/30"><table className="w-full min-w-[640px] text-small"><thead><tr className="text-caption font-semibold text-muted"><th className="px-5 py-2 text-start">{t('Screen')}</th>{BASE.map((v) => <th key={v} className="w-20 px-2 py-2 text-center">{t(BASE_LABEL[v])}</th>)}<th className="px-3 py-2 text-start">{t('Actions')}</th></tr></thead>
                <tbody className="divide-y divide-line">{m.items.map((r) => { const vs = verbsOf(r); return (
                  <tr key={r.slug} className="bg-card transition-colors hover:bg-soft/40">
                    <td className="px-5 py-2.5 font-medium">{rl(r, true)}</td>
                    {BASE.map((v) => <td key={v} className="px-2 py-2.5 text-center">{vs.includes(v) ? <input type="checkbox" aria-label={`${rl(r, true)} ${v}`} className="h-4 w-4 accent-[hsl(var(--navy))]" disabled={readOnly} checked={!!sel[r.slug]?.has(v)} onChange={(e) => toggle(r.slug, v, e.target.checked)} /> : <span className="text-muted/40">—</span>}</td>)}
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1.5">{r.actions.map((a) => { const act = !!sel[r.slug]?.has(a.key); return <button key={a.key} disabled={readOnly} onClick={() => toggle(r.slug, a.key)} className={cn('h-6 px-2 text-caption font-semibold transition-colors', act ? 'bg-navy text-white' : 'bg-soft text-strong hover:bg-line', readOnly && 'cursor-not-allowed')}>{lang === 'ar' ? a.ar : a.en}</button>; })}{r.actions.length === 0 && <span className="text-muted/40">—</span>}</div></td>
                  </tr>); })}</tbody></table></div>}
            </div>); })}</div>)}
      </Card>
      <ConfirmDialog open={del} onClose={() => setDel(false)} loading={remove.isPending} danger title={t('Delete role')} message={t('This cannot be undone.')} confirmText={t('Delete')} onConfirm={() => remove.mutate()} />
    </div>
  );
}
