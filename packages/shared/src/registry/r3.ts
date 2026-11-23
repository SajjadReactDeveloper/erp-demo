import { R, act } from './define';

export const inventory = [
  R('StockBin', 'inventory', 'Stock bin', 'موقع التخزين', 'code', 'archive', ['warehouseId:r=Warehouse!*', 'code:s!*?', 'description:s'], { rel: 'R3', f: ['INV-01'] }),
  R('Batch', 'inventory', 'Batch', 'الدفعة', 'batchNo', 'layers', ['partId:r=Part!*', 'batchNo:s!*?', 'mfgDate:D', 'expiryDate:D*', 'supplierId:r=Supplier'], { rel: 'R3', f: ['INV-05'] }),
  R('Serial', 'inventory', 'Serial number', 'الرقم التسلسلي', 'serialNo', 'barcode', [
    'partId:r=Part!*', 'serialNo:s!*?', 'batchId:r=Batch', 'status:e=in_stock|sold|returned|claimed|scrapped*', 'warehouseId:r=Warehouse', 'customerId:r=Customer', 'soldAt:D', 'warrantyUntil:D',
  ], { rel: 'R3', f: ['INV-05', 'POS-06'] }),
  R('StockMovement', 'inventory', 'Stock movement', 'حركة مخزون', 'kind', 'move', [
    'partId:r=Part!*', 'warehouseId:r=Warehouse!*', 'binId:r=StockBin', 'kind:e=receipt|issue|transfer_out|transfer_in|adjustment|count_adjust|sale|return*', 'qty:d!*', 'unitCost:d', 'refType:s', 'refId:s', 'batchId:r=Batch', 'serialId:r=Serial', 'movedAt:T*', 'notes:s',
  ], { rel: 'R3', immutable: true, f: ['INV-02', 'FIN-11'], order: 'movedAt:desc' }),
  R('StockCount', 'inventory', 'Stock count', 'جرد المخزون', 'number', 'clipboard-check', [
    'number:s#*?', 'warehouseId:r=Warehouse!*', 'kind:e=cycle|full*', 'status:e=open|counting|review|approved|posted*', 'startedAt:T', 'approvedById:r=User#',
  ], {
    num: 'CNT', rel: 'R3', f: ['INV-03'], children: [['StockCountLine', 'stockCountId']],
    actions: [act('generate', 'Generate count sheet', 'إنشاء كشف الجرد', ['open']), act('review', 'Submit for review', 'إرسال للمراجعة', ['counting'], 'review'), act('approve', 'Approve & post adjustments', 'اعتماد وترحيل التسويات', ['review'], 'posted', { confirm: true })],
  }),
  R('StockCountLine', 'inventory', 'Count line', 'بند الجرد', 'partId', 'list', ['stockCountId:r=StockCount!', 'partId:r=Part!*', 'binId:r=StockBin', 'expectedQty:d*', 'countedQty:d*', 'variance:d#*', 'batchId:r=Batch'], { rel: 'R3', f: ['INV-03'] }),
  R('ReorderRule', 'inventory', 'Reorder rule', 'قاعدة إعادة الطلب', 'partId', 'repeat', [
    'partId:r=Part!*', 'warehouseId:r=Warehouse*', 'branchId:r=Branch', 'minQty:d!*', 'maxQty:d!*', 'reorderQty:d', 'leadTimeDays:i', 'source:e=manual|ai*', 'isActive:b*',
  ], { rel: 'R3', f: ['INV-04', 'PRC-09'] }),
  R('ReorderSuggestion', 'inventory', 'Reorder suggestion', 'اقتراح إعادة طلب', 'partId', 'lightbulb', [
    'partId:r=Part!*', 'warehouseId:r=Warehouse*', 'suggestedQty:d!*', 'reason:s*', 'status:e=open|accepted|dismissed|ordered*', 'aiModel:s', 'rfqId:r=Rfq#',
  ], { rel: 'R3', f: ['INV-06', 'PRC-09'], actions: [act('accept', 'Accept & create RFQ', 'قبول وإنشاء طلب أسعار', ['open'], 'ordered'), act('dismiss', 'Dismiss', 'تجاهل', ['open'], 'dismissed')] }),
];

export const pos = [
  R('PosTerminal', 'pos', 'POS terminal', 'جهاز نقطة بيع', 'name', 'monitor-smartphone', ['name:s!*?', 'branchId:r=Branch*', 'warehouseId:r=Warehouse', 'deviceId:r=Device', 'status:e=active|inactive*'], { rel: 'R3', f: ['POS-01'] }),
  R('PosShift', 'pos', 'Shift', 'الوردية', 'status', 'clock', [
    'terminalId:r=PosTerminal!*', 'cashierId:r=User*', 'openedAt:T*', 'closedAt:T#', 'openingCash:d!*', 'expectedCash:d#', 'countedCash:d', 'variance:d#*', 'status:e=open|closed|variance_pending|approved*', 'approvedById:r=User#',
  ], { rel: 'R3', f: ['POS-04'], actions: [act('close', 'Close shift (cash-up)', 'إغلاق الوردية', ['open'], 'closed'), act('approve_variance', 'Approve variance', 'اعتماد الفرق', ['variance_pending'], 'approved')] }),
  R('PosSale', 'pos', 'POS sale', 'عملية بيع', 'number', 'shopping-cart', [
    'number:s#*?', 'shiftId:r=PosShift', 'terminalId:r=PosTerminal*', 'customerId:r=Customer', 'vehicleId:r=Vehicle', 'status:e=open|paid|voided|refunded*', 'subtotal:d#', 'vatAmount:d#', 'total:d#*', 'paidAmount:d#', 'invoiceId:r=Invoice#', 'soldAt:T*',
  ], {
    num: 'POS', rel: 'R3', f: ['POS-01', 'POS-02', 'POS-03'], children: [['PosSaleLine', 'posSaleId'], ['PosPayment', 'posSaleId']],
    actions: [act('pay', 'Complete payment', 'إتمام الدفع', ['open'], 'paid'), act('void', 'Void', 'إلغاء', ['open'], 'voided', { danger: true }), act('refund', 'Refund', 'استرجاع', ['paid'], 'refunded', { danger: true, confirm: true })],
  }),
  R('PosSaleLine', 'pos', 'Sale line', 'بند البيع', 'description', 'list', ['posSaleId:r=PosSale!', 'partId:r=Part*', 'description:s*', 'qty:d!*', 'unitPrice:d!*', 'vatPct:d', 'lineTotal:d#*', 'serialId:r=Serial', 'batchId:r=Batch'], { rel: 'R3', f: ['POS-01'] }),
  R('PosPayment', 'pos', 'Payment', 'الدفع', 'method', 'credit-card', ['posSaleId:r=PosSale!', 'method:e=cash|mada|card|voucher|points*', 'amount:d!*', 'reference:s', 'status:e=ok|failed|refunded*'], { rel: 'R3', f: ['POS-03'] }),
  R('TyreSpec', 'pos', 'Tyre spec', 'مواصفات الإطار', 'partId', 'circle-dot', [
    'partId:r=Part!*', 'width:i!*', 'aspect:i!*', 'rim:i!*', 'loadIndex:s*', 'speedRating:s*', 'dotCode:s', 'season:e=summer|winter|all', 'setOf:i',
  ], { rel: 'R3', f: ['POS-05'] }),
  R('BatteryUnit', 'pos', 'Battery unit', 'وحدة بطارية', 'serialNo', 'battery-charging', [
    'partId:r=Part!*', 'serialNo:s!*?', 'capacityAh:i', 'voltage:i', 'cca:i', 'warrantyMonths:i', 'soldToCustomerId:r=Customer', 'vehicleId:r=Vehicle', 'soldAt:D', 'warrantyUntil:D*', 'status:e=in_stock|sold|claimed|replaced*',
  ], { rel: 'R3', f: ['POS-06'], actions: [act('register_warranty', 'Register warranty', 'تسجيل الضمان', ['in_stock', 'sold'], 'sold')] }),
  R('WarrantyClaim', 'pos', 'Warranty claim', 'مطالبة ضمان', 'reason', 'shield-alert', [
    'batteryUnitId:r=BatteryUnit!*', 'customerId:r=Customer*', 'reason:t!', 'status:e=open|inspected|approved|rejected|replaced*', 'resolution:s',
  ], { rel: 'R3', f: ['POS-06'], actions: [act('approve', 'Approve', 'اعتماد', ['open', 'inspected'], 'approved'), act('reject', 'Reject', 'رفض', ['open', 'inspected'], 'rejected', { danger: true })] }),
];

export const workshop = [
  R('ServiceType', 'workshop', 'Service type', 'نوع الخدمة', 'name', 'list-todo', ['name:s!*?', 'nameAr:s', 'durationMin:i!*', 'price:d*', 'intervalKm:i', 'intervalMonths:i'], { rel: 'R3', f: ['WSH-01', 'VEH-03'] }),
  R('Bay', 'workshop', 'Service bay', 'محطة الخدمة', 'name', 'square', ['name:s!*?', 'branchId:r=Branch*', 'isActive:b*'], { rel: 'R3', f: ['WSH-01', 'WSH-03'] }),
  R('ServiceBooking', 'workshop', 'Service booking', 'حجز خدمة', 'number', 'calendar-check', [
    'number:s#*?', 'customerId:r=Customer!*', 'vehicleId:r=Vehicle*', 'serviceTypeId:r=ServiceType!*', 'bayId:r=Bay*', 'startAt:T!*', 'endAt:T!', 'status:e=booked|checked_in|in_progress|completed|cancelled|no_show*', 'source:e=online|counter', 'notes:t',
  ], {
    num: 'BK', rel: 'R3', portal: 'customer', f: ['WSH-01'],
    actions: [act('check_in', 'Check in (create job card)', 'تسجيل الوصول', ['booked'], 'checked_in'), act('cancel', 'Cancel', 'إلغاء', ['booked'], 'cancelled', { danger: true }), act('no_show', 'No show', 'لم يحضر', ['booked'], 'no_show')],
  }),
  R('JobCard', 'workshop', 'Job card', 'أمر العمل', 'number', 'clipboard-list', [
    'number:s#*?', 'bookingId:r=ServiceBooking', 'customerId:r=Customer!*', 'vehicleId:r=Vehicle*', 'mileageIn:i', 'status:e=checked_in|inspection|awaiting_approval|approved|in_progress|completed|invoiced*', 'inspectionNotes:t', 'inspection:j',
    'customerApprovedAt:T#', 'invoiceId:r=Invoice#', 'technicianId:r=User*', 'totalParts:d#', 'totalLabour:d#', 'total:d#*',
  ], {
    num: 'JC', rel: 'R3', portal: 'customer', f: ['WSH-02', 'WSH-04', 'WSH-05'], children: [['JobCardLine', 'jobCardId']],
    actions: [
      act('request_approval', 'Request customer approval', 'طلب موافقة العميل', ['inspection'], 'awaiting_approval'), act('approve', 'Customer approves', 'موافقة العميل', ['awaiting_approval'], 'approved'),
      act('start', 'Start work', 'بدء العمل', ['approved'], 'in_progress'), act('complete', 'Complete', 'إنهاء', ['in_progress'], 'completed'), act('invoice', 'Create invoice', 'إنشاء فاتورة', ['completed'], 'invoiced'),
    ],
  }),
  R('JobCardLine', 'workshop', 'Job line', 'بند العمل', 'description', 'list', [
    'jobCardId:r=JobCard!', 'kind:e=part|labour*', 'partId:r=Part', 'description:s!*', 'qty:d*', 'unitPrice:d!*', 'hours:d', 'vatPct:d', 'lineTotal:d#*', 'technicianId:r=User',
  ], { rel: 'R3', f: ['WSH-02'] }),
  R('TechnicianTime', 'workshop', 'Technician time', 'وقت الفني', 'minutes', 'timer', ['jobCardId:r=JobCard!*', 'technicianId:r=User!*', 'startedAt:T!*', 'endedAt:T', 'minutes:i#*'], { rel: 'R3', f: ['WSH-03'] }),
];

export const vehicle = [
  R('ServiceInterval', 'vehicle', 'Service interval', 'فترة الصيانة', 'serviceName', 'repeat', ['make:s*', 'model:s*', 'serviceName:s!*?', 'everyKm:i*', 'everyMonths:i*', 'notes:s'], { rel: 'R2', f: ['VEH-03'] }),
  R('VehicleReminder', 'vehicle', 'Vehicle reminder', 'تذكير مركبة', 'serviceName', 'bell-ring', [
    'vehicleId:r=Vehicle!*', 'customerId:r=Customer*', 'serviceName:s!*', 'dueDate:D*', 'dueMileage:i', 'status:e=upcoming|sent|done|dismissed*', 'sentAt:T#',
  ], { rel: 'R2', portal: 'customer', f: ['VEH-03'], actions: [act('send', 'Send reminder', 'إرسال التذكير', ['upcoming'], 'sent'), act('done', 'Mark done', 'تم', ['upcoming', 'sent'], 'done')] }),
];

export const ai = [
  R('AiLog', 'platform', 'AI log', 'سجل الذكاء الاصطناعي', 'feature', 'sparkles', [
    'feature:e=vin|part_match|quote_capture|assistant|forecast|reorder*', 'userId:r=User', 'input:j', 'output:j', 'confidence:d*', 'accepted:b*', 'latencyMs:i*', 'model:s', 'promptVersion:s',
  ], { immutable: true, f: ['PLT-07'] }),
  R('Forecast', 'marketplace', 'Forecast', 'التوقع', 'segment', 'trending-up', [
    'partId:r=Part', 'brandId:r=Brand', 'segment:s*', 'periodStart:D*', 'horizon:e=month|quarter*', 'predictedQty:d*', 'predictedPrice:d*', 'mape:d*', 'model:s',
  ], { rel: 'R2', f: ['RPT-11'] }),
];
