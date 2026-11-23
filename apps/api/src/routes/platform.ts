import type { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import { prisma } from '@erp/db';
import { BY_KEY, BY_SLUG, RESOURCES, can, PORTAL_WRITE } from '@erp/shared';
import { Ctx, HttpError, audit, bad, bus, clearSettingCache, conflict, delegateOf, forbidden, nextNumber, notFound, today } from '../core/base';
import { authenticate, signToken, JWT_SECRET, loadCtx } from '../core/auth-plugin';
import { authorize, createRow, scopeWhere, zodFor } from '../core/crud';
import { normPN } from '../services/catalogue';
import jwt from 'jsonwebtoken';

const UPLOAD_DIR = 'uploads';
const ALLOWED = new Set(['.pdf', '.xlsx', '.xls', '.csv', '.png', '.jpg', '.jpeg', '.webp', '.docx', '.txt']);
const MAGIC: Record<string, (b: Buffer) => boolean> = {
  '.pdf': (b) => b.subarray(0, 4).toString() === '%PDF', '.png': (b) => b[0] === 0x89 && b[1] === 0x50, '.jpg': (b) => b[0] === 0xff && b[1] === 0xd8, '.jpeg': (b) => b[0] === 0xff && b[1] === 0xd8,
  '.xlsx': (b) => b[0] === 0x50 && b[1] === 0x4b, '.docx': (b) => b[0] === 0x50 && b[1] === 0x4b, '.webp': (b) => b.subarray(0, 4).toString() === 'RIFF',
};

export function registerPlatformRoutes(app: FastifyInstance) {
  // ---------- approvals inbox (PLT-04) ----------
  app.get('/api/v1/approvals/inbox', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    if (ctx.kind !== 'staff') throw forbidden();
    const rows = await prisma.approvalRequest.findMany({ where: { companyId: ctx.companyId, status: { in: ['pending', 'escalated'] } }, orderBy: { dueAt: 'asc' }, take: 200 });
    const delegators = await prisma.user.findMany({ where: { companyId: ctx.companyId, delegateToId: ctx.userId, delegateUntil: { gte: new Date() } }, include: { role: true } });
    const roles = new Set([ctx.role, ...delegators.map((d: any) => d.role?.name)]);
    const mine = rows.filter((r) => { const step: any = (r.steps as any)[r.currentStep]; return ctx.perms.includes('*') || ctx.role === 'manager' || (step && roles.has(step.role)); });
    const users = await prisma.user.findMany({ where: { id: { in: mine.map((m) => m.requestedById!).filter(Boolean) } }, select: { id: true, name: true } });
    const nm = Object.fromEntries(users.map((u) => [u.id, u.name]));
    return { data: mine.map((r) => ({ ...r, requestedBy: nm[r.requestedById ?? ''] ?? null, stepRole: (r.steps as any)[r.currentStep]?.role, overdue: !!r.dueAt && r.dueAt < new Date() })) };
  });

  // ---------- notifications (NTF-03) ----------
  app.get('/api/v1/notifications/mine', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; const q = req.query as any;
    const limit = Math.min(50, Number(q.limit) || 20), page = Math.max(1, Number(q.page) || 1);
    const where: any = { userId: ctx.userId, ...(q.unread === '1' ? { read: false } : {}) };
    const [total, data] = await Promise.all([prisma.notification.count({ where }), prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit })]);
    return { data, meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
  });
  app.get('/api/v1/notifications/unread-count', { preHandler: authenticate }, async (req: any) => ({ count: await prisma.notification.count({ where: { userId: req.ctx.userId, read: false } }) }));
  app.post('/api/v1/notifications/read', { preHandler: authenticate }, async (req: any) => {
    const b = req.body ?? {};
    const where: any = { userId: req.ctx.userId, ...(b.all ? {} : { id: { in: Array.isArray(b.ids) ? b.ids : [] } }) };
    const r = await prisma.notification.updateMany({ where, data: { read: true } });
    return { updated: r.count };
  });

  // Server-Sent Events: real-time alerts and live delivery tracking
  app.get('/api/v1/stream', { preHandler: authenticate, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx;
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'Access-Control-Allow-Origin': req.headers.origin ?? '*', 'X-Accel-Buffering': 'no' });
    raw.write(`retry: 5000\n\n`);
    const send = (event: string, data: any) => raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onNotify = (e: any) => { if (e.userId === ctx.userId) send('notification', e.row); };
    const onDelivery = (e: any) => { if (e.companyId === ctx.companyId) send('delivery', e); };
    bus.on('notify', onNotify); bus.on('delivery', onDelivery);
    const ping = setInterval(() => raw.write(`: ping\n\n`), 25000);
    send('ready', { at: new Date().toISOString() });
    req.raw.on('close', () => { clearInterval(ping); bus.off('notify', onNotify); bus.off('delivery', onDelivery); });
  });

  // ---------- global search (PLT-09) ----------
  app.get('/api/v1/search', { preHandler: authenticate, config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const q = String((req.query as any).q ?? '').trim();
    if (q.length < 2) return { data: [] };
    const n = normPN(q);
    const jobs: [string, string, string, any, (r: any) => { label: string; sub?: string }][] = [
      ['Customer', 'customer', 'name', { OR: [{ name: { contains: q, mode: 'insensitive' } }, { nameAr: { contains: q } }, { code: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }, { vatNumber: { contains: q } }] }, (r) => ({ label: r.name, sub: r.code })],
      ['Vehicle', 'vehicle', 'vin', { OR: [{ vin: { contains: q.toUpperCase() } }, { plate: { contains: q, mode: 'insensitive' } }] }, (r) => ({ label: r.vin, sub: `${r.make ?? ''} ${r.model ?? ''} ${r.plate ?? ''}`.trim() })],
      ['Part', 'part', 'partNumber', { OR: [{ partNumber: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { nameAr: { contains: q } }, ...(n ? [{ PartXref_partId: { some: { xrefNumber: { contains: q, mode: 'insensitive' } } } }] : [])] }, (r) => ({ label: `${r.partNumber} — ${r.name}`, sub: r.status })],
      ['Request', 'request', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number, sub: r.status })],
      ['Quotation', 'quotation', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number, sub: r.status })],
      ['SalesOrder', 'sales-order', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number, sub: r.status })],
      ['Invoice', 'invoice', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number ?? 'Draft', sub: r.status })],
      ['PurchaseOrder', 'purchase-order', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number, sub: r.status })],
      ['DeliveryNote', 'delivery-note', 'number', { number: { contains: q, mode: 'insensitive' } }, (r) => ({ label: r.number, sub: r.status })],
      ['Supplier', 'supplier', 'name', { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] }, (r) => ({ label: r.name, sub: r.code })],
    ];
    const out: any[] = [];
    await Promise.all(jobs.map(async ([key, slug, , where, fmt]) => {
      const res = BY_KEY[key];
      try { authorize(ctx, res, 'read'); } catch { return; }
      const rows = await delegateOf(prisma, key).findMany({ where: { AND: [scopeWhere(res, ctx), where] }, take: 5, orderBy: { updatedAt: 'desc' } });
      if (rows.length) out.push({ type: key, slug, label: res.en, items: rows.map((r: any) => ({ id: r.id, ...fmt(r) })) });
    }));
    return { data: out };
  });

  // ---------- attachments (PLT-08) ----------
  async function parentFor(ctx: Ctx, refType: string, refId: string) {
    const res = BY_KEY[refType];
    if (!res) throw bad('Unknown record type');
    authorize(ctx, res, 'read');
    const p = await delegateOf(prisma, refType).findFirst({ where: { id: refId, ...scopeWhere(res, ctx) }, select: { id: true } });
    if (!p) throw notFound(res.en);
    return res;
  }
  app.post('/api/v1/files', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx;
    const fields: Record<string, string> = {};
    let file: { name: string; mime: string; buf: Buffer } | null = null;
    for await (const part of req.parts()) {
      if (part.type === 'file') { const chunks: Buffer[] = []; for await (const c of part.file) chunks.push(c); if (part.file.truncated) throw new HttpError(413, 'too_large', 'File is larger than 15 MB'); file = { name: part.filename, mime: part.mimetype, buf: Buffer.concat(chunks) }; }
      else fields[part.fieldname] = String(part.value);
    }
    if (!file || !file.buf.length) throw bad('Choose a file to upload');
    if (!fields.refType || !fields.refId) throw bad('refType and refId are required');
    const res = await parentFor(ctx, fields.refType, fields.refId);
    if (ctx.kind !== 'staff' && !PORTAL_WRITE[ctx.kind][res.slug]) throw forbidden();
    const ext = extname(file.name).toLowerCase();
    if (!ALLOWED.has(ext)) throw bad(`File type ${ext || '(none)'} is not allowed. Allowed: ${[...ALLOWED].join(', ')}`);
    if (MAGIC[ext] && !MAGIC[ext](file.buf)) throw bad('The file content does not match its extension');
    if (file.buf.includes(Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR'))) throw bad('The file was rejected by the malware scan');
    const key = `${ctx.companyId}/${randomUUID()}${ext}`;
    await mkdir(join(UPLOAD_DIR, ctx.companyId), { recursive: true });
    await writeFile(join(UPLOAD_DIR, key), file.buf);
    const row = await prisma.attachment.create({ data: { companyId: ctx.companyId, refType: fields.refType, refId: fields.refId, fileName: file.name.slice(0, 200), mimeType: file.mime, size: file.buf.length, storageKey: key, kind: (fields.kind as any) ?? 'document', uploadedById: ctx.userId, scanStatus: 'clean' } });
    await audit(prisma, ctx, 'Attachment', row.id, 'create', undefined, { fileName: row.fileName, refType: row.refType });
    reply.code(201);
    return { data: { id: row.id, fileName: row.fileName, size: row.size, mimeType: row.mimeType, kind: row.kind } };
  });
  app.get('/api/v1/files/by-ref/:refType/:refId', { preHandler: authenticate }, async (req: any) => {
    await parentFor(req.ctx, req.params.refType, req.params.refId);
    const rows = await prisma.attachment.findMany({ where: { companyId: req.ctx.companyId, refType: req.params.refType, refId: req.params.refId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, fileName: true, size: true, mimeType: true, kind: true, createdAt: true, uploadedById: true } });
    return { data: rows };
  });
  app.get('/api/v1/files/:id', { preHandler: authenticate }, async (req: any, reply) => {
    const a = await prisma.attachment.findFirst({ where: { id: req.params.id, companyId: req.ctx.companyId } });
    if (!a) throw notFound('File');
    await parentFor(req.ctx, a.refType, a.refId);
    const buf = await readFile(join(UPLOAD_DIR, a.storageKey!)).catch(() => { throw notFound('File'); });
    reply.header('Content-Type', a.mimeType ?? 'application/octet-stream').header('Content-Disposition', `${/^image|pdf/.test(a.mimeType ?? '') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.fileName)}`).header('X-Content-Type-Options', 'nosniff');
    return reply.send(buf);
  });
  app.delete('/api/v1/files/:id', { preHandler: authenticate }, async (req: any) => {
    const a = await prisma.attachment.findFirst({ where: { id: req.params.id, companyId: req.ctx.companyId } });
    if (!a) throw notFound('File');
    const res = await parentFor(req.ctx, a.refType, a.refId);
    if (req.ctx.kind === 'staff') authorize(req.ctx, res, 'update'); else if (a.uploadedById !== req.ctx.userId) throw forbidden();
    await prisma.attachment.delete({ where: { id: a.id } });
    await rm(join(UPLOAD_DIR, a.storageKey!), { force: true });
    await audit(prisma, req.ctx, 'Attachment', a.id, 'delete', { fileName: a.fileName });
    return { ok: true };
  });

  // ---------- users with password (PLT-01) ----------
  app.post('/api/v1/users', { preHandler: authenticate }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx; authorize(ctx, BY_KEY.User, 'create');
    const { password, ...rest } = req.body ?? {};
    const temp = password ?? randomBytes(7).toString('base64url');
    if (String(temp).length < 10) throw bad('Password must be at least 10 characters');
    const row = await prisma.$transaction((tx) => createRow(tx, ctx, BY_KEY.User, { ...rest, kind: rest.kind ?? 'staff' }, { trusted: false }).then(async (u) => tx.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(String(temp), 10) } })));
    reply.code(201);
    return { data: { id: row.id, email: row.email }, tempPassword: password ? undefined : temp };
  });
  app.post('/api/v1/users/:id/password', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; authorize(ctx, BY_KEY.User, 'update');
    const u = await prisma.user.findFirst({ where: { id: req.params.id, companyId: ctx.companyId } });
    if (!u) throw notFound('User');
    const temp = req.body?.password ?? randomBytes(7).toString('base64url');
    if (String(temp).length < 10) throw bad('Password must be at least 10 characters');
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await bcrypt.hash(String(temp), 10), failedLogins: 0, lockedUntil: null } });
    await audit(prisma, ctx, 'User', u.id, 'update', undefined, { passwordReset: true });
    return { ok: true, tempPassword: req.body?.password ? undefined : temp };
  });

  // ---------- settings bulk (PLT-10) ----------
  app.put('/api/v1/settings/bulk', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; authorize(ctx, BY_KEY.Setting, 'update');
    const entries = Object.entries((req.body?.settings ?? {}) as Record<string, any>);
    if (!entries.length) throw bad('Nothing to save');
    await prisma.$transaction(async (tx) => {
      for (const [key, v] of entries) {
        const ex = await tx.setting.findFirst({ where: { companyId: ctx.companyId, key } });
        if (ex) { await tx.setting.update({ where: { id: ex.id }, data: { value: { v }, version: { increment: 1 } } }); await audit(tx, ctx, 'Setting', ex.id, 'update', ex.value, { v }); }
        else { const s = await tx.setting.create({ data: { companyId: ctx.companyId, key, value: { v } } }); await audit(tx, ctx, 'Setting', s.id, 'create', undefined, { v }); }
      }
    });
    clearSettingCache();
    return { ok: true, saved: entries.length };
  });

  // ---------- system / integrations overview ----------
  app.get('/api/v1/system/integrations', { preHandler: authenticate }, async (req: any) => {
    const ctx: Ctx = req.ctx; authorize(ctx, BY_KEY.IntegrationMessage, 'read');
    const since = new Date(Date.now() - 7 * 86400000);
    const rows: any[] = await prisma.$queryRawUnsafe(`SELECT provider, status, COUNT(*)::int n, MAX("createdAt") last FROM integration_message WHERE "companyId"=$1 AND "createdAt" > $2 GROUP BY provider, status`, ctx.companyId, since);
    const byProvider: Record<string, any> = {};
    for (const r of rows) { const p = (byProvider[r.provider] ??= { provider: r.provider, ok: 0, error: 0, retry: 0, dead: 0, last: null }); p[r.status] = r.n; if (!p.last || r.last > p.last) p.last = r.last; }
    const live = { whatsapp: !!process.env.WHATSAPP_API_URL, sms: !!process.env.SMS_API_URL, email: !!process.env.EMAIL_API_URL, daftra: !!process.env.DAFTRA_API_URL, llm: !!(process.env.LLM_BASE_URL && process.env.LLM_API_KEY), payment: !!process.env.PAYMENT_GATEWAY_URL, vin: !!process.env.VIN_PROVIDER_URL };
    const dead = await prisma.outboxEvent.count({ where: { companyId: ctx.companyId, status: 'failed' } });
    const pending = await prisma.outboxEvent.count({ where: { companyId: ctx.companyId, status: 'pending' } });
    return { providers: Object.values(byProvider), live, outbox: { pending, failed: dead } };
  });

  // ---------- bulk import (PLT-11) ----------
  const IMPORTABLE = new Set(['customer', 'supplier', 'part', 'vehicle', 'brand', 'category', 'uom', 'price-rule', 'customer-contact', 'part-xref', 'part-vehicle-fit', 'opening-balances']);
  app.get('/api/v1/imports/template/:slug', { preHandler: authenticate }, async (req: any, reply) => {
    const slug = req.params.slug;
    if (!IMPORTABLE.has(slug)) throw notFound('Import target');
    const cols = slug === 'opening-balances' ? ['accountCode', 'debit', 'credit'] : BY_SLUG[slug].fields.filter((f) => !f.readonly && !f.hidden && f.type !== 'json').map((f) => f.name);
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${slug}-template.csv"`);
    return reply.send('﻿' + cols.join(',') + '\n');
  });
  app.post('/api/v1/imports/:slug', { preHandler: authenticate, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req: any) => {
    const ctx: Ctx = req.ctx;
    const slug = req.params.slug;
    if (ctx.kind !== 'staff') throw forbidden();
    if (!IMPORTABLE.has(slug)) throw notFound('Import target');
    const dryRun = (req.query as any).dryRun === '1';
    let buf: Buffer | null = null, filename = 'upload';
    for await (const part of req.parts()) if (part.type === 'file') { filename = part.filename; buf = Buffer.concat(await (async () => { const c: Buffer[] = []; for await (const x of part.file) c.push(x); return c; })()); }
    if (!buf) throw bad('Choose a CSV or Excel file');
    let rows: Record<string, any>[] = [];
    if (/\.xlsx?$/i.test(filename)) {
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf as any);
      const ws = wb.worksheets[0]; const hdr = (ws.getRow(1).values as any[]).slice(1).map((h) => String(h ?? '').trim());
      ws.eachRow((row, i) => { if (i === 1) return; const o: any = {}; (row.values as any[]).slice(1).forEach((v, j) => { o[hdr[j]] = v && typeof v === 'object' && 'text' in v ? v.text : v && typeof v === 'object' && 'result' in v ? v.result : v; }); rows.push(o); });
    } else rows = Papa.parse<Record<string, any>>(buf.toString('utf8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() }).data;
    if (rows.length > 5000) throw bad('Import is limited to 5,000 rows per file');
    if (!rows.length) throw bad('The file has no data rows');
    authorize(ctx, slug === 'opening-balances' ? BY_KEY.JournalEntry : BY_SLUG[slug], 'create');

    const errors: { row: number; message: string }[] = [];
    let created = 0;
    const run = async (tx: any) => {
      if (slug === 'opening-balances') {
        const accs = await tx.account.findMany({ where: { companyId: ctx.companyId } });
        const lines: any[] = []; let i = 1;
        for (const r of rows) { i++; const a = accs.find((x: any) => x.code === String(r.accountCode).trim()); const d = Number(r.debit || 0), c = Number(r.credit || 0); if (!a) { errors.push({ row: i, message: `Unknown account ${r.accountCode}` }); continue; } if ((d > 0) === (c > 0)) { errors.push({ row: i, message: 'Enter either a debit or a credit' }); continue; } lines.push({ accountId: a.id, debit: d, credit: c }); }
        const td = lines.reduce((s, l) => s + l.debit, 0), tc = lines.reduce((s, l) => s + l.credit, 0);
        if (Math.abs(td - tc) > 0.005) errors.push({ row: 0, message: `Opening balances do not balance: debit ${td.toFixed(2)} ≠ credit ${tc.toFixed(2)}` });
        if (!errors.length && !dryRun) { await createRow(tx, ctx, BY_KEY.JournalEntry, { entryDate: today(), memo: 'Opening balances (import)', sourceType: 'opening', children: { JournalLine: lines } }); created = lines.length; }
        else created = lines.length;
        return;
      }
      const res = BY_SLUG[slug];
      let i = 1;
      for (const raw of rows) {
        i++;
        try {
          const data: Record<string, any> = {};
          for (const f of res.fields) {
            let v = raw[f.name]; if (v === undefined || v === '') continue;
            if (f.type === 'ref') { const t = BY_KEY[f.ref!]; const found = await delegateOf(tx, t.key).findFirst({ where: { companyId: ctx.companyId, OR: [{ id: String(v) }, { [t.label]: String(v) }, ...(t.key === 'Part' ? [{ partNumber: String(v) }] : [])] } }); if (!found) throw bad(`${f.name}: "${v}" not found in ${t.enPlural}`); v = found.id; }
            else if (f.type === 'bool') v = /^(1|true|yes|y|نعم)$/i.test(String(v));
            else if (f.type === 'int') v = Number(v);
            else if (f.type === 'json') { try { v = JSON.parse(String(v)); } catch { v = String(v).split(/[;|]/).map((s) => s.trim()); } }
            else if (f.type === 'decimal') v = String(v);
            else if (f.type === 'date' || f.type === 'datetime') v = new Date(v).toISOString();
            data[f.name] = v;
          }
          await createRow(tx, ctx, res, data);
          created++;
        } catch (e: any) { errors.push({ row: i, message: e.details ? `${e.message}: ${JSON.stringify(e.details)}` : e.message }); }
      }
      if (errors.length || dryRun) throw new HttpError(422, 'import_rollback', 'rollback');
    };
    try { await prisma.$transaction(run, { timeout: 120000, maxWait: 10000 }); } catch (e: any) { if (!(e instanceof HttpError && e.code === 'import_rollback')) throw e; }
    const status = errors.length ? 'failed' : dryRun ? 'validated' : 'completed';
    await prisma.importJob.create({ data: { companyId: ctx.companyId, entity: slug, fileName: filename, status, total: rows.length, okRows: errors.length ? rows.length - errors.length : rows.length, failedRows: errors.length, errors: errors.slice(0, 200) as any, dryRun } });
    return { status, total: rows.length, created: errors.length || dryRun ? 0 : created, validRows: rows.length - errors.length, errors: errors.slice(0, 200), message: errors.length ? 'Nothing was imported. Fix the errors and upload again.' : dryRun ? 'Validation passed. Upload again without dry-run to import.' : `Imported ${created} row(s)` };
  });
  void signToken; void JWT_SECRET; void loadCtx; void jwt; void conflict; void nextNumber; void zodFor; void RESOURCES; void can;
}
