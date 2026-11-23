'use client';
import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, download, openDoc } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtNum, toInputDate } from '@/lib/format';
import { Button, Card, EmptyState, ErrorState, Input, PageHeader, Select, SkeletonRows, cn, toast } from '@/components/ui';
import { RefPicker } from '@/components/erp/fields';

const NAMES: Record<string, [string, string, string[]]> = {
  'trial-balance': ['Trial balance', 'ميزان المراجعة', ['asOf']], pnl: ['Profit & loss', 'قائمة الدخل', ['from', 'to']], 'balance-sheet': ['Balance sheet', 'الميزانية العمومية', ['asOf']], 'cash-flow': ['Cash flow', 'التدفقات النقدية', ['from', 'to']],
  vat: ['VAT return support', 'دعم إقرار ضريبة القيمة المضافة', ['from', 'to']], ageing: ['Receivables ageing', 'أعمار الذمم المدينة', ['asOf', 'groupBy']], 'supplier-performance': ['Supplier performance', 'أداء الموردين', []], statement: ['Customer statement', 'كشف حساب عميل', ['customerId', 'from', 'to']],
};

export default function ReportPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = use(params); const { t, lang } = useT(); const def = NAMES[name];
  const today = new Date(); const ys = new Date(today.getFullYear(), 0, 1);
  const [f, setF] = useState<Record<string, string>>({ asOf: toInputDate(today), from: toInputDate(name === 'statement' ? new Date(today.getTime() - 90 * 864e5) : ys), to: toInputDate(today), groupBy: 'customer', customerId: '' });
  const ready = !!def && (name !== 'statement' || !!f.customerId);
  const q = useQuery({ queryKey: ['report', name, f], enabled: ready, queryFn: ({ signal }) => api<{ data: any }>(`/api/v1/reports/${name}`, { query: f, signal }) });
  if (!def) return <EmptyState icon="file-question" title={t('Page not found')} />;
  const exp = async (format: string) => { try { if (format === 'pdf') openDoc(`/api/v1/reports/${name}/export`, { ...f, format: 'pdf', lang }); else await download(`/api/v1/reports/${name}/export`, `${name}.${format}`, { ...f, format }); } catch (e: any) { toast.error(e.message); } };
  const d = q.data?.data;
  return (
    <>
      <PageHeader title={def[lang === 'ar' ? 1 : 0]} actions={<>{[['xlsx', 'file-spreadsheet'], ['csv', 'download'], ['pdf', 'printer']].map(([k, i]) => <Button key={k} variant="secondary" size="sm" icon={i} disabled={!ready} onClick={() => exp(k)}>{k.toUpperCase()}</Button>)}</>} />
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-4">
        {def[2].includes('customerId') && <div className="w-64"><span className="mb-1 block text-xs font-semibold text-muted">{t('Customer')}</span><RefPicker resKey="Customer" value={f.customerId} onChange={(v) => setF({ ...f, customerId: v ?? '' })} /></div>}
        {def[2].includes('asOf') && <label className="text-xs font-semibold text-muted">{t('As of')}<Input type="date" value={f.asOf} onChange={(e) => setF({ ...f, asOf: e.target.value })} className="mt-1 h-10 w-44" dir="ltr" /></label>}
        {def[2].includes('from') && <label className="text-xs font-semibold text-muted">{t('From')}<Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className="mt-1 h-10 w-44" dir="ltr" /></label>}
        {def[2].includes('to') && <label className="text-xs font-semibold text-muted">{t('To')}<Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className="mt-1 h-10 w-44" dir="ltr" /></label>}
        {def[2].includes('groupBy') && <label className="text-xs font-semibold text-muted">{t('Group by')}<Select value={f.groupBy} onChange={(e) => setF({ ...f, groupBy: e.target.value })} className="mt-1 w-40">{['customer', 'rep', 'branch'].map((g) => <option key={g}>{g}</option>)}</Select></label>}
      </Card>
      {!ready ? <EmptyState icon="user-search" title={t('Choose a customer to see the statement')} /> : q.isLoading ? <Card><SkeletonRows rows={8} cols={4} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : d && (
        <Card className="overflow-hidden"><div className="border-b border-line px-5 py-3"><h2 className="text-sm font-bold">{d.title}</h2>{d.note && <p className={cn('mt-0.5 text-xs font-semibold', /balanced|ties|reconciles/i.test(d.note) ? 'text-success' : 'text-warn')}>{d.note}</p>}</div>
          {d.rows.length === 0 ? <EmptyState icon="file-bar-chart" title={t('No data for this period')} /> : <div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-line/25 text-xs text-muted">{d.columns.map((c: any) => <th key={c.key} className={cn('p-2.5 font-semibold', c.num ? 'text-end' : 'text-start')}>{c.label}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">{d.rows.map((r: any, i: number) => { const bold = /total|gross|net profit|closing|opening|net vat|liabilities \+/i.test(`${r.name ?? ''}${r.activity ?? ''}${r.line ?? ''}${r.type ?? ''}`); return <tr key={i} className={cn(bold && 'bg-primary/5 font-bold')}>{d.columns.map((c: any) => <td key={c.key} className={cn('p-2.5', c.num && 'num text-end')}>{c.num && r[c.key] !== '' && r[c.key] != null ? fmtNum(r[c.key], lang) : r[c.key] ?? ''}</td>)}</tr>; })}
              {d.totals && <tr className="border-t-2 border-primary bg-primary/10 font-extrabold">{d.columns.map((c: any) => <td key={c.key} className={cn('p-2.5', c.num && 'num text-end')}>{c.num && d.totals[c.key] != null ? fmtNum(d.totals[c.key], lang) : d.totals[c.key] ?? ''}</td>)}</tr>}</tbody></table></div>}
        </Card>)}
    </>
  );
}
