'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, Pagination, SkeletonRows, StatusBadge, cn } from '@/components/ui';
import { DashHeader, TD, TH } from '@/components/erp/dash';

export default function SupplierRfqs() {
  const { t, lang } = useT(); const router = useRouter(); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['supplier-rfqs', page], queryFn: () => api<any>('/api/v1/portal/supplier/rfqs', { query: { page, limit: 20 } }), placeholderData: keepPreviousData });
  return (
    <div className="space-y-5">
      <DashHeader title={t('Requests for quotation')} sub={t('Quote before the deadline. You only see RFQs you were invited to.')} />
      <Card className="overflow-hidden">{q.isLoading ? <SkeletonRows rows={6} cols={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.data.length === 0 ? <EmptyState icon="send" title={t('No RFQs yet')} desc={t('New requests for quotation will appear here and be sent to you by WhatsApp or email.')} /> : (
        <><div className="sticky-head"><table className="w-full min-w-[640px] text-body"><thead><tr><th className={TH}>{t('RFQ')}</th><th className={TH}>{t('Deadline')}</th><th className={TH}>{t('Your quote')}</th><th className={TH}>{t('Status')}</th></tr></thead>
          <tbody className="divide-y divide-line">{q.data.data.map((r: any) => <tr key={r.id} tabIndex={0} onClick={() => router.push(`/supplier/rfqs/${r.id}`)} onKeyDown={(e) => e.key === 'Enter' && router.push(`/supplier/rfqs/${r.id}`)} className="cursor-pointer transition-colors hover:bg-soft/60">
            <td className={TD}><Link href={`/supplier/rfqs/${r.id}`} onClick={(e) => e.stopPropagation()} className="mono text-navy hover:underline">{r.number}</Link></td>
            <td className={cn(TD, 'num text-muted')}>{r.deadline ? fmtDateTime(r.deadline, lang) : '—'}</td>
            <td className={TD}>{r.quote ? <StatusBadge value={r.quote.status} /> : <Badge tone="warn">{t('Not quoted')}</Badge>}</td>
            <td className={TD}><StatusBadge value={r.status} /></td></tr>)}</tbody></table></div>
          <Pagination page={q.data.meta.page} pages={q.data.meta.pages} total={q.data.meta.total} limit={q.data.meta.limit} onPage={setPage} /></>)}</Card>
    </div>
  );
}
