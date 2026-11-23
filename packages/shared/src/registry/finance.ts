import { R, act } from './define';

export const finance = [
  R('Account', 'finance', 'Account', 'الحساب', 'name', 'book', [
    'code:s!*?', 'name:s!*?', 'nameAr:s?', 'type:e=asset|liability|equity|revenue|expense|cogs*', 'parentId:r=Account', 'controlType:e=none|ar|ap|bank|cash|vat_in|vat_out|inventory|grni|in_transit|sales|cogs|expense|equity*',
    'allowPosting:b', 'isActive:b*',
  ], { f: ['FIN-01'], unique: [['companyId', 'code']] }),
  R('FiscalPeriod', 'finance', 'Fiscal period', 'الفترة المالية', 'name', 'calendar', ['name:s!*?', 'startDate:D!*', 'endDate:D!*', 'status:e=open|closed|locked*', 'closedById:r=User#'], {
    f: ['FIN-01'], actions: [act('close', 'Close period', 'إغلاق الفترة', ['open'], 'closed', { confirm: true }), act('reopen', 'Reopen', 'إعادة فتح', ['closed'], 'open')],
  }),
  R('JournalEntry', 'finance', 'Journal entry', 'قيد يومية', 'entryNo', 'notebook-pen', [
    'entryNo:s#*?', 'entryDate:D!*', 'periodId:r=FiscalPeriod#', 'branchId:r=Branch', 'sourceType:s*', 'sourceId:s', 'requestId:s', 'memo:s*?', 'status:e=posted|reversed*', 'reversalOfId:r=JournalEntry#', 'postedById:r=User#', 'totalDebit:d#*',
  ], {
    num: 'JV', f: ['FIN-01', 'FIN-02'], children: [['JournalLine', 'entryId']], noDelete: true,
    actions: [act('reverse', 'Reverse', 'عكس القيد', ['posted'], 'reversed', { danger: true, confirm: true })],
  }),
  R('JournalLine', 'finance', 'Journal line', 'بند القيد', 'accountId', 'list', ['entryId:r=JournalEntry!', 'accountId:r=Account!*', 'costCenterId:r=CostCenter', 'partnerType:s', 'partnerId:s', 'debit:d*', 'credit:d*', 'memo:s'], { f: ['FIN-01'] }),
  R('PostingRule', 'finance', 'Posting rule', 'قاعدة الترحيل', 'event', 'workflow', ['event:s!*?', 'side:e=debit|credit*', 'accountId:r=Account!*', 'amountExpr:s!*', 'seq:i', 'taxCode:s', 'isActive:b*'], { f: ['FIN-02'] }),
  R('Invoice', 'finance', 'Invoice', 'الفاتورة', 'number', 'receipt-text', [
    'number:s#*?', 'invoiceType:e=standard|simplified|credit_note|debit_note*', 'customerId:r=Customer*', 'salesOrderId:r=SalesOrder', 'deliveryNoteId:r=DeliveryNote', 'originalInvoiceId:r=Invoice',
    'status:e=draft|pending_zatca|cleared|reported|rejected|partially_paid|paid|cancelled*', 'issueDate:D*', 'dueDate:D*', 'subtotal:d#', 'discountTotal:d#', 'vatAmount:d#', 'total:d#*', 'paidAmount:d#', 'balance:d#*',
    'currency:s', 'zatcaUuid:s#', 'zatcaHash:s#', 'zatcaIcv:i#', 'zatcaPih:s#', 'zatcaQr:t#~', 'zatcaXml:t#~', 'zatcaStatus:s#', 'journalEntryId:r=JournalEntry#', 'branchId:r=Branch', 'posSaleId:s', 'notes:t',
  ], {
    num: 'INV', portal: 'customer', req: true, f: ['FIN-03', 'FIN-06', 'CPT-05'], children: [['InvoiceLine', 'invoiceId']], noDelete: true,
    actions: [
      act('issue', 'Issue (post + ZATCA)', 'إصدار (ترحيل + زاتكا)', ['draft'], 'pending_zatca', { confirm: true }),
      act('resubmit', 'Resubmit to ZATCA', 'إعادة الإرسال لزاتكا', ['rejected', 'pending_zatca']),
      act('credit_note', 'Create credit note', 'إنشاء إشعار دائن', ['cleared', 'reported', 'partially_paid', 'paid']),
      act('print', 'Print / PDF', 'طباعة / PDF'),
    ],
  }),
  R('InvoiceLine', 'finance', 'Invoice line', 'بند الفاتورة', 'description', 'list', [
    'invoiceId:r=Invoice!', 'partId:r=Part', 'description:s!*', 'qty:d!*', 'unitPrice:d!*', 'discount:d', 'taxCodeId:r=TaxCode', 'vatPct:d', 'vatAmount:d#', 'lineTotal:d#*', 'salesOrderLineId:r=SalesOrderLine', 'deliveryLineId:r=DeliveryLine', 'cost:d',
  ], { portal: 'customer', req: true, f: ['FIN-03'] }),
  R('Receipt', 'finance', 'Customer receipt', 'سند قبض', 'number', 'hand-coins', [
    'number:s#*?', 'customerId:r=Customer!*', 'method:e=cash|transfer|cheque|card|online*', 'amount:d!*', 'unappliedAmount:d#*', 'receiptDate:D*', 'bankAccountId:r=BankAccount', 'reference:s', 'chequeId:r=Cheque',
    'status:e=draft|posted|reversed*', 'journalEntryId:r=JournalEntry#', 'gatewayTxnId:s#',
  ], {
    num: 'RC', portal: 'customer', f: ['CRD-09', 'FIN-03', 'CPT-06'], children: [['ReceiptAllocation', 'receiptId']],
    actions: [act('post', 'Post & allocate', 'ترحيل وتخصيص', ['draft'], 'posted'), act('auto_allocate', 'Auto-allocate (oldest first)', 'تخصيص تلقائي', ['posted']), act('reverse', 'Reverse', 'عكس', ['posted'], 'reversed', { danger: true, confirm: true })],
  }),
  R('ReceiptAllocation', 'finance', 'Receipt allocation', 'تخصيص السند', 'amount', 'split', ['receiptId:r=Receipt!', 'invoiceId:r=Invoice!*', 'amount:d!*'], { f: ['CRD-09'] }),
  R('Payment', 'finance', 'Supplier payment', 'دفعة مورد', 'number', 'banknote', [
    'number:s#*?', 'supplierId:r=Supplier!*', 'method:e=cash|transfer|cheque*', 'amount:d!*', 'paymentDate:D*', 'bankAccountId:r=BankAccount', 'reference:s', 'status:e=draft|posted|reversed*', 'journalEntryId:r=JournalEntry#', 'paymentRun:s',
  ], { num: 'PAY', f: ['FIN-04'], children: [['PaymentAllocation', 'paymentId']], actions: [act('post', 'Post', 'ترحيل', ['draft'], 'posted', { confirm: true }), act('reverse', 'Reverse', 'عكس', ['posted'], 'reversed', { danger: true, confirm: true })] }),
  R('PaymentAllocation', 'finance', 'Payment allocation', 'تخصيص الدفعة', 'amount', 'split', ['paymentId:r=Payment!', 'billId:r=SupplierBill!*', 'amount:d!*'], { f: ['FIN-04'] }),
  R('BankAccount', 'finance', 'Bank / cash account', 'حساب بنكي / نقدي', 'name', 'landmark', [
    'name:s!*?', 'bankName:s*', 'accountNo:s', 'iban:s', 'type:e=bank|cash|petty_cash*', 'accountId:r=Account*', 'currency:s', 'openingBalance:d',
  ], { f: ['FIN-07'] }),
  R('BankStatement', 'finance', 'Bank statement', 'كشف حساب بنكي', 'fileName', 'file-spreadsheet', [
    'bankAccountId:r=BankAccount!*', 'fileName:s*', 'periodStart:D', 'periodEnd:D', 'status:e=imported|reconciling|reconciled*', 'lineCount:i#',
  ], { f: ['FIN-07'], children: [['BankStatementLine', 'statementId']], actions: [act('auto_match', 'Auto-match', 'مطابقة تلقائية', ['imported', 'reconciling'], 'reconciling'), act('finish', 'Mark reconciled', 'إنهاء التسوية', ['reconciling'], 'reconciled')] }),
  R('BankStatementLine', 'finance', 'Statement line', 'بند الكشف', 'description', 'list', [
    'statementId:r=BankStatement!', 'txnDate:D*', 'description:s*?', 'reference:s?', 'debit:d*', 'credit:d*', 'balance:d', 'matchStatus:e=unmatched|matched|ignored*', 'matchedType:s', 'matchedId:s',
  ], { f: ['FIN-07'] }),
  R('Cheque', 'finance', 'Cheque', 'شيك', 'number', 'ticket-check', [
    'number:s!*?', 'direction:e=received|issued*', 'partnerType:e=customer|supplier', 'partnerId:s', 'bankName:s*', 'amount:d!*', 'chequeDate:D*', 'dueDate:D*', 'status:e=held|deposited|cleared|bounced|cancelled*', 'isPostDated:b*',
  ], { f: ['FIN-07'], actions: [act('deposit', 'Deposit', 'إيداع', ['held'], 'deposited'), act('clear', 'Mark cleared', 'تم التحصيل', ['deposited'], 'cleared'), act('bounce', 'Bounced', 'مرتجع', ['deposited'], 'bounced', { danger: true })] }),
  R('ExpenseCategory', 'finance', 'Expense category', 'فئة المصروف', 'name', 'folder', ['name:s!*?', 'nameAr:s', 'accountId:r=Account*'], { plural: ['Expense categories', 'فئات المصروفات'], f: ['FIN-08'] }),
  R('Expense', 'finance', 'Expense', 'المصروف', 'number', 'wallet-cards', [
    'number:s#*?', 'categoryId:r=ExpenseCategory!*', 'costCenterId:r=CostCenter*', 'expenseDate:D*', 'amount:d!*', 'vatAmount:d', 'description:s*?', 'method:e=cash|bank|petty_cash|payable*', 'supplierId:r=Supplier', 'bankAccountId:r=BankAccount',
    'status:e=draft|pending_approval|approved|posted|rejected*', 'approvalId:r=ApprovalRequest#', 'journalEntryId:r=JournalEntry#', 'attachmentId:r=Attachment',
  ], { num: 'EXP', f: ['FIN-08'], actions: [act('submit', 'Submit', 'إرسال', ['draft'], 'pending_approval'), act('post', 'Post', 'ترحيل', ['draft', 'approved'], 'posted')] }),
  R('Budget', 'finance', 'Budget', 'الميزانية', 'amount', 'piggy-bank', ['costCenterId:r=CostCenter*', 'categoryId:r=ExpenseCategory*', 'periodStart:D!*', 'periodEnd:D!*', 'amount:d!*'], { f: ['FIN-08', 'RPT-04'] }),
  R('ZatcaCredential', 'finance', 'ZATCA credential (EGS)', 'اعتماد زاتكا', 'egsName', 'key-round', [
    'egsName:s!*?', 'branchId:r=Branch', 'environment:e=sandbox|simulation|production*', 'status:e=pending|compliance|production|expired*', 'csr:t#', 'privateKey:t#~', 'certificate:t#', 'csid:s#', 'issuedAt:D#', 'expiresAt:D*', 'icvCounter:i#', 'lastHash:s#',
  ], { f: ['FIN-06'], actions: [act('generate_csr', 'Generate CSR & keys', 'إنشاء الطلب والمفاتيح', ['pending']), act('compliance', 'Run compliance checks', 'فحوصات الامتثال', ['pending', 'compliance'], 'compliance'), act('go_production', 'Get production CSID', 'الحصول على CSID للإنتاج', ['compliance'], 'production')] }),
  R('ZatcaSubmission', 'finance', 'ZATCA submission', 'إرسال زاتكا', 'kind', 'cloud-upload', [
    'invoiceId:r=Invoice!*', 'kind:e=clearance|reporting|compliance*', 'status:e=pending|accepted|accepted_warnings|rejected|error*', 'attempt:i*', 'requestXml:t~', 'responseBody:j', 'warnings:j', 'errors:j', 'submittedAt:T*',
  ], { immutable: true, f: ['FIN-06'] }),
  R('DaftraSyncLog', 'finance', 'Daftra sync log', 'سجل مزامنة دفترة', 'entity', 'refresh-cw', ['entity:s!*', 'entityId:s*', 'direction:e=push|import*', 'externalId:s*', 'status:e=ok|error|skipped*', 'error:t', 'payload:j'], {
    f: ['FIN-10'], immutable: true, actions: [act('retry', 'Retry', 'إعادة المحاولة', ['error'])],
  }),
];

export const credit = [
  R('CreditProfile', 'credit', 'Credit profile', 'الملف الائتماني', 'customerId', 'badge-dollar-sign', [
    'customerId:r=Customer!*', 'limitAmount:d!*', 'termsDays:i*', 'tier:s', 'guarantees:t', 'graceDays:i', 'status:e=active|suspended*', 'documents:j', 'notes:t', 'reviewedAt:D', 'exposure:d#*', 'overdueAmount:d#*', 'lastCheckedAt:T#',
  ], { portal: 'customer', f: ['CRD-01', 'CRD-02'], unique: [['customerId']], actions: [act('recompute', 'Recompute exposure', 'إعادة احتساب الانكشاف', ['active', 'suspended'])] }),
  R('CreditHold', 'credit', 'Credit hold', 'إيقاف ائتماني', 'reason', 'octagon-alert', [
    'customerId:r=Customer!*', 'reason:e=limit|overdue|no_profile|manual*', 'status:e=held|released*', 'refType:s', 'refId:s', 'amount:d*', 'exposureAtHold:d', 'heldAt:T*', 'releasedById:r=User#', 'releasedAt:T#', 'releaseReason:t', 'approvalId:r=ApprovalRequest#',
  ], { f: ['CRD-03', 'CRD-04'], actions: [act('request_release', 'Request release', 'طلب الإفراج', ['held']), act('release', 'Release (authorised)', 'إفراج', ['held'], 'released', { confirm: true })] }),
  R('PromiseToPay', 'credit', 'Promise to pay', 'وعد بالدفع', 'promisedDate', 'handshake', [
    'customerId:r=Customer!*', 'invoiceId:r=Invoice', 'promisedDate:D!*', 'amount:d!*', 'status:e=open|kept|broken|cancelled*', 'collectorId:r=User*', 'note:t',
  ], { f: ['CRD-08'], actions: [act('kept', 'Mark kept', 'تم الوفاء', ['open'], 'kept'), act('broken', 'Mark broken', 'لم يتم الوفاء', ['open'], 'broken', { danger: true })] }),
  R('CollectionActivity', 'credit', 'Collection activity', 'نشاط تحصيل', 'kind', 'phone', [
    'customerId:r=Customer!*', 'invoiceId:r=Invoice', 'kind:e=call|visit|whatsapp|email|sms|note*', 'outcome:e=reached|no_answer|promise|dispute|paid|escalated*', 'note:t', 'collectorId:r=User*', 'nextActionDate:D*',
  ], { plural: ['Collection activities', 'أنشطة التحصيل'], f: ['CRD-08'] }),
  R('ReminderRule', 'credit', 'Reminder rule', 'قاعدة التذكير', 'offsetDays', 'alarm-clock', ['offsetDays:i!*', 'channel:e=whatsapp|sms|email*', 'templateKey:s!*', 'escalateToRoleId:r=Role', 'isActive:b*'], { f: ['CRD-07'] }),
  R('ReminderLog', 'credit', 'Reminder log', 'سجل التذكيرات', 'message', 'mail', [
    'invoiceId:r=Invoice!*', 'customerId:r=Customer*', 'offsetDays:i*', 'channel:s*', 'status:e=queued|sent|failed|cancelled*', 'sentAt:T', 'templateKey:s', 'message:t',
  ], { immutable: true, f: ['CRD-07'], unique: [['invoiceId', 'offsetDays', 'channel']] }),
  R('CreditAlert', 'credit', 'Credit alert', 'تنبيه ائتماني', 'message', 'siren', [
    'customerId:r=Customer!*', 'kind:e=late_trend|rising_overdue|limit_usage|broken_promise*', 'severity:e=info|warning|critical*', 'message:s!*', 'data:j', 'status:e=open|ack|resolved*', 'assignedToId:r=User*',
  ], { f: ['CRD-10'], actions: [act('ack', 'Acknowledge', 'إقرار', ['open'], 'ack'), act('resolve', 'Resolve', 'حل', ['open', 'ack'], 'resolved')] }),
];
