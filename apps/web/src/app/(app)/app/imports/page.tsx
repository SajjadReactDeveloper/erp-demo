'use client';
import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { api, download } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, PageHeader, Select, cn, toast } from '@/components/ui';

const TARGETS = [['customer', 'Customers'], ['supplier', 'Suppliers'], ['part', 'Parts'], ['vehicle', 'Vehicles'], ['brand', 'Brands'], ['category', 'Categories'], ['uom', 'Units of measure'], ['price-rule', 'Pricing rules'], ['customer-contact', 'Customer contacts'], ['part-xref', 'Part cross-references'], ['part-vehicle-fit', 'Vehicle compatibility'], ['opening-balances', 'Opening balances (ledger)']];

export default function ImportsPage() {
  const { t } = useT(); const [target, setTarget] = useState('customer'); const [dry, setDry] = useState(true); const [file, setFile] = useState<File | null>(null); const input = useRef<HTMLInputElement>(null);
  const run = useMutation({
    mutationFn: () => { const fd = new FormData(); fd.append('file', file!); return api<any>(`/api/v1/imports/${target}`, { method: 'POST', form: fd, query: { dryRun: dry ? '1' : undefined } }); },
    onSuccess: (r) => (r.status === 'failed' ? toast.error(r.message) : toast.success(r.message)), onError: (e: any) => toast.error(e.message),
  });
  const r = run.data;
  return (
    <>
      <PageHeader title={t('Import data')} sub={t('Bulk-load customers, suppliers, parts, vehicles and opening balances from CSV or Excel. Everything is validated first; nothing is saved if any row has an error.')} />
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <Card><CardHeader title={t('1. Choose what to import')} /><div className="space-y-4 p-5">
          <Select value={target} onChange={(e) => setTarget(e.target.value)} aria-label={t('Import target')}>{TARGETS.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</Select>
          <Button variant="secondary" icon="download" className="w-full" onClick={() => download(`/api/v1/imports/template/${target}`, `${target}-template.csv`).catch((e) => toast.error(e.message))}>{t('Download CSV template')}</Button>
          <div className="border-t border-line pt-4"><p className="mb-2 text-sm font-bold">{t('2. Upload the file')}</p>
            <input ref={input} type="file" hidden accept=".csv,.xlsx,.xls" onChange={(e) => { setFile(e.target.files?.[0] ?? null); run.reset(); }} />
            <button onClick={() => input.current?.click()} className={cn('flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-sm transition hover:border-primary hover:bg-primary/5', file ? 'border-primary/50' : 'border-line')}><Upload size={22} className="text-primary" />{file ? <b>{file.name}</b> : <span className="text-muted">{t('Click to choose a CSV or Excel file')}</span>}</button></div>
          <Checkbox checked={dry} onChange={(e) => setDry(e.target.checked)} label={t('Validate only (dry run)')} />
          <Button className="w-full" size="lg" loading={run.isPending} disabled={!file} onClick={() => run.mutate()}>{dry ? t('Validate file') : t('Import now')}</Button>
        </div></Card>
        <Card className="overflow-hidden"><CardHeader title={t('Result')} />
          {!r ? <EmptyState icon="file-up" title={t('No file processed yet')} desc={t('Validate first to see any problems before importing.')} /> : (
            <div className="space-y-4 p-5"><div className="flex flex-wrap gap-2"><Badge tone={r.status === 'failed' ? 'danger' : 'success'}>{r.status}</Badge><Badge>{r.total} {t('rows')}</Badge><Badge tone="success">{r.validRows} {t('valid')}</Badge>{r.errors.length > 0 && <Badge tone="danger">{r.errors.length} {t('errors')}</Badge>}{r.created > 0 && <Badge tone="primary">{r.created} {t('imported')}</Badge>}</div>
              <p className="text-sm text-muted">{r.message}</p>
              {r.errors.length > 0 && <div className="max-h-96 overflow-y-auto rounded-xl border border-line"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted"><th className="w-20 p-2.5 text-start">{t('Row')}</th><th className="p-2.5 text-start">{t('Problem')}</th></tr></thead><tbody className="divide-y divide-line">{r.errors.map((e: any, i: number) => <tr key={i}><td className="num p-2.5">{e.row || '—'}</td><td className="p-2.5 text-danger">{e.message}</td></tr>)}</tbody></table></div>}</div>)}
        </Card>
      </div>
    </>
  );
}
