'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtMoney } from '@/lib/format';
import { Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonCards, Stat, cn } from '@/components/ui';

export default function PortalHome() {
  const { me } = useAuth(); const { t, lang } = useT();
  const q = useQuery({ queryKey: ['portal-dash'], queryFn: () => api<any>('/api/v1/portal/customer/dashboard') });
  const d = q.data; const pct = d?.credit.limit ? Math.min(100, (d.credit.exposure / d.credit.limit) * 100) : 0;
  return (
    <>
      <PageHeader title={`${lang === 'ar' ? 'أهلاً' : 'Hello'}, ${me?.name?.split(' ')[0]}`} sub={d?.customer.name} actions={<Link href="/portal/request/new"><Button size="lg" icon="plus">{t('New request')}</Button></Link>} />
      {q.isLoading ? <SkeletonCards n={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/portal/request"><Stat label={t('Open requests')} value={d.openRequests} icon="inbox" /></Link><Link href="/portal/quotation"><Stat label={t('Quotations to review')} value={d.quotationsToReview} icon="file-text" tone={d.quotationsToReview ? 'warn' : 'primary'} /></Link><Link href="/portal/sales-order"><Stat label={t('Active orders')} value={d.activeOrders} icon="truck" /></Link><Link href="/portal/invoice"><Stat label={t('Unpaid invoices')} value={d.unpaidInvoices} icon="receipt" tone={d.unpaidInvoices ? 'danger' : 'success'} /></Link></div>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card><CardHeader title={t('Credit')} actions={<Link href="/portal/statement" className="text-xs font-semibold text-primary">{t('View statement')}</Link>} /><div className="space-y-4 p-5">
              <div className="flex items-end justify-between"><div><p className="text-xs text-muted">{t('Available credit')}</p><p className={cn('num text-3xl font-extrabold', d.credit.available < 0 && 'text-danger')}>{fmtMoney(d.credit.available, lang)}</p></div><p className="num text-xs text-muted">{t('Limit')} {fmtMoney(d.credit.limit, lang)}</p></div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className={cn('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-warn' : 'bg-primary')} style={{ width: `${pct}%` }} /></div>
              <div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted">{t('Amount due')}</p><p className="num font-bold">{fmtMoney(d.credit.balance, lang)}</p></div><div><p className="text-xs text-muted">{t('Overdue')}</p><p className={cn('num font-bold', d.credit.overdue > 0 && 'text-danger')}>{fmtMoney(d.credit.overdue, lang)}</p></div></div></div></Card>
            <Card><CardHeader title={t('Next due')} />{d.nextDue.length === 0 ? <EmptyState icon="party-popper" title={t('Nothing is due')} /> : <ul className="divide-y divide-line">{d.nextDue.map((i: any) => <li key={i.id}><Link href={`/portal/invoice/${i.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-primary/5"><b>{i.number}</b><span className="num text-muted">{fmtDate(i.dueDate, lang)}</span><span className="num font-bold">{fmtMoney(i.balance, lang)}</span></Link></li>)}</ul>}</Card>
          </div></div>)}
    </>
  );
}
