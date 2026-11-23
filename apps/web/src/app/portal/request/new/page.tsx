'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import { api, fieldErrors } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { toInputDate } from '@/lib/format';
import { Badge, Button, Card, Field, Input, Select, Textarea, cn, toast } from '@/components/ui';
import { Banner, DashHeader, Panel } from '@/components/erp/dash';
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
      if (!vId && vin) { if (dv && !dv.valid) throw new Error(dv.error); try { const v = await api<any>('/api/v1/r/vehicle', { method: 'POST', body: { vin: dvin, make: dv?.make, year: dv?.year } }); vId = v.data.id; } catch (e: any) { if (e?.code !== 'duplicate') throw e; /* VIN already registered: the request carries the VIN itself */ } }
      const req = await api<any>('/api/v1/r/request', { method: 'POST', body: { vehicleId: vId, vin: dvin || undefined, urgency, requiredDate: date, notes, children: { RequestLine: valid.map((l, i) => ({ lineNo: i + 1, customerText: l.text, partNumberText: l.partNo || undefined, qty: l.qty })) } } });
      const created = await api<any>(`/api/v1/r/request/${req.data.id}`);
      for (const [i, l] of lines.filter((x) => x.text.trim() && Number(x.qty) > 0).entries()) if (l.file) { const fd = new FormData(); fd.append('refType', 'RequestLine'); fd.append('refId', created.data._children.RequestLine[i].id); fd.append('kind', 'photo'); fd.append('file', l.file); await api('/api/v1/files', { method: 'POST', form: fd }).catch(() => toast.warning(t('A photo could not be uploaded'))); }
      return api<any>(`/api/v1/r/request/${req.data.id}/actions/submit`, { method: 'POST', body: {} }).then((r) => ({ ...r, id: req.data.id, number: req.data.number }));
    },
    onSuccess: (r) => setDone(r), onError: (e: any) => { setErr(e.message); const fe = fieldErrors(e); if (Object.keys(fe).length) setErr(Object.values(fe).join(' · ')); },
  });
  if (done) return <Card className="mx-auto mt-8 max-w-lg animate-in"><div className="grid place-items-center gap-3 p-10 text-center"><span className="grid h-16 w-16 place-items-center bg-success-bg text-success"><CheckCircle2 size={34} /></span><h1 className="text-page-title">{t('Request submitted')}</h1><p className="text-small text-muted"><b className="mono text-navy">{done.number}</b> · {t('We will send you quotations as soon as suppliers respond.')}</p><div className="mt-2 flex gap-2"><Link href={`/portal/request/${done.id}`}><Button>{t('Track this request')}</Button></Link><Button variant="secondary" onClick={() => router.push('/portal')}>{t('Home')}</Button></div></div></Card>;
  const steps = [t('Vehicle'), t('Parts'), t('Review')];
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <DashHeader title={t('New parts request')} sub={t('Tell us the vehicle and the parts you need. Suppliers will quote within hours.')} />
      <Card className="p-5"><ol className="flex items-center">{steps.map((s, i) => { const done = step > i + 1, cur = step === i + 1; return (
        <li key={s} className="flex flex-1 items-center last:flex-none"><span className={cn('grid h-9 w-9 shrink-0 place-items-center text-small font-bold', done ? 'bg-navy text-gold' : cur ? 'border-2 border-gold bg-gold-light text-gold-text' : 'bg-soft text-muted')}>{done ? <Check size={17} /> : i + 1}</span><span className={cn('ms-3 text-small font-semibold', done || cur ? 'text-fg' : 'text-muted')}>{s}</span>{i < steps.length - 1 && <span className={cn('mx-4 h-0.5 flex-1', done ? 'bg-navy' : 'bg-line')} />}</li>); })}</ol></Card>
      {step === 1 && <Panel title={t('Which vehicle?')} icon="car"><div className="space-y-4 p-5"><Field label={t('Choose a saved vehicle')}><RefPicker resKey="Vehicle" value={vehicleId} onChange={(v) => { setVehicleId(v); if (v) setVin(''); }} placeholder={t('Select a vehicle')} /></Field><div className="flex items-center gap-3 text-caption font-semibold uppercase text-muted"><span className="h-px flex-1 bg-line" />{t('or')}<span className="h-px flex-1 bg-line" /></div>
        <Field label={t('Enter the VIN (17 characters)')} hint={t('Found on the registration card or the windscreen.')}><Input value={vin} onChange={(e) => { setVin(e.target.value.toUpperCase()); setVehicleId(null); }} maxLength={17} dir="ltr" className="num tracking-wider" placeholder="JTNB11HK0J3000001" /></Field>
        {dvin.length === 17 && (decode.isLoading ? <p className="text-sm text-muted">{t('Decoding')}…</p> : dv?.valid ? <div className="flex flex-wrap items-center gap-2 border border-success/30 bg-success-bg p-3 text-small"><Badge tone="success">{t('Recognised')}</Badge><b>{[dv.make, dv.model, dv.year].filter(Boolean).join(' ') || dv.region}</b>{dv.checksumOk === false && <Badge tone="warn">{t('Check the VIN')}</Badge>}</div> : <p role="alert" className="text-sm text-danger">{dv?.error}</p>)}
        <div className="flex justify-end"><Button onClick={() => setStep(2)} disabled={!vehicleId && !(dvin.length === 17 && dv?.valid)}>{t('Next')}</Button></div></div></Panel>}
      {step === 2 && <div className="space-y-4">{lines.map((l, i) => (
        <Panel key={i} title={`${t('Part')} #${i + 1}`} icon="package" actions={lines.length > 1 && <button onClick={() => setLines(lines.filter((_, j) => j !== i))} className="rounded-xs p-1.5 text-danger transition-colors hover:bg-danger-bg" aria-label={t('Remove')}><Trash2 size={16} /></button>}><div className="p-5">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_100px]"><Field label={t('Describe the part')} required><Input value={l.text} onChange={(e) => upd(i, 'text', e.target.value)} placeholder={lang === 'ar' ? 'مثال: فحمات فرامل أمامية' : 'e.g. front brake pads'} /></Field><Field label={t('Part number (if known)')}><Input value={l.partNo} onChange={(e) => upd(i, 'partNo', e.target.value)} dir="ltr" /></Field><Field label={t('Qty')} required><Input type="number" min={1} value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} dir="ltr" /></Field></div>
          <label className="mt-4 block text-caption font-semibold text-muted">{t('Photo (optional)')}<input type="file" accept="image/*" capture="environment" onChange={(e) => upd(i, 'file', e.target.files?.[0])} className="mt-1.5 block w-full border border-dashed border-line bg-soft/50 p-3 text-small file:me-3 file:border-0 file:bg-navy file:px-3 file:py-1.5 file:text-caption file:font-semibold file:text-white" /></label></div></Panel>))}
        <Button variant="secondary" onClick={() => setLines([...lines, { text: '', partNo: '', qty: '1' }])}><Plus size={16} />{t('Add another part')}</Button>
        <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(1)}>{t('Back')}</Button><Button onClick={() => setStep(3)} disabled={!valid.length}>{t('Next')}</Button></div></div>}
      {step === 3 && <Panel title={t('Review and submit')} icon="clipboard-check"><div className="space-y-4 p-5"><ul className="divide-y divide-line border border-line">{valid.map((l, i) => <li key={i} className="flex items-center justify-between p-3.5 text-body"><span><b>{l.text}</b> <span className="num text-muted" dir="ltr">{l.partNo}</span></span><Badge>×{l.qty}</Badge></li>)}</ul>
        <div className="grid gap-3 sm:grid-cols-2"><Field label={t('Needed by')}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" /></Field><Field label={t('Urgency')}><Select value={urgency} onChange={(e) => setUrgency(e.target.value)}>{['normal', 'urgent', 'critical'].map((u) => <option key={u} value={u}>{t(u)}</option>)}</Select></Field></div>
        <Field label={t('Notes')}><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>{err && <Banner tone="danger" icon="octagon-alert">{err}</Banner>}
        <div className="flex justify-between"><Button variant="ghost" onClick={() => setStep(2)}>{t('Back')}</Button><Button size="lg" loading={submit.isPending} onClick={() => { setErr(undefined); submit.mutate(); }}>{t('Submit request')}</Button></div></div></Panel>}
    </div>
  );
}
