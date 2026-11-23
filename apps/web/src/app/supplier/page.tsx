'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { Badge, Card, CardHeader, EmptyState, ErrorState, SkeletonRows, StatusBadge, cn } from '@/components/ui';
import { Chip, DashHeader, Hero, Kpi, ROW1, ROW2, th } from '@/components/erp/dash';

export default function SupplierHome() {
  const { me } = useAuth(); const { t, lang } = useT();
  const q = useQuery({ queryKey: ['supplier-dash'], queryFn: () => api<any>('/api/v1/portal/supplier/dashboard') }); const d = q.data;
  const rfqs = useQuery({ queryKey: ['supplier-recent-rfqs'], queryFn: () => api<any>('/api/v1/portal/supplier/rfqs', { query: { limit: 6 } }), retry: false });
  const pos = useQuery({ queryKey: ['supplier-recent-pos'], queryFn: () => api<any>('/api/v1/r/purchase-order', { query: { limit: 5, sort: 'createdAt:desc' } }), retry: false });
  const hour = new Date().getHours(); const greet = hour < 12 ? (lang === 'ar' ? 'صباح الخير' : 'Good morning') : hour < 18 ? (lang === 'ar' ? 'مساء الخير' : 'Good afternoon') : (lang === 'ar' ? 'مساء النور' : 'Good evening');
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-5">
      <DashHeader title={`${greet}, ${me?.name?.split(' ')[0]}`} sub={t('Here is what needs your attention on requests, orders and payments.')} />
      <section aria-label="Key figures" className={ROW1}>
        <Hero loading={q.isLoading} icon="wallet" label={t('Awaiting payment')} value={fmtMoney(d?.unpaid, lang)} stats={d && [[t('Open RFQs to quote'), d.openRfqs], [t('POs to confirm'), d.posToConfirm], [t('Open claims'), d.openClaims ?? 0]]} />
        <Link href="/supplier/rfqs" className="block"><Kpi loading={q.isLoading} icon="send" tone="warn" label={t('Open RFQs to quote')} value={d?.openRfqs} chip={d?.openRfqs ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('All quoted')}</Chip>} /></Link>
        <Link href="/supplier/purchase-order" className="block"><Kpi loading={q.isLoading} icon="shopping-basket" tone="info" label={t('POs to confirm')} value={d?.posToConfirm} chip={d?.posToConfirm ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('Up to date')}</Chip>} /></Link>
        <Link href="/supplier/supplier-quote" className="block"><Kpi loading={q.isLoading} icon="file-input" label={t('Draft quotes')} value={d?.draftQuotes} chip={<Chip tone="muted">{t('Drafts')}</Chip>} /></Link>
      </section>
      <section className={ROW2}>
        <Card>
          <CardHeader title={t('Recent RFQs')} actions={<Link href="/supplier/rfqs" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
          {rfqs.isLoading ? <SkeletonRows rows={5} cols={4} /> : !rfqs.data?.data?.length ? <EmptyState icon="send" title={t('No RFQs yet')} desc={t('Requests for quotation will appear here.')} /> : (
            <div className="sticky-head px-3 pb-3 pt-2"><table className="w-full min-w-[480px] text-body"><thead><tr className="bg-soft text-caption font-semibold text-strong">{[t('RFQ'), t('Deadline'), t('Status')].map((h, i, a) => <th key={h} className={cn(th, i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{rfqs.data.data.map((r: any) => <tr key={r.id} className="transition-colors hover:bg-soft/60"><td className="px-4 py-3.5"><Link href={`/supplier/rfqs/${r.id}`} className="mono text-navy hover:underline">{r.number}</Link></td><td className="num px-4 py-3.5 text-muted">{fmtDate(r.deadline, lang)}</td><td className="px-4 py-3.5"><StatusBadge value={r.quote?.status ?? r.invitation} /></td></tr>)}</tbody></table></div>)}
        </Card>
        <Card>
          <CardHeader title={t('Latest purchase orders')} actions={<Link href="/supplier/purchase-order" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
          {pos.isLoading ? <SkeletonRows rows={4} cols={2} /> : !pos.data?.data?.length ? <EmptyState icon="shopping-basket" title={t('No purchase orders yet')} /> : <ul className="divide-y divide-line px-3 pb-3 pt-2">{pos.data.data.map((p: any) => <li key={p.id}><Link href={`/supplier/purchase-order/${p.id}`} className="flex items-center justify-between gap-3 rounded-sm px-3 py-3 transition-colors hover:bg-soft"><span className="min-w-0"><b className="mono block truncate text-navy">{p.number}</b><span className="num text-caption text-muted">{fmtDate(p.createdAt, lang)}</span></span><Badge tone="muted"><span className="num">{fmtMoney(p.total, lang)}</span></Badge></Link></li>)}</ul>}
        </Card>
      </section>
    </div>
  );
}
