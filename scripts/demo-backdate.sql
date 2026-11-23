-- Spreads demo documents over the last ~11 months so dashboards have a history. Demo data only.
BEGIN;
ALTER TABLE journal_entry DISABLE TRIGGER trg_journal_entry_guard;
ALTER TABLE journal_entry DISABLE TRIGGER trg_period_lock;

-- target date per invoice: a spread over 0..330 days ago, newest first by number
CREATE TEMP TABLE inv_dates AS
SELECT i.id, i."salesOrderId", i."customerId",
       (current_date - (((row_number() OVER (ORDER BY i."createdAt")) * 37) % 330 + 2) * interval '1 day')::date AS d
FROM invoice i WHERE i.number IS NOT NULL AND i."invoiceType" IN ('standard','simplified');

UPDATE invoice i SET "issueDate" = d.d, "dueDate" = d.d + COALESCE((SELECT "paymentTermsDays" FROM customer c WHERE c.id = i."customerId"), 30),
       "createdAt" = d.d + interval '10 hours'
FROM inv_dates d WHERE i.id = d.id;
UPDATE journal_entry je SET "entryDate" = d.d FROM inv_dates d WHERE je."sourceType" = 'Invoice' AND je."sourceId" = d.id::text;
UPDATE sales_order so SET "orderDate" = d.d - 6, "createdAt" = d.d - interval '6 days' FROM inv_dates d WHERE so.id = d."salesOrderId";
UPDATE quotation q SET "createdAt" = d.d - interval '7 days', "sentAt" = d.d - interval '7 days' + interval '3 hours' FROM inv_dates d, sales_order so WHERE so.id = d."salesOrderId" AND q.id = so."quotationId";
UPDATE request r SET "createdAt" = d.d - interval '8 days', "slaDueAt" = d.d - interval '8 days' + interval '4 hours' FROM inv_dates d, sales_order so WHERE so.id = d."salesOrderId" AND r.id = so."requestId" AND r.id <> (SELECT id FROM request ORDER BY "createdAt" DESC LIMIT 1);
UPDATE delivery_note dn SET "plannedDate" = d.d, "deliveredAt" = d.d + interval '14 hours' FROM inv_dates d WHERE dn."salesOrderId" = d."salesOrderId";
UPDATE purchase_order po SET "orderDate" = d.d - 4, "expectedDate" = d.d - 2 FROM inv_dates d WHERE po."salesOrderId" = d."salesOrderId";

-- receipts follow their invoices by ~12 days
UPDATE receipt r SET "receiptDate" = LEAST(current_date, x.d + 12)
FROM (SELECT ra."receiptId" rid, d.d FROM receipt_allocation ra JOIN inv_dates d ON d.id = ra."invoiceId") x WHERE r.id = x.rid;
UPDATE journal_entry je SET "entryDate" = r."receiptDate" FROM receipt r WHERE je."sourceType" = 'Receipt' AND je."sourceId" = r.id::text;

-- GL entries for goods receipts / supplier bills follow the purchase order date
UPDATE journal_entry je SET "entryDate" = po."orderDate" + 2 FROM goods_receipt gr JOIN purchase_order po ON po.id = gr."poId" WHERE je."sourceType" = 'GoodsReceipt' AND je."sourceId" = gr.id::text;

-- sales targets for the current month so the gauge and sidebar widget have something to show
INSERT INTO sales_target (id, "companyId", scope, "userId", "periodStart", "periodEnd", "targetAmount", "updatedAt", version)
SELECT gen_random_uuid(), c.id, 'rep', u.id, date_trunc('month', current_date)::date, (date_trunc('month', current_date) + interval '1 month - 1 day')::date, 60000, now(), 1
FROM company c, "user" u WHERE u.email = 'sales@autocquick.test' AND NOT EXISTS (SELECT 1 FROM sales_target);

ALTER TABLE journal_entry ENABLE TRIGGER trg_journal_entry_guard;
ALTER TABLE journal_entry ENABLE TRIGGER trg_period_lock;
COMMIT;
