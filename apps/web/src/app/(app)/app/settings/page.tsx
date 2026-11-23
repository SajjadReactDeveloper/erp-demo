'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardHeader, Checkbox, ErrorState, Icon, Input, NoAccess, PageHeader, SkeletonRows, Textarea, toast } from '@/components/ui';

const LINKS = [['company', 'building', 'Company profile'], ['branch', 'git-branch', 'Branches'], ['role', 'shield', 'Roles & permissions'], ['user', 'user', 'Users'], ['approval-rule', 'check-circle', 'Approval matrix'], ['price-rule', 'percent', 'Margin rules'], ['tax-code', 'receipt-text', 'Tax codes'], ['template', 'file-text', 'Document templates'], ['notification-rule', 'bell-ring', 'Notification rules'], ['reminder-rule', 'alarm-clock', 'Reminder rules'], ['posting-rule', 'workflow', 'Posting rules'], ['account', 'book', 'Chart of accounts'], ['report-schedule', 'calendar-clock', 'Report schedules'], ['zatca-credential', 'key-round', 'ZATCA credentials']];

export default function SettingsPage() {
  const { t } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient();
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ data: any[] }>('/api/v1/r/setting', { query: { limit: 100, sort: 'key:asc' } }) });
  const [vals, setVals] = useState<Record<string, any>>({}); const [dirty, setDirty] = useState<Set<string>>(new Set());
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.data.map((s) => [s.key, s.value?.v ?? s.value]))); }, [q.data]);
  const save = useMutation({ mutationFn: () => api('/api/v1/settings/bulk', { method: 'PUT', body: { settings: Object.fromEntries([...dirty].map((k) => [k, vals[k]])) } }), onSuccess: () => { toast.success(t('Settings saved')); setDirty(new Set()); qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e: any) => toast.error(e.message) });
  const groups = useMemo(() => { const g: Record<string, any[]> = {}; for (const s of q.data?.data ?? []) (g[s.key.split('.')[0]] ??= []).push(s); return g; }, [q.data]);
  if (ready && !can({ mod: 'platform', slug: 'setting' })) return <NoAccess />;
  const set = (k: string, v: any) => { setVals({ ...vals, [k]: v }); setDirty(new Set(dirty).add(k)); };
  return (
    <>
      <PageHeader title={t('Settings console')} sub={t('Business rules live here, not in code. Changes take effect immediately and are audited.')} actions={<Button loading={save.isPending} disabled={!dirty.size || !can({ mod: 'platform', slug: 'setting' }, 'update')} onClick={() => save.mutate()}>{t('Save changes')} {dirty.size ? `(${dirty.size})` : ''}</Button>} />
      <Card className="mb-5"><CardHeader title={t('Manage')} /><div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{LINKS.map(([slug, icon, label]) => <Link key={slug} href={`/app/${slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-semibold transition hover:border-primary/50 hover:bg-primary/5"><Icon name={icon} className="text-primary" />{t(label)}</Link>)}</div></Card>
      {q.isLoading ? <Card><SkeletonRows rows={8} cols={3} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <div className="grid gap-5 lg:grid-cols-2">{Object.entries(groups).map(([g, rows]) => (
          <Card key={g}><CardHeader title={g.toUpperCase()} /><div className="divide-y divide-line">{rows.map((s) => { const v = vals[s.key]; return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="num text-sm font-semibold" dir="ltr">{s.key}</p></div>
              <div className="w-56">{typeof v === 'boolean' ? <Checkbox checked={v} onChange={(e) => set(s.key, e.target.checked)} label={v ? t('On') : t('Off')} /> : typeof v === 'number' ? <Input type="number" step="any" value={v} onChange={(e) => set(s.key, Number(e.target.value))} dir="ltr" className="h-9" /> : typeof v === 'string' ? <Input value={v} onChange={(e) => set(s.key, e.target.value)} dir="ltr" className="h-9" /> : <JsonCell v={v} onChange={(x) => set(s.key, x)} />}</div></div>); })}</div></Card>))}</div>
      )}
    </>
  );
}
function JsonCell({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  const [raw, setRaw] = useState(JSON.stringify(v)); const [bad, setBad] = useState(false);
  return <Textarea rows={2} value={raw} dir="ltr" className={bad ? 'border-danger font-mono text-xs' : 'font-mono text-xs'} onChange={(e) => { setRaw(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} />;
}
