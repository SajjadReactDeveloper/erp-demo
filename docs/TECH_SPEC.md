# Technical Specification — AutocQuick Unified ERP

Companion to `PRD.md`. Feature IDs (e.g. `SAL-04`) are the same in both documents and are the unit of planning, testing and acceptance.

---

## 1. Architecture overview

**Modular monolith, services-ready.** One NestJS application with strict module boundaries and one PostgreSQL database; separate deployables only where the runtime differs (AI service in Python, mobile app, web app).

```
 Channels            ERP Web (Next.js)   Customer Portal   Supplier Portal   Sunmi/Android (RN)   Customer app (R2)   POS (R3)
                              \                |                 |                  |                  /               /
 Edge                  WAF / TLS / rate-limit  ->  API gateway (NestJS, REST + OpenAPI, webhooks in)
 Application (one NestJS app, modules below, one DB transaction boundary per command)
   platform | masterdata | crm | sales | procurement | supplierportal | logistics | finance | credit | reporting | notify | inventory* | pos* | workshop* | vehicle*
                                      |                                         |
                                 domain events -> transactional outbox -> BullMQ workers
 AI service (FastAPI)  <- internal HTTP, service token, user-context JWT      Integration hub (inside NestJS, adapters + retries + message log)
 Data: PostgreSQL 16 (+pgvector, pg_trgm)  | Redis 7 | S3-compatible object storage | reporting schema (materialised views)
 External: ZATCA, Daftra, WhatsApp BSP, SMS, SMTP, payment gateway, VIN/parts provider, Google Maps, couriers, LLM API
```
`*` = R2/R3 modules; their tables, permissions and event contracts are created in R1 so they are additive.

### Module boundary rules
- A module owns its tables and exposes (a) a service interface and (b) domain events. **No cross-module table access**; cross-module reads go through the interface or reporting views. Enforced by ESLint `no-restricted-imports` + dependency-cruiser in CI.
- All writes are **commands** (`CreateQuotation`, `ConfirmSalesOrder`, …) that run in one DB transaction, write an audit record, and append events to the **outbox** in the same transaction.
- Side effects (notifications, ZATCA submission, Daftra sync, AI jobs, webhooks out) run only from outbox consumers, never inline in a request.

## 2. Repository layout (pnpm + Turborepo monorepo)

```
/apps
  /api            NestJS (modules/*, common/*, main.ts)
  /web            Next.js 14+ App Router: (erp) (customer) (supplier) route groups, shared UI
  /mobile         React Native (Android first; iOS for customer app R2)
  /worker         BullMQ consumers (same codebase image as api, different entrypoint)
/services
  /ai             FastAPI (vin, quote-extract, assistant, forecast)
/packages
  /db             Prisma schema, migrations, raw SQL (RLS, triggers, views), seed
  /shared         zod schemas (single source of truth for DTOs), types, money/decimal utils, permission catalogue, i18n catalogues (ar/en)
  /ui             shadcn/ui components, RTL-aware tables, charts wrapper (ECharts)
  /zatca          UBL builder, signer, QR, hash chain, API client (isolated, heavily tested)
  /testkit        factories, golden datasets, fake providers, traceability reporter
/infra            terraform, docker, helm/compose, k6, zap
/docs             PRD.md, TECH_SPEC.md, ADRs, runbooks, API docs (generated)
```
Trunk-based development, short-lived branches, PR checks (§13), conventional commits, ADRs in `/docs/adr` for each decision in §3.

## 3. Technology decisions

| Concern | Choice | Notes |
|---|---|---|
| Web | Next.js + React 18 + TypeScript + Tailwind + shadcn/ui + TanStack Table/Query + ECharts | RTL via logical CSS properties (`ms-*`, `ps-*`) only; i18next; Hijri via `Intl` islamic-umalqura calendar |
| Backend | Node.js 20 LTS, NestJS, TypeScript strict | zod DTO validation shared with front end |
| ORM | Prisma + hand-written SQL migrations for RLS, triggers, partial indexes, views | One `public` schema, module-prefixed table names (avoids multiSchema friction) |
| DB | PostgreSQL 16, `pgvector`, `pg_trgm`, `btree_gist`, `uuid-ossp`/UUIDv7 | managed, standby replica, PITR |
| Queue/cache | Redis 7, BullMQ | queues per concern (§11) |
| Files | S3-compatible, private, presigned URLs, ClamAV scan on upload | |
| Mobile | React Native + WatermelonDB (SQLite) + Sunmi native modules; `react-native-vision-camera` fallback scanner | |
| AI | Python 3.12, FastAPI, enterprise LLM API behind one gateway; Tesseract (ara+eng); pgvector | provider is swappable |
| Identity | Keycloak (OIDC) realms: `staff`, `customers`, `suppliers`; Microsoft/Google as IdPs for staff | MFA via TOTP/WebAuthn |
| Observability | OpenTelemetry → Prometheus/Grafana/Loki/Tempo; Sentry | correlation id = `x-request-id` = business `request_id` where applicable |
| IaC/CI | Terraform; GitHub Actions; Docker | |
| Tests | Vitest/Jest, Supertest, Testcontainers, Playwright, Maestro/Detox, k6, Stryker, fast-check, OWASP ZAP, Trivy | §14 |

Time zone: store UTC; display `Asia/Riyadh`. Money: `NUMERIC(18,4)`, computed with decimal.js (never JS floats); rounding half-up at line level then summed, matching ZATCA rounding rules.

## 4. Data model

### 4.1 Conventions (every table)
`id uuid pk (v7)`, `company_id uuid not null`, `branch_id uuid null`, `created_at/by`, `updated_at/by`, `version int` (optimistic lock), `deleted_at` only for non-financial master data. Financial/operational documents are **never deleted** — they get a status.
- **Row-level security**: `ALTER TABLE … ENABLE RLS; POLICY company_isolation USING (company_id = current_setting('app.company_id')::uuid)`. The API sets `app.company_id`, `app.user_id`, `app.role` per transaction (`SET LOCAL`). Portal users additionally get customer/supplier scoping policies (`customer_id = current_setting('app.customer_id')`).
- `request_id uuid` on every operational document (BR-1), indexed.
- Status columns are Postgres enums with a CHECK-enforced transition table (§5).
- Gapless document numbers via `doc_sequence(company_id, branch_id, doc_type, year, next_no)` updated with `SELECT … FOR UPDATE` inside the posting transaction (PLT-05).

### 4.2 Core entities (table list by module)
- **platform**: `company, branch, warehouse, cost_center, user, role, permission, role_permission, user_role, setting (key, scope, jsonb, version), doc_sequence, template, approval_rule, approval_request, approval_step, attachment, audit_log, notification, notification_rule, outbox, integration_message, import_job`
- **masterdata**: `part, part_xref, part_image, part_vehicle_fit, brand, category, uom, uom_conversion, vehicle, customer, customer_contact, customer_address, supplier, supplier_contact, supplier_brand_category, supplier_document, price_rule, price_history`
- **crm**: `customer_type, activity, task, sales_target, lost_reason, loyalty_account, loyalty_txn, voucher` (R3)
- **sales**: `request, request_line, quotation, quotation_line, quotation_alt, sales_order, sales_order_line, return_auth, return_line, credit_note` (header in finance, lines in sales)
- **procurement**: `rfq, rfq_supplier, rfq_line, supplier_quote, supplier_quote_line, award, award_line, purchase_order, po_line, goods_receipt, gr_line, supplier_bill, supplier_bill_line, three_way_match, supplier_claim, supplier_score`
- **supplierportal** (R2): `vendor_application, supplier_catalogue_item, availability_feed, catalogue_match`
- **logistics**: `delivery_note, delivery_line, delivery_event, proof_of_delivery, driver, route, shipment (courier, R2), transfer (R3), scan_event, device`
- **finance**: `account, journal_entry, journal_line, fiscal_period, invoice, invoice_line, receipt, receipt_allocation, payment, payment_allocation, bank_account, bank_statement, bank_statement_line, cheque, expense, budget, tax_code, zatca_credential, zatca_submission, daftra_sync_log`
- **credit**: `credit_profile, credit_hold, exposure_snapshot, promise_to_pay, collection_activity, reminder_schedule, credit_alert`
- **inventory/pos/workshop/vehicle** (R2/R3): `stock_bin, stock_movement, stock_count, reorder_rule, batch, serial, pos_terminal, pos_shift, pos_sale, tyre_spec, battery_unit, warranty, service_booking, job_card, job_card_line, bay, technician_time, vehicle_service_interval, vehicle_reminder`

### 4.3 The "enter once" backbone

`request_line` is the single root for a part need. Downstream rows **reference** it and never copy part identity:

```sql
CREATE TABLE sales_request_line (
  id uuid PRIMARY KEY, company_id uuid NOT NULL, request_id uuid NOT NULL REFERENCES sales_request(id),
  line_no int NOT NULL, vehicle_id uuid REFERENCES md_vehicle(id),
  part_id uuid REFERENCES md_part(id),          -- set after AI/manual match, confirmed by user
  customer_text text, qty numeric(18,4) NOT NULL CHECK (qty > 0), uom_id uuid NOT NULL,
  match_confidence numeric(5,4), match_status text NOT NULL DEFAULT 'unmatched', -- unmatched|suggested|confirmed
  UNIQUE (request_id, line_no));

-- every downstream line carries request_line_id; part_id/qty/uom are read via join or snapshotted ONLY where legally required (invoice text)
CREATE TABLE sales_quotation_line (
  id uuid PRIMARY KEY, quotation_id uuid NOT NULL, request_line_id uuid NOT NULL REFERENCES sales_request_line(id),
  award_line_id uuid NOT NULL, part_id uuid NOT NULL, qty numeric(18,4) NOT NULL,
  unit_cost numeric(18,4) NOT NULL, unit_price numeric(18,4) NOT NULL,
  margin_pct numeric(9,6) GENERATED ALWAYS AS ((unit_price - unit_cost) / NULLIF(unit_price,0)) STORED,
  rule_id uuid, below_min boolean NOT NULL DEFAULT false, status text NOT NULL);
```
A **data-lineage report** (SQL view + test) proves BR-1: for every invoice line, the chain `invoice_line → delivery_line → so_line → quotation_line → award_line → supplier_quote_line → rfq_line → request_line` exists with no orphan.

### 4.4 Accounting core
```sql
CREATE TABLE fin_journal_entry (id uuid PK, company_id, branch_id, entry_no text, entry_date date, period_id uuid,
  source_type text NOT NULL, source_id uuid NOT NULL, request_id uuid, status text, -- posted|reversed
  reversal_of uuid, posted_by uuid, posted_at timestamptz, UNIQUE (company_id, entry_no));
CREATE TABLE fin_journal_line (id uuid PK, entry_id uuid NOT NULL, account_id uuid NOT NULL, cost_center_id uuid,
  partner_type text, partner_id uuid, debit numeric(18,4) NOT NULL DEFAULT 0, credit numeric(18,4) NOT NULL DEFAULT 0,
  CHECK (debit >= 0 AND credit >= 0 AND (debit = 0 OR credit = 0)));
-- integrity: deferred constraint trigger asserts SUM(debit)=SUM(credit) per entry at COMMIT
-- immutability: BEFORE UPDATE OR DELETE triggers on journal_entry/line/audit_log RAISE EXCEPTION; corrections = reversal entries
-- period lock: BEFORE INSERT trigger rejects postings into closed periods
```

## 5. State machines (enforced in domain layer + DB CHECK; each transition has a unit test)

| Entity | States → transitions |
|---|---|
| Request | `draft → submitted → in_sourcing → quoted → partially_approved / approved / lost / expired → ordered → closed`; `cancelled` from any pre-ordered state |
| RFQ | `draft → sent → collecting → closed → awarded` (`cancelled`) |
| Quotation | `draft → pending_margin_approval → approved_internal → sent → viewed → (approved_full / approved_partial / rejected / expired)` |
| Sales order | `draft → credit_check → on_hold → confirmed → partially_delivered → delivered → invoiced(partial/full) → closed` (`cancelled`) |
| Purchase order | `draft → pending_approval → approved → sent → confirmed → partially_received → received → billed → closed` |
| Delivery note | `planned → assigned → out_for_delivery → delivered / partially_delivered / failed → closed` |
| Invoice | `draft → pending_zatca → cleared/reported → (rejected → corrected → pending_zatca) → partially_paid → paid`; credit note reverses |
| Credit hold | `none → held (reason, doc refs) → released (approver, reason)` |
| Approval | `pending → approved / rejected / escalated / delegated / expired` |

## 6. Core algorithms (each is a pure, unit-tested function in the domain layer)

### 6.1 Margin and price (BR-3)
```
selectRule(ctx{tier, category, brand, supplier, urgency, date}, rules):
  candidates = rules where effective(date) and every non-null dimension equals ctx
  score(rule) = 16*[tier] + 8*[supplier] + 4*[brand] + 2*[category] + 1*[urgency]   // specificity
  return max by (score, effective_from desc)                                        // deterministic
price(cost, marginTarget) = round(cost / (1 - marginTarget), 2)
belowMin = (price - cost)/price < rule.min_margin
aboveCeiling = price > market_ceiling(part)  -> flag only
```
Property tests: price never below cost when margin ≥ 0; rounding stable; precedence total order.

### 6.2 Best-value score (BR-4)
Min-max normalise per line across quoting suppliers: `s = w_p*(1-normPrice) + w_l*(1-normLead) + w_r*normRating + w_w*normWarranty` (weights from settings, sum 1). Ties → lower price → shorter lead time. UI shows each component. Unavailable items are excluded, not scored.

### 6.3 Credit exposure and hold (BR-2)
```sql
exposure(customer) =
    COALESCE((SELECT SUM(balance) FROM fin_invoice WHERE customer_id=$1 AND status IN ('cleared','reported','partially_paid')),0)
  + COALESCE((SELECT SUM(undelivered_value) FROM sales_order_open_v WHERE customer_id=$1 AND status IN ('confirmed','partially_delivered')),0)
  + w * COALESCE((SELECT SUM(total) FROM sales_quotation WHERE customer_id=$1 AND status='approved_partial|approved_full' AND not ordered),0)
overdue(customer) = EXISTS invoice with due_date + grace_days < today AND balance > 0
check(customer, newAmount) -> allow | hold(reason: LIMIT|OVERDUE|NO_PROFILE)
```
Recomputed on events; cached in `credit_exposure_snapshot` with row lock on the customer during check to avoid race (two concurrent confirmations cannot both pass). Concurrency test: N parallel confirmations vs limit.

### 6.4 Three-way match (BR-6)
Per bill line: `qty_billed ≤ qty_received − qty_billed_before + tol_qty` and `|price_billed − price_po| ≤ tol_price` (% or abs, settings). Fail → `variance` record → approval; no GL posting until `matched` or approved.

### 6.5 Allocation and ageing
Receipt allocation: oldest-first default or explicit; remainder → unapplied cash; allocations are rows (`receipt_allocation`), never overwrite invoice balances (balance = invoice total − Σ allocations − Σ credit notes). Ageing buckets computed from `due_date` on open balance as of a date; **property test: Σ ageing = AR control account balance**.

### 6.6 Delivered-quantity invoicing (BR-5)
Invoice generated on `delivery_note` completion for `Σ delivered_qty × so_line price`; remaining qty stays on SO as back-order (SAL-08). Returns create credit notes against specific invoice lines with qty ≤ invoiced − credited.

### 6.7 Reminder schedule (CRD-07)
Rules: `offsets = [-3, 0, +3, +7, +14, +30]` days from due date (configurable) → channel + template + escalation target. Idempotent via `(invoice_id, offset)` unique key; cancelled when balance = 0.

## 7. Accounting postings and ZATCA

### 7.1 Posting rules (FIN-02) — drop-ship flow
| Event | Debit | Credit |
|---|---|---|
| Goods receipt (LOG-02) | Goods in transit (pass-through) | GRNI (goods received not invoiced) |
| Delivery confirmed / invoice issued | AR; COGS | Sales revenue; VAT output; Goods in transit |
| Supplier bill matched | GRNI; VAT input | AP |
| Customer receipt | Bank/Cash | AR |
| Supplier payment | AP | Bank/Cash |
| Customer credit note | Sales returns; VAT output | AR |
| Supplier debit note (claim) | AP | GRNI/COGS adjustment |
| Expense | Expense account; VAT input | AP/Cash |
R3: inventory valuation replaces "goods in transit" with Inventory at moving-average cost; POS/branch postings add branch dimension and inter-branch clearing accounts that eliminate on consolidation.

Posting rules are data (`posting_rule` table: event → account mapping by tax code/category) so finance can adjust without a deploy; each rule set has unit tests proving **debits = credits** for every event and tax scenario (standard, zero-rated, exempt, export).

### 7.2 ZATCA Phase 2 (package `@erp/zatca`, FIN-06 / POS-02)
Pipeline per invoice (executed by a dedicated queue worker; ICV/PIH assigned inside a serialised DB transaction):
1. Build **UBL 2.1** XML (invoice type code, subtype B2B `0100000`/B2C `0200000`, seller/buyer, lines, tax subtotals, `ICV` counter, `PIH` previous invoice hash, UUID).
2. Canonicalise (C14N 1.1), SHA-256 → invoice hash.
3. Sign with **XAdES-BES** using the CSID private key (ECDSA secp256k1) from the vault.
4. Generate **QR (TLV, base64)**: seller, VAT no., timestamp, total, VAT, hash, signature, public key, (+cert signature for simplified).
5. **B2B**: call *Clearance* API; use cleared XML returned by ZATCA as legal document; **B2C**: print/serve invoice immediately and call *Reporting* API within 24 h (queued, retried).
6. Persist request, response, status, warnings/errors in `fin_zatca_submission`; on `rejected` surface errors on the invoice, allow correction (new invoice/credit-debit note rules), resubmit.
7. Onboarding flow built into Settings: generate CSR/keys → compliance CSID → mandatory compliance invoice checks → production CSID; renewal reminders. Credentials per EGS unit (per branch/POS later).
8. CI validates every generated XML with the official **ZATCA SDK validator** against a corpus (standard, credit/debit note, zero-rated, discounts, prepayment, B2C, Arabic text, rounding edge cases). Sandbox E2E before every release.

### 7.3 Daftra transition (FIN-10)
`DaftraAdapter` (REST): **one-way** ERP→Daftra push of invoices, bills, receipts, payments, journals during the parallel run, keyed by idempotent external ids; reverse **import** only for opening balances/history. Migration: extract → cleanse → dry-run → reconcile (trial balance by account, AR/AP by partner, open items) → finance sign-off; **≥ 2 rehearsals**. Cut-over switch (`settings.finance.daftra_mode = push | readonly`) flipped once; after flip the adapter is disabled.

## 8. API design

- REST, JSON, `/api/v1/...`, OpenAPI generated from zod/Nest decorators; versioned; cursor pagination; `Idempotency-Key` required on every unsafe POST used by mobile/portal/webhooks; ETag/`If-Match` (using `version`) for optimistic locking.
- Errors: RFC 7807 problem+json with stable `code` strings (i18n keys), never leaking internals.
- Auth: OIDC bearer JWT; token carries `sub`, `company_id`, `roles`, `customer_id|supplier_id` (portals). Rate limiting per user/IP; stricter on portals and auth.
- Webhooks in (payment gateway, WhatsApp, ZATCA callbacks if any): signature verified, replay-protected, stored raw then processed from queue.
- Realtime: Server-Sent Events channel for in-app alerts and live tracking (CPT-04, LOG-10, NTF-03); falls back to polling.

### Endpoint map (resource → operations; all paths under `/api/v1`)
| Module | Resources |
|---|---|
| platform | `/users /roles /permissions /companies /branches /settings /approvals /approval-rules /attachments /search /imports /exports /audit /templates /notifications /notification-rules` |
| masterdata | `/parts /parts/{id}/xrefs /vehicles /customers /suppliers /price-rules /price-history /uoms` |
| crm | `/customers/{id}/360 /activities /tasks /targets /lost-reasons /onboarding-applications` |
| sales | `/requests /requests/{id}/lines /requests/{id}/match (AI) /quotations /quotations/{id}/send /quotations/{id}/approve /sales-orders /sales-orders/{id}/confirm /returns /discount-requests` |
| procurement | `/rfqs /rfqs/{id}/send /supplier-quotes /supplier-quotes/{id}/capture (AI) /comparisons/{rfqId} /awards /purchase-orders /goods-receipts /supplier-bills /matches /claims /supplier-scores` |
| logistics | `/deliveries /deliveries/{id}/assign /pod /receiving /scans /routes /labels /shipments (R2) /transfers (R3) /sync/push /sync/pull` |
| finance | `/accounts /journals /invoices /invoices/{id}/zatca /credit-notes /receipts /allocations /payments /bank-accounts /bank-statements /cheques /expenses /budgets /reports/{tb,pl,bs,cf} /vat /daftra/*` |
| credit | `/credit-profiles /exposure/{customerId} /holds /holds/{id}/release /ageing /statements /reminders /collections/worklist /promises /alerts` |
| reporting | `/dashboards/{executive,sales,profitability,expense,receivables,procurement,operations} /reports /report-schedules /history /assistant/ask` |
| portals | `/portal/customer/*` and `/portal/supplier/*` — thin facades over the same services with portal-scoped policies |
| R2/R3 | `/catalogue-items /availability-feeds /vendor-applications /vehicle-dashboard /forecasts` · `/stock /movements /counts /reorder /pos/* /shifts /tyres /batteries /bookings /job-cards` |

Every endpoint has: permission key, request/response schema, success + error tests, authz test (each role allowed/denied), audit behaviour documented.

## 9. Authentication, authorisation, tenancy

- **RBAC + attributes.** Permission keys `module.resource.action` (e.g. `sales.quotation.send`, `finance.invoice.post`). Roles are bundles; field-level rules in a `field_policy` table (hide/readonly per role: e.g. supplier cost hidden from some sales roles). Enforced in a Nest guard + response serializer; UI hides but the API is the authority.
- Approval-gated actions return `202 approval_required` with the approval id.
- **Tenancy:** single DB, RLS by `company_id` (multi-company ready); portal RLS by `customer_id`/`supplier_id`. Tests assert cross-tenant leakage is impossible by querying with every other tenant's context.
- Secrets in the cloud secret manager/vault; no secrets in env files in git; ZATCA private keys in KMS/HSM-backed secret.
- Audit: DB trigger writes `audit_log` (table, row id, op, old/new jsonb, user, request id, ip) for all non-ephemeral tables; append-only (revoke UPDATE/DELETE; trigger guard).

## 10. AI services (`/services/ai`)

Common: Python/FastAPI; internal-only; called with a service token + the end user's context (user id, role, company) for authorisation and audit; all prompts/outputs logged (PII-minimised) with prompt versions; LLM provider behind `LlmGateway` interface (retries, timeouts, token/cost metrics, provider fallback); data is not used for training.

### AI-1 VIN decode + part matching (`POST /vin/match`)
1. **VIN decode** — deterministic first: format validation (17 chars, no I/O/Q), WMI/VDS lookup, then `VinProvider` API (provider abstraction; client's choice). LLM is **not** used to invent vehicle facts.
2. **Candidate retrieval** — for each request line text/part number: normalise (Arabic/English, diacritics, number formats) → exact OEM/xref match → trigram + vector (pgvector embeddings of part name/xref text) restricted by `part_vehicle_fit` for the decoded vehicle.
3. **Re-rank/explain** — LLM re-ranks top-N with structured JSON output `{part_id, confidence, reason}`; hard rule: only `part_id`s from retrieval may be returned.
4. Response → `request_line.match_status = suggested` with confidence; user must confirm (SAL-02). Telemetry records accept/override for continuous evaluation.

### AI-2 Quotation capture (`POST /quotes/extract`)
File → type detect → **Excel/CSV**: deterministic parse with column mapping suggestions; **PDF**: text layer, else OCR (Tesseract ara+eng) at 300 dpi with deskew; **image/email body** likewise → LLM **structured extraction** to JSON schema `{lines:[{supplier_part_no, description, qty, uom, unit_price, currency, lead_time, availability, warranty}], totals}` → arithmetic validation (qty×price=line, totals reconcile) → map each line to the RFQ line/part via AI-1 retrieval → per-line confidence + issues → review screen where purchasing edits/confirms. Nothing enters `supplier_quote` until confirmed; original file is attached.

### AI-3 Business assistant (`POST /assistant/ask`)
**Never lets the LLM touch base tables.** Flow: question (AR/EN) → intent/entity resolution against a **semantic layer** (YAML metric/dimension catalogue over `sem_*` read-only views: e.g. `sem_sales`, `sem_receivables`, `sem_procurement`) → LLM produces a constrained query plan or SQL on `sem_*` only → **SQL validator** (parse with `pgsql-parser`; allow only SELECT on `sem_*`, no functions outside allow-list, forced `LIMIT`, statement timeout 5 s) → executed with a **read-only DB role and the user's RLS/field policies** (`SET LOCAL app.user_id…`) → result rendered as table/chart spec, plus the shown query and metric definitions. Refuses out-of-scope or write requests. Logged per user.

### AI-4 Forecasting (R2) / AI-5 Reorder suggestions (R3)
`scikit-learn`/statsmodels baselines (seasonal naive, ETS, gradient boosting on part/brand/segment features) trained from `sem_*` history; backtest with rolling origin; report MAPE/WAPE per segment; model registry + versioned artefacts; scheduled retrain; falls back to baseline when data is thin. AI-5: reorder point = demand forecast × lead time + safety stock (service-level z-score), user-accepted.

### 10.1 Evaluation and gates (see §14.4)
Golden datasets live in `/packages/testkit/golden/{vin,parts,quotes,assistant}` (client-provided real, anonymised samples + synthetic edge cases, AR and EN). A CI job runs them nightly and on prompt/model change; release is blocked if metrics fall below the PRD §6 thresholds.

## 11. Integration hub

Adapter interface `Provider<TReq,TRes>` per integration with: timeout, retry with exponential backoff + jitter, circuit breaker, idempotency key, raw request/response logging in `integration_message` (secrets redacted), dead-letter queue + alert, admin replay UI (PLT-10).

| Integration | Adapter | Queue | Notes |
|---|---|---|---|
| ZATCA | `@erp/zatca` | `zatca` (concurrency 1 per EGS for ICV order) | sandbox → simulation → production |
| Daftra | `DaftraAdapter` | `daftra` | one-way push, §7.3 |
| WhatsApp Business | BSP adapter (e.g. 360dialog/Twilio) | `notify` | pre-approved templates AR/EN; status webhooks; opt-out store |
| SMS / Email | local SMS gateway; SMTP/API | `notify` | OTP rate limits; bounce handling |
| Payment gateway | `PaymentGateway` (Moyasar default; HyperPay/Tap) | `payments` | hosted checkout, signed webhooks, idempotent receipt creation |
| VIN/parts | `VinProvider` | `catalogue` | cached |
| Maps | Google Maps | inline | geocode/route list |
| Bank statements | file import (MT940/CSV/CAMT) | `import` | bank API later |
| Couriers (R2) | `CourierProvider` SMSA/Aramex | `shipping` | label, tracking webhooks |
| POS hardware (R3) | device bridge | local | |

Providers have **fake implementations** (`@erp/testkit`) used in CI; contract tests run nightly against real sandboxes.

## 12. Mobile / offline design (Sunmi app, LOG-01…LOG-10)

- **Local-first.** WatermelonDB (SQLite): downloaded work set = assigned POs to receive, deliveries, parts/barcodes needed, customers' signatures requirements. `pull` by cursor (`/sync/pull?since=`), server wins for master data.
- **Append-only event log** for everything captured on device: `scan_event`, `receipt_line_event`, `discrepancy_event`, `pod_event` (signature PNG + stroke JSON, photo refs, GPS fix, device time + monotonic offset). Each event has a client UUID = idempotency key; `push` batches events in order; server applies idempotently and returns per-event result; failed events are surfaced for correction, never silently dropped.
- Media uploaded separately via resumable presigned uploads; event references media id; POD is "complete" server-side only when media arrives.
- **Conflicts:** receiving/delivery are physical facts so events are accepted and reconciled (e.g. PO cancelled meanwhile → discrepancy raised), not rejected.
- **Hardware:** scanner through Sunmi scan-service broadcast intent (camera fallback), printer through Sunmi printer service (ESC/POS + label templates), tested on real devices (V2/V2s/L2 class).
- Security: encrypted DB (SQLCipher), PIN/biometric unlock, remote revoke, token refresh offline-tolerant (24h grace), no sensitive data beyond the work set.
- Testing: device farm/emulators for flows; **chaos suite** — kill app mid-sync, airplane mode during signature, clock skew, duplicate push, large backlog — asserting exactly-once effect and zero data loss.

## 13. Infrastructure, environments, CI/CD

- **Cloud:** KSA region (default Oracle Cloud Riyadh/Jeddah or GCP Dammam; confirm Q10). Docker containers on managed container platform/Kubernetes; Terraform for everything.
- **Environments:** `dev` (shared, auto-deploy main), `staging` (UAT + ZATCA sandbox/simulation, production-like data volume, refreshed from anonymised data), `prod` (≥2 API replicas behind LB, managed PostgreSQL with standby + PITR, Redis, object storage, WAF, private networking, daily backups + weekly restore test).
- **Pipeline (every PR):** lint/format → typecheck → unit → integration (Testcontainers) → build → dependency audit/Trivy/SAST (Semgrep) → i18n key check → migration dry-run on production-size snapshot → preview deploy → E2E (Playwright, AR+EN projects) → traceability gate. **Merge to main:** deploy dev; **tag:** deploy staging → manual gate → prod with automated smoke tests and one-command rollback; DB migrations are expand/contract (backward-compatible).
- **Observability:** RED metrics per endpoint, queue depth/age per queue, ZATCA acceptance rate, AI latency/cost/accuracy, business SLIs (quotations/hour, hold count). Alerts to on-call; runbooks in `/docs/runbooks`.
- **Backups/DR:** PITR, tested restore quarterly, RTO < 4 h.
- **Security ops:** WAF, rate limits, secrets rotation, dependency bots, annual + pre-go-live pen-test, access reviews.

## 14. Test strategy — "fully tested" made concrete

### 14.1 Layers
| Layer | Tooling | Scope |
|---|---|---|
| Unit | Vitest/Jest, fast-check | Domain functions: margin, scoring, credit, three-way match, allocation, ageing, posting rules, state machines, ZATCA builders, money math. **Property tests** for ledger balance, allocation conservation, Σ ageing = AR. |
| Integration | Supertest + Testcontainers (real Postgres/Redis/S3-mock) | Every endpoint, RLS, triggers, transactions, outbox → consumer, provider fakes |
| Contract | Pact / recorded sandboxes | ZATCA, WhatsApp, gateway, Daftra, courier, VIN |
| E2E web | Playwright (Chromium, WebKit; **ar-RTL and en-LTR projects**) | Journeys below + screenshot diff |
| E2E mobile | Maestro/Detox + chaos suite | Receiving, partial receiving, POD, offline |
| Security | ZAP baseline/active, Semgrep, Trivy, authz matrix test, tenancy-leak tests, AI red-team prompts | per release + nightly |
| Performance | k6 | 2× expected volume: quote builder, credit check under concurrency, search, dashboards, sync push storm |
| Accessibility | axe-core in Playwright | portals |
| Mutation | Stryker | money/posting/credit/margin/permission modules (score ≥ 70%) |
| AI evaluation | golden sets + LLM-judge + human spot check | §14.4 |
| UAT | scripted per feature ID with client | sign-off recorded |

### 14.2 Mandatory end-to-end journeys (each is a Playwright/Maestro scenario; all must pass on staging before each release)
J1 Portal request → AI match → RFQ → supplier quote (portal) → comparison → margin → approval → send → customer partial approval → SO (credit pass) → PO → receive (partial) → deliver with POD → ZATCA-cleared invoice → receipt → ageing/dashboards update.
J2 Supplier quote by PDF/Excel/image → AI capture → review → award.
J3 Credit hold: limit exceeded, overdue customer, GM release, concurrent confirmations.
J4 Below-margin approval and override audit.
J5 Return → credit note → supplier claim → debit note.
J6 Three-way match variance → approval → posting.
J7 Online payment webhook (duplicate + out-of-order) → receipt → allocation.
J8 Offline delivery: no network, kill app, reconnect, exactly-once sync.
J9 ZATCA rejection → correction → resubmit; B2C reporting retry.
J10 Month-end: bank reconciliation, VAT report, period close, financial statements tie to ledger.
J11 Daftra parallel run → reconciliation report → cut-over switch.
J12 Permissions: each role × each module allowed/denied matrix; cross-tenant leakage attempts.
J13 AR/EN: full journey in Arabic RTL with Hijri dates.
J14 (R2) Supplier onboarding → catalogue upload → matching → marketplace search → RFQ; vehicle dashboard & reminders; courier booking.
J15 (R3) Stock receipt → transfer → count → POS sale with B2C ZATCA → shift cash-up; tyre/battery; job card → service invoice.

### 14.3 Traceability gate
Tests are tagged with feature IDs (`describe('SAL-04 margin control', …)` / `@feature('SAL-04')`). `pnpm trace` builds the matrix from `PRD.md` (all 131 IDs, their required layers from the *Tests* column) against passing results and **fails CI if any required (ID, layer) pair has no passing test**. The matrix is published as a CI artefact and attached to each release's UAT pack.

### 14.4 AI evaluation sets
`vin` (≥ 300 VINs incl. invalid/regional), `parts` (≥ 500 request lines AR/EN with ground-truth part ids), `quotes` (≥ 100 real supplier documents: PDF text/scanned, Excel, photos, AR/EN), `assistant` (≥ 100 questions + 50 permission-boundary and prompt-injection attacks). Thresholds are the PRD §6 gates. Metrics tracked per prompt/model version; regression blocks release.

### 14.5 Test data
Deterministic factories + a **seed universe** (3 companies, 40 customers across all tiers, 30 suppliers, 5k parts with xrefs, 24 months of synthetic transactions incl. overdue/partial/returns) for E2E, dashboards and performance; production-like anonymised snapshot in staging for migration rehearsals.

## 15. Work breakdown and schedule

Team assumption (per proposal): PM/Scrum master, 4 full-stack/back-end devs, 1 mobile dev, 1 AI engineer, 1 QA automation engineer, 1 UI/UX designer, DevOps part-time. Four vertical-slice streams:

| Stream | Owns |
|---|---|
| A Platform & Finance | platform, masterdata infra, finance, ZATCA, Daftra, credit, reporting |
| B Sales & Portals | crm, sales, customer portal, notifications |
| C Procurement & AI | procurement, supplier portal, AI service, catalogue |
| D Logistics & Mobile | logistics, Sunmi app, sync, labels/POD, payments |

### Week 0 (before sprint 1) — foundations
Repo, CI/CD, environments (Terraform), Keycloak realms, design system + RTL baseline, Prisma baseline + RLS + audit + outbox + doc sequences, i18n pipeline, test harness + traceability gate (empty matrix wired), seed universe skeleton. **Start in parallel (long lead):** ZATCA onboarding, WhatsApp BSP + template approval, gateway sandbox, VIN provider contract, Sunmi test devices, LLM tenancy, client sample documents (for golden sets), legacy DB/Daftra access.

### R1 sprints
| When | Stream A | B | C | D |
|---|---|---|---|---|
| Wk 1 Discovery | SRS sign-off from this PRD, COA, credit policy, migration plan | UI flows on approved prototype | supplier/AI sample collection | Sunmi flow capture |
| Sprint 1 (wk 2–3) | PLT-01…11 (incl. approval engine PLT-04), MDM-01…08, FIN-01, FIN-02 core posting, CRD-01 | CRM-01…06, CPT-01, CPT-02, SAL-01, NTF-02/03/04 | PRC-01, PRC-02, SUP-01, SUP-02, AI-1, AI-2 services | LOG-01 shell, sync foundation, LOG-05 |
| Sprint 2 (wk 4–5) | CRD-02…04, FIN-03, FIN-04, FIN-05 | SAL-02…10, CPT-03, CPT-04, CPT-07, NTF-01 | PRC-03…08, SUP-03 | LOG-02…04, LOG-06…10, CPT-06 payments |
| Sprint 3 (wk 6) | FIN-06 (sandbox pass), FIN-07…10, CRD-05…10, RPT-01…09 | CPT-05, CRM sales dashboards support | RPT-10 / AI-3, migration rehearsal 1 | Daftra push + migration, hardening of sync |
| Wk 7 | UAT, pen-test fixes, ZATCA production onboarding, final migration rehearsal, training, go-live (all 97 features at "Done" per PRD §9) |
| Wk 8–9 | Contingency / stabilisation / parallel-run reconciliation; hypercare 4 weeks |

### R2 (≈ 3 weeks) — SUP-04…08, LOG-11, VEH-01…03, CPT-08, RPT-11 / AI-4, customer mobile app (iOS+Android)
### R3 (≈ 4 weeks) — INV-01…06 / AI-5, FIN-11, FIN-12, PRC-09, LOG-12, POS-01…06, WSH-01…05, CRM-07, RPT-12, POS/workshop tablets

**Scheduling reality check.** The proposal commits to R1 go-live in week 7 with every feature at the §9 quality bar. That is only credible if (a) the prototype design is signed off in week 1, (b) client reviews return within 3 working days, (c) ZATCA onboarding starts in week 0, and (d) scope is frozen. Burn-up charts are tracked per feature ID; if two consecutive sprints land < 90% of planned IDs "Done", the contingency weeks (8–9) are invoked and the client is told immediately — quality gates are **not** relaxed to hold the date.

## 16. Kickoff checklist (first 10 working days)

1. Confirm defaults in PRD §12 with the client (Q1, Q3, Q6, Q10, Q13 are on the critical path).
2. Create repo, CI, environments, secrets, observability baseline.
3. Request/provision: ZATCA Fatoora onboarding (CSR, OTP via client), WhatsApp BSP + templates, payment gateway sandbox, VIN/parts provider keys, LLM tenancy, SMS sender ID, Google Maps key, Sunmi devices, Daftra API, read-only copy of legacy DB.
4. Collect real samples: supplier quotations (PDF/Excel/photo), VIN+part request history, chart of accounts, credit policy, document templates, price/margin rules.
5. Scaffold Prisma baseline (`company, branch, user, role, setting, audit_log, outbox, doc_sequence`), RLS helper, audit trigger, immutability triggers, ledger tables + balance constraint — with their tests — before any feature work.
6. Wire the traceability gate with all 131 IDs from `PRD.md` so progress is visible from day one.
7. Build the "walking skeleton": portal request → inbox → quotation PDF → approval, deployed to staging end to end (proves the pipeline, i18n/RTL, auth, outbox, audit).
8. Sprint 1 planning by feature ID per §15.
