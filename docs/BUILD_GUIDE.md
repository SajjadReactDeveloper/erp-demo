# Build Guide (conventions for everyone working in this repo)

Stack as built: pnpm monorepo · Postgres (docker, port 5433) · Fastify + Prisma API (`apps/api`, port 4010) · Next.js web (`apps/web`, port 3000) · `@erp/shared` registry.
(Deviations from TECH_SPEC: Fastify instead of NestJS, no Redis/BullMQ — outbox + in-process worker, AI logic in the API with adapters instead of a separate Python service, the logistics app is a PWA at `/m`.)

Run: `docker compose up -d db` · `pnpm gen` (registry → Prisma schema) · `pnpm db:push` · `pnpm db:seed` · `pnpm api` · `pnpm web`.
Demo logins: password `Passw0rd!2026` for admin@ / gm@ / sales@ / purchasing@ / warehouse@ / driver@ / finance@ / collector@ / cashier@ / tech@ `autocquick.test`; portals `customer@alnoor.test`, `supplier@riyadhparts.test`.

## 1. One registry drives everything
`packages/shared/src/registry/*.ts` defines every resource (fields, refs, children, status actions, release, PRD feature ids).
Changing a field → edit the registry → `pnpm gen && pnpm db:push`. Never edit `schema.prisma` by hand.
Field spec: `name:type[=arg]flags` — types `s t i d b D T j e r`; flags `!` required, `*` list column, `?` searchable, `#` system-set (readonly in API), `~` hidden.
Generic API gives list/get/create/patch/delete/actions/export/options/history for every resource under `/api/v1/r/:slug` (pagination: `page`, `limit<=100`; search `q`; filters `f.field=a,b`, `f.field.gte=`; sort `sort=field:asc`).
Children (lines) are created/updated nested: `{ ...header, children: { QuotationLine: [ {...} ] } }`.

## 2. Writing domain logic (API)
Files under `apps/api/src/domain/*.ts` register behaviour at import time (imported from `domain/index.ts`):
```ts
import { H, A } from '../core/base';
H('QuotationLine', { beforeCreate: ({ctx, tx, data}) => {...}, afterCreate/afterUpdate/beforeDelete: ... });   // row hooks (inside the request transaction)
A('Quotation.send', async ({ ctx, tx, row, body }) => { ...; return { set: { sentAt: new Date() }, message: 'Sent' }; });   // status action
```
- Every action declared in the registry MUST have a handler unless it only changes status (`to`). Handler may return `{ set, status, skip, message, data }`.
- Always use the passed `tx`. Never call `prisma` for writes inside a handler. Create rows through `createRow(tx, ctx, BY_KEY.X, data, { trusted: true })` from `core/crud.ts` so numbering/audit/outbox/hooks run.
- Money: `D()` / `r2()` from `core/base` (Prisma.Decimal). Never JS floats for sums.
- Cross-cutting services: `services/posting.ts` (journal), `services/credit.ts`, `services/pricing.ts`, `services/zatca.ts`, `adapters/index.ts` (messaging, payment, courier, Daftra, LLM), `core/approvals.ts`, `core/base.ts` (notify, emit, settings, numbering, audit).
- Errors: throw `bad() / conflict() / forbidden() / notFound() / HttpError`. Messages are user-facing: short, plain, say what to do.
- Custom (non-CRUD) endpoints go in `apps/api/src/routes/*.ts` and are registered in `routes/index.ts`. Always `preHandler: authenticate`, check permissions with `authorize()`, scope by `ctx.companyId`, validate input with zod, paginate lists (`limit<=100`), and set a route-specific `config.rateLimit` when the route is expensive or public.

## 3. Web conventions (`apps/web`)
- Arabic is the primary locale (RTL via logical CSS only: `ms-/me-/ps-/pe-/start/end`; never `left/right`). English fully supported. All text through the `t()` helper / registry labels (`labelAr/labelEn`).
- Every data screen must implement: **skeleton loading**, **empty state** (with a primary action), **error state** (retry), **success toast**, pagination, debounced search, disabled+spinner on submit, optimistic invalidation. Components live in `apps/web/src/components/ui`.
- Generic screens: `/app/[slug]` (list), `/app/[slug]/[id]` (detail with lines, actions, history, attachments), `/app/[slug]/new`. Bespoke pages only where workflow demands (quotation builder, comparison matrix, dashboards, credit workbench, receiving, POS, portals).
- SEO: every public page has `metadata` (title/description/OG), semantic headings, `robots` (app is `noindex`; public landing/register pages indexable), sitemap.xml, robots.txt, canonical URLs.

## 4. Quality rules for this phase
No per-feature testing during the build (decision of the product owner); correctness-by-construction and typecheck only. A full test + live-browser pass and the UI/UX polish pass come afterwards.
