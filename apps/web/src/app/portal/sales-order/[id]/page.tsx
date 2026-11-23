'use client';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, Icon, SkeletonRows, StatusBadge, cn } from '@/components/ui';
import { Banner, DocHeader, Panel } from '@/components/erp/dash';

const STAGES = ['confirmed', 'partially_delivered', 'delivered', 'invoiced'];
export default function PortalOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter();
  const q = useQuery({ queryKey: ['order-track', id], queryFn: async () => { const o = await api<{ data: any }>(`/api/v1/r/sales-order/${id}`); const dns = await api<{ data: any[] }>('/api/v1/r/delivery-note', { query: { 'f.salesOrderId': id, limit: 20 } }); const evs = await Promise.all(dns.data.map((d) => api<{ data: any[] }>('/api/v1/r/delivery-event', { query: { 'f.deliveryNoteId': d.id, sort: 'at:asc', limit: 30 } }).then((r) => ({ id: d.id, events: r.data })))); const inv = await api<{ data: any[] }>('/api/v1/r/invoice', { query: { 'f.salesOrderId': id, limit: 20 } }); return { order: o.data, dns: dns.data, evs, inv: inv.data }; }, refetchInterval: 20000 });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={4} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { order: o, dns, evs, inv } = q.data!; const lines: any[] = o._children?.SalesOrderLine ?? []; const stage = Math.max(0, STAGES.indexOf(inv.length ? 'invoiced' : o.status));
  const labels = [t('Confirmed'), t('Partly delivered'), t('Delivered'), t('Invoiced')];
  return (
    <div className="space-y-5">
      <DocHeader onBack={() => router.push('/portal/sales-order')} icon="shopping-bag" kicker={t('Order')} title={o.number} badge={<StatusBadge value={o.status} />} sub={fmtDate(o.orderDate, lang)}
        facts={[{ label: t('Total'), value: fmtMoney(o.total, lang) }, { label: t('Items'), value: lines.length }, { label: t('Deliveries'), value: dns.length }, { label: t('Invoices'), value: inv.length }]} />
      {o.status === 'on_hold' && <Banner tone="warn" icon="hourglass">{t('Your order is waiting for a credit review. We will confirm shortly.')}</Banner>}
      <Card className="p-6"><ol className="flex items-start">{labels.map((s, i) => { const done = i < stage || (i === stage && stage === 3); const cur = i === stage && !done; return (
        <li key={s} className="flex flex-1 flex-col items-center last:flex-none sm:flex-row sm:items-center">
          <div className="flex flex-col items-center gap-2 sm:flex-row"><span className={cn('grid h-9 w-9 shrink-0 place-items-center text-small font-bold', done ? 'bg-navy text-gold' : cur ? 'border-2 border-gold bg-gold-light text-gold-text' : 'bg-soft text-muted')}>{done ? <Check size={17} /> : i + 1}</span><span className={cn('text-center text-small font-semibold sm:text-start', done || cur ? 'text-fg' : 'text-muted')}>{s}</span></div>
          {i < 3 && <span className={cn('mx-3 hidden h-0.5 flex-1 sm:block', i < stage ? 'bg-navy' : 'bg-line')} />}
        </li>); })}</ol></Card>
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Panel title={t('Items')} icon="package">{lines.length === 0 ? <EmptyState icon="package" title={t('No items')} /> : <ul className="divide-y divide-line">{lines.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3.5"><span className="min-w-0"><b className="block truncate text-body font-semibold">{l._refs?.partId?.label}</b><span className="num text-caption text-muted">{t('Ordered')} {fmtNum(l.qty, lang, 0)} · {t('Delivered')} {fmtNum(l.deliveredQty, lang, 0)}{Number(l.backorderQty) > 0 && Number(l.deliveredQty) > 0 && ` · ${t('Back-order')} ${fmtNum(l.backorderQty, lang, 0)}`}</span></span><StatusBadge value={l.status} /></li>)}</ul>}</Panel>
        <Panel title={t('Delivery tracking')} icon="truck">{dns.length === 0 ? <EmptyState icon="truck" title={t('Not scheduled yet')} desc={t('We will notify you as soon as your goods are ready.')} /> : <div className="space-y-6 p-5">{dns.map((d) => <div key={d.id}><div className="mb-3 flex flex-wrap items-center gap-2"><b className="mono text-navy">{d.number}</b><StatusBadge value={d.status} /><span className="num text-caption text-muted">{fmtDate(d.plannedDate, lang)}</span><Button size="sm" variant="ghost" icon="printer" className="ms-auto" onClick={() => openDoc(`/api/v1/docs/delivery_note/${d.id}`)}>{t('Delivery note')}</Button></div>
          <ol className="space-y-3 border-s border-line ps-5">{(evs.find((e) => e.id === d.id)?.events ?? []).map((e) => <li key={e.id} className="relative"><span className="absolute -start-[25px] top-1 grid h-2.5 w-2.5 place-items-center bg-gold" /><StatusBadge value={e.kind} /> <span className="num ms-1 text-caption text-muted">{fmtDateTime(e.at, lang)}</span>{e.note && <span className="mt-0.5 block text-small text-muted">{e.note}</span>}</li>)}</ol></div>)}</div>}</Panel>
      </div>
      {inv.length > 0 && <Panel title={t('Invoices')} icon="receipt-text"><ul className="divide-y divide-line">{inv.map((i) => <li key={i.id}><Link href={`/portal/invoice/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-soft"><b className="mono text-navy">{i.number}</b><span className="num text-body font-semibold">{fmtMoney(i.total, lang)}</span><StatusBadge value={i.status} /></Link></li>)}</ul></Panel>}
    </div>
  );
}
void Icon;
