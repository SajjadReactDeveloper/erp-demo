import { trServer } from "./i18n";
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010';
const KEY = 'erp_token';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any, public requestId?: string) { super(message); }
}

export const getToken = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } };

type Q = Record<string, string | number | boolean | null | undefined | string[]>;
export function qs(q?: Q) {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) { if (v == null || v === '' || v === false) continue; p.set(k, Array.isArray(v) ? v.join(',') : String(v)); }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function api<T = any>(path: string, opts: { method?: string; body?: any; query?: Q; signal?: AbortSignal; form?: FormData; auth?: boolean; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token && opts.auth !== false) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs(opts.query)}`, { method: opts.method ?? 'GET', headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined), signal: opts.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e;
    throw new ApiError(0, 'network', 'Cannot reach the server. Check your connection and try again.');
  }
  const ct = res.headers.get('content-type') ?? '';
  const data = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && opts.auth !== false && !path.startsWith('/api/v1/auth/login') && typeof window !== 'undefined') {
      setToken(null);
      if (!location.pathname.startsWith('/login')) location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}&reason=${err.code ?? 'expired'}`;
    }
    throw new ApiError(res.status, err.code ?? 'error', trServer(err.message ?? (res.status === 429 ? 'Too many requests. Please slow down.' : 'Request failed')), err.details, err.requestId);
  }
  if (data && typeof (data as any).message === 'string') (data as any).message = trServer((data as any).message);
  return data as T;
}

export const fieldErrors = (e: unknown): Record<string, string> => {
  if (!(e instanceof ApiError) || !e.details || typeof e.details !== 'object') return {};
  return Object.fromEntries(Object.entries(e.details).map(([k, v]) => [k, Array.isArray(v) ? String(v[0]) : String(v)]));
};

export async function download(path: string, filename: string, query?: Q) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}${qs(query)}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new ApiError(res.status, 'download', 'Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Open an authenticated HTML document (print view) in a new tab. */
export function openDoc(path: string, query?: Q) {
  const token = getToken();
  window.open(`${API_URL}${path}${qs({ ...query, access_token: token ?? undefined })}`, '_blank', 'noopener');
}
