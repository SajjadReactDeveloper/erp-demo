// Raw SQL that Prisma cannot express: immutability, ledger balance, period lock, double-booking exclusion, search extensions.
import { PrismaClient } from '@prisma/client';
import { ASSISTANT_KEYS, tableOf } from '@erp/shared';

const prisma = new PrismaClient();

// Read-only role used by the AI assistant for free-form questions: it can only SELECT the analytic tables, never write.
const assistantRole = [
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_ro') THEN CREATE ROLE erp_ro NOLOGIN; END IF; END $$`,
  `GRANT erp_ro TO CURRENT_USER`,
  `REVOKE ALL ON ALL TABLES IN SCHEMA public FROM erp_ro`,
  `GRANT USAGE ON SCHEMA public TO erp_ro`,
  ...ASSISTANT_KEYS.map((k) => `GRANT SELECT ON ${tableOf(k)} TO erp_ro`),
];

const statements: string[] = [
  ...assistantRole,
  `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
  `CREATE EXTENSION IF NOT EXISTS btree_gist`,

  // generic append-only guard
  `CREATE OR REPLACE FUNCTION erp_block_mutation() RETURNS trigger AS $$
   BEGIN RAISE EXCEPTION '% is append-only (% blocked)', TG_TABLE_NAME, TG_OP; END; $$ LANGUAGE plpgsql`,
  ...['audit_log', 'stock_movement', 'zatca_submission', 'approval_action', 'price_history', 'proof_of_delivery', 'scan_event', 'delivery_event', 'loyalty_txn', 'reminder_log', 'ai_log'].flatMap((t) => [
    `DROP TRIGGER IF EXISTS trg_${t}_immutable ON ${t}`,
    `CREATE TRIGGER trg_${t}_immutable BEFORE UPDATE OR DELETE ON ${t} FOR EACH ROW EXECUTE FUNCTION erp_block_mutation()`,
  ]),

  // journal lines are immutable once posted; entries only allow status/reversal changes
  `DROP TRIGGER IF EXISTS trg_journal_line_immutable ON journal_line`,
  `CREATE TRIGGER trg_journal_line_immutable BEFORE UPDATE OR DELETE ON journal_line FOR EACH ROW EXECUTE FUNCTION erp_block_mutation()`,
  `CREATE OR REPLACE FUNCTION erp_journal_entry_guard() RETURNS trigger AS $$
   BEGIN
     IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'journal entries cannot be deleted'; END IF;
     IF NEW."entryDate" <> OLD."entryDate" OR NEW."totalDebit" <> OLD."totalDebit" OR NEW."entryNo" <> OLD."entryNo" THEN
       RAISE EXCEPTION 'posted journal entries are immutable (reverse instead)'; END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_journal_entry_guard ON journal_entry`,
  `CREATE TRIGGER trg_journal_entry_guard BEFORE UPDATE OR DELETE ON journal_entry FOR EACH ROW EXECUTE FUNCTION erp_journal_entry_guard()`,

  // balanced entry check at commit
  `CREATE OR REPLACE FUNCTION erp_journal_balanced() RETURNS trigger AS $$
   DECLARE d numeric; c numeric;
   BEGIN
     SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO d, c FROM journal_line WHERE "entryId" = NEW."entryId";
     IF d <> c THEN RAISE EXCEPTION 'Journal entry % is not balanced (debit % <> credit %)', NEW."entryId", d, c; END IF;
     RETURN NULL;
   END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_journal_balanced ON journal_line`,
  `CREATE CONSTRAINT TRIGGER trg_journal_balanced AFTER INSERT ON journal_line DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_journal_balanced()`,

  // closed period lock
  `CREATE OR REPLACE FUNCTION erp_period_lock() RETURNS trigger AS $$
   DECLARE st text;
   BEGIN
     SELECT status INTO st FROM fiscal_period WHERE "companyId" = NEW."companyId" AND NEW."entryDate" BETWEEN "startDate" AND "endDate" LIMIT 1;
     IF st IN ('closed','locked') THEN RAISE EXCEPTION 'Posting into a closed period is not allowed (%).', NEW."entryDate"; END IF;
     RETURN NEW;
   END; $$ LANGUAGE plpgsql`,
  `DROP TRIGGER IF EXISTS trg_period_lock ON journal_entry`,
  `CREATE TRIGGER trg_period_lock BEFORE INSERT ON journal_entry FOR EACH ROW EXECUTE FUNCTION erp_period_lock()`,

  // no double-booking of workshop bays
  `ALTER TABLE service_booking DROP CONSTRAINT IF EXISTS no_bay_overlap`,
  `ALTER TABLE service_booking ADD CONSTRAINT no_bay_overlap EXCLUDE USING gist ("bayId" WITH =, tsrange("startAt", "endAt") WITH &&) WHERE (status IN ('booked','checked_in','in_progress') AND "bayId" IS NOT NULL)`,

  // trigram indexes for fuzzy part / customer search
  `CREATE INDEX IF NOT EXISTS idx_part_number_trgm ON part USING gin ("partNumber" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_part_name_trgm ON part USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_xref_number_trgm ON part_xref USING gin ("xrefNumber" gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_customer_name_trgm ON customer USING gin (name gin_trgm_ops)`,
  `CREATE INDEX IF NOT EXISTS idx_vehicle_vin_trgm ON vehicle USING gin (vin gin_trgm_ops)`,
];

for (const s of statements) {
  try {
    await prisma.$executeRawUnsafe(s);
  } catch (e: any) {
    console.error('SQL failed:', s.slice(0, 80), '\n  ', e.message);
    process.exitCode = 1;
  }
}
console.log('post-push SQL applied');
await prisma.$disconnect();
