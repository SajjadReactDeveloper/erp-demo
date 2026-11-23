'use client';
import { use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtDate, fmtDateTime, fmtMoney, fmtNum } from '@/lib/format';
import { Badge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, SkeletonRows, StatusBadge, cn } from '@/components/ui';

const STAGES = ['confirmed', 'partially_delivered', 'delivered', 'invoiced'];
export default function PortalOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t, lang } = useT(); const router = useRouter();
  const q = useQuery({ queryKey: ['order-track', id], queryFn: async () => { const o = await api<{ data: any }>(`/api/v1/r/sales-order/${id}`); const dns = await api<{ data: any[] }>('/api/v1/r/delivery-note', { query: { 'f.salesOrderId': id, limit: 20 } }); const evs = await Promise.all(dns.data.map((d) => api<{ data: any[] }>('/api/v1/r/delivery-event', { query: { 'f.deliveryNoteId': d.id, sort: 'at:asc', limit: 30 } }).then((r) => ({ id: d.id, events: r.data })))); const inv = await api<{ data: any[] }>('/api/v1/r/invoice', { query: { 'f.salesOrderId': id, limit: 20 } }); return { order: o.data, dns: dns.data, evs, inv: inv.data }; }, refetchInterval: 20000 });
  if (q.isLoading) return <Card><SkeletonRows rows={6} cols={4} /></Card>; if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { order: o, dns, evs, inv } = q.data!; const lines: any[] = o._children?.SalesOrderLine ?? []; const stage = Math.max(0, STAGES.indexOf(inv.length ? 'invoiced' : o.status));
  return (
    <>
      <PageHeader back={() => router.push('/portal/sales-order')} title={o.number} badge={<StatusBadge value={o.status} />} sub={fmtDate(o.orderDate, lang)} />
      {o.status === 'on_hold' && <p role="alert" className="mb-4 rounded-xl bg-warn/10 p-3 text-sm text-warn">{t('Your order is waiting for a credit review. We will confirm shortly.')}</p>}
      <Card className="mb-5 p-5"><ol className="flex items-center">{[t('Confirmed'), t('Partly delivered'), t('Delivered'), t('Invoiced')].map((s, i) => <li key={s} className="flex flex-1 items-center last:flex-none"><span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold', i <= stage ? 'bg-primary text-primary-fg' : 'bg-line text-muted')}>{i + 1}</span><span className={cn('ms-2 hidden text-xs font-semibold sm:block', i <= stage ? 'text-primary' : 'text-muted')}>{s}</span>{i < 3 && <span className={cn('mx-2 h-0.5 flex-1', i < stage ? 'bg-primary' : 'bg-line')} />}</li>)}</ol></Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title={t('Items')} actions={<Badge tone="primary">{fmtMoney(o.total, lang)}</Badge>} /><ul className="divide-y divide-line">{lines.map((l) => <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm"><span className="min-w-0"><b className="block truncate">{l._refs?.partId?.label}</b><span className="num text-xs text-muted">{t('Ordered')} {fmtNum(l.qty, lang, 0)} · {t('Delivered')} {fmtNum(l.deliveredQty, lang, 0)}{Number(l.backorderQty) > 0 && Number(l.deliveredQty) > 0 && ` · ${t('Back-order')} ${fmtNum(l.backorderQty, lang, 0)}`}</span></span><StatusBadge value={l.status} /></li>)}</ul></Card>
        <Card><CardHeader title={t('Delivery tracking')} />{dns.length === 0 ? <EmptyState icon="truck" title={t('Not scheduled yet')} desc={t('We will notify you as soon as your goods are ready.')} /> : <div className="space-y-4 p-5">{dns.map((d) => <div key={d.id}><div className="mb-2 flex items-center gap-2"><b className="text-sm">{d.number}</b><StatusBadge value={d.status} /><span className="num text-xs text-muted">{fmtDate(d.plannedDate, lang)}</span><Button size="sm" variant="ghost" icon="printer" className="ms-auto" onClick={() => openDoc(`/api/v1/docs/delivery_note/${d.id}`)}>{t('Delivery note')}</Button></div>
          <ol className="space-y-2 border-s border-line ps-4">{(evs.find((e) => e.id === d.id)?.events ?? []).map((e) => <li key={e.id} className="relative text-xs"><span className="absolute -start-[21px] top-1 h-2.5 w-2.5 rounded-full bg-primary" /><StatusBadge value={e.kind} /> <span className="text-muted">{fmtDateTime(e.at, lang)}</span>{e.note && <span className="block text-muted">{e.note}</span>}</li>)}</ol></div>)}</div>}</Card>
      </div>
      {inv.length > 0 && <Card className="mt-5"><CardHeader title={t('Invoices')} /><ul className="divide-y divide-line">{inv.map((i) => <li key={i.id}><Link href={`/portal/invoice/${i.id}`} className="flex items-center justify-between px-5 py-3 text-sm hover:bg-primary/5"><b>{i.number}</b><span className="num">{fmtMoney(i.total, lang)}</span><StatusBadge value={i.status} /></Link></li>)}</ul></Card>}
    </>
  );
}
