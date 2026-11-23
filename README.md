# AutocQuick Unified ERP

Custom ERP for automotive spare-parts trading (drop-shipping, ~90% credit sales, ZATCA e-invoicing). Docs: `docs/PRD.md` (131 features), `docs/TECH_SPEC.md`, `docs/BUILD_GUIDE.md` (conventions), `docs/FEATURE_COVERAGE.md` (every PRD feature → where it is built).

**Status:** all 131 features are built; the build phase is complete. Testing (incl. live-browser pass) and the UI/UX polish pass are the next phases. Only a typecheck and one golden-path smoke (`scripts/smoke.mjs`) have been run.

## Run it (Windows, Docker Desktop, Node 20+, pnpm)
```powershell
docker compose up -d db          # Postgres on :5433
pnpm install
pnpm gen                          # registry -> Prisma schema
pnpm db:push                      # create tables + triggers
pnpm db:seed                      # demo data
pnpm api                          # API on http://localhost:4010  (docs: /api/docs)
pnpm web                          # Web on http://localhost:3010
node scripts/smoke.mjs            # request -> cash golden path (needs the API running)
```
Logins (password `Passw0rd!2026`): `gm@` `sales@` `purchasing@` `finance@` `warehouse@` `driver@` `collector@` `cashier@` `tech@` `admin@autocquick.test`; customer portal `customer@alnoor.test`; supplier portal `supplier@riyadhparts.test` (also `supplier2@gulfbrakes.test`, `supplier3@alfursan.test`).
Surfaces: staff `/app`, customer portal `/portal`, supplier portal `/supplier`, warehouse/driver PWA `/m`, public `/`, `/login`, `/register`, `/vendor`.

## Architecture in one paragraph
`packages/shared` holds one **resource registry** (136 resources: fields, refs, lines, status actions, PRD feature ids, Arabic/English labels). From it we generate the Prisma schema, the generic REST CRUD (`/api/v1/r/:slug`, pagination ≤100, search, filters, export, history, actions), and the generic list/detail/form screens with skeleton/empty/error/success states. Hand-written code covers the real workflows (`apps/api/src/domain`, `services`, `routes`) and the bespoke screens (`apps/web`).

## Deviations from TECH_SPEC (chosen for speed; revisit when hardening)
Fastify instead of NestJS · no Redis/BullMQ (outbox table + in-process worker) · AI logic in the API behind adapters instead of a Python service · warehouse/driver app is a PWA, not React Native · attachments on local disk · JWT in localStorage (move to httpOnly cookie) · RLS policies not yet enabled (tenancy enforced in the API layer).

## Known limits (honest list)
ZATCA runs in **simulation** (real UBL/hash/QR/signature structures; live Fatoora needs onboarding credentials and SDK validation) · WhatsApp/SMS/e-mail/payment/VIN/LLM/Daftra use **fakes** until provider env vars are set · photo/scanned supplier quotations need OCR (not enabled) · assistant is intent-based (no free-form text-to-SQL) · Sunmi printer SDK needs a native shell (labels print via the browser) · inbound WhatsApp/e-mail request parsing is not built · many Arabic UI strings fall back to English.
