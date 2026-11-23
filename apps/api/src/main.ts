import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';
import { prisma } from '@erp/db';
import { HttpError } from './core/base';
import { registerCrud } from './core/crud';
import { registerAuth } from './routes/auth';
import { registerRoutes } from './routes/index';
import './domain/index';
import { startWorker } from './worker';

const PORT = Number(process.env.API_PORT ?? 4000);
const origins = (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim());

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization'] },
  bodyLimit: 2 * 1024 * 1024,
  genReqId: () => crypto.randomUUID(),
  trustProxy: true,
});

await app.register(helmet, { contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } });
await app.register(cors, {
  origin: (origin, cb) => cb(null, !origin || origins.includes(origin) || origins.includes('*')),
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'Accept-Language'],
  exposedHeaders: ['X-Request-Id', 'X-RateLimit-Remaining', 'Retry-After'],
  maxAge: 600,
});
await app.register(rateLimit, {
  global: true,
  max: Number(process.env.RATE_LIMIT_MAX ?? 600),
  timeWindow: '1 minute',
  keyGenerator: (req) => `ip:${req.ip}`, // never key on client-supplied header content: it would let an attacker rotate the key and dodge login/MFA limits
  errorResponseBuilder: (_req, ctx) => ({ statusCode: 429, error: { code: 'rate_limited', message: `Too many requests. Try again in ${Math.ceil(ctx.ttl / 1000)}s.` } }),
});
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 10 } });

// request id on every response
app.addHook('onSend', async (req, reply) => {
  reply.header('X-Request-Id', req.id);
});

// idempotency for unsafe requests (mobile / portal / webhook retries)
const idem = new Map<string, { at: number; status: number; body: any }>();
app.addHook('preHandler', async (req, reply) => {
  const key = req.headers['idempotency-key'];
  if (req.method !== 'POST' || typeof key !== 'string') return;
  const k = `${req.headers.authorization?.slice(-16) ?? req.ip}:${req.url}:${key}`;
  const hit = idem.get(k);
  if (hit && Date.now() - hit.at < 24 * 3600000) return reply.code(hit.status).header('Idempotent-Replay', 'true').send(hit.body);
  (req as any).idemKey = k;
});
app.addHook('onSend', async (req, reply, payload) => {
  const k = (req as any).idemKey;
  if (k && reply.statusCode < 500) {
    try { idem.set(k, { at: Date.now(), status: reply.statusCode, body: JSON.parse(String(payload)) }); } catch { /* non-json */ }
    if (idem.size > 5000) for (const [kk, v] of idem) if (Date.now() - v.at > 3600000) idem.delete(kk);
  }
  return payload;
});

app.setErrorHandler((err: any, req, reply) => {
  const send = (status: number, code: string, message: string, details?: any) => reply.code(status).send({ error: { code, message, details, requestId: req.id } });
  if (err instanceof HttpError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return send(400, 'validation_failed', 'Validation failed', err.flatten().fieldErrors);
  if (err.statusCode === 429) return reply.code(429).send(err);
  if (err.code === 'P2002') return send(409, 'duplicate', `A record with the same ${(err.meta?.target as string[])?.join(', ') ?? 'value'} already exists`, err.meta);
  if (err.code === 'P2003') return send(409, 'in_use', 'This record is linked to other records and cannot be changed this way', err.meta);
  if (err.code === 'P2025') return send(404, 'not_found', 'Record not found');
  const m = /ERROR:\s*(.+)/.exec(err.message ?? '');
  if (err.name?.startsWith('PrismaClient') && m && /immutable|append-only|not balanced|closed period|cannot be deleted|overlap|conflicting key/i.test(err.message)) return send(409, 'rule_violation', m[1].split('\n')[0]);
  if (err.validation || err.statusCode === 400) return send(400, 'bad_request', err.message);
  if (err.statusCode === 413) return send(413, 'too_large', 'Payload too large');
  req.log.error({ err }, 'unhandled');
  return send(500, 'internal_error', 'Something went wrong on our side. Please try again.');
});
app.setNotFoundHandler((req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Route not found' } }));

app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', time: new Date().toISOString() };
});

registerAuth(app);
registerCrud(app);
await registerRoutes(app);

await app.listen({ port: PORT, host: '0.0.0.0' });
if (process.env.DISABLE_WORKER !== '1') startWorker();
app.log.info(`API ready on :${PORT}`);

const shutdown = async () => { await app.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
