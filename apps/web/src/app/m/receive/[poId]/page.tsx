'use client';
import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Minus, Plus } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { enqueue, getDeviceId, useWorkset } from '@/lib/offline';
import { norm, ScanInput } from '@/components/erp/scan-input';
import { Badge, Button, Card, EmptyState, Input, Modal, Skeleton, cn, toast } from '@/components/ui';

export default function ReceivePo({ params }: { params: Promise<{ poId: string }> }) {
  const { poId } = use(params); const { t } = useT(); const router = useRouter(); const { ws, loading } = useWorkset();
  const po = useMemo(() => (ws?.purchaseOrders ?? []).find((p: any) => p.id === poId), [ws, poId]);
  const [got, setGot] = useState<Record<string, number>>({}); const [dmg, setDmg] = useState<Record<string, number>>({}); const [alert, setAlert] = useState<string | null>(null); const [finish, setFinish] = useState(false); const [last, setLast] = useState<string | null>(null);
  const key = `aq:recv:${poId}`;
  useEffect(() => { try { const s = localStorage.getItem(key); if (s) setGot(JSON.parse(s)); } catch { /* ignore */ } }, [key]);
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(got)); } catch { /* ignore */ } }, [got, key]);
  const scan = async (code: string) => {
    if (!po) return; const c = norm(code); const line = po.lines.find((l: any) => l.codes.some((x: string) => norm(x) === c));
    const deviceId = await getDeviceId();
    if (!line) { setAlert(`${t('Wrong item')}: ${code}`); navigator.vibrate?.([200, 80, 200]); await enqueue('scan', { kind: 'receive', barcode: code, qty: 1 }, deviceId); return; }
    const remaining = line.qty - line.received - (got[line.id] ?? 0);
    if (remaining <= 0) { setAlert(`${t('More than ordered')}: ${line.partNumber}`); navigator.vibrate?.([200, 80, 200]); await enqueue('scan', { kind: 'receive', barcode: code, qty: 1, poLineId: line.id }, deviceId); return; }
    setAlert(null); setLast(line.id); navigator.vibrate?.(40); setGot((g) => ({ ...g, [line.id]: (g[line.id] ?? 0) + 1 }));
    await enqueue('scan', { kind: 'receive', barcode: code, qty: 1, poLineId: line.id }, deviceId);
  };
  if (loading && !ws) return <div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-32" /></div>;
  if (!po) return <Card><EmptyState icon="package-x" title={t('Purchase order not found')} desc={t('It may already be fully received. Refresh the list.')} action={<Button onClick={() => router.push('/m/receive')}>{t('Back')}</Button>} /></Card>;
  const totalGot = Object.values(got).reduce((s, n) => s + n, 0);
  const submit = async () => {
    const lines = po.lines.filter((l: any) => (got[l.id] ?? 0) > 0 || (dmg[l.id] ?? 0) > 0).map((l: any) => ({ poLineId: l.id, receivedQty: got[l.id] ?? 0, damagedQty: dmg[l.id] ?? 0 }));
    if (!lines.length) return toast.error(t('Scan at least one item'));
    await enqueue('receipt', { poId, lines, deliveryRef: `MOB-${Date.now()}` }, await getDeviceId());
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    toast.success(t('Receipt saved. It will sync automatically.')); router.replace('/m/receive');
  };
  return (
    <div className="space-y-4">
      <div><h1 className="text-xl font-extrabold">{po.number}</h1><p className="text-sm text-muted">{po.supplier}</p></div>
      <ScanInput onScan={scan} />
      {alert && <div role="alert" className="flex items-center gap-3 rounded-2xl bg-danger p-4 font-bold text-white animate-in"><AlertTriangle size={28} />{alert}</div>}
      <div className="space-y-3">{po.lines.map((l: any) => { const rem = l.qty - l.received, g = got[l.id] ?? 0, done = g >= rem; return (
        <Card key={l.id} className={cn('p-4 transition', last === l.id && 'ring-2 ring-primary', done && 'border-success/50 bg-success/5')}>
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><b className="num block text-base" dir="ltr">{l.partNumber}</b><span className="text-xs text-muted">{l.name}</span></div>{done ? <CheckCircle2 className="shrink-0 text-success" /> : <Badge tone="warn">{t('To receive')} {rem - g}</Badge>}</div>
          <div className="mt-3 flex items-center justify-between"><span className="text-xs text-muted">{t('Ordered')} {l.qty} · {t('Already received')} {l.received}</span>
            <div className="flex items-center gap-2"><Button size="sm" variant="secondary" onClick={() => setGot({ ...got, [l.id]: Math.max(0, g - 1) })} aria-label="-"><Minus size={16} /></Button><span className="num w-10 text-center text-xl font-extrabold">{g}</span><Button size="sm" variant="secondary" onClick={() => setGot({ ...got, [l.id]: Math.min(rem, g + 1) })} aria-label="+"><Plus size={16} /></Button></div></div></Card>); })}</div>
      <div className="sticky bottom-3"><Button size="lg" className="w-full shadow-soft" disabled={totalGot === 0} onClick={() => setFinish(true)}>{t('Finish receiving')} ({totalGot})</Button></div>
      <Modal open={finish} onClose={() => setFinish(false)} title={t('Confirm receipt')} footer={<><Button variant="secondary" onClick={() => setFinish(false)}>{t('Cancel')}</Button><Button onClick={submit}>{t('Confirm')}</Button></>}>
        <p className="mb-3 text-sm text-muted">{t('Partial receiving is fine: the balance stays open on the purchase order. Enter any damaged units.')}</p>
        <ul className="space-y-3">{po.lines.filter((l: any) => (got[l.id] ?? 0) > 0).map((l: any) => <li key={l.id} className="flex items-center justify-between gap-3 text-sm"><span className="min-w-0 flex-1"><b className="num block" dir="ltr">{l.partNumber}</b><span className="text-xs text-muted">{t('Received')} {got[l.id]} / {l.qty - l.received}</span></span><label className="text-xs text-muted">{t('Damaged')}<Input type="number" min={0} max={got[l.id]} value={dmg[l.id] ?? 0} onChange={(e) => setDmg({ ...dmg, [l.id]: Math.min(Number(e.target.value), got[l.id]) })} className="mt-1 h-10 w-20" dir="ltr" /></label></li>)}</ul>
      </Modal>
    </div>
  );
}
