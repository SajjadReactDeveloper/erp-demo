'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, Modal, NoAccess, Select, SkeletonRows, cn, toast } from '@/components/ui';
import { Banner, DashHeader, TD, TH } from '@/components/erp/dash';

type Rule = { id: string; event: string; roleId?: string; channel: 'inapp' | 'email' | 'sms' | 'whatsapp'; language: 'ar' | 'en' | 'user'; templateKey?: string; isActive: boolean; version?: number; _refs?: any };
type Ev = { event: string; label: string; resource: string };
const CH: Record<string, [string, string]> = { inapp: ['In-app', 'bell'], email: ['E-mail', 'mail'], whatsapp: ['WhatsApp', 'message-circle'], sms: ['SMS', 'smartphone'] };

export default function NotificationRules() {
  const { t, lang } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient();
  const canWrite = can({ mod: 'platform', slug: 'notification-rule' }, 'create');
  const rules = useQuery({ queryKey: ['notification-rules'], queryFn: () => api<{ data: Rule[] }>('/api/v1/r/notification-rule', { query: { limit: 200 } }) });
  const events = useQuery({ queryKey: ['event-catalogue'], queryFn: () => api<{ data: Ev[] }>('/api/v1/admin/event-catalogue'), staleTime: 600000, retry: false });
  const roles = useQuery({ queryKey: ['role-options'], queryFn: () => api<{ data: { id: string; name: string }[] }>('/api/v1/r/role', { query: { limit: 100 } }), staleTime: 60000 });
  const [edit, setEdit] = useState<Partial<Rule> | null>(null); const [del, setDel] = useState<Rule | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['notification-rules'] });
  const labelOf = useMemo(() => { const m = new Map((events.data?.data ?? []).map((e) => [e.event, e.label])); return (ev: string) => m.get(ev) ?? ev; }, [events.data]);
  const roleName = (id?: string) => (id ? roles.data?.data.find((r) => r.id === id)?.name : null) ?? t('Administrators');
  const toggle = useMutation({ mutationFn: (r: Rule) => api(`/api/v1/r/notification-rule/${r.id}`, { method: 'PATCH', body: { isActive: !r.isActive, version: r.version } }), onSuccess: refresh, onError: (e: any) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (r: Rule) => api(`/api/v1/r/notification-rule/${r.id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); refresh(); toast.success(t('Deleted')); }, onError: (e: any) => { setDel(null); toast.error(e.message); } });
  if (ready && !can({ mod: 'platform', slug: 'notification-rule' }, 'read')) return <NoAccess />;
  const rows = rules.data?.data ?? [];
  return (
    <div className="space-y-5">
      <DashHeader title={t('Notification rules')} sub={t('Choose who is told, and how, when something happens in the system.')} actions={canWrite && <Button icon="plus" onClick={() => setEdit({ channel: 'inapp', language: 'user', isActive: true })}>{t('New rule')}</Button>} />
      <Card className="overflow-hidden">
        {rules.isLoading ? <SkeletonRows rows={5} cols={4} /> : rules.isError ? <ErrorState error={rules.error} onRetry={() => rules.refetch()} /> : rows.length === 0 ? <EmptyState icon="bell-ring" title={t('No notification rules yet')} desc={t('Add a rule, for example: tell the sales team by e-mail when a quotation is approved.')} action={canWrite ? <Button icon="plus" onClick={() => setEdit({ channel: 'inapp', language: 'user', isActive: true })}>{t('New rule')}</Button> : undefined} /> : (
          <div className="sticky-head"><table className="w-full min-w-[720px] text-body"><thead><tr><th className={TH}>{t('When this happens')}</th><th className={TH}>{t('Tell')}</th><th className={TH}>{t('By')}</th><th className={TH}>{t('Language')}</th><th className={TH}>{t('Status')}</th><th className={cn(TH, 'w-40')} /></tr></thead>
            <tbody className="divide-y divide-line">{rows.map((r) => (
              <tr key={r.id} className={cn('transition-colors hover:bg-soft/60', !r.isActive && 'opacity-60')}>
                <td className={cn(TD, 'font-semibold')}>{labelOf(r.event)}<p className="mono text-[11px] font-normal text-muted" dir="ltr">{r.event}</p></td>
                <td className={TD}><Badge tone="primary">{roleName(r.roleId)}</Badge></td>
                <td className={TD}><span className="inline-flex items-center gap-1.5 text-small font-medium"><Icon name={CH[r.channel]?.[1] ?? 'bell'} size={15} className="text-muted" />{t(CH[r.channel]?.[0] ?? r.channel)}</span></td>
                <td className={cn(TD, 'text-small')}>{r.language === 'user' ? t("User's language") : r.language === 'ar' ? 'العربية' : 'English'}</td>
                <td className={TD}><Badge tone={r.isActive ? 'success' : 'muted'} dot>{r.isActive ? t('Active') : t('Paused')}</Badge></td>
                <td className={TD}>{canWrite && <div className="flex justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => toggle.mutate(r)}>{r.isActive ? t('Pause') : t('Resume')}</Button><Button size="sm" variant="secondary" icon="pencil" onClick={() => setEdit(r)} aria-label={t('Edit')} /><Button size="sm" variant="ghost" className="text-danger" icon="trash-2" onClick={() => setDel(r)} aria-label={t('Delete')} /></div>}</td>
              </tr>))}</tbody></table></div>)}
      </Card>
      {edit && <RuleModal init={edit} events={events.data?.data ?? []} roles={roles.data?.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} danger title={t('Delete rule')} message={t('This cannot be undone.')} confirmText={t('Delete')} onConfirm={() => del && remove.mutate(del)} />
    </div>
  );
}

function RuleModal({ init, events, roles, onClose, onSaved }: { init: Partial<Rule>; events: Ev[]; roles: { id: string; name: string }[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT(); const editing = !!init.id; const [f, setF] = useState<any>({ event: '', roleId: '', ...init }); const [err, setErr] = useState<string>();
  const grouped = useMemo(() => { const g = new Map<string, Ev[]>(); for (const e of events) g.set(e.resource, [...(g.get(e.resource) ?? []), e]); return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0])); }, [events]);
  const save = useMutation({
    mutationFn: () => { const body = { event: f.event, roleId: f.roleId || null, channel: f.channel, language: f.language, isActive: f.isActive ?? true }; return editing ? api(`/api/v1/r/notification-rule/${init.id}`, { method: 'PATCH', body: { ...body, version: init.version } }) : api('/api/v1/r/notification-rule', { method: 'POST', body }); },
    onSuccess: () => { toast.success(t('Saved successfully')); onSaved(); }, onError: (e: any) => setErr(e.message),
  });
  return (
    <Modal open onClose={onClose} wide title={editing ? t('Edit rule') : t('New rule')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={save.isPending} disabled={!f.event} onClick={() => { setErr(undefined); save.mutate(); }}>{t('Save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('When this happens')} required className="sm:col-span-2"><Select value={f.event} onChange={(e) => setF({ ...f, event: e.target.value })}><option value="">{t('Select an event')}</option>{grouped.map(([res, evs]) => <optgroup key={res} label={res}>{evs.map((e) => <option key={e.event} value={e.event}>{e.label}</option>)}</optgroup>)}</Select></Field>
        <Field label={t('Tell')} hint={t('Everyone with this role is notified.')}><Select value={f.roleId ?? ''} onChange={(e) => setF({ ...f, roleId: e.target.value })}><option value="">{t('Administrators')}</option>{roles.filter((r) => !['customer', 'supplier'].includes(r.name)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Field label={t('By')}><Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>{Object.entries(CH).map(([k, [l]]) => <option key={k} value={k}>{t(l)}</option>)}</Select></Field>
        <Field label={t('Language')}><Select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })}><option value="user">{t("User's language")}</option><option value="ar">العربية</option><option value="en">English</option></Select></Field>
      </div>
      <p className="mt-4 text-caption text-muted">{t('E-mail needs SMTP, and WhatsApp or SMS need a provider, to be configured on the server. In-app alerts always work.')}</p>
      {err && <div className="mt-4"><Banner tone="danger" icon="octagon-alert">{err}</Banner></div>}
    </Modal>
  );
}
