// NTF-04: notification rules. When an event is published (Quotation.send, Request.submit, Invoice.created…) every active rule for that
// event notifies the users of its role on its channel: in-app, e-mail, WhatsApp (or SMS when a provider is configured).
import { prisma } from '@erp/db';
import { BY_KEY } from '@erp/shared';
import { notifyUsers } from '../core/base';
import { sendMessage } from '../adapters';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
const delegate = (key: string) => (prisma as any)[key.charAt(0).toLowerCase() + key.slice(1)];

export async function applyNotificationRules(e: { companyId: string; type: string; payload: any }) {
  if (e.type.startsWith('NotificationRule') || e.type.startsWith('Notification.') || e.type.startsWith('IntegrationMessage')) return; // never react to our own bookkeeping
  const [key, action] = e.type.split('.'); const res = BY_KEY[key]; const id = e.payload?.id; if (!res || !id) return;
  // a rule may name the action (Request.submit) or the status that action produces (Request.submitted)
  const toStatus = res.actions.find((a) => a.key === action)?.to; const names = [e.type, ...(toStatus ? [`${key}.${toStatus}`] : [])];
  const rules = await prisma.notificationRule.findMany({ where: { companyId: e.companyId, event: { in: names }, isActive: true } });
  if (!rules.length) return;
  const row = await delegate(key)?.findUnique({ where: { id } }).catch(() => null); if (!row) return;
  const label = String(row[res.numField ?? res.label] ?? row.number ?? row.name ?? id);
  const verb = res.actions.find((a) => a.key === action)?.en ?? ({ created: 'created', updated: 'updated', deleted: 'deleted' } as Record<string, string>)[action] ?? action;
  const title = `${res.en} ${label}: ${verb}`; const path = `/app/${res.slug}/${id}`;
  for (const rule of rules) {
    const users = await prisma.user.findMany({ where: { companyId: e.companyId, kind: 'staff', isActive: true, ...(rule.roleId ? { roleId: rule.roleId } : { role: { name: 'admin' } }) }, select: { id: true, email: true, phone: true, locale: true } });
    if (rule.channel === 'inapp') { await notifyUsers(prisma, e.companyId, users.map((u) => u.id), { title, link: path, type: 'rule', severity: 'info' }); continue; }
    for (const u of users) {
      const to = rule.channel === 'email' ? u.email : u.phone; if (!to) continue;
      const lang = rule.language === 'user' ? ((u.locale as 'ar' | 'en') ?? 'ar') : (rule.language as 'ar' | 'en');
      await sendMessage(prisma, e.companyId, { channel: rule.channel as any, to, template: rule.templateKey || 'event_generic', vars: { title, number: label, link: `${WEB}${path}` }, lang, subject: title }).catch((err) => console.error('[notify-rule]', err.message));
    }
  }
}

/** Every event a rule can listen to: created/updated/deleted plus each workflow action of every resource. */
export function eventCatalogue() {
  const out: { event: string; label: string; resource: string }[] = [];
  for (const r of Object.values(BY_KEY)) { if (r.sys) continue; for (const a of ['created', 'updated']) out.push({ event: `${r.key}.${a}`, label: `${r.en} ${a}`, resource: r.en }); for (const act of r.actions) { out.push({ event: `${r.key}.${act.key}`, label: `${r.en}: ${act.en}`, resource: r.en }); if (act.to && !out.some((x) => x.event === `${r.key}.${act.to}`)) out.push({ event: `${r.key}.${act.to}`, label: `${r.en} becomes “${act.to.replace(/_/g, ' ')}”`, resource: r.en }); } }
  return out;
}
