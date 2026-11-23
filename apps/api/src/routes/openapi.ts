import type { FastifyInstance } from 'fastify';
import { RESOURCES } from '@erp/shared';

const T: Record<string, any> = { string: { type: 'string' }, text: { type: 'string' }, int: { type: 'integer' }, decimal: { type: 'string', example: '0.0000' }, bool: { type: 'boolean' }, date: { type: 'string', format: 'date' }, datetime: { type: 'string', format: 'date-time' }, json: {}, ref: { type: 'string', format: 'uuid' } };

export function buildOpenApi() {
  const schemas: Record<string, any> = {};
  const paths: Record<string, any> = {};
  const list = { parameters: [{ name: 'page', in: 'query', schema: { type: 'integer', default: 1 } }, { name: 'limit', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } }, { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Text search' }, { name: 'sort', in: 'query', schema: { type: 'string', example: 'createdAt:desc' } }] };
  for (const r of RESOURCES) {
    schemas[r.key] = { type: 'object', properties: Object.fromEntries([['id', { type: 'string', format: 'uuid' }], ...r.fields.map((f) => [f.name, f.type === 'enum' ? { type: 'string', enum: f.values } : T[f.type]])]), required: r.fields.filter((f) => f.required && !f.readonly).map((f) => f.name) };
    const tag = [r.mod];
    const sec = [{ bearer: [] }];
    paths[`/api/v1/r/${r.slug}`] = {
      get: { tags: tag, summary: `List ${r.enPlural}`, security: sec, ...list, responses: { 200: { description: 'Paginated list' } } },
      ...(r.immutable || r.sys ? {} : { post: { tags: tag, summary: `Create ${r.en}`, security: sec, requestBody: { content: { 'application/json': { schema: { $ref: `#/components/schemas/${r.key}` } } } }, responses: { 201: { description: 'Created' }, 400: { description: 'Validation failed' }, 403: { description: 'Forbidden' } } } }),
    };
    paths[`/api/v1/r/${r.slug}/{id}`] = {
      parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
      get: { tags: tag, summary: `Get ${r.en} with lines`, security: sec, responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } } },
      ...(r.immutable || r.sys ? {} : { patch: { tags: tag, summary: `Update ${r.en}`, security: sec, responses: { 200: { description: 'OK' }, 409: { description: 'Version conflict / invalid state' } } }, delete: { tags: tag, summary: `Delete ${r.en}`, security: sec, responses: { 200: { description: 'OK' } } } }),
    };
    for (const a of r.actions) paths[`/api/v1/r/${r.slug}/{id}/actions/${a.key}`] = { post: { tags: tag, summary: a.en, security: sec, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }], description: a.from ? `Allowed from status: ${a.from.join(', ')}${a.to ? ` → ${a.to}` : ''}` : undefined, responses: { 200: { description: 'OK' }, 409: { description: 'Invalid state' } } } };
  }
  for (const [p, s] of [['/api/v1/auth/login', 'Sign in (rate limited: 10/min)'], ['/api/v1/auth/me', 'Current user'], ['/api/v1/search', 'Global search'], ['/api/v1/files', 'Upload attachment (multipart)'], ['/api/v1/sync/push', 'Mobile offline sync: push events (idempotent)'], ['/api/v1/sync/pull', 'Mobile sync: pull work set'], ['/api/v1/ai/assistant', 'Business assistant'], ['/api/v1/dashboards/executive', 'Executive dashboard']] as const) paths[p] = { post: { summary: s, tags: ['core'] } };
  return { openapi: '3.0.3', info: { title: 'AutocQuick ERP API', version: '1.0.0', description: 'REST API. All endpoints are paginated (limit ≤ 100), rate limited and require a Bearer JWT except /auth and /public.' }, servers: [{ url: '/' }], components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, schemas }, paths };
}

export function registerOpenApi(app: FastifyInstance) {
  let cache: any;
  app.get('/api/docs/openapi.json', async () => (cache ??= buildOpenApi()));
  app.get('/api/docs', async (_req, reply) => reply.header('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><html><head><meta charset="utf-8"><title>AutocQuick ERP API</title><meta name="robots" content="noindex"><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui.css" integrity="sha384-wxLW6kwyHktdDGr6Pv1zgm/VGJh99lfUbzSn6HNHBENZlCN7W602k9VkGdxuFvPn" crossorigin="anonymous"></head><body><div id="ui"></div><script src="https://unpkg.com/swagger-ui-dist@5.17.14/swagger-ui-bundle.js" integrity="sha384-wmyclcVGX/WhUkdkATwhaK1X1JtiNrr2EoYJ+diV3vj4v6OC5yCeSu+yW13SYJep" crossorigin="anonymous"></script><script>SwaggerUIBundle({url:'/api/docs/openapi.json',dom_id:'#ui',deepLinking:true})</script></body></html>`));
}
