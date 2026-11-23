# Product Requirements Document — AutocQuick Unified ERP ("Auto Parts ERP")

| | |
|---|---|
| Client | AutocQuick, Kingdom of Saudi Arabia (decision maker: Mr. Fouad, General Manager) |
| Supplier | Funavry Technologies in consortium with SWAT Consulting |
| Source documents | Client meeting 15 Nov 2026 (summary + transcript notes); Technical & Financial Proposal v1.1 |
| Status | Draft v1.0 for engineering kickoff |
| Companion doc | `TECH_SPEC.md` (architecture, data model, algorithms, test strategy, work plan) |

---

## 1. Purpose

Replace the client's fragmented systems (partial ERP/CRM, separate quotation process, Daftra accounting, standalone Sunmi receiving page) with **one custom ERP** that runs the whole trading cycle on one data model:

> Customer Request → AI Part Matching → RFQ → Supplier Quotation → Comparison → Margin Pricing → Customer Approval → Order + PO → Goods Receiving → Delivery + Signature → ZATCA Invoice → Credit & Collections → Dashboards

The headline problem to eliminate: **the same item is typed 3–5 times** across ERP, quotations and Daftra. Success means every part line is captured once and flows untouched to the ledger.

## 2. Product decisions

| # | Decision | Reason |
|---|---|---|
| D1 | **All 131 catalogued features are in scope.** None is dropped. | Explicit instruction: every feature built, working, production-ready, fully tested. |
| D2 | Features ship in three **production-complete releases** (R1 = 97 P1 features, R2 = 11 P2, R3 = 23 P3). A release is not "demo quality"; each is shippable. | The three phases in the proposal; keeps risk contained while honouring D1. R2/R3 are designed into the R1 data model. |
| D3 | **The ERP is the book of record.** Daftra is fed one-way during one parallel closing cycle, then becomes a read-only archive. | Removes duplicate entry; only one system may issue ZATCA invoices. |
| D4 | AI is limited to five use cases (AI-1…AI-5); everything else is rule-based and explainable. Every AI output is confirmed by a human. | Client says AI is a necessity; keep it useful, cheap, auditable. |
| D5 | Marketing/campaign management is out of scope. | Client confirmed. |
| D6 | Margin is defined **on selling price**: `margin% = (price − cost) / price`; `price = cost / (1 − margin%)`. Confirm in discovery (see §12). | Needed for deterministic pricing tests. |
| D7 | Currency SAR (base). VAT 15%. Arabic + English, RTL, Hijri + Gregorian dates. | KSA requirements. |

## 3. Personas and roles

| Role | Who | Main surface |
|---|---|---|
| Sales rep | Handles requests, quotations, follow-ups | ERP web |
| Purchasing | Runs RFQs, comparison, POs, supplier claims | ERP web |
| Warehouse / driver | Receives goods, delivers, captures signature | Sunmi / Android app (offline) |
| Finance | Invoicing, ledger, bank, credit, collections | ERP web |
| Collector | Daily call/visit list, promises to pay | ERP web |
| Manager / GM | Approves margins, credit releases, POs, discounts; reads dashboards | ERP web (responsive) |
| Admin | Users, rules, templates, integrations | ERP web settings |
| Customer user | Workshop / fleet / dealer staff placing requests | Customer Portal |
| Supplier user | Quotes RFQs, confirms POs, uploads invoices/catalogues | Supplier Portal |
| Branch cashier / technician (R3) | Counter sales, job cards | POS / workshop tablets |

## 4. Core business rules (cross-cutting, testable)

**BR-1 Single entry.** A part line is created once on the request and referenced (never copied/retyped) by RFQ, quotation, SO, PO, receipt, delivery, invoice and journal. Every operational document carries `request_id`; any invoice traces back to its request and supplier quote.

**BR-2 Credit exposure.** `exposure = open invoice balances + confirmed SO value not yet invoiced + approved-quotation value not yet ordered × w` (`w` configurable, default 1.0). On quotation approval and SO confirmation: if `exposure + new > credit_limit` **or** any invoice overdue beyond `grace_days`, the document is placed on **credit hold** and routed through the approval matrix. No SO or PO is created while on hold.

**BR-3 Margin control.** Each quotation line price comes from the winning supplier cost plus margin rule (most specific rule wins: customer tier × category × brand × supplier × urgency). Price below `min_margin` requires approval before sending. Price above market ceiling is flagged.

**BR-4 Best-value recommendation.** Weighted, explainable score over normalised price, lead time, supplier rating, warranty; weights set by the Client. The recommendation is advisory; purchasing awards per line.

**BR-5 Delivered-quantity invoicing.** Invoices are issued for quantities actually delivered (proof of delivery). Partial deliveries create partial invoices; balance stays as back-order.

**BR-6 Three-way match.** Supplier bill posts only when PO, goods receipt and bill agree within tolerance (qty and price tolerances configurable); variances are flagged and routed.

**BR-7 ZATCA.** Only the ERP issues tax invoices. B2B invoices are cleared by ZATCA before being delivered to the customer; B2C simplified invoices are reported within the legal window. Rejected invoices are correctable and resubmittable. Invoice numbers are gapless and hash-chained per ZATCA rules.

**BR-8 Immutable accounting.** Posted journal entries and posted/cleared invoices are never edited or deleted; corrections are reversals/credit notes. Every change anywhere is audit-logged.

**BR-9 Approvals.** All approval thresholds (margin, credit, PO value, discount, returns, write-offs) live in settings, not code, with escalation and delegation.

**BR-10 Data visibility.** Role + field-level permissions everywhere, including the AI assistant (it can only see what the asking user may see).

## 5. Functional requirements

Release column: **R1** (P1, immediate), **R2** (P2 Digital Ecosystem), **R3** (P3 Retail & Service). "Done" requires the acceptance criterion **and** the test layers listed (see §9: U unit, I integration, E end-to-end, S security, P performance, A accessibility/RTL, M manual UAT).

### 5.1 Platform and Administration

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| PLT-01 | Users and roles | Admin creates users/roles; permission matrix enforced on API and UI down to field level; denied access returns 403 and is audited. | R1 | U,I,S,E |
| PLT-02 | SSO and MFA | Login via Microsoft/Google OIDC; MFA mandatory for Finance/Manager/Admin; idle timeout configurable; lockout after N failures. | R1 | I,S,E |
| PLT-03 | Company and branch set-up | Company profile with VAT no.; branches, warehouses, cost centres; every transactional table scoped by `company_id` (+`branch_id`); data from company A never visible to B. | R1 | U,I,S |
| PLT-04 | Workflow/approval engine | Rules by type/amount/tier; multi-step; escalate after SLA; delegate while away; every decision logged; approve/reject from web and phone. | R1 | U,I,E |
| PLT-05 | Numbering and templates | Per-document gapless series (per company/branch/year); bilingual branded PDF templates for quotation, PO, delivery note, invoice, statement render correctly in AR and EN. | R1 | U,I,A,M |
| PLT-06 | Bilingual interface | Every screen, message, PDF and notification available in AR (RTL) and EN; per-user switch; Hijri/Gregorian date display; no hard-coded strings (lint-enforced). | R1 | U,A,E |
| PLT-07 | Audit trail | Who/what/when/old→new on every record; append-only; DB blocks UPDATE/DELETE on audit and ledger tables; viewable per record. | R1 | I,S |
| PLT-08 | Attachments | Upload to any record; type/size limits; virus scan; private object storage with signed URLs; permission-checked download. | R1 | I,S,E |
| PLT-09 | Global search | One box searches customers, VINs, part numbers, requests, orders, invoices; <1 s p95; results respect permissions; Arabic/English and part-number fuzzy match. | R1 | I,P,E |
| PLT-10 | Settings console | Admin edits margins, credit rules, tax, notification rules, integrations with no code/deploy; changes versioned and audited. | R1 | I,E |
| PLT-11 | Import / export | Bulk import (CSV/XLSX) of customers, suppliers, parts, balances with dry-run validation report, row-level errors, rollback on failure; export any list to CSV/XLSX honouring permissions. | R1 | U,I,E |

### 5.2 Master Data Management

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| MDM-01 | Parts catalogue | Part with number, OEM + aftermarket cross-refs, brand, category, unit, images, compatible vehicles; search by any number. | R1 | U,I,E |
| MDM-02 | Self-building catalogue | New part numbers from quotations/orders create draft catalogue entries; fuzzy duplicate detection suggests merges; merge preserves history. | R1 | U,I |
| MDM-03 | Vehicle register | Vehicle (make, model, year, engine, trim, VIN) linked to customer, requests, invoices; VIN checksum/format validated; duplicate VIN blocked. | R1 | U,I |
| MDM-04 | Customer master | Profile, contacts, addresses, VAT no., CR no., price tier, credit limit, terms; VAT/CR format validated. | R1 | U,I,E |
| MDM-05 | Supplier master | Profile, brands/categories, payment terms, bank details, documents, rating (auto-updated by PRC-08). | R1 | U,I |
| MDM-06 | Pricing and margin rules | Rules by tier × category × brand × supplier × urgency with target, minimum, ceiling; precedence deterministic and unit-tested; effective dates. | R1 | U,I |
| MDM-07 | Price history | Every supplier quote and selling price stored per part/supplier/date; queryable and charted; never overwritten. | R1 | U,I |
| MDM-08 | Units and conversions | Units (pcs, sets, L, packs) with conversion factors between supplier and customer UoM; rounding rules; conversion applied in quote→PO. | R1 | U,I |

### 5.3 CRM and Customer Management

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| CRM-01 | Customer 360 | Single screen: requests, quotes, orders, deliveries, invoices, payments, vehicles, notes, credit status; loads <2 s. | R1 | I,P,E |
| CRM-02 | Customer types and tiers | Workshop/fleet/rental/dealer/individual types each map to price tier and terms; tier change audited and affects future quotes only. | R1 | U,I |
| CRM-03 | Activities and follow-ups | Log call/visit/WhatsApp/task against customer; reminders fire via in-app + configured channel; overdue tasks surface on dashboard. | R1 | I,E |
| CRM-04 | Sales targets | Targets per rep/customer/category/period; achievement computed from invoiced sales; shown on dashboards. | R1 | U,I |
| CRM-05 | Lost-sales analysis | Closing an unapproved line requires a reason; analysis by customer/category/price gap; exported. | R1 | U,I,E |
| CRM-06 | Customer onboarding | Portal self-registration, CR/VAT upload, internal approval workflow; credit cannot be granted before approval. | R1 | I,E |
| CRM-07 | Loyalty and offers | Points rules, vouchers, targeted offers for branch/portal customers; redemption at POS/portal; points ledger auditable. | R3 | U,I,E |

### 5.4 Customer Portal

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| CPT-01 | Parts request | Request with vehicle, VIN (decoded on entry), parts, qty, photos, required date; saved drafts; arrives in SAL-01 inbox as a single record. | R1 | I,E,A |
| CPT-02 | Multiple users and branches | Customer company has several users/locations with own approval rights (e.g. only some may approve quotes); isolated from other customers. | R1 | I,S,E |
| CPT-03 | Quotation review | View quotes, alternatives per line, approve all/selected lines, reason for rejected lines; credit check on approval. | R1 | I,E |
| CPT-04 | Order tracking | Live status sourcing→delivery, delivery notes and POD visible; updates within 5 s of event. | R1 | I,E |
| CPT-05 | Invoices and statements | Download ZATCA e-invoice PDF/XML and statements; see limit, balance, due dates. | R1 | I,E |
| CPT-06 | Online payment | Pay invoices via Mada/card gateway; webhook-confirmed; auto-creates receipt and allocates; idempotent against duplicate webhooks. | R1 | I,S,E |
| CPT-07 | Returns requests | Return against an invoice line with reason and photos; routed to SAL-09 flow. | R1 | I,E |
| CPT-08 | Vehicle dashboards | Per-vehicle/fleet expenses, history, upcoming services in portal (data from VEH-01..03). | R2 | I,E |

### 5.5 Sales

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| SAL-01 | Request inbox | One inbox for portal/phone/WhatsApp/email requests; manual capture form; auto/manual assignment; SLA timers with breach alerts. | R1 | I,E |
| SAL-02 | AI part matching | VIN decoded to make/model/year/engine; OEM + alternative parts suggested per line with confidence; low confidence flagged; user must confirm; accuracy measured on a golden set (TECH_SPEC §14.4). | R1 | U,I,E |
| SAL-03 | Quotation builder | Built from awarded supplier quotes + margin rules; alternatives per line; validity date; bilingual PDF; no retyping of part data. | R1 | U,I,E |
| SAL-04 | Margin control | Live margin per line and total; below-minimum triggers approval and blocks sending until approved. | R1 | U,I,E |
| SAL-05 | Quotation sending | Send via portal, WhatsApp link, email; opened/approved status tracked; expiry handled. | R1 | I,E |
| SAL-06 | Partial approval | Customer approves selected lines; remaining lines closed with lost reason (feeds CRM-05). | R1 | U,E |
| SAL-07 | Sales orders | Created from approved lines; credit check on confirmation (BR-2); linked to POs, deliveries, invoices. | R1 | U,I,E |
| SAL-08 | Back-orders | Short-supplied qty stays open and is delivered later without re-entry; visible to customer. | R1 | U,I,E |
| SAL-09 | Returns and credit notes | RMA → supplier return → customer credit note (ZATCA) → write-off or restock; approval-gated. | R1 | U,I,E |
| SAL-10 | Discounts and price overrides | Discount/override requires reason; thresholds approval-gated; full audit. | R1 | U,I,E |

### 5.6 Procurement and Sourcing

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| PRC-01 | RFQ engine | RFQ auto-sent to approved suppliers selected by brand/category; deadline and reminders; channels portal/email/WhatsApp; re-send and cancel. | R1 | U,I,E |
| PRC-02 | Quotation capture | Suppliers enter quotes in portal or AI reads PDF/Excel/image/email into lines matched to parts (AI-2); user reviews and confirms; originals attached. | R1 | U,I,E |
| PRC-03 | Comparison matrix | Side-by-side price, availability, lead time, warranty, rating; best-value highlighted with score breakdown (BR-4). | R1 | U,I,E |
| PRC-04 | One-click award | Award per line to different suppliers; losing suppliers notified; award immutable once PO issued. | R1 | U,I,E |
| PRC-05 | Purchase orders | One PO per awarded supplier; approval by value; sent via email/WhatsApp; supplier confirms in portal; revision history. | R1 | U,I,E |
| PRC-06 | Three-way match | PO×receipt×bill matched with tolerances (BR-6); variance queue; posting blocked until resolved/approved. | R1 | U,I,E |
| PRC-07 | Supplier claims | Short/damaged/wrong items raise a claim and debit note automatically from LOG-04; claim lifecycle tracked. | R1 | U,I,E |
| PRC-08 | Supplier performance | On-time %, price competitiveness, defect rate, response time per supplier; feeds rating used in BR-4. | R1 | U,I |
| PRC-09 | Stock replenishment | Purchase suggestions from reorder points (INV-04); one click to RFQ/PO. | R3 | U,I,E |

### 5.7 Supplier Portal and Marketplace

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| SUP-01 | RFQ responses | Supplier sees only own RFQs; submits price, availability, lead time, warranty; before deadline only. | R1 | I,S,E |
| SUP-02 | Document upload | Upload quote in own format; triggers AI capture; status visible. | R1 | I,E |
| SUP-03 | PO confirmation and invoices | Confirm/decline PO lines with dates; upload invoice; see payment status. | R1 | I,E |
| SUP-04 | Vendor onboarding | Self-registration with docs, brands, categories; approval workflow; credentials issued on approval. | R2 | I,E |
| SUP-05 | Product and price uploads | Suppliers maintain catalogue/price lists (form + CSV/XLSX); validated; synced to ERP catalogue and price history. | R2 | U,I,E |
| SUP-06 | Availability feeds | Stock/lead-time updates by file or API; scheduled; stale feeds flagged. | R2 | I,E |
| SUP-07 | Marketplace search | Staff search all supplier catalogues by part/vehicle/brand before RFQ; results show price, availability, supplier. | R2 | I,P,E |
| SUP-08 | Catalogue matching | Supplier part numbers mapped to ERP catalogue; duplicate checks; manual review queue. | R2 | U,I |

### 5.8 Logistics, Receiving and Delivery

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| LOG-01 | Sunmi mobile app | Android app using Sunmi scanner and printer SDKs; also runs on standard Android phones (camera scanning); role-based login. | R1 | I,E,M |
| LOG-02 | Goods receiving | Scan item against PO; wrong item alerts; qty verification before confirm. | R1 | U,I,E |
| LOG-03 | Partial receiving | Receive part of a PO; balance stays open; SO status updated. | R1 | U,I,E |
| LOG-04 | Discrepancies | Short/excess/damaged recorded with photos; supplier claim auto-created. | R1 | U,I,E |
| LOG-05 | Delivery planning | Delivery notes, driver assignment, route list by area; printable. | R1 | U,I,E |
| LOG-06 | Proof of delivery | Scan at hand-over; on-screen customer e-signature; photo; GPS; timestamp; stored immutably; PDF attached to delivery note. | R1 | I,E,M |
| LOG-07 | Partial and failed delivery | Reason captured; back-order or re-delivery scheduled; invoice only for delivered qty (BR-5). | R1 | U,I,E |
| LOG-08 | Labels | Item/package labels printed from Sunmi printer; templates configurable. | R1 | I,M |
| LOG-09 | Offline mode | Scans/signatures/photos queue on device with no network; sync idempotently on reconnect; no data loss across app kill/reboot; conflicts surfaced. | R1 | U,I,E |
| LOG-10 | Live tracking | Delivery status visible to staff and customer; updates ≤5 s after event. | R1 | I,E |
| LOG-11 | Courier integration | Book/track shipments via courier APIs (SMSA, Aramex); label and status sync. | R2 | I,E |
| LOG-12 | Branch transfers | Transfer between warehouses/branches with in-transit tracking and receipt confirmation. | R3 | U,I,E |

### 5.9 Finance and Accounting

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| FIN-01 | General ledger | Chart of accounts (SOCPA/IFRS), journals, cost centres, periods, period lock, year-end close; trial balance always balances. | R1 | U,I,E |
| FIN-02 | Automatic postings | Sales, purchases, receipts, payments, returns post automatically via posting rules; each posting is balanced and traceable to source. | R1 | U,I |
| FIN-03 | Accounts receivable | Invoices, credit notes, receipts, allocation (full/partial/unapplied), customer statements. | R1 | U,I,E |
| FIN-04 | Accounts payable | Bills, debit notes, payment runs, supplier statements. | R1 | U,I,E |
| FIN-05 | VAT | 15% VAT, zero-rated/exempt handling, VAT report and return support; reconciles to ledger. | R1 | U,I |
| FIN-06 | ZATCA e-invoicing | Phase 2: UBL 2.1 XML, QR (TLV), XAdES stamp, hash chain, clearance (B2B) / reporting (B2C), retry, error correction; passes ZATCA sandbox validation. | R1 | U,I,E,M |
| FIN-07 | Cash and bank | Bank/cash accounts, transfers, cheques and post-dated cheques, reconciliation from statement import. | R1 | U,I,E |
| FIN-08 | Expenses | Expense entry by category/cost centre, petty cash, approvals, budgets with overrun alerts. | R1 | U,I,E |
| FIN-09 | Financial statements | Trial balance, P&L, balance sheet, cash flow by branch/period; export PDF/XLSX; ties to ledger. | R1 | U,I,E |
| FIN-10 | Daftra transition | One-way ERP→Daftra sync during parallel run; opening balances/history migrated with reconciliation report; cut-over switch; Daftra then read-only. | R1 | I,E,M |
| FIN-11 | Inventory valuation | Stock valuation (moving average), COGS, adjustments posted to ledger. | R3 | U,I |
| FIN-12 | Branch accounting | Branch P&L, cash-up, inter-branch postings that eliminate on consolidation. | R3 | U,I,E |

### 5.10 Credit Management and Collections

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| CRD-01 | Credit profile | Limit, terms (30/60/90), tier, guarantees, documents per customer; changes approval-gated and audited. | R1 | U,I |
| CRD-02 | Real-time exposure | Exposure per BR-2 recomputed on every relevant event; checked at quotation approval and SO confirmation; shown on customer 360. | R1 | U,I,E |
| CRD-03 | Credit holds | Auto hold on over-limit/overdue; release only by authorised approver with reason; blocked documents resume on release. | R1 | U,I,E |
| CRD-04 | Approval matrix | Over-limit approvals routed by amount and tier (sales mgr → finance mgr → GM). | R1 | U,I,E |
| CRD-05 | Ageing | Buckets current/1–30/31–60/61–90/90+ (configurable) by customer/rep/branch; totals tie to AR ledger. | R1 | U,I |
| CRD-06 | Statements | On-demand and scheduled statements; also in portal; AR/EN PDF. | R1 | I,E |
| CRD-07 | Automated reminders | Pre-due/overdue reminders by WhatsApp/SMS/email escalating by age; templates bilingual; no duplicates; stop on payment. | R1 | U,I,E |
| CRD-08 | Collection workbench | Daily call/visit list prioritised; promise-to-pay with date; notes/outcomes; broken-promise flag. | R1 | U,I,E |
| CRD-09 | Receipts and allocation | Cash/transfer/cheque receipts, allocate to invoices, unapplied cash, reversal. | R1 | U,I,E |
| CRD-10 | Credit alerts | Rule-based early warning (days late trend, rising overdue, limit usage); alert routed to collector/manager. | R1 | U,I |

### 5.11 Reports, Dashboards and BI

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| RPT-01 | Executive dashboard | Sales, gross margin, net profit, cash, AR/AP with MoM/YoY; numbers reconcile to ledger; role-restricted. | R1 | U,I,E |
| RPT-02 | Sales dashboard | By customer/rep/category/brand/make; quote→order conversion; lost reasons. | R1 | U,I,E |
| RPT-03 | Profitability dashboard | Margin by order/customer/supplier/category; below-target deals; trends. | R1 | U,I,E |
| RPT-04 | Expense dashboard | Expenses vs budget by category/cost centre. | R1 | U,I,E |
| RPT-05 | Receivables dashboard | Ageing, overdue, DSO, collection effectiveness, credit utilisation. | R1 | U,I,E |
| RPT-06 | Procurement dashboard | Supplier spend, price trends, response and on-time rates. | R1 | U,I,E |
| RPT-07 | Operations dashboard | Open requests, pending quotes, deliveries due, partials, SLA breaches; live. | R1 | I,E |
| RPT-08 | Historical analysis | Multi-year trends; drill-down to source transaction. | R1 | I,E,P |
| RPT-09 | Report scheduling | Export XLSX/PDF; schedule by email; recipient permissions respected. | R1 | I,E |
| RPT-10 | AI business assistant | Arabic/English questions answered with tables/charts via semantic layer; read-only; sees only permitted data; answer cites query; refuses out-of-scope. | R1 | U,I,E,S |
| RPT-11 | Forecasting | Demand and price forecasts by part/brand/segment (AI-4) with accuracy metrics (MAPE) on hold-out data. | R2 | U,I,E |
| RPT-12 | Branch and POS dashboards | Branch sales, cash-up, stock, service performance. | R3 | I,E |

### 5.12 Notifications and Communication

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| NTF-01 | WhatsApp Business | Template messages for quotes, status, delivery notes, invoices, reminders; delivery status tracked; opt-out honoured. | R1 | I,E |
| NTF-02 | SMS and email | OTPs, alerts, documents by SMS/email; bounce handling; rate limits. | R1 | I,E |
| NTF-03 | In-app alerts | Approvals, SLA breaches, holds, exceptions to the right role; read/unread; real-time. | R1 | I,E |
| NTF-04 | Notification rules | Admin configures who gets what, channel, language; test-send; audited. | R1 | I,E |

### 5.13 Inventory and Warehouse (R3)

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| INV-01 | Warehouses and bins | Multiple warehouses and bins per branch; bin-level stock. | R3 | U,I,E |
| INV-02 | Stock movements | Receipts, issues, transfers, adjustments; immutable movement ledger; stock = sum of movements. | R3 | U,I |
| INV-03 | Stock counts | Cycle/full counts via Sunmi scanner; variance approval; adjustment posts to GL. | R3 | I,E |
| INV-04 | Reorder points | Min/max per part and branch; breach creates suggestion. | R3 | U,I |
| INV-05 | Batch and serial tracking | Batch/serial/expiry/manufacture date where flagged; forward/backward trace. | R3 | U,I,E |
| INV-06 | Reorder suggestions | AI-5 suggested reorder points for fast movers, tyres, batteries; user accepts/edits. | R3 | U,I |

### 5.14 Branches, POS, Tyres and Batteries (R3)

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| POS-01 | POS application | Fast counter sale with barcode scan, customer lookup, vehicle search; works through brief network loss. | R3 | I,E,P |
| POS-02 | ZATCA simplified invoices | B2C invoice with QR, reported to ZATCA; offline queue with reporting on reconnect within window. | R3 | I,E,M |
| POS-03 | Payments at counter | Cash, Mada/card terminal, split payments; reconciled to shift. | R3 | I,E |
| POS-04 | Shifts and cash-up | Open/close shift, cash drawer, variances approved and posted. | R3 | U,I,E |
| POS-05 | Tyre management | Size, load/speed rating, DOT code, sets of four; search by size. | R3 | U,I,E |
| POS-06 | Battery management | Serials, fitment, warranty registration and claims. | R3 | U,I,E |

### 5.15 Workshop and Maintenance (R3)

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| WSH-01 | Service bookings | Online/counter booking by service type, bay, time; no double booking. | R3 | U,I,E |
| WSH-02 | Job cards | Check-in, inspection, job card, parts + labour, customer approval. | R3 | U,I,E |
| WSH-03 | Bays and technicians | Scheduling, time tracking, productivity per technician. | R3 | U,I,E |
| WSH-04 | Service billing | Parts and labour invoiced together with ZATCA e-invoice. | R3 | U,I,E |
| WSH-05 | Service history | History linked to vehicle; visible on vehicle dashboard. | R3 | I,E |

### 5.16 Customer Vehicle Dashboards (R2)

| ID | Feature | Acceptance criteria | Rel | Tests |
|---|---|---|---|---|
| VEH-01 | Vehicle expenses | Spend per vehicle/fleet by category and period from invoiced transactions. | R2 | U,I,E |
| VEH-02 | Maintenance history | Parts bought and services done per vehicle, built from ERP transactions. | R2 | U,I,E |
| VEH-03 | Service reminders | Upcoming services by mileage/time from standard intervals; reminders to customer. | R2 | U,I,E |

**Totals check:** PLT 11 + MDM 8 + CRM 7 + CPT 8 + SAL 10 + PRC 9 + SUP 8 + LOG 12 + FIN 12 + CRD 10 + RPT 12 + NTF 4 + INV 6 + POS 6 + WSH 5 + VEH 3 = **131**.

## 6. AI use cases (full requirements in `TECH_SPEC.md` §10)

| ID | Use case | Release | Quality bar (release gate) |
|---|---|---|---|
| AI-1 | VIN decode + part matching | R1 | VIN→make/model/year ≥ 98% on golden VIN set; top-3 part suggestion hit-rate target agreed on client sample set; every suggestion shows confidence and needs confirmation. |
| AI-2 | Supplier quotation capture (PDF/Excel/image/email) | R1 | Line-level extraction F1 ≥ 0.90 on client sample set; 100% of lines human-confirmed before use. |
| AI-3 | Business assistant (AR/EN) | R1 | ≥ 90% correct on a curated 100-question set; 0 permission leaks in red-team tests. |
| AI-4 | Demand/price forecasting | R2 | Beats naïve baseline on hold-out MAPE; reported in UI. |
| AI-5 | Reorder suggestions | R3 | Back-tested against actual stock-outs; user-accepted. |

## 7. Customer-facing surfaces

ERP web (staff, responsive for managers), Customer Portal, Supplier Portal, Sunmi/Android logistics app, Customer mobile app (R2, iOS + Android), POS and workshop tablets (R3). All bilingual, RTL-correct, WCAG 2.1 AA for portals.

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Availability | 99.5% monthly (excluding agreed windows) |
| Performance | Screen open < 2 s p95; search < 1 s p95; dashboards < 3 s p95 at expected volumes |
| Scale | 200+ concurrent internal users; thousands of portal users; multi-branch |
| Recovery | RPO < 24 h (daily backup + PITR; target 5 min), RTO < 4 h; restore tested quarterly |
| Security | ISO 27001-aligned; TLS 1.2+, AES-256 at rest, MFA for privileged; OWASP Top 10; pen-test before go-live; PDPL; NCA ECC where applicable |
| Data residency | Production data in KSA region |
| Offline | Sunmi app fully functional offline for receiving and delivery |
| Languages | AR (RTL) + EN everywhere |
| Observability | Metrics, logs, traces, error tracking, alerting on every integration queue |
| Ownership | Client owns code, DB, cloud accounts; full docs handed over |

## 9. Definition of "production-ready and fully tested"

A feature is **Done** only when **all** hold:

1. Acceptance criteria in §5 demonstrably met on staging with realistic data.
2. Automated tests at every layer listed in its *Tests* column, in CI, green; **no skipped or flaky tests**.
3. Coverage gates: ≥ 85% line / ≥ 80% branch on domain logic; **100% of money, posting, tax, credit, margin and permission code paths** covered.
4. Traceability: test names carry the feature ID (e.g. `SAL-04`); CI produces a requirement→test matrix and **fails the build if any of the 131 IDs has no passing test**.
5. Security: authz tests for every endpoint; no high/critical findings in SAST, dependency and container scans; ZAP baseline clean; pen-test findings closed before R1 go-live.
6. i18n/RTL: screenshot tests in AR and EN; no untranslated keys.
7. Accessibility checks pass on portals.
8. Performance budgets met under k6 load at 2× expected volumes.
9. Observability: metrics, structured logs, alerts, runbook entry exist.
10. Documentation: API (OpenAPI), user guide section, admin settings documented.
11. Client UAT sign-off recorded against the feature ID.
12. Migrations are reversible or forward-safe, tested on a production-size dataset.

TECH_SPEC §14.4 covers AI evaluation sets; AI features must additionally pass their release gate in §6.

## 10. Success metrics (baseline in discovery)

| Objective | Measure |
|---|---|
| Single entry | 0 re-keyed fields between request → invoice (audited by data lineage report) |
| Faster quoting | Median request→quotation time cut ≥ 50% vs baseline |
| Margin protection | 100% of quotation lines priced via rules; 0 below-minimum sends without approval |
| Credit control | 100% of quotes/orders credit-checked; overdue % and DSO tracked weekly |
| Digital POD | 100% of deliveries with scan + signature + photo + GPS |
| Visibility | Dashboards reconcile to ledger to the halala |
| Compliance | 100% of invoices accepted by ZATCA; rejection rate < 1% after first month |

## 11. Release plan

| Release | Contents | Target (from scope sign-off) |
|---|---|---|
| R1 | 97 P1 features + AI-1/2/3, Daftra parallel run, data migration, training | go-live week 7 (weeks 8–9 contingency), 4 weeks hypercare |
| R2 | 11 P2 features + AI-4, customer mobile app | ~3 weeks after R1 (weeks 8–12) |
| R3 | 23 P3 features + AI-5, POS/workshop tablets | ~4 weeks after R2 (weeks 11–16) |

Every release passes §9 for every feature it contains.

## 12. Open questions and working defaults (engineering proceeds with defaults; client confirms)

| # | Question | Working default |
|---|---|---|
| Q1 | Daftra replaced or kept? | **Replaced** after parallel run (D3). Option B (keep Daftra, one-way push) re-scopes FIN module. |
| Q2 | Years of history to migrate | Opening balances + 24 months transactions; older kept in Daftra archive. |
| Q3 | Credit limits/rules/approval levels | Configurable; defaults: grace 5 days, exposure weight 1.0, matrix Sales Mgr < SAR 25k, Finance Mgr < 100k, GM above. |
| Q4 | Volumes | Design for 5k requests/month, 50k lines/month, 500 suppliers, 2k customers, 60 internal users; test at 2×. |
| Q5 | Supplier count/willingness | Supplier Portal + email/WhatsApp link + AI capture so no supplier is forced onto the portal. |
| Q6 | VIN/parts data provider | Abstraction `VinProvider`; start with a decoder API + TecDoc-type provider chosen by client; AI-assisted fallback. |
| Q7 | Drivers/couriers, Sunmi models | Support own drivers in R1; couriers in R2; target Sunmi V2/V2s/L2 class (Android 7+). |
| Q8 | Customer types/tiers/multi-user | As CRM-02 / CPT-02. |
| Q9 | Payment gateway/banks/PDCs | Gateway adapter (Moyasar default; HyperPay/Tap pluggable); PDCs supported (FIN-07). |
| Q10 | Cloud | KSA region; default Oracle Cloud Riyadh/Jeddah or GCP Dammam (see TECH_SPEC §13). |
| Q11 | Branding/templates | Provided by client at kickoff; default neutral bilingual templates. |
| Q12 | Future phase timing | R2/R3 as in §11. |
| Q13 | Margin definition (on price vs on cost) | On price (D6). |

## 13. Risks

| Risk | Mitigation |
|---|---|
| ZATCA onboarding/approval delays | Start onboarding in week 1; build against sandbox early; isolate `zatca` module behind an interface; reserve contingency weeks. |
| Aggressive scope vs time | Four parallel streams, vertical slices, CI traceability gate, weekly burn-up by feature ID; scope changes only via change request. |
| Data quality in legacy ERP/Daftra | Migration rehearsals ≥ 2 with finance sign-off on reconciliation. |
| AI accuracy on Arabic/auto-parts data | Golden sets from real client documents; human-in-the-loop mandatory; confidence display; fallback to manual. |
| Third-party dependency (WhatsApp templates, gateway, VIN data) | Provider adapters + queued retries + sandbox accounts requested in week 0. |
| Offline sync defects | Event-sourced append-only scan log, idempotency keys, chaos tests (kill app, drop network). |
| Client sign-off latency | 3-working-day review SLA in contract; weekly demo. |

## 14. Out of scope

Marketing campaign management; third-party licences, hosting and hardware costs; data cleansing beyond de-duplication/normalisation; anything not in this PRD or signed-off SRS (change request).
