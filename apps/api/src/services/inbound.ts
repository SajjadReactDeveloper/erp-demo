// SAL-01: inbound WhatsApp / e-mail -> customer request. A message from a known customer becomes a submitted Request (with parsed
// part lines); a message from an unknown sender is logged and the sales team is notified, never turned into a record.
import { prisma } from '@erp/db';
import { BY_KEY } from '@erp/shared';
import type { Ctx } from '../core/base';
import { createRow, runAction } from '../core/crud';
import { llm } from '../adapters';
import { notifyRole } from '../core/base';

export interface Inbound { channel: 'whatsapp' | 'email'; from: string; text: string; subject?: string; name?: string }
type Line = { text: string; partNo?: string; qty: number };

const digits = (s: string) => String(s ?? '').replace(/\D/g, '');
/** Saudi numbers appear as 9665xxxxxxxx, 05xxxxxxxx or 5xxxxxxxx: compare the last 9 digits. */
const tail = (s: string) => digits(s).slice(-9);
const VIN = /\b[A-HJ-NPR-Z0-9]{17}\b/i;
const GREETING = /^(?:(?:hi|hello|hey|dear|thanks?|thank you|regards|best|salam)\b|(?:السلام|مرحبا|أهلا|اهلا|شكرا|شكراً|تحية))/i;
const westernDigits = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

const LEAD = /^(?:please\s+)?(?:kindly\s+)?(?:can you\s+)?(?:quote|send me|i need|we need|need|looking for|i want|we want|do you have|price for|مطلوب|نحتاج|أحتاج|احتاج|ابغى|أبغى|أريد|اريد|ممكن عرض سعر|عرض سعر)(?![A-Za-z])[\s:،,-]*/i;
const URGENT = /\b(urgent(?:ly)?|asap|immediately|today)\b|عاجل|ضروري|حالا|الآن/i;
/** Heuristic parser used when no AI engine is configured: one line per item, quantities like "2x", "qty 4", "x3", "3 pcs". */
export function parseLines(input: string): { lines: Line[]; vin?: string; urgent?: boolean } {
  const text = westernDigits(input);
  const vin = VIN.exec(text)?.[0]?.toUpperCase();
  const lines: Line[] = [];
  // newlines, semicolons, and inline numbered items ("1. air filter 2. wipers") separate items
  const parts = text.replace(VIN, ' ').replace(/(\s)(\d{1,2}[.)]\s+)(?=\D)/g, '\n').split(/\r?\n|[;؛]|\s+(?:and|و)\s+(?=\d)/i);
  for (const raw of parts) {
    let t = raw.replace(/^[\s\-*•]*(?:\d{1,2}[.)]\s+)?/, '').trim();
    if (!t || GREETING.test(t) || /^(on .* wrote:|from:|sent from|vin\b|chassis)/i.test(t)) continue;
    t = t.replace(/^(?:urgent|asap|عاجل)[:\s،,-]+/i, '').replace(LEAD, '').trim();
    let qty = 1;
    const m = /(?:^|\s)(?:qty|quantity|الكمية)[:\s]*(\d{1,3})\b/i.exec(t) ?? /(?:^|\s)(\d{1,3})\s*(?:x|×|pcs?|pieces?|قطعة|قطع|حبة|حبات)(?=\s|$)/i.exec(t) ?? /^(\d{1,3})\s*x?\s+(?=\D)/i.exec(t) ?? /\bx\s*(\d{1,3})\b/i.exec(t);
    if (m) { qty = Math.min(999, Math.max(1, Number(m[1]))); t = t.replace(m[0], ' '); }
    t = t.replace(/\b(?:qty|quantity|pcs?|pieces?)\b[:\s]*/i, ' ').replace(/[\s:،,.-]+$/, '').replace(/\s{2,}/g, ' ').trim();
    if (t.length < 3 || t.length > 200) continue;
    const pn = /\b(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{4,}\b/i.exec(t)?.[0];
    lines.push({ text: t, partNo: pn, qty });
    if (lines.length >= 30) break;
  }
  return { lines, vin, urgent: URGENT.test(text) };
}

async function extract(companyId: string, text: string): Promise<{ lines: Line[]; vin?: string; urgent?: boolean }> {
  if (await llm.active(companyId)) {
    const r = await llm.json('You read a customer message asking an auto-parts company for parts (Arabic or English). Return {"vin":string|null,"urgent":boolean,"lines":[{"text":string,"partNo":string|null,"qty":number}]}. Only parts the customer actually asks for; no greetings; qty defaults to 1.', text.slice(0, 4000));
    const d = r?.data; if (d?.lines?.length) return { vin: d.vin || undefined, urgent: !!d.urgent, lines: d.lines.slice(0, 30).map((l: any) => ({ text: String(l.text).slice(0, 200), partNo: l.partNo || undefined, qty: Math.max(1, Number(l.qty) || 1) })) };
  }
  return parseLines(text);
}

async function findCustomer(companyId: string, m: Inbound) {
  if (m.channel === 'email') {
    const e = m.from.toLowerCase().trim();
    return (await prisma.customer.findFirst({ where: { companyId, status: { not: 'blocked' }, email: { equals: e, mode: 'insensitive' } } }))
      ?? (await prisma.customerContact.findFirst({ where: { companyId, email: { equals: e, mode: 'insensitive' } }, include: { customer: true } }))?.customer
      ?? (await prisma.user.findFirst({ where: { companyId, kind: 'customer', isActive: true, email: { equals: e, mode: 'insensitive' } }, include: { customer: true } }))?.customer ?? null;
  }
  const t = tail(m.from); if (t.length < 8) return null;
  const cands = await prisma.customer.findMany({ where: { companyId, status: { not: 'blocked' }, phone: { not: null } }, select: { id: true, phone: true } });
  const hit = cands.find((c) => tail(c.phone!) === t);
  if (hit) return prisma.customer.findUnique({ where: { id: hit.id } });
  const contacts = await prisma.customerContact.findMany({ where: { companyId, phone: { not: null } }, select: { phone: true, customerId: true } });
  const c = contacts.find((x) => tail(x.phone!) === t);
  return c ? prisma.customer.findUnique({ where: { id: c.customerId } }) : null;
}

/** Automated captures are attributed to a dedicated, inactive "System" user (it cannot sign in), so audit/AI logs keep a valid user reference. */
const sysUser = new Map<string, string>();
async function systemUserId(companyId: string) {
  const known = sysUser.get(companyId); if (known) return known;
  const email = 'system@system.local';
  const u = (await prisma.user.findFirst({ where: { email } })) ?? (await prisma.user.create({ data: { companyId, email, name: 'System', kind: 'staff', isActive: false, locale: 'en' } as any }));
  sysUser.set(companyId, u.id); return u.id;
}
const system = async (companyId: string): Promise<Ctx> => ({ companyId, userId: await systemUserId(companyId), role: 'system', perms: ['*'], kind: 'staff', locale: 'ar' } as any);

export async function captureInbound(companyId: string, m: Inbound): Promise<{ ok: boolean; requestId?: string; number?: string; reason?: string }> {
  const log = (status: 'ok' | 'error', body: any, error?: string) => prisma.integrationMessage.create({ data: { companyId, provider: m.channel, direction: 'in', endpoint: 'inbound', requestBody: { from: m.from, subject: m.subject, text: m.text.slice(0, 2000) }, responseBody: body, status, error, attempts: 1, idempotencyKey: `${m.channel}:${m.from}:${Date.now()}` } as any });
  const customer = await findCustomer(companyId, m);
  if (!customer) {
    await log('error', null, 'unknown sender');
    await prisma.$transaction((tx) => notifyRole(tx, companyId, 'sales', { title: `Message from an unknown ${m.channel} sender`, body: `${m.name ? m.name + ' · ' : ''}${m.from}: ${m.text.slice(0, 140)}`, link: '/app/integrations', severity: 'warning', type: 'request' }));
    return { ok: false, reason: 'unknown_sender' };
  }
  const x = await extract(companyId, m.text); if (m.subject && URGENT.test(m.subject)) x.urgent = true;
  const lines = x.lines.length ? x.lines : [{ text: m.text.replace(/\s+/g, ' ').trim().slice(0, 200) || '(see notes)', qty: 1 }];
  const ctx = await system(companyId);
  const row = await prisma.$transaction(async (tx) => createRow(tx, ctx, BY_KEY.Request, { customerId: customer.id, channel: m.channel, status: 'draft', urgency: x.urgent ? 'urgent' : 'normal', vin: x.vin ?? null, notes: `[${m.channel}] ${m.subject ? m.subject + ' — ' : ''}${m.text}`.slice(0, 2000), children: { RequestLine: lines.map((l, i) => ({ lineNo: i + 1, customerText: l.text, partNumberText: l.partNo ?? null, qty: l.qty })) } }, { trusted: true }));
  await runAction(ctx, BY_KEY.Request, row.id, 'submit', {}).catch(async (e) => { await log('error', { requestId: row.id }, `submit failed: ${e.message}`); });
  await log('ok', { requestId: row.id, number: row.number, lines: lines.length });
  return { ok: true, requestId: row.id, number: row.number };
}
