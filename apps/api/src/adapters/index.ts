// External-service adapters. Every adapter has a deterministic fake used in dev/CI; set the provider env vars to go live.
// All calls are logged to IntegrationMessage (PLT-10: monitoring, replay).
import { prisma, Tx } from '@erp/db';
import { getSetting } from '../core/base';
import { createHmac, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

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
  event_generic: { en: '{title} {link}', ar: '{title} {link}' },
  report_ready: { en: 'Your scheduled report "{title}" is attached.', ar: 'التقرير المجدول "{title}" مرفق.' },
  welcome_portal: { en: 'Welcome to AutocQuick. Your portal account is ready: {link}', ar: 'مرحباً بك في أوتوكويك. حساب البوابة جاهز: {link}' },
};
export const render = (key: string, vars: Record<string, any>, lang: 'ar' | 'en') => (T[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

/** WhatsApp wants digits only with the country code. Saudi local formats (05xxxxxxxx, 5xxxxxxxx) are completed with 966. */
export const waNumber = (to: string) => { let d = String(to).replace(/[^\d]/g, ''); if (d.startsWith('00')) d = d.slice(2); if (d.startsWith('05') && d.length === 10) d = '966' + d.slice(1); else if (d.startsWith('5') && d.length === 9) d = '966' + d; return d; };

let mailer: ReturnType<typeof nodemailer.createTransport> | undefined;
export const smtpConfigured = () => !!(process.env.SMTP_URL || process.env.SMTP_HOST);
const smtp = () => (mailer ??= nodemailer.createTransport(process.env.SMTP_URL ? process.env.SMTP_URL : { host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT ?? 587), secure: process.env.SMTP_SECURE === '1' || process.env.SMTP_PORT === '465', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' } : undefined }));
const WA_CLOUD = () => !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export async function sendMessage(db: Db, companyId: string, m: { channel: 'whatsapp' | 'sms' | 'email'; to?: string | null; template: string; vars?: Record<string, any>; lang?: 'ar' | 'en'; subject?: string; attachments?: { filename: string; content: Buffer; contentType?: string }[] }) {
  if (!m.to) return { ok: false, skipped: 'no_recipient' };
  const optout = await getSetting<string[]>(companyId, 'messaging.optout', [], db as any);
  if (optout.includes(m.to)) return { ok: false, skipped: 'opted_out' };
  if (m.channel === 'whatsapp' && !(await getSetting(companyId, 'whatsapp.enabled', true, db as any))) return { ok: false, skipped: 'disabled' };
  const lang = m.lang ?? 'ar'; const body = render(m.template, m.vars ?? {}, lang);

  // ----- e-mail over SMTP (with attachments) -----
  if (m.channel === 'email' && smtpConfigured()) {
    const ep = process.env.SMTP_HOST ?? 'smtp-url';
    try {
      const info = await smtp().sendMail({ from: process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? 'no-reply@localhost', to: m.to, subject: m.subject ?? body.slice(0, 80), text: body, html: `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6">${body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</div>`, attachments: m.attachments });
      await log(db, companyId, 'email', ep, { to: m.to, subject: m.subject, attachments: (m.attachments ?? []).map((a) => a.filename) }, { id: info.messageId, accepted: info.accepted }, 'ok');
      return { ok: true, body };
    } catch (e: any) { await log(db, companyId, 'email', ep, { to: m.to, subject: m.subject }, null, 'retry', e.message); return { ok: false, error: e.message }; }
  }

  // ----- WhatsApp Business Cloud API -----
  if (m.channel === 'whatsapp' && WA_CLOUD()) {
    const url = `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? 'v20.0'}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    // Outside the 24-hour window WhatsApp only delivers approved templates: WHATSAPP_TEMPLATES='{"quotation_sent":{"name":"quotation_sent","ar":"ar","en":"en"}}'
    let tpl: any = null; try { tpl = JSON.parse(process.env.WHATSAPP_TEMPLATES ?? '{}')[m.template]; } catch { /* ignore */ }
    const order = [...((T[m.template]?.[lang] ?? '').matchAll(/\{(\w+)\}/g))].map((x) => x[1]);
    const payload: any = { messaging_product: 'whatsapp', to: waNumber(m.to), ...(tpl ? { type: 'template', template: { name: tpl.name, language: { code: tpl[lang] ?? lang }, components: order.length ? [{ type: 'body', parameters: order.map((k) => ({ type: 'text', text: String((m.vars ?? {})[k] ?? '') })) }] : [] } } : { type: 'text', text: { body, preview_url: true } }) };
    try {
      const r = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, body: JSON.stringify(payload) });
      const j: any = await r.json().catch(() => ({}));
      await log(db, companyId, 'whatsapp', url, { to: payload.to, template: tpl?.name ?? 'text' }, j, r.ok ? 'ok' : 'error', r.ok ? undefined : String(j?.error?.message ?? `HTTP ${r.status}`));
      return { ok: r.ok, body, ...(r.ok ? {} : { error: j?.error?.message }) };
    } catch (e: any) { await log(db, companyId, 'whatsapp', url, { to: payload.to }, null, 'retry', e.message); return { ok: false, error: e.message }; }
  }

  // ----- generic provider (SMS / BSP / e-mail API): <CHANNEL>_API_URL -----
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

// ---------------- LLM gateway (AI-1/2/3). Any OpenAI-compatible endpoint (OpenAI, Azure, Anthropic's /v1 compatibility API, a local server) ----------------
// Used only when LLM_BASE_URL + LLM_API_KEY are set AND the company setting ai.provider is not 'local'. Otherwise callers use deterministic logic.
export const llm = {
  /** Environment is configured (does not look at the per-company setting). */
  enabled: () => !!process.env.LLM_BASE_URL && !!process.env.LLM_API_KEY,
  /** Configured and switched on for this company (ai.provider = 'llm'). */
  async active(companyId?: string): Promise<boolean> { if (!llm.enabled()) return false; if (!companyId) return true; return (await getSetting<string>(companyId, 'ai.provider', 'local')) !== 'local'; },
  async chat(messages: any[], opts: { json?: boolean; vision?: boolean; maxTokens?: number; err?: { status?: number } } = {}): Promise<{ text: string; ms: number } | null> {
    if (!llm.enabled()) return null;
    const t0 = Date.now(); const model = opts.vision ? (process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini') : (process.env.LLM_MODEL ?? 'gpt-4o-mini');
    try {
      const r = await fetch(`${process.env.LLM_BASE_URL!.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(60000), headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LLM_API_KEY}` }, body: JSON.stringify({ model, temperature: 0, max_tokens: opts.maxTokens ?? 2000, ...(opts.json ? { response_format: { type: 'json_object' } } : {}), messages }) });
      const j: any = await r.json(); if (!r.ok) { if (opts.err) opts.err.status = r.status; console.error("LLM request failed:", model, r.status, String(j?.error?.message ?? "").slice(0, 200)); return null; }
      return { text: String(j.choices?.[0]?.message?.content ?? ''), ms: Date.now() - t0 };
    } catch (e: any) { if (opts.err) opts.err.status = 0; console.error("LLM request error:", model, String(e?.message ?? e).slice(0, 200)); return null; }
  },
  async json(system: string, user: string, images?: { mime: string; b64: string }[], err?: { status?: number }): Promise<any | null> {
    const content: any = images?.length ? [{ type: 'text', text: user }, ...images.map((i) => ({ type: 'image_url', image_url: { url: `data:${i.mime};base64,${i.b64}` } }))] : user;
    const r = await llm.chat([{ role: 'system', content: system }, { role: 'user', content }], { json: true, vision: !!images?.length, err });
    if (!r) return null; try { return { data: JSON.parse(r.text.replace(/^```(?:json)?|```$/g, '').trim()), ms: r.ms }; } catch { return null; }
  },
};
