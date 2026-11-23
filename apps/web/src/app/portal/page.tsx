'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { Gauge } from '@/components/charts';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, SkeletonRows, StatusBadge, cn } from '@/components/ui';
import { Chip, DashHeader, Hero, Kpi, ROW1, ROW2, th } from '@/components/erp/dash';

export default function PortalHome() {
  const { me } = useAuth(); const { t, lang } = useT();
  const q = useQuery({ queryKey: ['portal-dash'], queryFn: () => api<any>('/api/v1/portal/customer/dashboard') });
  const reqs = useQuery({ queryKey: ['portal-recent-requests'], queryFn: () => api<any>('/api/v1/r/request', { query: { limit: 6, sort: 'createdAt:desc' } }), retry: false });
  const d = q.data; const pct = d?.credit.limit ? Math.min(100, (d.credit.exposure / d.credit.limit) * 100) : 0;
  const hour = new Date().getHours(); const greet = hour < 12 ? (lang === 'ar' ? 'صباح الخير' : 'Good morning') : hour < 18 ? (lang === 'ar' ? 'مساء الخير' : 'Good afternoon') : (lang === 'ar' ? 'مساء النور' : 'Good evening');
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  return (
    <div className="space-y-5">
      <DashHeader title={`${greet}, ${me?.name?.split(' ')[0]}`} sub={d?.customer.name ?? t('Here is what is happening across your requests, orders and payments.')} />
      <section aria-label="Key figures" className={ROW1}>
        <Hero loading={q.isLoading} icon="wallet" label={t('Available credit')} value={<span className={cn('num', d?.credit.available < 0 && 'text-[#FCA5A5]')}>{fmtMoney(d?.credit.available, lang)}</span>}
          stats={d && [[t('Limit'), fmtMoney(d.credit.limit, lang)], [t('Amount due'), fmtMoney(d.credit.balance, lang)], [t('Overdue'), fmtMoney(d.credit.overdue, lang)]]}>
          <div className="h-1.5 overflow-hidden rounded-xs bg-white/10" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div className={cn('h-full rounded-xs', pct > 90 ? 'bg-[#FCA5A5]' : 'bg-gold')} style={{ width: `${pct}%` }} /></div>
          <p className="num mt-2 text-caption text-onnavy-muted">{Math.round(pct)}% {t('of your credit limit is in use')}</p>
        </Hero>
        <Link href="/portal/request" className="block"><Kpi loading={q.isLoading} icon="inbox" label={t('Open requests')} value={d?.openRequests} chip={<Chip tone="info">{t('In progress')}</Chip>} /></Link>
        <Link href="/portal/quotation" className="block"><Kpi loading={q.isLoading} icon="file-text" tone="warn" label={t('Quotations to review')} value={d?.quotationsToReview} chip={d?.quotationsToReview ? <Chip tone="warn">{t('Action needed')}</Chip> : <Chip tone="success">{t('All reviewed')}</Chip>} /></Link>
        <Link href="/portal/sales-order" className="block"><Kpi loading={q.isLoading} icon="truck" tone="success" label={t('Active orders')} value={d?.activeOrders} chip={<Chip tone="success">{t('On the way')}</Chip>} /></Link>
      </section>
      <section className={ROW2}>
        <Card>
          <CardHeader title={t('Recent requests')} actions={<Link href="/portal/request" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('View all')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
          {reqs.isLoading ? <SkeletonRows rows={5} cols={4} /> : !reqs.data?.data?.length ? <EmptyState icon="inbox" title={t('No requests yet')} desc={t('Send a request and suppliers will quote it.')} action={<Link href="/portal/request/new"><Button size="sm">{t('New request')}</Button></Link>} /> : (
            <div className="sticky-head px-3 pb-3 pt-2"><table className="w-full min-w-[480px] text-body"><thead><tr className="bg-soft text-caption font-semibold text-strong">{[t('Request'), t('Date'), t('Status')].map((h, i, a) => <th key={h} className={cn(th, i === 0 && 'rounded-s-sm', i === a.length - 1 && 'rounded-e-sm')}>{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">{reqs.data.data.map((r: any) => <tr key={r.id} className="transition-colors hover:bg-soft/60"><td className="px-4 py-3.5"><Link href={`/portal/request/${r.id}`} className="mono text-navy hover:underline">{r.number}</Link></td><td className="num px-4 py-3.5 text-muted">{fmtDate(r.createdAt, lang)}</td><td className="px-4 py-3.5"><StatusBadge value={r.status} /></td></tr>)}</tbody></table></div>)}
        </Card>
        <Card className="flex flex-col">
          <CardHeader title={t('Next due')} sub={d?.unpaidInvoices ? `${d.unpaidInvoices} ${t('Unpaid invoices').toLowerCase()}` : undefined} actions={<Link href="/portal/statement" className="inline-flex items-center gap-1 text-small font-semibold text-navy hover:underline">{t('View statement')} <ArrowUpRight size={14} className="rtl:-scale-x-100" /></Link>} />
          {q.isLoading ? <SkeletonRows rows={3} cols={2} /> : !d?.nextDue.length ? <EmptyState icon="party-popper" title={t('Nothing is due')} /> : <ul className="divide-y divide-line px-3 pb-3 pt-2">{d.nextDue.map((i: any) => <li key={i.id}><Link href={`/portal/invoice/${i.id}`} className="flex items-center justify-between gap-3 rounded-sm px-3 py-3 transition-colors hover:bg-soft"><span className="min-w-0"><b className="mono block truncate text-navy">{i.number}</b><span className="num text-caption text-muted">{fmtDate(i.dueDate, lang)}</span></span><Badge tone="gold"><span className="num">{fmtMoney(i.balance, lang)}</span></Badge></Link></li>)}</ul>}
          {d && d.credit.limit > 0 && <div className="mt-auto border-t border-line px-6 py-4"><p className="overline mb-1 text-muted">{t('Credit used')}</p><Gauge value={pct} size={160} /></div>}
        </Card>
      </section>
    </div>
  );
}
