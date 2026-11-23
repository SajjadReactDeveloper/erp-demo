// External-service adapters. Every adapter has a deterministic fake used in dev/CI; set the provider env vars to go live.
// All calls are logged to IntegrationMessage (PLT-10: monitoring, replay).
import { prisma, Tx } from '@erp/db';
import { getSetting } from '../core/base';
import { createHmac, randomUUID } from 'node:crypto';

type Db = Tx | typeof prisma;

async function log(db: Db, companyId: string, provider: string, endpoint: string, requestBody: any, responseBody: any, status: 'ok' | 'error' | 'retry', error?: string, direction: 'out' | 'in' = 'out') {
  return (db as any).integrationMessage.create({ data: { companyId, provider, direction, endpoint, requestBody, responseBody, status, error, attempts: 1, idempotencyKey: randomUUID() } });
}

// ---------------- messaging (NTF-01 / NTF-02) ----------------
const T: Record<string, { en: string; ar: string }> = {
  quotation_sent: { en: 'Your quotation {number} (SAR {total}) is ready. Review & approve: {link}', ar: 'عرض السعر {number} (بقيمة {total} ريال) جاهز. للمراجعة والموافقة: {link}' },
  rfq_invite: { en: 'New RFQ {number}. Please quote before {deadline}: {link}', ar: 'طلب عرض أسعار جديد {number}. يرجى تقديم السعر قبل {deadline}: {link}' },
  rfq_reminder: { en: 'Reminder: RFQ {number} closes {deadline}. Quote here: {link}', ar: 'تذكير: يغلق طلب الأسعار {number} في {deadline}. قدّم عرضك: {link}' },
  po_sent: { en: 'Purchase order {number} (SAR {total}). Please confirm: {link}', ar: 'أمر شراء {number} (بقيمة {total} ريال). يرجى التأكيد: {link}' },
  delivery_note: { en: 'Your order is out for delivery. Delivery note {number}. Track: {link}', ar: 'طلبك في الطريق. إشعار التسليم {number}. تتبّع: {link}' },
  invoice_issued: { en: 'Invoice {number} for SAR {total} is issued. Due {due}. View: {link}', ar: 'صدرت الفاتورة {number} بقيمة {total} ريال. الاستحقاق {due}. عرض: {link}' },
  pre_due: { en: 'Friendly reminder: invoice {number} (SAR {balance}) is due on {due}.', ar: 'تذكير: الفاتورة {number} (بقيمة {balance} ريال) تستحق في {due}.' },
  due_today: { en: 'Invoice {number} (SAR {balance}) is due today. Pay: {link}', ar: 'الفاتورة {number} (بقيمة {balance} ريال) مستحقة اليوم. للدفع: {link}' },
  overdue: { en: 'Invoice {number} (SAR {balance}) is overdue by {days} days. Please settle: {link}', ar: 'الفاتورة {number} (بقيمة {balance} ريال) متأخرة {days} يوماً. يرجى السداد: {link}' },
  otp: { en: 'Your verification code is {code}', ar: 'رمز التحقق الخاص بك هو {code}' },
  vehicle_service: { en: 'Service reminder for {vehicle}: {service} is due {due}.', ar: 'تذكير صيانة للمركبة {vehicle}: {service} مستحقة في {due}.' },
  welcome_portal: { en: 'Welcome to AutocQuick. Your portal account is ready: {link}', ar: 'مرحباً بك في أوتوكويك. حساب البوابة جاهز: {link}' },
};
export const render = (key: string, vars: Record<string, any>, lang: 'ar' | 'en') => (T[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

export async function sendMessage(db: Db, companyId: string, m: { channel: 'whatsapp' | 'sms' | 'email'; to?: string | null; template: string; vars?: Record<string, any>; lang?: 'ar' | 'en'; subject?: string }) {
  if (!m.to) return { ok: false, skipped: 'no_recipient' };
  const optout = await getSetting<string[]>(companyId, 'messaging.optout', [], db as any);
  if (optout.includes(m.to)) return { ok: false, skipped: 'opted_out' };
  if (m.channel === 'whatsapp' && !(await getSetting(companyId, 'whatsapp.enabled', true, db as any))) return { ok: false, skipped: 'disabled' };
  const body = render(m.template, m.vars ?? {}, m.lang ?? 'ar');
  const url = process.env[`${m.channel.toUpperCase()}_API_URL`];
  if (url) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env[`${m.channel.toUpperCase()}_API_KEY`] ?? ''}` }, body: JSON.stringify({ to: m.to, body, template: m.template, subject: m.subject }) });
      const j = await r.json().catch(() => ({}));
      await log(db, companyId, m.channel, url, { to: m.to, body }, j, r.ok ? 'ok' : 'error', r.ok ? undefined : `HTTP ${r.status}`);
      return { ok: r.ok, body };
    } catch (e: any) { await log(db, companyId, m.channel, url, { to: m.to, body }, null, 'retry', e.message); return { ok: false, error: e.message }; }
  }
  await log(db, companyId, m.channel, 'fake://' + m.channel, { to: m.to, body, subject: m.subject }, { id: randomUUID(), delivered: true }, 'ok');
  return { ok: true, body, fake: true };
}

// ---------------- payment gateway (CPT-06) ----------------
export const PAYMENT_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-payment-secret';
if (process.env.NODE_ENV === 'production' && (!process.env.PAYMENT_WEBHOOK_SECRET || process.env.PAYMENT_WEBHOOK_SECRET.length < 24 || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change-me|dev-only/.test(process.env.JWT_SECRET))) throw new Error('Refusing to start in production without strong JWT_SECRET and PAYMENT_WEBHOOK_SECRET');
export const signPayload = (raw: string) => createHmac('sha256', PAYMENT_SECRET).update(raw).digest('hex');
export async function createCheckout(db: Db, companyId: string, p: { invoiceId: string; invoiceNumber: string; amount: number; customerId: string }) {
  const id = 'chk_' + randomUUID().replace(/-/g, '').slice(0, 20);
  const url = process.env.PAYMENT_GATEWAY_URL ? `${process.env.PAYMENT_GATEWAY_URL}/${id}` : `${process.env.WEB_ORIGIN ?? 'http://localhost:3000'}/pay/${id}?invoice=${p.invoiceId}&amount=${p.amount}`;
  await log(db, companyId, 'payment', 'checkout.create', p, { id, url }, 'ok');
  return { id, url };
}

// ---------------- courier (LOG-11) ----------------
export const courier = {
  async book(db: Db, companyId: string, courierName: string, p: any) {
    const trackingNo = `${courierName.toUpperCase().slice(0, 3)}${Math.floor(1e9 + Math.random() * 9e9)}`;
    await log(db, companyId, courierName, 'shipment.book', p, { trackingNo }, 'ok');
    return { trackingNo, labelUrl: `/api/v1/docs/label/${trackingNo}` };
  },
  async track(db: Db, companyId: string, courierName: string, trackingNo: string, bookedAt: Date) {
    const mins = (Date.now() - bookedAt.getTime()) / 60000;
    const status = mins < 5 ? 'booked' : mins < 30 ? 'picked_up' : mins < 120 ? 'in_transit' : 'delivered';
    await log(db, companyId, courierName, 'shipment.track', { trackingNo }, { status }, 'ok');
    return { status, events: [{ at: bookedAt.toISOString(), status: 'booked' }, ...(status !== 'booked' ? [{ at: new Date().toISOString(), status }] : [])] };
  },
};

// ---------------- Daftra (FIN-10) ----------------
export async function daftraPush(db: Db, companyId: string, entity: string, entityId: string, payload: any) {
  const mode = await getSetting<string>(companyId, 'daftra.mode', 'push', db as any);
  if (mode === 'readonly') return { status: 'skipped' as const };
  const url = process.env.DAFTRA_API_URL;
  let status: 'ok' | 'error' = 'ok', error: string | undefined, externalId = `fake-${entityId.slice(0, 8)}`;
  if (url) {
    try {
      const r = await fetch(`${url}/${entity}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.DAFTRA_API_KEY ?? '' }, body: JSON.stringify(payload) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) { status = 'error'; error = `HTTP ${r.status}`; } else externalId = String(j.id ?? externalId);
    } catch (e: any) { status = 'error'; error = e.message; }
  }
  await (db as any).daftraSyncLog.create({ data: { companyId, entity, entityId, direction: 'push', externalId, status, error, payload } });
  return { status, externalId };
}

// ---------------- LLM gateway (AI-1/2/3). 'local' provider returns null -> callers use deterministic logic ----------------
export const llm = {
  enabled: () => !!process.env.LLM_BASE_URL && !!process.env.LLM_API_KEY,
  async json(system: string, user: string): Promise<any | null> {
    if (!llm.enabled()) return null;
    const t0 = Date.now();
    try {
      const r = await fetch(`${process.env.LLM_BASE_URL}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` }, body: JSON.stringify({ model: process.env.LLM_MODEL ?? 'gpt-4o-mini', response_format: { type: 'json_object' }, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }) });
      const j: any = await r.json();
      return { data: JSON.parse(j.choices[0].message.content), ms: Date.now() - t0 };
    } catch { return null; }
  },
};
