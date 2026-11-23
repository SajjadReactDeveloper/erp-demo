import { R, act } from './define';

export const masterdata = [
  R('Brand', 'masterdata', 'Brand', 'العلامة التجارية', 'name', 'tag', ['name:s!*?', 'nameAr:s?', 'isOem:b*'], { f: ['MDM-01'] }),
  R('Category', 'masterdata', 'Category', 'الفئة', 'name', 'folder-tree', ['name:s!*?', 'nameAr:s?', 'parentId:r=Category*'], { plural: ['Categories', 'الفئات'], f: ['MDM-01'] }),
  R('Uom', 'masterdata', 'Unit of measure', 'وحدة القياس', 'code', 'ruler', ['code:s!*?', 'name:s!*?', 'nameAr:s'], { plural: ['Units of measure', 'وحدات القياس'], f: ['MDM-08'] }),
  R('UomConversion', 'masterdata', 'UoM conversion', 'تحويل الوحدات', 'factor', 'repeat', ['fromUomId:r=Uom!*', 'toUomId:r=Uom!*', 'factor:d!*', 'partId:r=Part'], { f: ['MDM-08'] }),
  R('Part', 'masterdata', 'Part', 'القطعة', 'partNumber', 'cog', [
    'partNumber:s!*?', 'name:s!*?', 'nameAr:s?', 'brandId:r=Brand*', 'categoryId:r=Category*', 'uomId:r=Uom', 'description:t', 'imageUrl:s', 'oemNumber:s?', 'status:e=active|draft|merged|inactive*',
    'mergedIntoId:r=Part#', 'source:e=manual|quotation|order|import|supplier', 'trackBatch:b', 'trackSerial:b', 'marketCeiling:d', 'embedding:j#~',
  ], {
    f: ['MDM-01', 'MDM-02', 'MDM-06'], unique: [['companyId', 'partNumber', 'brandId']],
    actions: [act('merge', 'Merge into…', 'دمج في…', ['draft', 'active'], 'merged', { confirm: true }), act('activate', 'Activate', 'تفعيل', ['draft'], 'active')],
  }),
  R('PartXref', 'masterdata', 'Part cross-reference', 'مرادف القطعة', 'xrefNumber', 'link-2', ['partId:r=Part!*', 'xrefNumber:s!*?', 'xrefType:e=oem|aftermarket|supplier|superseded*', 'brandId:r=Brand'], { f: ['MDM-01'] }),
  R('PartVehicleFit', 'masterdata', 'Vehicle compatibility', 'توافق المركبات', 'make', 'car-front', ['partId:r=Part!*', 'make:s!*?', 'model:s*?', 'yearFrom:i', 'yearTo:i', 'engine:s'], { f: ['MDM-01'] }),
  R('Vehicle', 'masterdata', 'Vehicle', 'المركبة', 'vin', 'car', [
    'vin:s!*?', 'make:s*?', 'model:s*?', 'year:i*', 'engine:s', 'trim:s', 'plate:s?', 'customerId:r=Customer*', 'mileage:i', 'notes:t',
  ], { portal: 'customer', f: ['MDM-03', 'VEH-02'], unique: [['companyId', 'vin']] }),
  R('Customer', 'masterdata', 'Customer', 'العميل', 'name', 'users', [
    'code:s#*', 'name:s!*?', 'nameAr:s?', 'customerType:e=workshop|fleet|rental|dealer|individual*', 'priceTier:e=A|B|C|retail*', 'vatNumber:s?', 'crNumber:s', 'email:s?', 'phone:s?',
    'status:e=pending|active|blocked*', 'salesRepId:r=User', 'creditLimit:d*', 'paymentTermsDays:i', 'branchId:r=Branch', 'portalEnabled:b', 'source:e=portal|manual|import', 'notes:t',
  ], {
    num: 'CUS', f: ['MDM-04', 'CRM-01', 'CRM-02', 'CRD-01'], children: [['CustomerContact', 'customerId'], ['CustomerAddress', 'customerId']],
    actions: [act('block', 'Block', 'حظر', ['active'], 'blocked', { danger: true, confirm: true }), act('activate', 'Activate', 'تفعيل', ['pending', 'blocked'], 'active')],
  }),
  R('CustomerContact', 'masterdata', 'Contact', 'جهة اتصال', 'name', 'contact', ['customerId:r=Customer!', 'name:s!*?', 'role:s', 'email:s*', 'phone:s*', 'isPrimary:b*'], { f: ['MDM-04'] }),
  R('CustomerAddress', 'masterdata', 'Delivery address', 'عنوان التسليم', 'label', 'map-pin', ['customerId:r=Customer!', 'label:s!*?', 'line1:s!*', 'city:s*', 'region:s', 'area:s*', 'lat:d', 'lng:d', 'isDefault:b*'], { portal: 'customer', f: ['MDM-04', 'CPT-02'] }),
  R('Supplier', 'masterdata', 'Supplier', 'المورد', 'name', 'factory', [
    'code:s#*', 'name:s!*?', 'nameAr:s?', 'vatNumber:s', 'email:s?', 'phone:s?', 'whatsapp:s', 'paymentTermsDays:i', 'brands:j', 'categories:j', 'bankName:s', 'iban:s', 'rating:d#*', 'onTimePct:d#',
    'leadTimeDays:i', 'status:e=pending|active|blocked*', 'notes:t',
  ], { num: 'SUP', f: ['MDM-05', 'PRC-08'], children: [['SupplierContact', 'supplierId'], ['SupplierDocument', 'supplierId']] }),
  R('SupplierContact', 'masterdata', 'Supplier contact', 'جهة اتصال المورد', 'name', 'contact', ['supplierId:r=Supplier!', 'name:s!*?', 'email:s*', 'phone:s*'], { f: ['MDM-05'] }),
  R('SupplierDocument', 'masterdata', 'Supplier document', 'مستند المورد', 'docType', 'file', ['supplierId:r=Supplier!', 'docType:s!*', 'fileName:s*', 'storageKey:s#~', 'expiresAt:D*'], { f: ['MDM-05'] }),
  R('PriceRule', 'masterdata', 'Pricing rule', 'قاعدة التسعير', 'name', 'percent', [
    'name:s!*?', 'customerTier:s*', 'categoryId:r=Category', 'brandId:r=Brand', 'supplierId:r=Supplier', 'urgency:e=any|normal|urgent|critical*', 'targetMarginPct:d!*', 'minMarginPct:d!*',
    'maxMarginPct:d', 'effectiveFrom:D', 'effectiveTo:D', 'isActive:b*',
  ], { f: ['MDM-06', 'SAL-04'] }),
  R('PriceHistory', 'masterdata', 'Price history', 'سجل الأسعار', 'price', 'line-chart', [
    'partId:r=Part!*', 'kind:e=supplier|selling*', 'supplierId:r=Supplier', 'customerId:r=Customer', 'price:d!*', 'currency:s', 'source:s', 'recordedAt:T*',
  ], { immutable: true, f: ['MDM-07'] }),
  R('TaxCode', 'masterdata', 'Tax code', 'رمز الضريبة', 'code', 'receipt-text', ['code:s!*?', 'name:s!*?', 'ratePct:d!*', 'category:e=standard|zero|exempt|export*', 'isDefault:b*'], { f: ['FIN-05'] }),
];

export const crm = [
  R('Activity', 'sales', 'Activity', 'نشاط', 'subject', 'phone-call', [
    'customerId:r=Customer!*', 'kind:e=call|visit|whatsapp|task|note*', 'subject:s!*?', 'notes:t', 'dueAt:T*', 'status:e=open|done|cancelled*', 'assignedToId:r=User*', 'completedAt:T#',
  ], { plural: ['Activities', 'الأنشطة'], f: ['CRM-03'], actions: [act('complete', 'Mark done', 'إنجاز', ['open'], 'done')] }),
  R('SalesTarget', 'sales', 'Sales target', 'هدف المبيعات', 'scope', 'target', [
    'scope:e=rep|customer|category*', 'userId:r=User*', 'customerId:r=Customer', 'categoryId:r=Category', 'periodStart:D!*', 'periodEnd:D!*', 'targetAmount:d!*',
  ], { f: ['CRM-04'] }),
  R('LostReason', 'sales', 'Lost reason', 'سبب الخسارة', 'name', 'x-circle', ['code:s!*?', 'name:s!*?', 'nameAr:s'], { f: ['CRM-05', 'SAL-06'] }),
  R('CustomerApplication', 'sales', 'Customer application', 'طلب تسجيل عميل', 'companyName', 'user-plus', [
    'companyName:s!*?', 'contactName:s!*', 'email:s!*?', 'phone:s*', 'vatNumber:s', 'crNumber:s', 'documents:j', 'status:e=submitted|under_review|approved|rejected*', 'reviewedById:r=User#', 'customerId:r=Customer#', 'notes:t',
  ], {
    f: ['CRM-06'], actions: [act('approve', 'Approve & create customer', 'اعتماد وإنشاء عميل', ['submitted', 'under_review'], 'approved'), act('reject', 'Reject', 'رفض', ['submitted', 'under_review'], 'rejected', { danger: true })],
  }),
  R('LoyaltyAccount', 'sales', 'Loyalty account', 'حساب الولاء', 'points', 'award', ['customerId:r=Customer!*', 'points:i*', 'tier:s*'], { rel: 'R3', f: ['CRM-07'], unique: [['customerId']] }),
  R('LoyaltyTxn', 'sales', 'Loyalty transaction', 'حركة الولاء', 'points', 'coins', ['accountId:r=LoyaltyAccount!*', 'kind:e=earn|redeem|adjust|expire*', 'points:i!*', 'refType:s', 'refId:s', 'note:s'], { rel: 'R3', immutable: true, f: ['CRM-07'] }),
  R('Voucher', 'sales', 'Voucher', 'قسيمة', 'code', 'ticket', ['code:s!*?', 'description:s', 'discountPct:d', 'discountAmount:d', 'validFrom:D', 'validTo:D', 'maxUses:i', 'usedCount:i#', 'customerId:r=Customer', 'isActive:b*'], { rel: 'R3', f: ['CRM-07'] }),
  R('Offer', 'sales', 'Targeted offer', 'عرض موجّه', 'name', 'gift', ['name:s!*?', 'segment:s*', 'discountPct:d*', 'validFrom:D', 'validTo:D', 'isActive:b*'], { rel: 'R3', f: ['CRM-07'] }),
];
