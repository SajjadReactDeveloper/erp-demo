'use client';
// Local-first sync for the warehouse / driver app: an append-only event queue in IndexedDB with idempotency keys,
// replayed to /sync/push when the network is back. Events are never dropped on failure.
import { get, set, del } from 'idb-keyval';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

export interface QEvent { clientEventId: string; type: 'scan' | 'receipt' | 'dispatch' | 'pod' | 'fail'; at: string; deviceId?: string; payload: any; status: 'pending' | 'error'; error?: string }
const QK = 'aq:queue', WK = 'aq:workset', DK = 'aq:device';

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const getQueue = async (): Promise<QEvent[]> => (await get(QK)) ?? [];
export async function enqueue(type: QEvent['type'], payload: any, deviceId?: string) {
  const q = await getQueue(); const e: QEvent = { clientEventId: uuid(), type, at: new Date().toISOString(), deviceId, payload, status: 'pending' };
  await set(QK, [...q, e]); window.dispatchEvent(new Event('aq:queue')); return e;
}
export const getWorkset = async () => (await get(WK)) as any | undefined;
export async function getDeviceId() { let d = await get(DK); if (!d) { d = uuid(); await set(DK, d); } return d as string; }

async function uploadPhotos(e: QEvent) {
  const p = e.payload;
  if (e.type === 'pod' && p.photoData && !p.photoKeys?.length) {
    const blob = await (await fetch(p.photoData)).blob(); const fd = new FormData(); fd.append('refType', 'DeliveryNote'); fd.append('refId', p.deliveryNoteId); fd.append('kind', 'photo'); fd.append('file', new File([blob], 'pod.jpg', { type: blob.type }));
    const r = await api<any>('/api/v1/files', { method: 'POST', form: fd }); p.photoKeys = [r.data.id]; delete p.photoData;
  }
}
let flushing = false;
export async function flush(): Promise<{ ok: number; errors: number }> {
  if (flushing || !navigator.onLine) return { ok: 0, errors: 0 };
  flushing = true;
  try {
    let q = await getQueue(); const todo = q.filter((e) => e.status === 'pending'); if (!todo.length) return { ok: 0, errors: 0 };
    for (const e of todo) { try { await uploadPhotos(e); } catch { /* retried next flush */ } }
    const r = await api<{ results: any[] }>('/api/v1/sync/push', { method: 'POST', body: { events: todo.map((e) => ({ clientEventId: e.clientEventId, type: e.type, at: e.at, deviceId: e.deviceId, payload: e.payload })) } });
    q = await getQueue(); let ok = 0, errors = 0;
    const next: QEvent[] = [];
    for (const e of q) { const res = r.results.find((x) => x.clientEventId === e.clientEventId); if (!res) { next.push(e); continue; } if (res.status === 'ok' || res.status === 'duplicate') ok++; else { errors++; next.push({ ...e, status: 'error', error: res.message }); } }
    await set(QK, next); window.dispatchEvent(new Event('aq:queue')); return { ok, errors };
  } finally { flushing = false; }
}
export async function pull() {
  const r = await api<any>('/api/v1/sync/pull'); await set(WK, r); return r;
}
export async function dropEvent(id: string) { const q = await getQueue(); await set(QK, q.filter((e) => e.clientEventId !== id)); window.dispatchEvent(new Event('aq:queue')); }
export async function retryEvent(id: string) { const q = await getQueue(); await set(QK, q.map((e) => (e.clientEventId === id ? { ...e, status: 'pending' as const, error: undefined } : e))); window.dispatchEvent(new Event('aq:queue')); }
export const clearAll = async () => { await del(QK); await del(WK); };

export function useOnline() { const [on, setOn] = useState(true); useEffect(() => { setOn(navigator.onLine); const a = () => setOn(true), b = () => setOn(false); window.addEventListener('online', a); window.addEventListener('offline', b); return () => { window.removeEventListener('online', a); window.removeEventListener('offline', b); }; }, []); return on; }
export function useQueue() { const [q, setQ] = useState<QEvent[]>([]); const load = useCallback(async () => setQ(await getQueue()), []); useEffect(() => { load(); window.addEventListener('aq:queue', load); return () => window.removeEventListener('aq:queue', load); }, [load]); return { queue: q, reload: load }; }
export function useWorkset() {
  const [ws, setWs] = useState<any>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>();
  const refresh = useCallback(async () => { setError(undefined); try { if (navigator.onLine) setWs(await pull()); else setWs((await getWorkset()) ?? null); } catch (e: any) { const c = await getWorkset(); if (c) setWs(c); else setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { getWorkset().then((c) => c && setWs(c)); refresh(); }, [refresh]);
  return { ws, loading, error, refresh };
}
