'use client';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';

export interface SigHandle { toDataURL: () => string | null; clear: () => void }
/** Touch / mouse signature capture. Exposes the PNG as a data URL; empty pads return null. */
export const SignaturePad = forwardRef<SigHandle, { height?: number; onChange?: (hasInk: boolean) => void }>(({ height = 160, onChange }, ref) => {
  const { t } = useT();
  const cv = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [ink, setInk] = useState(false);
  useEffect(() => {
    const c = cv.current!; const ratio = window.devicePixelRatio || 1;
    c.width = c.offsetWidth * ratio; c.height = height * ratio; const g = c.getContext('2d')!; g.scale(ratio, ratio); g.lineWidth = 2.4; g.lineCap = 'round'; g.strokeStyle = '#111827';
  }, [height]);
  const pos = (e: React.PointerEvent) => { const r = cv.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: React.PointerEvent) => { drawing.current = true; cv.current!.setPointerCapture(e.pointerId); const g = cv.current!.getContext('2d')!; const [x, y] = pos(e); g.beginPath(); g.moveTo(x, y); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const g = cv.current!.getContext('2d')!; const [x, y] = pos(e); g.lineTo(x, y); g.stroke(); if (!ink) { setInk(true); onChange?.(true); } };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = cv.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setInk(false); onChange?.(false); };
  useImperativeHandle(ref, () => ({ toDataURL: () => (ink ? cv.current!.toDataURL('image/png') : null), clear }), [ink]);
  return (
    <div>
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} style={{ height, touchAction: 'none' }} className="w-full rounded-xl border-2 border-dashed border-line bg-white" aria-label={t('Signature')} />
      <div className="mt-1.5 flex items-center justify-between text-xs text-muted"><span>{t('Sign above with your finger or mouse')}</span><Button type="button" variant="ghost" size="sm" onClick={clear}>{t('Clear')}</Button></div>
    </div>
  );
});
SignaturePad.displayName = 'SignaturePad';
