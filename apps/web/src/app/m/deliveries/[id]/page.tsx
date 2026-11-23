'use client';
import { use, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, MapPin, Phone } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { enqueue, getDeviceId, useWorkset } from '@/lib/offline';
import { norm, ScanInput } from '@/components/erp/scan-input';
import { SignaturePad, type SigHandle } from '@/components/erp/signature';
import { openDoc } from '@/lib/api';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Skeleton, StatusBadge, Textarea, cn, toast } from '@/components/ui';

export default function DeliveryStop({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params); const { t } = useT(); const router = useRouter(); const { ws, loading } = useWorkset();
  const d = useMemo(() => (ws?.deliveries ?? []).find((x: any) => x.id === id), [ws, id]);
  const [scanned, setScanned] = useState<Record<string, number>>({}); const [alert, setAlert] = useState<string | null>(null); const [pod, setPod] = useState(false); const [fail, setFail] = useState(false); const [reason, setReason] = useState('');
  const [qty, setQty] = useState<Record<string, string>>({}); const [short, setShort] = useState<Record<string, string>>({}); const [name, setName] = useState(''); const [idn, setIdn] = useState(''); const [ink, setInk] = useState(false); const [photo, setPhoto] = useState<string | null>(null); const sig = useRef<SigHandle>(null); const [local, setLocal] = useState<string | null>(null);
  useEffect(() => { try { setLocal(localStorage.getItem(`aq:dn:${id}`)); } catch { /* ignore */ } }, [id]);
  const mark = (s: string) => { try { localStorage.setItem(`aq:dn:${id}`, s); } catch { /* ignore */ } setLocal(s); };
  const scan = async (code: string) => {
    if (!d) return; const c = norm(code); const line = d.lines.find((l: any) => l.codes.some((x: string) => norm(x) === c)); const deviceId = await getDeviceId();
    if (!line) { setAlert(`${t('Wrong item')}: ${code}`); navigator.vibrate?.([200, 80, 200]); return; }
    if ((scanned[line.id] ?? 0) + 1 > line.qty) { setAlert(`${t('More than ordered')}: ${line.partNumber}`); navigator.vibrate?.([200, 80, 200]); return; }
    setAlert(null); navigator.vibrate?.(40); setScanned((s) => ({ ...s, [line.id]: (s[line.id] ?? 0) + 1 })); await enqueue('scan', { kind: 'deliver', barcode: code, qty: 1, deliveryLineId: line.id }, deviceId);
  };
  if (loading && !ws) return <div className="space-y-3"><Skeleton className="h-24" /><Skeleton className="h-40" /></div>;
  if (!d) return <Card><EmptyState icon="truck" title={t('Delivery not found')} action={<Button onClick={() => router.push('/m/deliveries')}>{t('Back')}</Button>} /></Card>;
  const status = local ?? d.status;
  const startPod = () => { setQty(Object.fromEntries(d.lines.map((l: any) => [l.id, String(scanned[l.id] ?? l.qty)]))); setPod(true); };
  const takePhoto = (f?: File) => { if (!f) return; const r = new FileReader(); r.onload = () => setPhoto(String(r.result)); r.readAsDataURL(f); };
  const submitPod = async () => {
    const pos = await new Promise<GeolocationPosition | null>((res) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 4000, maximumAge: 60000 }) : res(null)));
    const lines = d.lines.map((l: any) => ({ lineId: l.id, deliveredQty: Number(qty[l.id] ?? 0), reason: short[l.id] }));
    if (lines.some((l: any, i: number) => l.deliveredQty < d.lines[i].qty && !l.reason)) return toast.error(t('Give a reason for lines that are short'));
    await enqueue('pod', { deliveryNoteId: id, lines, signatureData: sig.current?.toDataURL(), signerName: name, signerIdNumber: idn, photoData: photo ?? undefined, lat: pos?.coords.latitude, lng: pos?.coords.longitude }, await getDeviceId());
    mark('delivered'); setPod(false); toast.success(t('Delivery confirmed. It will sync automatically.')); router.replace('/m/deliveries');
  };
  const submitFail = async () => { await enqueue('fail', { deliveryNoteId: id, reason }, await getDeviceId()); mark('failed'); setFail(false); toast.success(t('Saved')); router.replace('/m/deliveries'); };
  const start = async () => { const pos = await new Promise<GeolocationPosition | null>((res) => (navigator.geolocation ? navigator.geolocation.getCurrentPosition(res, () => res(null), { timeout: 3000 }) : res(null))); await enqueue('dispatch', { deliveryNoteId: id, lat: pos?.coords.latitude, lng: pos?.coords.longitude }, await getDeviceId()); mark('out_for_delivery'); toast.success(t('Delivery started')); };
  const maps = d.address?.lat ? `https://www.google.com/maps/dir/?api=1&destination=${d.address.lat},${d.address.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${d.address?.line1 ?? ''} ${d.address?.city ?? ''}`)}`;
  const done = status === 'delivered' || status === 'failed';
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">{d.number}</h1><StatusBadge value={status} /></div>
      <Card className="space-y-3 p-4"><div><b className="text-lg">{d.customer?.name}</b><p className="text-sm text-muted">{d.address?.line1} {d.address?.city}</p></div><div className="flex gap-2">{d.customer?.phone && <a href={`tel:${d.customer.phone}`} className="flex-1"><Button variant="secondary" className="w-full"><Phone size={16} />{t('Call')}</Button></a>}<a href={maps} target="_blank" rel="noreferrer" className="flex-1"><Button variant="secondary" className="w-full"><MapPin size={16} />{t('Navigate')}</Button></a></div></Card>
      {!done && <ScanInput onScan={scan} autoFocus={false} />}
      {alert && <div role="alert" className="flex items-center gap-3 rounded-2xl bg-danger p-4 font-bold text-white animate-in"><AlertTriangle size={28} />{alert}</div>}
      <div className="space-y-2">{d.lines.map((l: any) => { const s = scanned[l.id] ?? 0; return <Card key={l.id} className={cn('flex items-center justify-between gap-3 p-3', s >= l.qty && 'border-success/50 bg-success/5')}><span className="min-w-0"><b className="num block text-sm" dir="ltr">{l.partNumber}</b><span className="text-xs text-muted">{l.name}</span></span>{s >= l.qty ? <CheckCircle2 className="text-success" /> : <Badge tone={s ? 'warn' : 'muted'}>{s}/{l.qty}</Badge>}</Card>; })}</div>
      {!done && <div className="sticky bottom-3 grid gap-2 sm:grid-cols-2">{status !== 'out_for_delivery' ? <Button size="lg" className="sm:col-span-2" onClick={start}>{t('Start delivery')}</Button> : <><Button size="lg" onClick={startPod}>{t('Deliver & sign')}</Button><Button size="lg" variant="secondary" className="text-danger" onClick={() => setFail(true)}>{t('Could not deliver')}</Button></>}</div>}
      <Button variant="ghost" className="w-full" onClick={() => openDoc(`/api/v1/docs/label/${id}`, { kind: 'delivery_note' })}>{t('Print label')}</Button>

      <Modal open={pod} onClose={() => setPod(false)} title={t('Proof of delivery')} wide footer={<><Button variant="secondary" onClick={() => setPod(false)}>{t('Cancel')}</Button><Button disabled={!ink || !name.trim()} onClick={submitPod}>{t('Confirm delivery')}</Button></>}>
        <div className="space-y-4"><ul className="space-y-2">{d.lines.map((l: any) => { const q = Number(qty[l.id] ?? 0); return <li key={l.id} className="rounded-xl border border-line p-3"><div className="flex items-center justify-between gap-2"><b className="num text-sm" dir="ltr">{l.partNumber}</b><Input type="number" min={0} max={l.qty} step="any" value={qty[l.id] ?? ''} onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })} className="h-10 w-24" dir="ltr" /></div>{q < l.qty && <Input value={short[l.id] ?? ''} onChange={(e) => setShort({ ...short, [l.id]: e.target.value })} placeholder={t('Reason (required)')} className="mt-2 h-10" />}</li>; })}</ul>
          <div className="grid gap-3 sm:grid-cols-2"><Field label={t('Customer name')} required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label={t('ID number (optional)')}><Input value={idn} onChange={(e) => setIdn(e.target.value)} dir="ltr" /></Field></div>
          <Field label={t('Signature')} required><SignaturePad ref={sig} onChange={setInk} /></Field>
          <Field label={t('Photo')}><input type="file" accept="image/*" capture="environment" onChange={(e) => takePhoto(e.target.files?.[0])} className="text-sm" />{photo && <img src={photo} alt="" className="mt-2 max-h-32 rounded-lg" />}</Field></div></Modal>
      <Modal open={fail} onClose={() => setFail(false)} title={t('Why could the delivery not be completed?')} footer={<><Button variant="secondary" onClick={() => setFail(false)}>{t('Cancel')}</Button><Button variant="danger" disabled={!reason.trim()} onClick={submitFail}>{t('Confirm')}</Button></>}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('e.g. customer not available')} autoFocus /></Modal>
    </div>
  );
}
