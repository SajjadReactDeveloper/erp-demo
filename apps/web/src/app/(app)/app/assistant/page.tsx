'use client';
import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Send, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtNum } from '@/lib/format';
import { BarCard, LineCard, PieCard } from '@/components/charts';
import { Button, Card, Input, PageHeader, Skeleton, cn } from '@/components/ui';

interface Msg { role: 'user' | 'bot'; text?: string; result?: any; suggestions?: string[]; error?: string }
export default function AssistantPage() {
  const { t, lang } = useT(); const [q, setQ] = useState(''); const [msgs, setMsgs] = useState<Msg[]>([]); const end = useRef<HTMLDivElement>(null);
  const ask = useMutation({
    mutationFn: (question: string) => api<any>('/api/v1/ai/assistant', { method: 'POST', body: { question } }),
    onSuccess: (r) => setMsgs((m) => [...m, r.ok ? { role: 'bot', result: r.result } : { role: 'bot', text: r.answer, suggestions: r.suggestions }]),
    onError: (e: any) => setMsgs((m) => [...m, { role: 'bot', error: e.message }]),
  });
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, ask.isPending]);
  const send = (text: string) => { if (!text.trim() || ask.isPending) return; setMsgs((m) => [...m, { role: 'user', text }]); setQ(''); ask.mutate(text); };
  const sugg = lang === 'ar' ? ['أعلى 10 عملاء متأخرين', 'مبيعات هذا الشهر', 'المبيعات حسب العميل', 'الهامش حسب الفئة', 'أعمار الذمم', 'المصروفات هذا الشهر'] : ['Top 10 overdue customers', 'Sales this month', 'Sales by customer', 'Gross margin by category', 'Receivables ageing', 'Expenses this month'];
  return (
    <>
      <PageHeader title={t('Assistant')} sub={t('Ask about your data in Arabic or English. It only reads what you are allowed to see.')} />
      <Card className="flex min-h-[60vh] flex-col">
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {msgs.length === 0 && <div className="grid place-items-center gap-4 py-10 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Sparkles size={26} /></span><div><h2 className="text-lg font-bold">{t('Try asking')}</h2></div><div className="flex flex-wrap justify-center gap-2">{sugg.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-primary hover:bg-primary/5">{s}</button>)}</div></div>}
          {msgs.map((m, i) => m.role === 'user' ? <div key={i} className="flex justify-end"><p className="max-w-[80%] rounded-2xl rounded-ee-sm bg-primary px-4 py-2.5 text-sm text-primary-fg">{m.text}</p></div> : (
            <div key={i} className="max-w-full space-y-3">
              {m.error && <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-2.5 text-sm text-danger">{m.error}</p>}
              {m.text && <div className="rounded-2xl rounded-es-sm bg-line/40 px-4 py-2.5 text-sm">{m.text}{m.suggestions && <div className="mt-2 flex flex-wrap gap-1.5">{m.suggestions.map((s) => <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-semibold hover:border-primary">{s}</button>)}</div>}</div>}
              {m.result && <Answer r={m.result} />}
            </div>))}
          {ask.isPending && <div className="max-w-sm space-y-2 rounded-2xl bg-line/40 p-4"><Skeleton className="h-3 w-40" /><Skeleton className="h-3 w-56" /><Skeleton className="h-3 w-32" /></div>}
          <div ref={end} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }} className="flex gap-2 border-t border-line p-3"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ask a question')} maxLength={300} aria-label={t('Ask a question')} /><Button type="submit" disabled={!q.trim()} loading={ask.isPending} className="shrink-0"><Send size={16} className="rtl:-scale-x-100" />{t('Send')}</Button></form>
      </Card>
    </>
  );
}
function Answer({ r }: { r: any }) {
  const { t, lang } = useT(); const [show, setShow] = useState(false);
  const data = r.rows.map((row: any[]) => ({ name: String(row[0]), value: Number(row[1]) || 0, ...Object.fromEntries(r.columns.slice(1).map((c: string, i: number) => [c, row[i + 1]])) }));
  return (
    <div className="space-y-3"><p className="text-sm font-bold">{r.title}</p>
      {r.rows.length === 0 ? <p className="rounded-2xl bg-line/40 px-4 py-2.5 text-sm text-muted">{t('No data found for that question.')}</p> : <>
        {r.chart === 'bar' && <BarCard title="" data={data} h={220} />}{r.chart === 'pie' && <PieCard title="" data={data} h={220} />}{r.chart === 'line' && <LineCard title="" data={data} xKey="name" area h={220} />}
        <Card className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-line/25 text-xs text-muted">{r.columns.map((c: string) => <th key={c} className="p-2.5 text-start font-semibold">{c}</th>)}</tr></thead><tbody className="divide-y divide-line">{r.rows.map((row: any[], i: number) => <tr key={i}>{row.map((v, j) => <td key={j} className={cn('p-2.5', typeof v === 'number' && 'num')}>{typeof v === 'number' ? fmtNum(v, lang) : String(v)}</td>)}</tr>)}</tbody></table></Card></>}
      <button onClick={() => setShow(!show)} className="text-xs font-semibold text-muted hover:text-fg">{show ? t('Hide query') : t('Show the query used')}</button>
      {show && <pre dir="ltr" className="overflow-x-auto rounded-xl bg-line/40 p-3 text-[11px]">{r.query}</pre>}</div>
  );
}
