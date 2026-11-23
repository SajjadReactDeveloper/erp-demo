import { R, act } from './define';

export const procurement = [
  R('Rfq', 'procurement', 'RFQ', 'طلب عرض أسعار', 'number', 'send', [
    'number:s#*?', 'requestId:r=Request*', 'status:e=draft|sent|collecting|closed|awarded|cancelled*', 'deadline:T*', 'sentAt:T#', 'notes:t',
  ], {
    num: 'RFQ', req: true, f: ['PRC-01', 'PRC-03'], children: [['RfqLine', 'rfqId'], ['RfqSupplier', 'rfqId']], plural: ['RFQs', 'طلبات عروض الأسعار'],
    actions: [
      act('select_suppliers', 'Select suppliers', 'اختيار الموردين', ['draft']),
      act('send', 'Send to suppliers', 'إرسال للموردين', ['draft'], 'sent'),
      act('remind', 'Send reminders', 'إرسال تذكيرات', ['sent', 'collecting']),
      act('close', 'Close collection', 'إغلاق الاستلام', ['sent', 'collecting'], 'closed'),
      act('cancel', 'Cancel', 'إلغاء', ['draft', 'sent', 'collecting'], 'cancelled', { danger: true, confirm: true }),
    ],
  }),
  R('RfqLine', 'procurement', 'RFQ line', 'بند طلب الأسعار', 'partId', 'list', ['rfqId:r=Rfq!', 'requestLineId:r=RequestLine', 'partId:r=Part!*', 'qty:d!*', 'uomId:r=Uom', 'notes:s'], { req: true, f: ['PRC-01'] }),
  R('RfqSupplier', 'procurement', 'RFQ supplier', 'مورد الطلب', 'supplierId', 'user-check', [
    'rfqId:r=Rfq!', 'supplierId:r=Supplier!*', 'channel:e=portal|email|whatsapp*', 'status:e=invited|viewed|quoted|declined|no_response*', 'sentAt:T', 'respondedAt:T', 'remindersSent:i', 'accessToken:s#~',
  ], { portal: 'supplier', f: ['PRC-01', 'SUP-01'] }),
  R('SupplierQuote', 'procurement', 'Supplier quotation', 'عرض المورد', 'number', 'file-input', [
    'number:s#*?', 'rfqId:r=Rfq!*', 'supplierId:r=Supplier!*', 'status:e=draft|submitted|captured_review|confirmed|rejected*', 'source:e=portal|ai_capture|manual*', 'currency:s', 'validUntil:D', 'leadTimeDays:i',
    'notes:t', 'attachmentId:r=Attachment', 'aiConfidence:d#', 'totalAmount:d#*',
  ], {
    num: 'SQ', portal: 'supplier', req: true, f: ['PRC-02', 'SUP-01', 'SUP-02'], children: [['SupplierQuoteLine', 'supplierQuoteId']],
    actions: [
      act('submit', 'Submit', 'إرسال', ['draft'], 'submitted'),
      act('capture', 'AI capture from file', 'استخراج ذكي من ملف', ['draft', 'captured_review']),
      act('confirm', 'Confirm captured lines', 'تأكيد البنود المستخرجة', ['captured_review'], 'confirmed'),
      act('reject', 'Reject', 'رفض', ['submitted', 'captured_review'], 'rejected', { danger: true }),
    ],
  }),
  R('SupplierQuoteLine', 'procurement', 'Supplier quote line', 'بند عرض المورد', 'description', 'list', [
    'supplierQuoteId:r=SupplierQuote!', 'rfqLineId:r=RfqLine*', 'partId:r=Part', 'supplierPartNo:s*?', 'description:s*', 'qty:d!*', 'uomId:r=Uom', 'unitPrice:d!*', 'availability:e=in_stock|on_order|unavailable*',
    'leadTimeDays:i*', 'warranty:s', 'brandId:r=Brand', 'aiConfidence:d#', 'needsReview:b#*',
  ], { portal: 'supplier', req: true, f: ['PRC-02', 'SUP-01'] }),
  R('Award', 'procurement', 'Award', 'الترسية', 'number', 'award', ['number:s#*?', 'rfqId:r=Rfq!*', 'status:e=draft|confirmed*', 'awardedById:r=User#', 'notes:t'], {
    num: 'AWD', req: true, f: ['PRC-03', 'PRC-04'], children: [['AwardLine', 'awardId']],
    actions: [act('recommend', 'Auto-recommend best value', 'توصية أفضل قيمة', ['draft']), act('confirm', 'Confirm award', 'تأكيد الترسية', ['draft'], 'confirmed', { confirm: true })],
  }),
  R('AwardLine', 'procurement', 'Award line', 'بند الترسية', 'partId', 'list', [
    'awardId:r=Award!', 'rfqLineId:r=RfqLine*', 'supplierQuoteLineId:r=SupplierQuoteLine', 'supplierId:r=Supplier!*', 'partId:r=Part*', 'qty:d!*', 'unitCost:d!*', 'reason:s', 'score:d#*',
  ], { req: true, f: ['PRC-03', 'PRC-04'] }),
  R('PurchaseOrder', 'procurement', 'Purchase order', 'أمر الشراء', 'number', 'shopping-basket', [
    'number:s#*?', 'awardId:r=Award', 'requestId:r=Request', 'salesOrderId:r=SalesOrder', 'supplierId:r=Supplier!*',
    'status:e=draft|pending_approval|approved|sent|confirmed|partially_received|received|billed|closed|cancelled*', 'orderDate:D*', 'expectedDate:D*', 'currency:s', 'subtotal:d#', 'vatAmount:d#', 'total:d#*',
    'approvalId:r=ApprovalRequest#', 'sentAt:T#', 'confirmedAt:T#', 'revision:i#', 'notes:t',
  ], {
    num: 'PO', portal: 'supplier', req: true, f: ['PRC-05', 'SUP-03'], children: [['PoLine', 'poId']],
    actions: [
      act('submit', 'Submit for approval', 'إرسال للاعتماد', ['draft'], 'pending_approval'),
      act('send', 'Send to supplier', 'إرسال للمورد', ['approved'], 'sent'),
      act('confirm', 'Supplier confirms', 'تأكيد المورد', ['sent'], 'confirmed'),
      act('revise', 'Revise', 'تعديل', ['approved', 'sent', 'confirmed']),
      act('cancel', 'Cancel', 'إلغاء', ['draft', 'pending_approval', 'approved', 'sent'], 'cancelled', { danger: true, confirm: true }),
    ],
  }),
  R('PoLine', 'procurement', 'PO line', 'بند أمر الشراء', 'partId', 'list', [
    'poId:r=PurchaseOrder!', 'awardLineId:r=AwardLine', 'requestLineId:r=RequestLine', 'salesOrderLineId:r=SalesOrderLine', 'partId:r=Part!*', 'qty:d!*', 'receivedQty:d#*', 'billedQty:d#', 'unitCost:d!*', 'vatPct:d',
    'lineTotal:d#*', 'supplierConfirmedQty:d', 'confirmedDate:D', 'status:e=open|partially_received|received|cancelled*',
  ], { portal: 'supplier', req: true, f: ['PRC-05', 'SUP-03'] }),
  R('GoodsReceipt', 'procurement', 'Goods receipt', 'استلام بضاعة', 'number', 'package-check', [
    'number:s#*?', 'poId:r=PurchaseOrder!*', 'supplierId:r=Supplier*', 'status:e=draft|confirmed|cancelled*', 'receivedAt:T*', 'receivedById:r=User#', 'warehouseId:r=Warehouse', 'deliveryRef:s', 'notes:t',
  ], {
    num: 'GR', req: true, f: ['LOG-02', 'LOG-03', 'LOG-04'], children: [['GrLine', 'goodsReceiptId']],
    actions: [act('confirm', 'Confirm receipt', 'تأكيد الاستلام', ['draft'], 'confirmed', { confirm: true })],
  }),
  R('GrLine', 'procurement', 'Receipt line', 'بند الاستلام', 'partId', 'list', [
    'goodsReceiptId:r=GoodsReceipt!', 'poLineId:r=PoLine!*', 'partId:r=Part*', 'orderedQty:d*', 'receivedQty:d!*', 'damagedQty:d', 'shortQty:d#', 'excessQty:d#', 'wrongItem:b', 'notes:s', 'photos:j',
  ], { req: true, f: ['LOG-02', 'LOG-03', 'LOG-04'] }),
  R('SupplierBill', 'procurement', 'Supplier bill', 'فاتورة المورد', 'number', 'receipt', [
    'number:s#*?', 'docType:e=bill|debit_note*', 'supplierRef:s*?', 'poId:r=PurchaseOrder*', 'supplierId:r=Supplier!*', 'status:e=draft|variance|approved|posted|paid|cancelled*', 'billDate:D*', 'dueDate:D*',
    'subtotal:d#', 'vatAmount:d#', 'total:d#*', 'paidAmount:d#', 'matchStatus:e=pending|matched|variance|override*', 'journalEntryId:r=JournalEntry#', 'attachmentId:r=Attachment',
  ], {
    num: 'BILL', portal: 'supplier', req: true, f: ['PRC-06', 'FIN-04', 'SUP-03'], children: [['SupplierBillLine', 'billId']],
    actions: [
      act('match', 'Run 3-way match', 'مطابقة ثلاثية', ['draft', 'variance']),
      act('approve_variance', 'Approve variance', 'اعتماد الفرق', ['variance'], 'approved'),
      act('post', 'Post to ledger', 'ترحيل', ['draft', 'approved'], 'posted', { confirm: true }),
    ],
  }),
  R('SupplierBillLine', 'procurement', 'Bill line', 'بند الفاتورة', 'partId', 'list', [
    'billId:r=SupplierBill!', 'poLineId:r=PoLine', 'grLineId:r=GrLine', 'partId:r=Part*', 'qty:d!*', 'unitPrice:d!*', 'vatPct:d', 'lineTotal:d#*', 'variance:d#*', 'varianceReason:s',
  ], { portal: 'supplier', f: ['PRC-06'] }),
  R('SupplierClaim', 'procurement', 'Supplier claim', 'مطالبة مورد', 'number', 'alert-triangle', [
    'number:s#*?', 'supplierId:r=Supplier!*', 'poId:r=PurchaseOrder', 'goodsReceiptId:r=GoodsReceipt', 'partId:r=Part*', 'qty:d*', 'unitCost:d', 'kind:e=short|damaged|wrong_item*',
    'status:e=open|submitted|accepted|rejected|credited*', 'amount:d*', 'debitNoteId:r=SupplierBill#', 'notes:t',
  ], {
    num: 'CLM', req: true, f: ['PRC-07', 'LOG-04'],
    actions: [act('submit', 'Submit to supplier', 'إرسال للمورد', ['open'], 'submitted'), act('accept', 'Supplier accepted', 'قبول المورد', ['submitted'], 'accepted'), act('debit_note', 'Create debit note', 'إنشاء إشعار مدين', ['accepted'], 'credited')],
  }),
  R('SupplierScore', 'procurement', 'Supplier performance', 'أداء المورد', 'overall', 'gauge', [
    'supplierId:r=Supplier!*', 'periodStart:D*', 'periodEnd:D*', 'onTimePct:d*', 'priceScore:d*', 'defectRate:d*', 'responseHours:d*', 'overall:d*',
  ], { f: ['PRC-08'] }),
];

export const marketplace = [
  R('VendorApplication', 'marketplace', 'Vendor application', 'طلب تسجيل مورد', 'companyName', 'user-plus', [
    'companyName:s!*?', 'contactName:s!*', 'email:s!*?', 'phone:s*', 'vatNumber:s', 'crNumber:s', 'brands:j', 'categories:j', 'documents:j', 'status:e=submitted|under_review|approved|rejected*', 'supplierId:r=Supplier#', 'notes:t',
  ], { rel: 'R2', f: ['SUP-04'], actions: [act('approve', 'Approve & create supplier', 'اعتماد وإنشاء مورد', ['submitted', 'under_review'], 'approved'), act('reject', 'Reject', 'رفض', ['submitted', 'under_review'], 'rejected', { danger: true })] }),
  R('CatalogueItem', 'marketplace', 'Catalogue item', 'صنف الكتالوج', 'supplierPartNo', 'book-open', [
    'supplierId:r=Supplier!*', 'supplierPartNo:s!*?', 'description:s*?', 'brandId:r=Brand', 'price:d*', 'currency:s', 'availability:e=in_stock|on_order|unavailable*', 'leadTimeDays:i', 'minQty:d', 'partId:r=Part*',
    'matchStatus:e=unmatched|suggested|matched|rejected*', 'matchConfidence:d#', 'isActive:b',
  ], { rel: 'R2', portal: 'supplier', f: ['SUP-05', 'SUP-07', 'SUP-08'], unique: [['supplierId', 'supplierPartNo']] }),
  R('AvailabilityFeed', 'marketplace', 'Availability feed', 'خلاصة التوفر', 'kind', 'rss', [
    'supplierId:r=Supplier!*', 'kind:e=file|api*', 'url:s', 'schedule:s', 'status:e=active|paused|error*', 'lastRunAt:T#', 'lastError:t#', 'itemsProcessed:i#', 'staleAfterHours:i',
  ], { rel: 'R2', portal: 'supplier', f: ['SUP-06'], actions: [act('run', 'Run now', 'تشغيل الآن', ['active', 'error'])] }),
  R('CatalogueMatch', 'marketplace', 'Catalogue match', 'مطابقة الكتالوج', 'score', 'git-merge', [
    'catalogueItemId:r=CatalogueItem!*', 'candidatePartId:r=Part*', 'score:d*', 'status:e=pending|accepted|rejected*', 'reviewedById:r=User#',
  ], { rel: 'R2', f: ['SUP-08'], actions: [act('accept', 'Accept match', 'قبول المطابقة', ['pending'], 'accepted'), act('reject', 'Reject', 'رفض', ['pending'], 'rejected', { danger: true })] }),
];
