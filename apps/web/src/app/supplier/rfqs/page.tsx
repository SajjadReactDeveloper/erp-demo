'use client';
import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDateTime } from '@/lib/format';
import { Badge, Card, EmptyState, ErrorState, PageHeader, Pagination, SkeletonRows, StatusBadge } from '@/components/ui';

export default function SupplierRfqs() {
  const { t, lang } = useT(); const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['supplier-rfqs', page], queryFn: () => api<any>('/api/v1/portal/supplier/rfqs', { query: { page, limit: 20 } }), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title={t('Requests for quotation')} sub={t('Quote before the deadline. You only see RFQs you were invited to.')} />
      <Card className="overflow-hidden">{q.isLoading ? <SkeletonRows rows={6} cols={5} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data.data.length === 0 ? <EmptyState icon="send" title={t('No RFQs yet')} desc={t('New requests for quotation will appear here and be sent to you by WhatsApp or email.')} /> : (
        <><ul className="divide-y divide-line">{q.data.data.map((r: any) => <li key={r.id}><Link href={`/supplier/rfqs/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-primary/5"><div><b>{r.number}</b><p className="text-xs text-muted">{t('Deadline')}: {r.deadline ? fmtDateTime(r.deadline, lang) : '—'}</p></div><div className="flex items-center gap-2">{r.quote ? <Badge tone="success">{t('Quote')}: <StatusBadge value={r.quote.status} /></Badge> : <Badge tone="warn">{t('Not quoted')}</Badge>}<StatusBadge value={r.status} /></div></Link></li>)}</ul>
          <Pagination page={q.data.meta.page} pages={q.data.meta.pages} total={q.data.meta.total} limit={q.data.meta.limit} onPage={setPage} /></>)}</Card>
    </>
  );
}
