// Builds docs/FEATURE_COVERAGE.md: every PRD feature ID -> where it is implemented. Fails (exit 1) if any ID has no mapping.
import { readFileSync, writeFileSync } from 'node:fs';
import { RESOURCES } from '@erp/shared';

const prd = readFileSync(new URL('../../../docs/PRD.md', import.meta.url), 'utf8');
const rows = [...prd.matchAll(/^\| ([A-Z]{3}-\d\d) \| ([^|]+) \|/gm)].map((m) => ({ id: m[1], name: m[2].trim() }));
const rel = Object.fromEntries([...prd.matchAll(/^\| ([A-Z]{3}-\d\d) \|.*\| (R[123]) \| [A-Z,]+ \|$/gm)].map((m) => [m[1], m[2]]));

// features that are not (only) a registry resource: where the code lives
const CODE: Record<string, [string, string?]> = {
  'PLT-02': ['API `routes/auth.ts` (OIDC SSO, TOTP MFA, lockout, idle timeout) · UI `/login`, `/app/profile`', 'SSO activates when OIDC_* env vars are set; MFA enforced for admin/finance/manager'],
  'PLT-04': ['`core/approvals.ts` engine (steps, SLA escalation, delegation) · UI `/app/approvals`'],
  'PLT-05': ['`core/base.ts nextNumber` (gapless, locked) · `routes/docs.ts` bilingual print documents · `Template` resource'],
  'PLT-06': ['`@erp/shared i18n` + web `lib/i18n.tsx` (Arabic RTL default, English), Hijri dates in `lib/format.ts`', 'UI strings still being completed in Arabic'],
  'PLT-07': ['Audit trigger-protected table + `core/crud.ts` audit on every write · record History tab'],
  'PLT-08': ['`routes/platform.ts` /files (type+magic-byte checks, malware signature check, permission-checked download) · Attachments tab', 'Local disk storage; swap for S3-compatible storage in production'],
  'PLT-09': ['`routes/platform.ts` /search · global search box (Ctrl+K)'],
  'PLT-10': ['UI `/app/settings` + `PUT /settings/bulk` · rules are DB settings, not code'],
  'PLT-11': ['`routes/platform.ts` /imports (dry-run, row errors, rollback) + export endpoints · UI `/app/imports`'],
  'MDM-02': ['`domain/masterdata.ts` Part hooks · `services/catalogue.ts` ensurePart (draft parts from quotations, duplicate detection)'],
  'MDM-06': ['`PriceRule` resource · `services/pricing.ts` deterministic precedence (specificity)'],
  'MDM-07': ['`services/catalogue.ts` recordPrice · Part → Price history tab'],
  'CRM-01': ['Customer → 360 tab · `/customers/:id/360`'],
  'CRM-04': ['`SalesTarget` resource · sales dashboard target achievement'],
  'CRM-05': ['Lost reasons captured on partial approval · sales dashboard'],
  'CPT-01': ['UI `/portal/request/new` wizard (live VIN decode, photos)'],
  'CPT-03': ['UI `/portal/quotation/[id]` (alternatives, partial approval, reasons)'],
  'CPT-04': ['UI `/portal/sales-order/[id]` (timeline + live SSE)'],
  'CPT-05': ['UI `/portal/invoice/[id]`, `/portal/statement`, dashboard credit card'],
  'CPT-06': ['`routes/ops.ts` checkout + signed idempotent webhook · UI `/pay/[id]`', 'Gateway is a test-mode stand-in; set PAYMENT_GATEWAY_URL for Moyasar/HyperPay/Tap'],
  'CPT-08': ['UI `/portal/vehicles` (vehicle dashboards)'],
  'SAL-01': ['Request resource + SLA timers (worker) + assignment', 'Portal/staff capture; automatic inbound WhatsApp/e-mail parsing is not built'],
  'SAL-02': ['`services/ai.ts` (VIN decode, hybrid retrieval, confidence) · Request → AI matching tab'],
  'SAL-03': ['`domain/sales.ts` Quotation.build (from award + margin rules) · `routes/docs.ts` bilingual PDF/print'],
  'PRC-02': ['`services/ai.ts extractQuote` (Excel/CSV/PDF text) · SupplierQuote.capture', 'Photo/scanned quotations need OCR (not enabled); reported to the user'],
  'PRC-03': ['`domain/procurement.ts comparison` + `services/pricing.ts bestValue` · RFQ → Comparison tab'],
  'PRC-04': ['Comparison tab → Confirm award (per-line suppliers, losers notified)'],
  'PRC-08': ['`recomputeSupplierScores` (worker) · SupplierScore + supplier rating'],
  'SUP-05': ['`routes/ops.ts` catalogue CSV import · UI `/supplier/catalogue-item`'],
  'SUP-07': ['`/marketplace/search` (trigram + vehicle fit)'],
  'LOG-01': ['Web PWA `/m` (Sunmi scanner as keyboard-wedge + camera) with service worker', 'PWA, not a React Native app; Sunmi printer SDK needs a native shell'],
  'LOG-08': ['`routes/docs.ts` label documents (58 mm) printable from the device browser', 'Direct Sunmi printer SDK printing needs a native shell'],
  'LOG-09': ['`lib/offline.ts` (IndexedDB queue, idempotency keys) + `public/sw.js` + `/sync/push|pull`'],
  'LOG-10': ['SSE `/stream` · portal order tracking · delivery events'],
  'FIN-06': ['`services/zatca.ts` (UBL 2.1, hash chain, ECDSA, TLV QR) · ZatcaCredential · Invoice → ZATCA tab', 'Simulation mode; live Fatoora needs onboarding credentials. XML canonicalisation to be validated with the official SDK'],
  'FIN-10': ['`adapters/index.ts daftraPush` (one-way) · DaftraSyncLog · UI `/app/integrations` cut-over'],
  'CRD-02': ['`services/credit.ts exposure/checkCredit` (row-locked, BR-2) · Customer credit strip'],
  'CRD-05': ['`routes/reports.ts` ageing (ties to AR control account)'],
  'CRD-06': ['`customerStatement` · `/docs/statement` · portal statement'],
  'CRD-07': ['`worker.ts runReminders` (idempotent, stops on payment, escalates)'],
  'CRD-08': ['UI `/app/collections` workbench · `/credit/worklist`'],
  'CRD-10': ['`services/credit.ts creditSweep` (rule-based alerts)'],
  'RPT-01': ['UI `/app/dashboards/executive`'], 'RPT-02': ['UI `/app/dashboards/sales`'], 'RPT-03': ['UI `/app/dashboards/profitability`'], 'RPT-04': ['UI `/app/dashboards/expenses`'],
  'RPT-05': ['UI `/app/dashboards/receivables`'], 'RPT-06': ['UI `/app/dashboards/procurement`'], 'RPT-07': ['UI `/app/dashboards/operations` (live refresh)'],
  'RPT-08': ['UI `/app/dashboards/history` + drill-down to source transactions'],
  'RPT-09': ['Export XLSX/CSV/print endpoints · `ReportSchedule` + worker cron'],
  'RPT-10': ['`services/ai.ts askAssistant` (permission-aware semantic intents, read-only) · UI `/app/assistant`', 'Intent-based; free-form text-to-SQL via an LLM is not enabled'],
  'RPT-11': ['`services/forecast.ts` (exponential smoothing, MAPE back-test) · UI `/app/forecast`'],
  'RPT-12': ['UI `/app/dashboards/branch`'],
  'NTF-01': ['`adapters/index.ts sendMessage` (AR/EN templates, opt-out, logging, retry)', 'Fake provider by default; set WHATSAPP_API_URL for a BSP'],
  'NTF-02': ['`adapters/index.ts sendMessage` (SMS/e-mail)', 'Fake provider by default; set SMS_API_URL / EMAIL_API_URL'],
  'NTF-03': ['`core/base.ts notifyUsers` + SSE bell (`/notifications`, `/stream`)'],
  'NTF-04': ['`NotificationRule` resource'],
  'INV-06': ['`services/forecast.ts suggestReorders` (reorder point + safety stock)'],
  'POS-01': ['UI `/app/pos` (scan/search, cart, split payments)'], 'POS-02': ['`domain/r23.ts PosSale.pay` → simplified ZATCA invoice'],
  'VEH-01': ['`/vehicles/:id/dashboard` + customer/fleet dashboard'], 'VEH-02': ['`/vehicles/:id/dashboard` history'], 'VEH-03': ['`services/forecast.ts generateVehicleReminders` + VehicleReminder'],
  'WSH-05': ['Vehicle dashboard history from job cards'],
  'FIN-09': ['`routes/reports.ts` trial balance, P&L, balance sheet, cash flow (by branch/period, XLSX/CSV/print) · UI `/app/reports/*`'],
  'FIN-12': ['Branch P&L via `branchId` filter on statements · inter-branch clearing postings in `domain/r23.ts Transfer.receive` · UI `/app/dashboards/branch`'],
};

const byFeature: Record<string, string[]> = {};
for (const r of RESOURCES) for (const f of r.features) (byFeature[f] ??= []).push(`\`${r.key}\``);
const missing: string[] = [];
const lines = rows.map((r) => {
  const res = byFeature[r.id]; const code = CODE[r.id];
  if (!res && !code) missing.push(r.id);
  const where = [res ? `Resource ${[...new Set(res)].join(', ')} (+ generic CRUD/actions/UI)` : '', code?.[0] ?? ''].filter(Boolean).join(' · ');
  return `| ${r.id} | ${r.name} | ${rel[r.id] ?? ''} | ${where || '**MISSING**'} | ${code?.[1] ?? ''} |`;
});
const out = `# Feature coverage (PRD → implementation)\n\nGenerated by \`pnpm --filter @erp/db exec tsx scripts/coverage.ts\`. ${rows.length} PRD features; ${missing.length} unmapped.\n\nStatus: **built, not yet tested** (testing and UI polish are the next phases).\n\n| ID | Feature | Rel | Implemented in | Notes / limits |\n|---|---|---|---|---|\n${lines.join('\n')}\n`;
writeFileSync(new URL('../../../docs/FEATURE_COVERAGE.md', import.meta.url), out);
console.log(`PRD features: ${rows.length}; unmapped: ${missing.length}${missing.length ? ' -> ' + missing.join(', ') : ''}`);
if (missing.length || rows.length !== 131) process.exit(1);
