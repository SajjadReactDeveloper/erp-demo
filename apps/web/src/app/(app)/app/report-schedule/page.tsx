'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDateTime, timeAgo } from '@/lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, Icon, Input, Modal, NoAccess, Select, SkeletonRows, cn, toast } from '@/components/ui';
import { Banner, DashHeader } from '@/components/erp/dash';
import { REPORTS } from '@/components/erp/shell';

type Sch = { id: string; name: string; report: string; format: 'xlsx' | 'csv' | 'pdf'; cron: string; recipients: string[]; filters: any; isActive: boolean; lastRunAt?: string };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
type When = { freq: 'daily' | 'weekly' | 'monthly'; time: string; dow: number; dom: number };

const toCron = (w: When) => { const [h, m] = w.time.split(':').map(Number); return w.freq === 'daily' ? `${m} ${h} * * *` : w.freq === 'weekly' ? `${m} ${h} * * ${w.dow}` : `${m} ${h} ${w.dom} * *`; };
function fromCron(cron: string): When | null {
  const p = cron.trim().split(/\s+/); if (p.length !== 5 || !/^\d+$/.test(p[0]) || !/^\d+$/.test(p[1]) || p[3] !== '*') return null; const time = `${p[1].padStart(2, '0')}:${p[0].padStart(2, '0')}`;
  if (p[2] === '*' && p[4] === '*') return { freq: 'daily', time, dow: 1, dom: 1 }; if (p[2] === '*' && /^\d$/.test(p[4])) return { freq: 'weekly', time, dow: Number(p[4]), dom: 1 }; if (/^\d+$/.test(p[2]) && p[4] === '*') return { freq: 'monthly', time, dow: 1, dom: Number(p[2]) }; return null;
}
export default function ReportSchedules() {
  const { t, lang } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient();
  const canWrite = can({ mod: 'platform', slug: 'report-schedule' }, 'create');
  const q = useQuery({ queryKey: ['report-schedules'], queryFn: () => api<{ data: Sch[] }>('/api/v1/r/report-schedule', { query: { limit: 100, sort: 'createdAt:desc' } }) });
  const [edit, setEdit] = useState<Partial<Sch> | null>(null); const [del, setDel] = useState<Sch | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['report-schedules'] });
  const toggle = useMutation({ mutationFn: (s: Sch) => api(`/api/v1/r/report-schedule/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive, version: (s as any).version } }), onSuccess: refresh, onError: (e: any) => toast.error(e.message) });
  const run = useMutation({ mutationFn: (s: Sch) => api<any>(`/api/v1/admin/report-schedules/${s.id}/run`, { method: 'POST', body: {} }), onSuccess: (r) => { toast[r.failed ? 'warning' : 'success'](r.message); refresh(); }, onError: (e: any) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: (s: Sch) => api(`/api/v1/r/report-schedule/${s.id}`, { method: 'DELETE' }), onSuccess: () => { setDel(null); refresh(); toast.success(t('Deleted')); }, onError: (e: any) => { setDel(null); toast.error(e.message); } });
  const nameOf = (k: string) => { const r = REPORTS.find((x) => x[0] === k); return r ? (lang === 'ar' ? r[2] : r[1]) : k; };
  const describe = (cron: string) => { const w = fromCron(cron); if (!w) return cron; return w.freq === 'daily' ? `${t('Every day at')} ${w.time}` : w.freq === 'weekly' ? `${t('Every')} ${t(DAYS[w.dow])} ${t('at')} ${w.time}` : `${t('Day')} ${w.dom} ${t('of every month at')} ${w.time}`; };
  if (ready && !can({ mod: 'platform', slug: 'report-schedule' }, 'read')) return <NoAccess />;
  const rows = q.data?.data ?? [];
  return (
    <div className="space-y-5">
      <DashHeader title={t('Scheduled reports')} sub={t('E-mail a report to your team automatically, with the file attached.')} actions={canWrite && <Button icon="plus" onClick={() => setEdit({ report: 'pnl', format: 'xlsx', cron: '0 8 * * 1', recipients: [], isActive: true })}>{t('New schedule')}</Button>} />
      {q.isLoading ? <Card><SkeletonRows rows={4} cols={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : rows.length === 0 ? <Card><EmptyState icon="calendar-clock" title={t('No scheduled reports yet')} desc={t('Pick a report, a day and time, and who should receive it.')} action={canWrite ? <Button icon="plus" onClick={() => setEdit({ report: 'pnl', format: 'xlsx', cron: '0 8 * * 1', recipients: [], isActive: true })}>{t('New schedule')}</Button> : undefined} /></Card> : (
        <div className="grid gap-4 lg:grid-cols-2">{rows.map((s) => (
          <Card key={s.id} className={cn('flex flex-col overflow-hidden', !s.isActive && 'opacity-70')}>
            <div className="flex items-start gap-4 p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center bg-navy text-gold"><Icon name="calendar-clock" size={21} /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-card-title">{s.name}</h3><Badge tone={s.isActive ? 'success' : 'muted'} dot>{s.isActive ? t('Active') : t('Paused')}</Badge></div>
                <p className="mt-0.5 text-small text-muted">{nameOf(s.report)} · <span className="uppercase">{s.format}</span></p>
                <p className="mt-2 inline-flex items-center gap-1.5 text-small font-semibold"><Icon name="clock" size={14} className="text-gold-text" />{describe(s.cron)}</p></div>
            </div>
            <div className="border-t border-line bg-soft/40 px-5 py-3"><p className="mb-1.5 text-caption font-medium text-muted">{t('Recipients')}</p>{(s.recipients ?? []).length ? <div className="flex flex-wrap gap-1.5">{s.recipients.map((r) => <span key={r} dir="ltr" className="bg-card px-2 py-0.5 text-caption font-medium ring-1 ring-line">{r}</span>)}</div> : <p className="text-small text-warn">{t('No recipients: nothing will be sent')}</p>}</div>
            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line p-3"><span className="me-auto ps-2 text-caption text-muted">{s.lastRunAt ? <span title={fmtDateTime(s.lastRunAt, lang)}>{t('Last sent')} {timeAgo(s.lastRunAt, lang)}</span> : t('Never sent')}</span>
              {canWrite && <><Button size="sm" variant="soft" icon="send" loading={run.isPending && run.variables?.id === s.id} disabled={!(s.recipients ?? []).length} onClick={() => run.mutate(s)}>{t('Send now')}</Button><Button size="sm" variant="secondary" onClick={() => toggle.mutate(s)}>{s.isActive ? t('Pause') : t('Resume')}</Button><Button size="sm" variant="secondary" icon="pencil" onClick={() => setEdit(s)} aria-label={t('Edit')} /><Button size="sm" variant="ghost" className="text-danger" icon="trash-2" onClick={() => setDel(s)} aria-label={t('Delete')} /></>}</div>
          </Card>))}</div>)}
      {edit && <ScheduleModal init={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); refresh(); }} />}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} loading={remove.isPending} danger title={t('Delete schedule')} message={t('This cannot be undone.')} confirmText={t('Delete')} onConfirm={() => del && remove.mutate(del)} />
    </div>
  );
}

function ScheduleModal({ init, onClose, onSaved }: { init: Partial<Sch>; onClose: () => void; onSaved: () => void }) {
  const { t, lang } = useT(); const editing = !!init.id;
  const [f, setF] = useState<any>({ name: '', ...init, filters: init.filters ?? {}, recipients: init.recipients ?? [] });
  const [when, setWhen] = useState<When>(fromCron(init.cron ?? '0 8 * * 1') ?? { freq: 'weekly', time: '08:00', dow: 1, dom: 1 });
  const [draft, setDraft] = useState(''); const [err, setErr] = useState<string>();
  const addRecipients = (raw: string) => { const list = raw.split(/[\s,;،]+/).map((x) => x.trim().toLowerCase()).filter(Boolean); const bad = list.filter((x) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)); if (bad.length) { setErr(`${t('Not a valid e-mail')}: ${bad.join(', ')}`); return false; } setErr(undefined); setF((p: any) => ({ ...p, recipients: [...new Set([...p.recipients, ...list])] })); setDraft(''); return true; };
  const save = useMutation({
    mutationFn: () => { const body: any = { name: f.name, report: f.report, format: f.format, cron: toCron(when), recipients: f.recipients, filters: f.report === 'ageing' && f.filters.groupBy ? { groupBy: f.filters.groupBy } : {}, isActive: f.isActive ?? true }; return editing ? api(`/api/v1/r/report-schedule/${init.id}`, { method: 'PATCH', body: { ...body, version: (init as any).version } }) : api('/api/v1/r/report-schedule', { method: 'POST', body }); },
    onSuccess: () => { toast.success(t('Saved successfully')); onSaved(); }, onError: (e: any) => setErr(e.message),
  });
  const ok = f.name.trim().length >= 2 && f.recipients.length > 0;
  return (
    <Modal open onClose={onClose} wide title={editing ? t('Edit schedule') : t('New schedule')} footer={<><Button variant="secondary" onClick={onClose}>{t('Cancel')}</Button><Button loading={save.isPending} disabled={!ok} onClick={() => { if (draft.trim() && !addRecipients(draft)) return; setErr(undefined); save.mutate(); }}>{t('Save')}</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('Name')} required className="sm:col-span-2"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={t('e.g. Weekly profit & loss')} autoFocus /></Field>
        <Field label={t('Report')}><Select value={f.report} onChange={(e) => setF({ ...f, report: e.target.value })}>{REPORTS.map(([k, en, ar]) => <option key={k} value={k}>{lang === 'ar' ? ar : en}</option>)}</Select></Field>
        <Field label={t('File format')}><Select value={f.format === 'pdf' ? 'xlsx' : f.format} onChange={(e) => setF({ ...f, format: e.target.value })}><option value="xlsx">Excel (.xlsx)</option><option value="csv">CSV (.csv)</option></Select></Field>
        <Field label={t('Repeat')}><Select value={when.freq} onChange={(e) => setWhen({ ...when, freq: e.target.value as When['freq'] })}><option value="daily">{t('Every day')}</option><option value="weekly">{t('Every week')}</option><option value="monthly">{t('Every month')}</option></Select></Field>
        <div className="grid grid-cols-2 gap-3">
          {when.freq === 'weekly' ? <Field label={t('Day')}><Select value={when.dow} onChange={(e) => setWhen({ ...when, dow: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{t(d)}</option>)}</Select></Field> : when.freq === 'monthly' ? <Field label={t('Day of month')}><Select value={when.dom} onChange={(e) => setWhen({ ...when, dom: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field> : <div />}
          <Field label={t('Time')}><Input type="time" value={when.time} onChange={(e) => setWhen({ ...when, time: e.target.value || '08:00' })} dir="ltr" /></Field>
        </div>
        {f.report === 'ageing' && <Field label={t('Group by')} className="sm:col-span-2"><Select value={f.filters.groupBy ?? 'customer'} onChange={(e) => setF({ ...f, filters: { ...f.filters, groupBy: e.target.value } })}><option value="customer">customer</option><option value="rep">rep</option><option value="branch">branch</option></Select></Field>}
        <Field label={t('Recipients')} required className="sm:col-span-2" hint={t('Press Enter or comma after each e-mail address.')}>
          <div className="flex min-h-[42px] flex-wrap items-center gap-1.5 border border-line bg-soft px-2 py-1.5 focus-within:border-navy">{f.recipients.map((r: string) => <span key={r} dir="ltr" className="inline-flex items-center gap-1 bg-navy px-2 py-1 text-caption font-medium text-white">{r}<button type="button" aria-label={t('Remove')} onClick={() => setF({ ...f, recipients: f.recipients.filter((x: string) => x !== r) })} className="text-white/70 hover:text-white">×</button></span>)}
            <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (['Enter', ',', ';'].includes(e.key) && draft.trim()) { e.preventDefault(); addRecipients(draft); } else if (e.key === 'Backspace' && !draft && f.recipients.length) setF({ ...f, recipients: f.recipients.slice(0, -1) }); }} onBlur={() => draft.trim() && addRecipients(draft)} dir="ltr" placeholder={f.recipients.length ? '' : 'name@company.com'} className="min-w-[160px] flex-1 border-0 bg-transparent p-1 text-body outline-none focus:shadow-none" /></div>
        </Field>
      </div>
      <p className="mt-4 text-caption text-muted">{t('Reports are built when they are sent, so they always show current figures. E-mail delivery needs SMTP to be configured on the server.')}</p>
      {err && <div className="mt-4"><Banner tone="danger" icon="octagon-alert">{err}</Banner></div>}
    </Modal>
  );
}
