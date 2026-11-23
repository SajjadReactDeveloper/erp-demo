import { R, act } from './define';

export const sales = [
  R('Request', 'sales', 'Customer request', 'طلب العميل', 'number', 'inbox', [
    'number:s#*?', 'customerId:r=Customer!*', 'vehicleId:r=Vehicle', 'vin:s?', 'channel:e=portal|phone|whatsapp|email|walkin*', 'status:e=draft|submitted|in_sourcing|quoted|partially_approved|approved|ordered|lost|expired|cancelled*',
    'urgency:e=normal|urgent|critical*', 'requiredDate:D*', 'assignedToId:r=User*', 'slaDueAt:T*', 'branchId:r=Branch', 'notes:t',
  ], {
    num: 'REQ', portal: 'customer', req: true, f: ['SAL-01', 'CPT-01', 'CPT-04'], children: [['RequestLine', 'requestId']],
    actions: [
      act('submit', 'Submit', 'إرسال', ['draft'], 'submitted'),
      act('match', 'AI part matching', 'مطابقة ذكية للقطع', ['submitted', 'in_sourcing']),
      act('create_rfq', 'Create RFQ', 'إنشاء طلب أسعار', ['submitted', 'in_sourcing'], 'in_sourcing'),
      act('assign', 'Assign', 'إسناد', ['submitted', 'in_sourcing']),
      act('cancel', 'Cancel', 'إلغاء', ['draft', 'submitted', 'in_sourcing'], 'cancelled', { danger: true, confirm: true }),
    ],
  }),
  R('RequestLine', 'sales', 'Request line', 'بند الطلب', 'customerText', 'list', [
    'requestId:r=Request!', 'lineNo:i*', 'partId:r=Part*', 'customerText:s!*?', 'partNumberText:s?', 'qty:d!*', 'uomId:r=Uom', 'matchStatus:e=unmatched|suggested|confirmed*', 'matchConfidence:d#',
    'photos:j', 'notes:s', 'status:e=open|quoted|approved|lost|ordered*', 'lostReasonId:r=LostReason',
  ], { portal: 'customer', req: true, f: ['SAL-02', 'CPT-01'] }),
  R('Quotation', 'sales', 'Quotation', 'عرض السعر', 'number', 'file-text', [
    'number:s#*?', 'requestId:r=Request*', 'customerId:r=Customer!*', 'status:e=draft|pending_margin_approval|approved_internal|sent|viewed|approved_full|approved_partial|rejected|expired|cancelled*',
    'validUntil:D*', 'currency:s', 'subtotal:d#', 'vatAmount:d#', 'total:d#*', 'marginPct:d#*', 'minMarginBreached:b#*', 'sentAt:T#', 'viewedAt:T#', 'approvedAt:T#', 'approvalId:r=ApprovalRequest#', 'channel:e=portal|whatsapp|email', 'notes:t',
  ], {
    num: 'QT', portal: 'customer', req: true, f: ['SAL-03', 'SAL-04', 'SAL-05', 'SAL-06', 'CPT-03'], children: [['QuotationLine', 'quotationId']],
    actions: [
      act('build', 'Build from award', 'بناء من الترسية', ['draft']),
      act('recalc', 'Recalculate', 'إعادة الحساب', ['draft', 'pending_margin_approval']),
      act('submit_margin', 'Request margin approval', 'طلب اعتماد الهامش', ['draft'], 'pending_margin_approval'),
      act('send', 'Send to customer', 'إرسال للعميل', ['draft', 'approved_internal'], 'sent'),
      act('approve', 'Customer approves', 'موافقة العميل', ['sent', 'viewed']),
      act('reject', 'Customer rejects', 'رفض العميل', ['sent', 'viewed'], 'rejected', { danger: true }),
      act('create_order', 'Create sales order', 'إنشاء أمر بيع', ['approved_full', 'approved_partial']),
    ],
  }),
  R('QuotationLine', 'sales', 'Quotation line', 'بند عرض السعر', 'partId', 'list', [
    'quotationId:r=Quotation!', 'requestLineId:r=RequestLine*', 'partId:r=Part!*', 'supplierId:r=Supplier', 'qty:d!*', 'unitCost:d!', 'unitPrice:d!*', 'discountPct:d', 'marginPct:d#*', 'vatPct:d', 'lineTotal:d#*',
    'leadTimeDays:i', 'warranty:s', 'isAlternative:b*', 'alternativeOfId:r=QuotationLine', 'status:e=pending|approved|rejected*', 'lostReasonId:r=LostReason', 'belowMin:b#*', 'ruleId:r=PriceRule#',
  ], { portal: 'customer', req: true, f: ['SAL-03', 'SAL-04', 'SAL-06', 'SAL-10'] }),
  R('SalesOrder', 'sales', 'Sales order', 'أمر البيع', 'number', 'shopping-bag', [
    'number:s#*?', 'quotationId:r=Quotation', 'requestId:r=Request', 'customerId:r=Customer!*', 'status:e=draft|credit_check|on_hold|confirmed|partially_delivered|delivered|invoiced|closed|cancelled*',
    'orderDate:D*', 'total:d#*', 'deliveryAddressId:r=CustomerAddress', 'holdId:r=CreditHold#', 'poNumber:s', 'notes:t',
  ], {
    num: 'SO', portal: 'customer', req: true, f: ['SAL-07', 'SAL-08', 'CPT-04'], children: [['SalesOrderLine', 'salesOrderId']],
    actions: [
      act('confirm', 'Confirm (credit check)', 'تأكيد (فحص الائتمان)', ['draft', 'on_hold'], 'confirmed'),
      act('create_pos', 'Create purchase orders', 'إنشاء أوامر الشراء', ['confirmed', 'partially_delivered']),
      act('plan_delivery', 'Plan delivery', 'تخطيط التسليم', ['confirmed', 'partially_delivered']),
      act('cancel', 'Cancel', 'إلغاء', ['draft', 'on_hold', 'confirmed'], 'cancelled', { danger: true, confirm: true }),
    ],
  }),
  R('SalesOrderLine', 'sales', 'Sales order line', 'بند أمر البيع', 'partId', 'list', [
    'salesOrderId:r=SalesOrder!', 'requestLineId:r=RequestLine', 'quotationLineId:r=QuotationLine', 'partId:r=Part!*', 'supplierId:r=Supplier', 'qty:d!*', 'deliveredQty:d#*', 'invoicedQty:d#', 'unitPrice:d!*',
    'vatPct:d', 'lineTotal:d#*', 'unitCost:d', 'backorderQty:d#*', 'status:e=open|partially_delivered|delivered|cancelled*',
  ], { portal: 'customer', req: true, f: ['SAL-07', 'SAL-08'] }),
  R('ReturnAuth', 'sales', 'Return authorisation', 'إذن إرجاع', 'number', 'undo-2', [
    'number:s#*?', 'customerId:r=Customer!*', 'invoiceId:r=Invoice*', 'salesOrderId:r=SalesOrder', 'status:e=requested|approved|rejected|received|supplier_returned|credited|closed*',
    'reason:e=wrong_part|damaged|not_needed|warranty|other*', 'resolution:e=credit_note|restock|write_off|supplier_return', 'notes:t', 'requestedVia:e=portal|staff', 'creditNoteId:r=Invoice#',
  ], {
    num: 'RMA', portal: 'customer', req: true, f: ['SAL-09', 'CPT-07'], children: [['ReturnLine', 'returnAuthId']],
    actions: [
      act('approve', 'Approve return', 'اعتماد الإرجاع', ['requested'], 'approved'), act('reject', 'Reject', 'رفض', ['requested'], 'rejected', { danger: true }),
      act('receive', 'Mark received', 'تم الاستلام', ['approved'], 'received'), act('credit', 'Issue credit note', 'إصدار إشعار دائن', ['received'], 'credited'),
      act('supplier_return', 'Return to supplier', 'إرجاع للمورد', ['received'], 'supplier_returned'),
    ],
  }),
  R('ReturnLine', 'sales', 'Return line', 'بند الإرجاع', 'partId', 'list', ['returnAuthId:r=ReturnAuth!', 'invoiceLineId:r=InvoiceLine*', 'partId:r=Part*', 'qty:d!*', 'reason:s', 'photos:j', 'condition:e=good|damaged'], { portal: 'customer', f: ['SAL-09', 'CPT-07'] }),
  R('DiscountRequest', 'sales', 'Discount / override', 'خصم / تعديل سعر', 'type', 'badge-percent', [
    'quotationLineId:r=QuotationLine*', 'type:e=discount|override*', 'pct:d', 'amount:d', 'reason:t!', 'status:e=pending|approved|rejected*', 'approvalId:r=ApprovalRequest#',
  ], { f: ['SAL-10'], actions: [act('submit', 'Submit for approval', 'إرسال للاعتماد', ['pending'])] }),
];
