'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, MoreHorizontal, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, Input, Modal, Select, SkeletonRows, Tabs, cn, toast } from '@/components/ui';
import { Banner, DashHeader, Kpi, TD, TH } from '@/components/erp/dash';
import { RefPicker } from '@/components/erp/fields';

type U = { id: string; name: string; email: string; phone?: string; kind: 'staff' | 'customer' | 'supplier'; locale: string; roleId?: string; roleName?: string; branchId?: string; branchName?: string; customerId?: string; customerName?: string; supplierId?: string; supplierName?: string; isActive: boolean; mfaEnabled: boolean; ssoLinked: boolean; hasPassword: boolean; locked: boolean; lastLoginAt?: string; createdAt: string };
type Role = { id: string; name: string; description?: string; isSystem: boolean; users: number };

export default function UsersPage() {
  const { t, lang } = useT(); const { can, me } = useAuth(); const qc = useQueryClient();
  const canCreate = can({ mod: 'platform', slug: 'user' }, 'create'), canUpdate = can({ mod: 'platform', slug: 'user' }, 'update');
  const [tab, setTab] = useState<'all' | 'staff' | 'customer' | 'supplier'>('staff'); const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<U> | null>(null); const [pw, setPw] = useState<{ name: string; email: string; password: string } | null>(null); const [confirm, setConfirm] = useState<{ u: U; action: string } | null>(null);
  const users = useQuery({ queryKey: ['admin-users'], queryFn: () => api<{ data: U[]; summary: any }>('/api/v1/admin/users') });
  const roles = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<{ data: Role[] }>('/api/v1/admin/roles'), retry: false });
  const rows = useMemo(() => (users.data?.data ?? []).filter((u) => (tab === 'all' || u.kind === tab) && (!q.trim() || `${u.name} ${u.email} ${u.roleName ?? ''} ${u.customerName ?? ''} ${u.supplierName ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [users.data, tab, q]);
  const s = users.data?.summary;
  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['admin-roles'] }); };
  const run = useMutation({
    mutationFn: ({ u, action }: { u: U; action: string }) => action === 'toggle' ? api<any>(`/api/v1/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }) : api<any>(`/api/v1/admin/users/${u.id}/${action}`, { method: 'POST', body: {} }),
    onSuccess: (r, { u, action }) => { setConfirm(null); refresh(); if (r.tempPassword) setPw({ name: u.name, email: u.email, password: r.tempPassword }); else toast.success(r.message ?? t('Saved successfully')); },
    onError: (e: any) => { setConfirm(null); toast.error(e.message); },
  });
  const tabs = [{ key: 'staff', label: t('Staff'), count: s?.staff }, { key: 'customer', label: t('Customer users'), count: s?.customer }, { key: 'supplier', label: t('Supplier users'), count: s?.supplier }, { key: 'all', label: t('All'), count: s?.total }] as any;
  const ACTIONS: Record<string, { title: string; msg: string; danger?: boolean }> = {
    'reset-password': { title: t('Reset password'), msg: t('A new temporary password will be generated. The old password stops working immediately.') },
    unlock: { title: t('Unlock account'), msg: t('Clear the failed-login lockout for this user.') },
    'reset-mfa': { title: t('Reset two-factor'), msg: t('The user will have to set up an authenticator app again.'), danger: true },
    'unlink-sso': { title: t('Unlink SSO identity'), msg: t('The next SSO sign-in will link the account again.') },
    toggle: { title: '', msg: '' },
  };
  return (
    <div className="space-y-5">
      <DashHeader title={t('Users')} sub={t('People who can sign in: your staff, plus customer and supplier portal users.')} actions={canCreate && <Button icon="user-plus" onClick={() => setEdit({ kind: tab === 'all' ? 'staff' : tab, locale: 'ar' })}>{t('Add user')}</Button>} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi loading={users.isLoading} icon="users" label={t('Total users')} value={s?.total} />
        <Kpi loading={users.isLoading} icon="user-check" tone="success" label={t('Active')} value={s?.active} />
        <Kpi loading={users.isLoading} icon="briefcase" tone="info" label={t('Staff')} value={s?.staff} />
        <Kpi loading={users.isLoading} icon="shield-check" label={t('With two-factor')} value={s?.mfa} />
      </section>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-3"><div className="min-w-0 flex-1"><Tabs tabs={tabs} value={tab} onChange={(k) => setTab(k as typeof tab)} /></div>
          <div className="relative my-2 w-full sm:w-64"><Search size={15} className="pointer-events-none absolute start-3 top-3 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search')} className="ps-9" aria-label={t('Search')} /></div></div>
        {users.isLoading ? <SkeletonRows rows={6} cols={5} /> : users.isError ? <ErrorState error={users.error} onRetry={() => users.refetch()} /> : rows.length === 0 ? <EmptyState icon="users" title={t('No users found')} desc={canCreate ? t('Add the first user to get started.') : undefined} action={canCreate ? <Button icon="user-plus" onClick={() => setEdit({ kind: tab === 'all' ? 'staff' : tab, locale: 'ar' })}>{t('Add user')}</Button> : undefined} /> : (
          <div className="sticky-head !max-h-[calc(100vh-28rem)] min-h-[260px]"><table className="w-full min-w-[860px] text-body"><thead><tr><th className={TH}>{t('User')}</th><th className={TH}>{tab === 'customer' ? t('Customer') : tab === 'supplier' ? t('Supplier') : t('Role')}</th><th className={TH}>{t('Status')}</th><th className={TH}>{t('Security')}</th><th className={TH}>{t('Last sign-in')}</th><th className={cn(TH, 'w-12')} /></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((u) => (
              <tr key={u.id} className={cn('transition-colors hover:bg-soft/60', !u.isActive && 'opacity-60')}>
                <td className={TD}><div className="flex items-center gap-3"><Avatar name={u.name} size={36} /><div className="min-w-0"><p className="truncate font-semibold">{u.name}{u.id === me?.id && <span className="ms-2 text-caption font-medium text-muted">({t('you')})</span>}</p><p className="truncate text-caption text-muted" dir="ltr">{u.email}</p></div></div></td>
                <td className={TD}>{u.kind === 'staff' ? <Badge tone="primary">{u.roleName ?? '—'}</Badge> : <span className="font-medium">{u.customerName ?? u.supplierName ?? '—'}</span>}{u.branchName && <p className="mt-0.5 text-caption text-muted">{u.branchName}</p>}</td>
                <td className={TD}>{!u.isActive ? <Badge tone="muted" dot>{t('Inactive')}</Badge> : u.locked ? <Badge tone="danger" dot>{t('Locked')}</Badge> : <Badge tone="success" dot>{t('Active')}</Badge>}</td>
                <td className={TD}><div className="flex flex-wrap gap-1.5">{u.mfaEnabled && <Badge tone="info"><Icon name="shield-check" size={12} />2FA</Badge>}{u.ssoLinked && <Badge tone="muted"><Icon name="key-round" size={12} />SSO</Badge>}{!u.mfaEnabled && !u.ssoLinked && <span className="text-caption text-muted">{t('Password only')}</span>}</div></td>
                <td className={cn(TD, 'text-small text-muted')}>{u.lastLoginAt ? <span title={fmtDateTime(u.lastLoginAt, lang)}>{timeAgo(u.lastLoginAt, lang)}</span> : t('Never')}</td>
                <td className={TD}>{canUpdate && u.id !== me?.id && <RowMenu items={[
                  { label: t('Edit'), icon: 'pencil', on: () => setEdit(u) }, { label: t('Reset password'), icon: 'key-round', on: () => setConfirm({ u, action: 'reset-password' }) },
                  ...(u.locked ? [{ label: t('Unlock account'), icon: 'lock-open', on: () => setConfirm({ u, action: 'unlock' }) }] : []), ...(u.mfaEnabled ? [{ label: t('Reset two-factor'), icon: 'shield-off', on: () => setConfirm({ u, action: 'reset-mfa' }) }] : []), ...(u.ssoLinked ? [{ label: t('Unlink SSO identity'), icon: 'unlink', on: () => setConfirm({ u, action: 'unlink-sso' }) }] : []),
                  { label: u.isActive ? t('Deactivate') : t('Activate'), icon: u.isActive ? 'user-x' : 'user-check', danger: u.isActive, on: () => setConfirm({ u, action: 'toggle' }) }]} />}</td>
              </tr>))}</tbody></table></div>)}
      </Card>
      {edit && <UserModal init={edit} roles={roles.data?.data ?? []} onClose={() => setEdit(null)} onSaved={(r) => { setEdit(null); refresh(); if (r?.tempPassword) setPw({ name: r.name, email: r.email, password: r.tempPassword }); }} />}
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)} loading={run.isPending} danger={confirm ? (confirm.action === 'toggle' ? confirm.u.isActive : !!ACTIONS[confirm.action]?.danger) : false}
        title={confirm ? (confirm.action === 'toggle' ? (confirm.u.isActive ? t('Deactivate user') : t('Activate user')) : ACTIONS[confirm.action].title) : ''} message={confirm ? (confirm.action === 'toggle' ? (confirm.u.isActive ? t('This person will no longer be able to sign in. Their records are kept.') : t('This person will be able to sign in again.')) : ACTIONS[confirm.action].msg) : ''}
        confirmText={t('Confirm')} onConfirm={() => confirm && run.mutate(confirm)} />
      <Modal open={!!pw} onClose={() => setPw(null)} title={t('Temporary password')} footer={<Button onClick={() => setPw(null)}>{t('Done')}</Button>}>
        {pw && <div className="space-y-4"><Banner tone="gold" icon="key-round">{t('Share this password with the user securely. It is shown only once and they should change it from their profile after signing in.')}</Banner>
          <div className="grid gap-1 text-small"><span className="text-muted">{pw.name}</span><span dir="ltr" className="font-medium">{pw.email}</span></div>
          <div className="flex items-center gap-2"><code dir="ltr" className="mono flex-1 select-all border border-line bg-soft px-4 py-3 text-[15px] tracking-wide">{pw.password}</code><Button variant="secondary" icon="copy" onClick={() => { navigator.clipboard?.writeText(pw.password).then(() => toast.success(t('Copied'))); }}><Copy size={15} />{t('Copy')}</Button></div></div>}
      </Modal>
    </div>
  );
}

function RowMenu({ items }: { items: { label: string; icon: string; on: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false); const box = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  return (
    <div ref={box} className="relative"><button onClick={() => setOpen(!open)} aria-label="Actions" aria-expanded={open} className="grid h-8 w-8 place-items-center text-muted transition-colors hover:bg-soft hover:text-fg"><MoreHorizontal size={18} /></button>
      {open && <div className="absolute end-0 z-30 mt-1 w-56 border border-line bg-card py-1 shadow-pop animate-in">{items.map((i) => <button key={i.label} onClick={() => { setOpen(false); i.on(); }} className={cn('flex w-full items-center gap-2.5 px-3.5 py-2 text-start text-small font-medium transition-colors hover:bg-soft', i.danger ? 'text-danger' : 'text-fg')}><Icon name={i.icon} size={16} className={i.danger ? '' : 'text-muted'} />{i.label}</button>)}</div>}
    </div>
  );
}

function UserModal({ init, roles, onClose, onSaved }: { init: Partial<U>; roles: Role[]; onClose: () => void; onSaved: (r: any) => void }) {
  const { t } = useT(); const editing = !!init.id; const [f, setF] = useState<any>({ kind: 'staff', locale: 'ar', ...init }); const [err, setErr] = useState<string>(); const [fe, setFe] = useState<Record<string, string>>({});
  const save = useMutation({
    mutationFn: () => editing ? api<any>(`/api/v1/admin/users/${init.id}`, { method: 'PATCH', body: { name: f.name, phone: f.phone || null, roleId: f.kind === 'staff' ? f.roleId : undefined, branchId: f.branchId || null, locale: f.locale } }) : api<any>('/api/v1/admin/users', { method: 'POST', body: { name: f.name, email: f.email, phone: f.phone || null, kind: f.kind, roleId: f.kind === 'staff' ? f.roleId : null, branchId: f.branchId || null, locale: f.locale, customerId: f.kind === 'customer' ? f.customerId : null, supplierId: f.kind === 'supplier' ? f.supplierId : null } }),
    onSuccess: (r) => { toast.success(editing ? t('Saved successfully') : t('User created')); onSaved({ ...r, name: f.name, email: f.email }); },
    onError: (e: any) => { setErr(e.message); setFe(Object.fromEntries(Object.entries(e.details ?? {}).map(([k, v]: any) => [k, Array.isArray(v) ? v.join(', ') : String(v)]))); },
  });
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const ok = f.name?.trim().length >= 2 && (editing || /.+@.+\..+/.test(f.email ?? '')) && (f.kind !== 'staff' || f.roleId) && (editing || f.kind !== 'customer' || f.customerId) && (editing || f.kind !== 'supplier' || f.supplierId);
  return (
    <Modal open onClose={onClose} wide title={editing ? t('Edit user') : t('Add user')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={save.isPending} disabled={!ok} onClick={() => { setErr(undefined); setFe({}); save.mutate(); }}>{editing ? t('Save') : t('Create user')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        {!editing && <Field label={t('Account type')} className="sm:col-span-2"><div className="grid grid-cols-3 gap-2">{([['staff', t('Staff'), 'briefcase'], ['customer', t('Customer user'), 'building-2'], ['supplier', t('Supplier user'), 'factory']] as const).map(([k, l, i]) => <button key={k} type="button" onClick={() => set('kind', k)} className={cn('flex items-center justify-center gap-2 border px-3 py-2.5 text-small font-semibold transition-colors', f.kind === k ? 'border-navy bg-navy text-white' : 'border-line bg-card text-strong hover:bg-soft')}><Icon name={i} size={16} />{l}</button>)}</div></Field>}
        <Field label={t('Full name')} required error={fe.name}><Input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label={t('Email')} required error={fe.email}><Input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} disabled={editing} dir="ltr" /></Field>
        <Field label={t('Phone')}><Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value)} dir="ltr" placeholder="+966 5…" /></Field>
        <Field label={t('Language')}><Select value={f.locale} onChange={(e) => set('locale', e.target.value)}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
        {f.kind === 'staff' && <Field label={t('Role')} required error={fe.roleId} hint={roles.find((r) => r.id === f.roleId)?.description}><Select value={f.roleId ?? ''} onChange={(e) => set('roleId', e.target.value)}><option value="">{t('Select a role')}</option>{roles.filter((r) => !['customer', 'supplier'].includes(r.name)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>}
        {f.kind === 'staff' && <Field label={t('Branch')}><RefPicker resKey="Branch" value={f.branchId ?? null} onChange={(v) => set('branchId', v)} /></Field>}
        {f.kind === 'customer' && !editing && <Field label={t('Customer')} required error={fe.customerId} className="sm:col-span-2"><RefPicker resKey="Customer" value={f.customerId ?? null} onChange={(v) => set('customerId', v)} /></Field>}
        {f.kind === 'supplier' && !editing && <Field label={t('Supplier')} required error={fe.supplierId} className="sm:col-span-2"><RefPicker resKey="Supplier" value={f.supplierId ?? null} onChange={(v) => set('supplierId', v)} /></Field>}
      </div>
      {!editing && <p className="mt-4 text-caption text-muted">{t('A temporary password is generated when you create the user. You will see it once.')}</p>}
      {err && <div className="mt-4"><Banner tone="danger" icon="octagon-alert">{err}</Banner></div>}
    </Modal>
  );
}
