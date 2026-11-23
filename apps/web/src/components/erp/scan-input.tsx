'use client';
import { useEffect, useRef, useState } from 'react';
import { Camera, ScanLine, X } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { useT } from '@/lib/i18n';

export const norm = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Works with Sunmi's built-in scanner (acts as a keyboard: scan + Enter) and falls back to the camera (BarcodeDetector) on other Android phones. */
export function ScanInput({ onScan, autoFocus = true }: { onScan: (code: string) => void; autoFocus?: boolean }) {
  const { t } = useT(); const [v, setV] = useState(''); const ref = useRef<HTMLInputElement>(null); const [cam, setCam] = useState(false); const video = useRef<HTMLVideoElement>(null);
  const hasCam = typeof window !== 'undefined' && 'BarcodeDetector' in window;
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const submit = (code: string) => { const c = code.trim(); if (!c) return; onScan(c); setV(''); ref.current?.focus(); };
  useEffect(() => {
    if (!cam) return; let stream: MediaStream | null = null; let stop = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); if (video.current) { video.current.srcObject = stream; await video.current.play(); }
        const det = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a'] });
        let last = '', lastAt = 0;
        const tick = async () => { if (stop || !video.current) return; try { const r = await det.detect(video.current); const c = r[0]?.rawValue; if (c && (c !== last || Date.now() - lastAt > 1500)) { last = c; lastAt = Date.now(); submit(c); navigator.vibrate?.(60); } } catch { /* frame not ready */ } requestAnimationFrame(tick); };
        tick();
      } catch { setCam(false); }
    })();
    return () => { stop = true; stream?.getTracks().forEach((x) => x.stop()); };
    // eslint-disable-next-line
  }, [cam]);
  return (
    <div className="space-y-2">
      <div className="flex gap-2"><div className="relative flex-1"><ScanLine size={20} className="pointer-events-none absolute start-3 top-3.5 text-primary" /><Input ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(v); } }} placeholder={t('Scan or type a barcode')} className="h-12 ps-11 text-base" inputMode="text" autoComplete="off" enterKeyHint="done" aria-label={t('Scan or type a barcode')} /></div>
        {hasCam && <Button type="button" variant="secondary" className="h-12" onClick={() => setCam(!cam)} aria-label="Camera">{cam ? <X size={18} /> : <Camera size={18} />}</Button>}</div>
      {cam && <video ref={video} playsInline muted className="aspect-video w-full rounded-xl bg-black object-cover" />}
    </div>
  );
}
