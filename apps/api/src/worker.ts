// In-process background worker: outbox consumer + scheduled jobs. (Single instance; use a leader lock / queue when scaling out.)
import { prisma } from '@erp/db';
import { addDays, notifyRole, num, today, bus, getSetting } from './core/base';
import { escalateOverdue } from './core/approvals';
import { creditSweep } from './services/credit';
import { zatcaRetrySweep } from './services/zatca';
import { sendMessage } from './adapters';
import { recomputeSupplierScores } from './domain/procurement';
import { generateVehicleReminders, runForecast, suggestReorders } from './services/forecast';
import { TABLES, tableToFile } from './routes/reports';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
const guard = (name: string, fn: () => Promise<any>) => { let busy = false; return async () => { if (busy) return; busy = true; try { await fn(); } catch (e: any) { console.error(`[worker:${name}]`, e.message); } finally { busy = false; } }; };

// ---- outbox: fan committed events out to realtime subscribers, retry integration messages ----
async function drainOutbox() {
  const rows = await prisma.outboxEvent.findMany({ where: { status: 'pending', nextRunAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 200 });
  for (const e of rows) {
    try { bus.emit('event', { companyId: e.companyId, type: e.type, payload: e.payload }); await prisma.outboxEvent.update({ where: { id: e.id }, data: { status: 'done', attempts: e.attempts + 1 } }); }
    catch (err: any) { await prisma.outboxEvent.update({ where: { id: e.id }, data: { attempts: e.attempts + 1, status: e.attempts >= 4 ? 'failed' : 'pending', error: err.message, nextRunAt: new Date(Date.now() + 2 ** e.attempts * 5000) } }); }
  }
  const retry = await prisma.integrationMessage.findMany({ where: { status: 'retry' }, take: 50 });
  for (const m of retry) {
    const url = (m.endpoint ?? '').startsWith('http') ? m.endpoint! : null;
    let ok = true, error: string | undefined;
    if (url) { try { const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(m.requestBody) }); ok = r.ok; if (!ok) error = `HTTP ${r.status}`; } catch (e: any) { ok = false; error = e.message; } }
    await prisma.integrationMessage.update({ where: { id: m.id }, data: { status: ok ? 'ok' : m.attempts >= 5 ? 'dead' : 'retry', attempts: m.attempts + 1, error } });
  }
  await prisma.outboxEvent.deleteMany({ where: { status: 'done', createdAt: { lt: addDays(new Date(), -7) } } });
}

// ---- per-minute housekeeping ----
async function minutely() {
  await escalateOverdue();
  await zatcaRetrySweep();
  const now = new Date();
  // RFQ deadlines: close collection automatically
  const rfqs = await prisma.rfq.findMany({ where: { status: { in: ['sent', 'collecting'] }, deadline: { lt: now } }, take: 50 });
  for (const r of rfqs) await prisma.$transaction(async (tx) => {
    await tx.rfq.update({ where: { id: r.id }, data: { status: 'closed' } });
    await tx.rfqSupplier.updateMany({ where: { rfqId: r.id, status: { in: ['invited', 'viewed'] } }, data: { status: 'no_response' } });
    await notifyRole(tx, r.companyId, 'purchasing', { title: `RFQ ${r.number} deadline passed`, body: 'Compare the quotes received and award', link: `/app/rfq/${r.id}`, type: 'rfq' });
  });
  // quotation expiry
  await prisma.quotation.updateMany({ where: { status: { in: ['sent', 'viewed'] }, validUntil: { lt: today() } }, data: { status: 'expired' } });
  // request SLA breach alerts (once)
  const sla = await prisma.request.findMany({ where: { status: { in: ['submitted', 'in_sourcing'] }, slaDueAt: { lt: now } }, take: 50 });
  for (const r of sla) {
    const link = `/app/request/${r.id}`;
    if (await prisma.notification.findFirst({ where: { companyId: r.companyId, link, type: 'sla' } })) continue;
    await prisma.$transaction((tx) => notifyRole(tx, r.companyId, 'sales', { title: `SLA breached: request ${r.number}`, body: 'Still not quoted', link, severity: 'critical', type: 'sla' }));
  }
  // broken promises to pay
  const broken = await prisma.promiseToPay.findMany({ where: { status: 'open', promisedDate: { lt: today() } }, take: 100 });
  for (const p of broken) { await prisma.promiseToPay.update({ where: { id: p.id }, data: { status: 'broken' } }); await prisma.creditAlert.create({ data: { companyId: p.companyId, customerId: p.customerId, kind: 'broken_promise', severity: 'warning', message: 'A promise to pay was not kept', assignedToId: p.collectorId } }); }
  // task / activity reminders due within the hour
  const acts = await prisma.activity.findMany({ where: { status: 'open', dueAt: { lte: new Date(now.getTime() + 3600000), gte: addDays(now, -1) } }, take: 100 });
  for (const a of acts) { if (!a.assignedToId) continue; const link = `/app/activity/${a.id}`; if (await prisma.notification.findFirst({ where: { userId: a.assignedToId, link, type: 'task' } })) continue; await prisma.notification.create({ data: { companyId: a.companyId, userId: a.assignedToId, type: 'task', title: `Follow-up due: ${a.subject}`, link, severity: 'info', channel: 'inapp' } }); }
}

// ---- CRD-07: reminders, escalating by age, idempotent per (invoice, offset, channel), stop when paid ----
export async function runReminders(companyId?: string) {
  const rules = await prisma.reminderRule.findMany({ where: { isActive: true, ...(companyId ? { companyId } : {}) } });
  if (!rules.length) return 0;
  const invs = await prisma.invoice.findMany({ where: { ...(companyId ? { companyId } : {}), balance: { gt: 0 }, status: { in: ['cleared', 'reported', 'partially_paid'] }, invoiceType: { in: ['standard', 'simplified', 'debit_note'] }, dueDate: { not: null } }, include: { customer: true }, take: 5000 });
  let sent = 0;
  for (const inv of invs) {
    if (!(await getSetting(inv.companyId, 'reminder.enabled', true))) continue;
    const diff = Math.round((today().getTime() - inv.dueDate!.getTime()) / 86400000);
    for (const r of rules.filter((x) => x.companyId === inv.companyId && x.offsetDays === diff)) {
      if (await prisma.reminderLog.findFirst({ where: { invoiceId: inv.id, offsetDays: r.offsetDays, channel: r.channel } })) continue;
      const vars = { number: inv.number, balance: num(inv.balance).toFixed(2), due: inv.dueDate!.toISOString().slice(0, 10), days: Math.max(0, diff), link: `${WEB}/portal/invoices/${inv.id}` };
      const to = r.channel === 'email' ? inv.customer?.email : inv.customer?.phone;
      const res = await sendMessage(prisma, inv.companyId, { channel: r.channel as any, to, template: r.templateKey, vars, lang: 'ar', subject: `Invoice ${inv.number}` });
      await prisma.reminderLog.create({ data: { companyId: inv.companyId, invoiceId: inv.id, customerId: inv.customerId, offsetDays: r.offsetDays, channel: r.channel, status: res.ok ? 'sent' : 'failed', sentAt: new Date(), templateKey: r.templateKey, message: (res as any).body ?? (res as any).skipped } });
      if (res.ok) sent++;
      if (diff >= 14) await prisma.$transaction((tx) => notifyRole(tx, inv.companyId, diff >= 30 ? 'manager' : 'collector', { title: `Overdue ${diff} days: ${inv.customer?.name}`, body: `${inv.number} · SAR ${num(inv.balance).toFixed(2)}`, link: `/app/invoice/${inv.id}`, severity: 'warning', type: 'collection' }));
    }
  }
  return sent;
}

// ---- tiny cron matcher (minute hour dom month dow; supports *, numbers, lists, */n) for report schedules ----
const field = (spec: string, v: number) => spec === '*' || spec.split(',').some((p) => (p.startsWith('*/') ? v % Number(p.slice(2)) === 0 : Number(p) === v));
export const cronMatch = (cron: string, d: Date) => { const [mi, h, dom, mo, dow] = cron.trim().split(/\s+/); return !!dow && field(mi, d.getMinutes()) && field(h, d.getHours()) && field(dom, d.getDate()) && field(mo, d.getMonth() + 1) && field(dow, d.getDay()); };
async function reportSchedules() {
  const now = new Date();
  const due = (await prisma.reportSchedule.findMany({ where: { isActive: true } })).filter((s) => cronMatch(s.cron, now) && (!s.lastRunAt || now.getTime() - s.lastRunAt.getTime() > 55000));
  for (const s of due) {
    const rep = TABLES[s.report]; if (!rep) continue;
    try {
      const ctx: any = { companyId: s.companyId, userId: '', role: 'system', perms: ['*'], kind: 'staff', locale: 'ar' };
      const t = await rep.run(ctx, s.filters ?? {}); const file = await tableToFile(t, s.format === 'pdf' ? 'csv' : s.format);
      for (const to of ((s.recipients as any[]) ?? [])) await sendMessage(prisma, s.companyId, { channel: 'email', to, template: 'otp', vars: { code: `${t.title} (${file.buf.length} bytes attached as ${s.report}.${file.ext})` }, subject: t.title });
      await prisma.reportSchedule.update({ where: { id: s.id }, data: { lastRunAt: now } });
    } catch (e: any) { console.error('[worker:report]', s.name, e.message); }
  }
}

// ---- daily jobs ----
let lastDaily = '';
async function daily() {
  const key = new Date().toISOString().slice(0, 10);
  if (lastDaily === key || new Date().getHours() < 2) return;
  lastDaily = key;
  const companies = await prisma.company.findMany();
  await creditSweep();
  for (const c of companies) {
    await recomputeSupplierScores(c.id); await generateVehicleReminders(c.id); await suggestReorders(c.id);
    if (new Date().getDate() === 1) await runForecast(c.id);
    // vehicle reminders due -> send
    const rem = await prisma.vehicleReminder.findMany({ where: { companyId: c.id, status: 'upcoming', dueDate: { lte: addDays(today(), 14) } }, take: 200 });
    for (const r of rem) { const v = await prisma.vehicle.findUnique({ where: { id: r.vehicleId } }); const cu = r.customerId ? await prisma.customer.findUnique({ where: { id: r.customerId } }) : null; await sendMessage(prisma, c.id, { channel: 'whatsapp', to: cu?.phone, template: 'vehicle_service', lang: 'ar', vars: { vehicle: `${v?.make ?? ''} ${v?.model ?? ''}`, service: r.serviceName, due: r.dueDate?.toISOString().slice(0, 10) ?? '' } }); await prisma.vehicleReminder.update({ where: { id: r.id }, data: { status: 'sent', sentAt: new Date() } }); }
  }
}

export function startWorker() {
  setInterval(guard('outbox', drainOutbox), 4000);
  setInterval(guard('minutely', async () => { await minutely(); await reportSchedules(); }), 60000);
  setInterval(guard('hourly', async () => { await runReminders(); await daily(); }), 3600000);
  setTimeout(guard('boot', async () => { await minutely(); await daily(); }), 15000);
  console.log('[worker] started');
}
