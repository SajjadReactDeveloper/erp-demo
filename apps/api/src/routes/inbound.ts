import type { FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { prisma } from '@erp/db';
import { HttpError } from '../core/base';
import { captureInbound } from '../services/inbound';

const eq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

/** Public webhooks (no login): WhatsApp Business Cloud API and a generic e-mail relay. Both are authenticated by a shared secret / HMAC. */
export function registerInboundRoutes(app: FastifyInstance) {
  app.register(async (scope) => {
    // keep the raw bytes: WhatsApp signs the exact body
    scope.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1024 * 1024 }, (_req, body, done) => { try { done(null, { raw: body as Buffer, json: JSON.parse((body as Buffer).toString('utf8') || '{}') }); } catch (e) { done(e as Error, undefined); } });
    const limit = { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } };
    const company = async () => { const c = await prisma.company.findFirst(); if (!c) throw new HttpError(503, 'not_ready', 'System is not configured'); return c.id; };

    // Meta verification handshake
    scope.get('/api/v1/public/whatsapp/webhook', limit, async (req: any, reply) => {
      const q = req.query ?? {}; const token = process.env.WHATSAPP_VERIFY_TOKEN;
      if (!token) throw new HttpError(501, 'not_configured', 'WhatsApp webhook is not configured');
      if (q['hub.mode'] === 'subscribe' && typeof q['hub.verify_token'] === 'string' && eq(q['hub.verify_token'], token)) return reply.type('text/plain').send(String(q['hub.challenge'] ?? ''));
      throw new HttpError(403, 'forbidden', 'Verification failed');
    });
    scope.post('/api/v1/public/whatsapp/webhook', limit, async (req: any) => {
      const secret = process.env.WHATSAPP_APP_SECRET; if (!secret) throw new HttpError(501, 'not_configured', 'WhatsApp webhook is not configured');
      const sig = String(req.headers['x-hub-signature-256'] ?? '').replace(/^sha256=/, '');
      if (!sig || !eq(sig, createHmac('sha256', secret).update(req.body.raw).digest('hex'))) throw new HttpError(401, 'bad_signature', 'Invalid signature');
      const cid = await company(); const results: any[] = [];
      for (const e of req.body.json.entry ?? []) for (const ch of e.changes ?? []) {
        const names: Record<string, string> = Object.fromEntries((ch.value?.contacts ?? []).map((c: any) => [c.wa_id, c.profile?.name]));
        for (const msg of ch.value?.messages ?? []) {
          const text = msg.type === 'text' ? msg.text?.body : msg.type === 'image' || msg.type === 'document' ? msg.image?.caption ?? msg.document?.caption : undefined;
          if (!text) continue; // voice notes / stickers etc. are not turned into requests
          try { results.push(await captureInbound(cid, { channel: 'whatsapp', from: String(msg.from), text: String(text), name: names[msg.from] })); } catch (err: any) { console.error('[inbound:whatsapp]', err.message); }
        }
      }
      return { ok: true, processed: results.length }; // always 200 so Meta does not retry
    });

    // E-mail relay (Postmark/SendGrid/Mailgun routes or an n8n/Zapier hop): POST JSON {from, subject, text} with header x-inbound-secret
    scope.post('/api/v1/public/inbound-email', limit, async (req: any) => {
      const secret = process.env.INBOUND_EMAIL_SECRET; if (!secret) throw new HttpError(501, 'not_configured', 'Inbound e-mail is not configured');
      if (!eq(String(req.headers['x-inbound-secret'] ?? ''), secret)) throw new HttpError(401, 'unauthorized', 'Invalid secret');
      const b = req.body?.json ?? {}; const from = String(b.from?.email ?? b.from ?? '').match(/[^\s<>"]+@[^\s<>"]+/)?.[0]; const text = String(b.text ?? b.TextBody ?? b.body ?? '').slice(0, 20000);
      if (!from || !text.trim()) throw new HttpError(400, 'bad_request', 'from and text are required');
      return captureInbound(await company(), { channel: 'email', from, text, subject: b.subject ? String(b.subject).slice(0, 200) : undefined });
    });
  });
}
