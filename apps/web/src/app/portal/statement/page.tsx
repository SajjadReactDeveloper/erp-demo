'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, openDoc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, Input, SkeletonRows, cn } from '@/components/ui';
import { DocHeader, Panel, TD, TH } from '@/components/erp/dash';

export default function Statement() {
  const { t, lang } = useT(); const { me } = useAuth(); const [from, setFrom] = useState(toInputDate(new Date(Date.now() - 90 * 864e5))); const [to, setTo] = useState(toInputDate(new Date()));
  const q = useQuery({ queryKey: ['statement', from, to], queryFn: () => api<{ data: any }>('/api/v1/portal/customer/statement', { query: { from, to } }) });
  const d = q.data?.data;
  return (
    <div className="space-y-5">
      <DocHeader icon="scroll-text" kicker={t('Account')} title={t('Statement of account')} sub={`${fmtDate(from, lang)} – ${fmtDate(to, lang)}`}
        actions={<Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/statement/${me?.customerId}`, { from, to })}>{t('Print / PDF')}</Button>}
        facts={d ? [{ label: t('Opening balance'), value: fmtMoney(d.opening, lang) }, { label: t('Closing balance'), value: <span className={cn(d.closing > 0 ? 'text-danger' : 'text-success')}>{fmtMoney(d.closing, lang)}</span> }, { label: t('Transactions'), value: Math.max(0, d.rows.length - 1) }] : undefined} />
      <Card className="flex flex-wrap items-end gap-4 p-4">
        <label className="text-caption font-semibold text-muted">{t('From')}<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-44" dir="ltr" /></label>
        <label className="text-caption font-semibold text-muted">{t('To')}<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-44" dir="ltr" /></label>
        <div className="ms-auto flex gap-2">{[[30, t('Last 30 days')], [90, t('Last 90 days')], [365, t('Last year')]].map(([n, l]) => <Button key={String(n)} size="sm" variant="soft" onClick={() => { setFrom(toInputDate(new Date(Date.now() - Number(n) * 864e5))); setTo(toInputDate(new Date())); }}>{l}</Button>)}</div>
      </Card>
      {q.isLoading ? <Card><SkeletonRows rows={8} cols={6} /></Card> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <Panel title={t('Transactions')} icon="list">{d.rows.length <= 1 ? <EmptyState icon="file-text" title={t('No transactions in this period')} /> : <div className="sticky-head"><table className="w-full min-w-[620px] text-body"><thead><tr>{d.columns.map((c: any) => <th key={c.key} className={cn(TH, c.num && 'text-end')}>{c.label}</th>)}</tr></thead><tbody className="divide-y divide-line">{d.rows.map((r: any, i: number) => <tr key={i} className="transition-colors hover:bg-soft/60">{d.columns.map((c: any) => <td key={c.key} className={cn(TD, c.num && 'num text-end', c.key === d.columns[0].key && 'font-medium')}>{c.key === 'date' || c.key === 'due' ? (r[c.key] ? fmtDate(r[c.key], lang) : '') : c.num && r[c.key] ? fmtNum(r[c.key], lang) : r[c.key] ?? ''}</td>)}</tr>)}</tbody></table></div>}</Panel>)}
    </div>
  );
}
