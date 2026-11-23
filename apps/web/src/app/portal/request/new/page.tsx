'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { toInputDate } from '@/lib/format';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea, cn, toast } from '@/components/ui';
import { RefPicker, useDebounced } from '@/components/erp/fields';

interface L { text: string; partNo: string; qty: string; file?: File | null }
export default function NewRequest() {
  const { t, lang } = useT(); const { me } = useAuth(); const router = useRouter();
  const [step, setStep] = useState(1);
  const [vehicleId, setVehicleId] = useState<string | null>(null); const [vin, setVin] = useState(''); const [urgency, setUrgency] = useState('normal'); const [date, setDate] = useState(toInputDate(new Date(Date.now() + 3 * 864e5))); const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<L[]>([{ text: '', partNo: '', qty: '1' }]); const [done, setDone] = useState<any>(null); const [err, setErr] = useState<string>();
  const dvin = useDebounced(vin.trim().toUpperCase(), 400);
  const decode = useQuery({ queryKey: ['vin', dvin], enabled: dvin.length === 17, queryFn: () => api<{ data: any }>('/api/v1/ai/vin-decode', { method: 'POST', body: { vin: dvin } }) });
  const dv = decode.data?.data;
  const upd = (i: number, k: keyof L, v: any) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const valid = lines.filter((l) => l.text.trim() && Number(l.qty) > 0);
  const submit = useMutation({
    mutationFn: async () => {
      let vId = vehicleId;
      if (!vId && vin) { if (dv && !dv.valid) throw new Error(dv.error); const v = await api<any>('/api/v1/r/vehicle', { method: 'POST', body: { vin: dvin, make: dv?.make, year: dv?.year } }); vId = v.data.id; }
      const req = await api<any>('/api/v1/r/request', { method: 'POST', body: { vehicleId: vId, vin: dvin || undefined, urgency, requiredDate: date, notes, children: { RequestLine: valid.map((l, i) => ({ lineNo: i + 1, customerText: l.text, partNumberText: l.partNo || undefined, qty: l.qty })) } } });
      const created = await api<any>(`/api/v1/r/request/${req.data.id}`);
      for (const [i, l] of lines.filter((x) => x.text.trim() && Number(x.qty) > 0).entries()) if (l.file) { const fd = new FormData(); fd.append('refType', 'RequestLine'); fd.append('refId', created.data._children.RequestLine[i].id); fd.append('kind', 'photo'); fd.append('file', l.file); await api('/api/v1/files', { method: 'POST', form: fd }).catch(() => toast.warning(t('A photo could not be uploaded'))); }
      return api<any>(`/api/v1/r/request/${req.data.id}/actions/submit`, { method: 'POST', body: {} }).then((r) => ({ ...r, id: req.data.id, number: req.data.number }));
    },
    onSuccess: (r) => setDone(r), onError: (e: any) => { setErr(e.message); const fe = fieldErrors(e); if (Object.keys(fe).length) setErr(Object.values(fe).join(' · ')); },
  });
  if (done) return <Card className="mx-auto mt-8 max-w-lg animate-in"><div className="grid place-items-center gap-3 p-10 text-center"><CheckCircle2 size={60} className="text-success" /><h1 className="text-2xl font-extrabold">{t('Request submitted')}</h1><p className="text-sm text-muted">{done.number} · {t('We will send you quotations as soon as suppliers respond.')}</p><div className="mt-2 flex gap-2"><Link href={`/portal/request/${done.id}`}><Button>{t('Track this request')}</Button></Link><Button variant="secondary" onClick={() => router.push('/portal')}>{t('Home')}</Button></div></div></Card>;
  const steps = [t('Vehicle'), t('Parts'), t('Review')];
  return (
    <>
      <PageHeader title={t('New parts request')} back={() => router.push('/portal/request')} />
      <ol className="mb-5 flex gap-2">{steps.map((s, i) => <li key={s} className={cn('flex-1 rounded-xl border px-3 py-2 text-center text-sm font-semibold', step === i + 1 ? 'border-primary bg-primary/10 text-primary' : step > i + 1 ? 'border-success/40 text-success' : 'border-line text-muted')}>{i + 1}. {s}</li>)}</ol>
      {step === 1 && <Card><CardHeader title={t('Which vehicle?')} /><div className="space-y-4 p-5"><Field label={t('Choose a saved vehicle')}><RefPicker resKey="Vehicle" value={vehicleId} onChange={(v) => { setVehicleId(v); if (v) setVin(''); }} placeholder={t('Select a vehicle')} /></Field><p className="text-center text-xs text-muted">{t('or')}</p>
        <Field label={t('Enter the VIN (17 characters)')} hint={t('Found on the registration card or the windscreen.')}><Input value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); setVehicleId(null); }} maxLength={17} dir="ltr" className="num tracking-wider" placeholder="JTNB11HK0J3000001" /></Field>
        {dvin.length === 17 && (decode.isLoading ? <p className="text-sm text-muted">{t('Decoding')}…</p> : dv?.valid ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-success/10 p-3 text-sm"><Badge tone="success">{t('Recognised')}</Badge><b>{[dv.make, dv.model, dv.year].filter(Boolean).join(' ') || dv.region}</b>{dv.checksumOk === false && <Badge tone="warn">{t('Check the VIN')}</Badge>}</div> : <p role="alert" className="text-sm text-danger">{dv?.error}</p>)}
        <div className="flex justify-end"><Button onClick={() => setStep(2)} disabled={!vehicleId && !(dvin.length === 17 && dv?.valid)}>{t('Next')}</Button></div></div></Card>}
      {step === 2 && <div className="space-y-4">{lines.map((l, i) => (
        <Card key={i} className="p-4"><div className="mb-3 flex items-center justify-between"><b className="text-sm">{t('Part')} #{i + 1}</b>{lines.length > 1 && <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-lg p-1.5 text-danger hover:bg-danger/10" aria-label={t('Remove')}><Trash2 size={16} /></button>}</div>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_100px]"><Field label={t('Describe the part')} required><Input value={l.text} onChange={(e) => upd(i, 'text', e.target.value)} placeholder={lang === 'ar' ? 'مثال: فحمات فرامل أمامية' : 'e.g. front brake pads'} /></Field><Field label={t('Part number (if known)')}><Input value={l.partNo} onChange={(e) => upd(i, 'partNo', e.target.value)} dir="ltr" /></Field><Field label={t('Qty')} required><Input type="number" min={1} value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} dir="ltr" /></Field></div>
          <label className="mt-3 block text-xs font-semibold text-muted">{t('Photo (optional)')}<input type="file" accept="image/*" capture="environment" onChange={(e) => upd(i, 'file', e.target.files?.[0])} className="mt-1 block text-sm" /></label></Card>))}
        <Button variant="secondary" icon="plus" onClick={() => setLines([...lines, { text: '', partNo: '', qty: '1' }])}><Plus size={16} />{t('Add another part')}</Button>
        <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}>{t('Back')}</Button><Button onClick={() => setStep(3)} disabled={!valid.length}>{t('Next')}</Button></div></div>}
      {step === 3 && <Card><CardHeader title={t('Review and submit')} /><div className="space-y-4 p-5"><ul className="divide-y divide-line rounded-xl border border-line">{valid.map((l, i) => <li key={i} className="flex items-center justify-between p-3 text-sm"><span><b>{l.text}</b> <span className="num text-muted" dir="ltr">{l.partNo}</span></span><Badge>×{l.qty}</Badge></li>)}</ul>
        <div className="grid gap-3 sm:grid-cols-2"><Field label={t('Needed by')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" /></Field><Field label={t('Urgency')}><Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>{['normal', 'urgent', 'critical'].map((u) => <option key={u} value={u}>{t(u)}</option>)}</Select></Field></div>
        <Field label={t('Notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>{err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
        <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(2)}>{t('Back')}</Button><Button size="lg" loading={submit.isPending} onClick={() => { setErr(undefined); submit.mutate(); }}>{t('Submit request')}</Button></div></div></Card>}
    </>
  );
}
