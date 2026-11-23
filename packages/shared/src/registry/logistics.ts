import { R, act } from './define';

export const logistics = [
  R('DeliveryNote', 'logistics', 'Delivery note', 'إشعار التسليم', 'number', 'truck', [
    'number:s#*?', 'salesOrderId:r=SalesOrder!*', 'customerId:r=Customer*', 'addressId:r=CustomerAddress', 'status:e=planned|assigned|out_for_delivery|delivered|partially_delivered|failed|closed*', 'plannedDate:D*',
    'driverId:r=User*', 'routeArea:s*', 'routeSeq:i', 'deliveredAt:T#', 'receivedByName:s#', 'invoiceId:r=Invoice#', 'shipmentId:r=Shipment#', 'notes:t',
  ], {
    num: 'DN', portal: 'customer', req: true, f: ['LOG-05', 'LOG-06', 'LOG-07', 'LOG-10', 'CPT-04'], children: [['DeliveryLine', 'deliveryNoteId']],
    actions: [
      act('assign', 'Assign driver', 'إسناد سائق', ['planned', 'assigned']),
      act('dispatch', 'Out for delivery', 'خروج للتسليم', ['assigned'], 'out_for_delivery'),
      act('deliver', 'Confirm delivery (POD)', 'تأكيد التسليم', ['out_for_delivery']),
      act('fail', 'Mark failed', 'تعذر التسليم', ['out_for_delivery'], 'failed', { danger: true }),
      act('reschedule', 'Re-schedule', 'إعادة جدولة', ['failed', 'partially_delivered'], 'planned'),
      act('print', 'Print', 'طباعة'),
    ],
  }),
  R('DeliveryLine', 'logistics', 'Delivery line', 'بند التسليم', 'partId', 'list', [
    'deliveryNoteId:r=DeliveryNote!', 'salesOrderLineId:r=SalesOrderLine*', 'partId:r=Part*', 'qty:d!*', 'deliveredQty:d*', 'grLineId:r=GrLine', 'status:e=pending|delivered|partial|failed*', 'failReason:s',
  ], { portal: 'customer', req: true, f: ['LOG-05', 'LOG-07'] }),
  R('DeliveryEvent', 'logistics', 'Delivery event', 'حدث التسليم', 'kind', 'activity', [
    'deliveryNoteId:r=DeliveryNote!*', 'kind:e=assigned|departed|arrived|delivered|partial|failed|rescheduled*', 'lat:d', 'lng:d', 'note:s', 'at:T*', 'byId:r=User',
  ], { portal: 'customer', immutable: true, f: ['LOG-10'], order: 'at:desc' }),
  R('ProofOfDelivery', 'logistics', 'Proof of delivery', 'إثبات التسليم', 'signerName', 'signature', [
    'deliveryNoteId:r=DeliveryNote!*', 'signatureData:t~', 'signerName:s*', 'signerIdNumber:s', 'photoKeys:j', 'lat:d', 'lng:d', 'capturedAt:T*', 'deviceId:r=Device', 'hash:s#',
  ], { portal: 'customer', immutable: true, f: ['LOG-06'] }),
  R('Device', 'logistics', 'Device', 'الجهاز', 'name', 'smartphone', [
    'name:s!*?', 'kind:e=sunmi|android|ios|pos*', 'serial:s?', 'userId:r=User*', 'lastSeenAt:T#*', 'status:e=active|revoked*',
  ], { f: ['LOG-01'], actions: [act('revoke', 'Revoke access', 'إلغاء الوصول', ['active'], 'revoked', { danger: true, confirm: true })] }),
  R('ScanEvent', 'logistics', 'Scan event', 'حدث مسح', 'barcode', 'scan-line', [
    'clientEventId:s!', 'deviceId:r=Device', 'userId:r=User*', 'kind:e=receive|deliver|count|label|verify*', 'barcode:s!*?', 'partId:r=Part*', 'poLineId:r=PoLine', 'deliveryLineId:r=DeliveryLine', 'qty:d*',
    'result:e=ok|wrong_item|over|short*', 'scannedAt:T*', 'lat:d', 'lng:d', 'syncedAt:T#',
  ], { immutable: true, f: ['LOG-02', 'LOG-09'], unique: [['companyId', 'clientEventId']], order: 'scannedAt:desc' }),
  R('Shipment', 'logistics', 'Courier shipment', 'شحنة', 'number', 'send', [
    'number:s#*?', 'deliveryNoteId:r=DeliveryNote', 'courier:e=smsa|aramex|other*', 'trackingNo:s*?', 'status:e=booked|picked_up|in_transit|delivered|exception|cancelled*', 'labelUrl:s', 'cost:d', 'events:j',
  ], {
    num: 'SHP', rel: 'R2', f: ['LOG-11'],
    actions: [act('book', 'Book with courier', 'حجز مع الشركة', ['booked']), act('track', 'Refresh tracking', 'تحديث التتبع', ['booked', 'picked_up', 'in_transit']), act('cancel', 'Cancel', 'إلغاء', ['booked'], 'cancelled', { danger: true })],
  }),
  R('Transfer', 'logistics', 'Branch transfer', 'تحويل بين الفروع', 'number', 'arrow-left-right', [
    'number:s#*?', 'fromWarehouseId:r=Warehouse!*', 'toWarehouseId:r=Warehouse!*', 'status:e=draft|in_transit|received|cancelled*', 'shippedAt:T#', 'receivedAt:T#',
  ], {
    num: 'TRF', rel: 'R3', f: ['LOG-12'], children: [['TransferLine', 'transferId']],
    actions: [act('ship', 'Ship', 'شحن', ['draft'], 'in_transit'), act('receive', 'Receive', 'استلام', ['in_transit'], 'received'), act('cancel', 'Cancel', 'إلغاء', ['draft'], 'cancelled', { danger: true })],
  }),
  R('TransferLine', 'logistics', 'Transfer line', 'بند التحويل', 'partId', 'list', ['transferId:r=Transfer!', 'partId:r=Part!*', 'qty:d!*', 'receivedQty:d*', 'batchId:r=Batch', 'serialId:r=Serial'], { rel: 'R3', f: ['LOG-12'] }),
];
