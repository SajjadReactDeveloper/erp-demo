'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, openDoc } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney, fmtNum, toInputDate } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, SkeletonRows, Stat } from '@/components/ui';

export default function Statement() {
  const { t, lang } = useT(); const { me } = useAuth(); const [from, setFrom] = useState(toInputDate(new Date(Date.now() - 90 * 864e5))); const [to, setTo] = useState(toInputDate(new Date()));
  const q = useQuery({ queryKey: ['statement', from, to], queryFn: () => api<{ data: any }>('/api/v1/portal/customer/statement', { query: { from, to } }) });
  const d = q.data?.data;
  return (
    <>
      <PageHeader title={t('Statement of account')} actions={<Button variant="secondary" icon="printer" onClick={() => openDoc(`/api/v1/docs/statement/${me?.customerId}`, { from, to })}>{t('Print / PDF')}</Button>} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4"><label className="text-xs font-semibold text-muted">{t('From')}<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 w-44" dir="ltr" /></label><label className="text-xs font-semibold text-muted">{t('To')}<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 w-44" dir="ltr" /></label></Card>
      {q.isLoading ? <Card><SkeletonRows rows={8} cols={6} /></Card> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <><div className="mb-4 grid gap-3 sm:grid-cols-2"><Stat label={t('Opening balance')} value={fmtMoney(d.opening, lang)} /><Stat label={t('Closing balance')} value={fmtMoney(d.closing, lang)} tone={d.closing > 0 ? 'danger' : 'success'} icon="wallet" /></div>
          <Card className="overflow-x-auto">{d.rows.length <= 1 ? <EmptyState icon="file-text" title={t('No transactions in this period')} /> : <table className="w-full min-w-[620px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted">{d.columns.map((c: any) => <th key={c.key} className="p-3 text-start font-semibold">{c.label}</th>)}</tr></thead><tbody className="divide-y divide-line">{d.rows.map((r: any, i: number) => <tr key={i}>{d.columns.map((c: any) => <td key={c.key} className={c.num ? 'num p-3' : 'p-3'}>{c.key === 'date' || c.key === 'due' ? (r[c.key] ? fmtDate(r[c.key], lang) : '') : c.num && r[c.key] ? fmtNum(r[c.key], lang) : r[c.key] ?? ''}</td>)}</tr>)}</tbody></table>}</Card></>)}
    </>
  );
}
