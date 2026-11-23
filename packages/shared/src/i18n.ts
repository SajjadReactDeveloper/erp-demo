// Arabic dictionary used to auto-compose field / enum labels from camelCase and snake_case words.
const AR: Record<string, string> = {
  id: 'المعرف', name: 'الاسم', code: 'الرمز', number: 'الرقم', no: 'الرقم', description: 'الوصف', notes: 'ملاحظات', note: 'ملاحظة', status: 'الحالة', type: 'النوع', kind: 'النوع',
  email: 'البريد الإلكتروني', phone: 'الهاتف', address: 'العنوان', city: 'المدينة', region: 'المنطقة', area: 'الحي', line1: 'العنوان',
  customer: 'العميل', supplier: 'المورد', part: 'القطعة', parts: 'القطع', vehicle: 'المركبة', request: 'الطلب', quotation: 'عرض السعر', quote: 'عرض السعر',
  order: 'الطلب', sales: 'المبيعات', purchase: 'الشراء', invoice: 'الفاتورة', receipt: 'السند', payment: 'الدفعة', bill: 'فاتورة المورد', delivery: 'التسليم',
  line: 'البند', lines: 'البنود', qty: 'الكمية', quantity: 'الكمية', price: 'السعر', unit: 'الوحدة', cost: 'التكلفة', total: 'الإجمالي', subtotal: 'المجموع الفرعي',
  vat: 'الضريبة', tax: 'الضريبة', amount: 'المبلغ', balance: 'الرصيد', limit: 'الحد', credit: 'الائتمان', debit: 'المدين',
  date: 'التاريخ', time: 'الوقت', due: 'الاستحقاق', valid: 'صالح', until: 'حتى', from: 'من', to: 'إلى', start: 'البداية', end: 'النهاية', period: 'الفترة',
  created: 'أُنشئ', updated: 'حُدّث', by: 'بواسطة', at: 'في', approved: 'معتمد', approval: 'الاعتماد', rejected: 'مرفوض', pending: 'قيد الانتظار', draft: 'مسودة',
  active: 'نشط', inactive: 'غير نشط', is: '', has: '', enabled: 'مفعّل', default: 'افتراضي', primary: 'أساسي',
  brand: 'العلامة التجارية', category: 'الفئة', uom: 'وحدة القياس', make: 'الصنع', model: 'الطراز', year: 'السنة', engine: 'المحرك', trim: 'الفئة', vin: 'رقم الهيكل',
  plate: 'اللوحة', mileage: 'العداد', margin: 'الهامش', pct: '%', min: 'الأدنى', max: 'الأعلى', target: 'المستهدف', ceiling: 'السقف', rule: 'القاعدة', rules: 'القواعد',
  tier: 'الشريحة', urgency: 'الاستعجال', normal: 'عادي', urgent: 'عاجل', critical: 'حرج', channel: 'القناة', source: 'المصدر', priority: 'الأولوية',
  user: 'المستخدم', role: 'الدور', roles: 'الأدوار', permissions: 'الصلاحيات', locale: 'اللغة', language: 'اللغة', branch: 'الفرع', warehouse: 'المستودع', company: 'الشركة',
  cr: 'السجل التجاري', terms: 'الشروط', days: 'أيام', hours: 'ساعات', minutes: 'دقائق', lead: 'مدة التوريد', warranty: 'الضمان', availability: 'التوفر', rating: 'التقييم',
  rfq: 'طلب عرض أسعار', award: 'الترسية', po: 'أمر الشراء', goods: 'البضائع', receiving: 'الاستلام', received: 'المستلم', ordered: 'المطلوب', short: 'ناقص', damaged: 'تالف',
  excess: 'زائد', wrong: 'خاطئ', item: 'الصنف', claim: 'مطالبة', return: 'مرتجع', returns: 'المرتجعات', reason: 'السبب', resolution: 'المعالجة', photo: 'صورة', photos: 'الصور',
  signature: 'التوقيع', signer: 'الموقّع', lat: 'خط العرض', lng: 'خط الطول', gps: 'الموقع', driver: 'السائق', route: 'المسار', planned: 'مخطط',
  account: 'الحساب', accounts: 'الحسابات', journal: 'القيد', entry: 'القيد', ledger: 'الأستاذ', fiscal: 'المالية', bank: 'البنك', cash: 'النقد', cheque: 'الشيك',
  iban: 'الآيبان', expense: 'المصروف', budget: 'الميزانية', zatca: 'هيئة الزكاة', qr: 'رمز QR', hash: 'البصمة', uuid: 'المعرف الفريد', xml: 'XML', icv: 'العداد',
  hold: 'إيقاف', held: 'موقوف', released: 'مُفرج', promise: 'وعد بالدفع', promised: 'الموعود', collector: 'المحصّل', collection: 'التحصيل', outcome: 'النتيجة',
  reminder: 'التذكير', alert: 'التنبيه', severity: 'الخطورة', message: 'الرسالة', title: 'العنوان', body: 'المحتوى', read: 'مقروء', link: 'الرابط',
  stock: 'المخزون', bin: 'الموقع', batch: 'الدفعة', serial: 'الرقم التسلسلي', expiry: 'الانتهاء', movement: 'الحركة', count: 'الجرد', counted: 'المعدود', expected: 'المتوقع',
  variance: 'الفرق', reorder: 'إعادة الطلب', suggested: 'المقترح', pos: 'نقطة البيع', shift: 'الوردية', opening: 'الافتتاحي', closing: 'الإغلاق',
  tyre: 'الإطار', battery: 'البطارية', width: 'العرض', aspect: 'النسبة', rim: 'القطر', load: 'الحمل', index: 'المؤشر', speed: 'السرعة', dot: 'DOT', season: 'الموسم',
  voltage: 'الجهد', capacity: 'السعة', cca: 'CCA', service: 'الخدمة', booking: 'الحجز', bay: 'المحطة', job: 'أمر العمل', card: 'البطاقة', technician: 'الفني', labour: 'العمالة',
  inspection: 'الفحص', interval: 'الفترة', every: 'كل', km: 'كم', months: 'أشهر', loyalty: 'الولاء', points: 'النقاط', voucher: 'القسيمة', offer: 'العرض', discount: 'الخصم',
  confidence: 'الثقة', match: 'المطابقة', matched: 'مطابق', ai: 'الذكاء الاصطناعي', forecast: 'التوقع', predicted: 'المتوقع', horizon: 'الأفق',
  attachment: 'المرفق', file: 'الملف', mime: 'نوع الملف', size: 'الحجم', storage: 'التخزين', key: 'المفتاح', value: 'القيمة', json: 'بيانات', payload: 'البيانات',
  attempts: 'المحاولات', error: 'الخطأ', errors: 'الأخطاء', warnings: 'التحذيرات', response: 'الاستجابة', external: 'خارجي', direction: 'الاتجاه', provider: 'المزود',
  entity: 'الكيان', ref: 'المرجع', sla: 'اتفاقية الخدمة', deadline: 'الموعد النهائي', sent: 'أُرسل', viewed: 'شوهد', responded: 'تم الرد', declined: 'مرفوض',
  currency: 'العملة', paid: 'المدفوع', unapplied: 'غير مخصص', allocation: 'التخصيص', method: 'الطريقة', reference: 'المرجع', gateway: 'البوابة', txn: 'العملية',
  password: 'كلمة المرور', mfa: 'التحقق الثنائي', secret: 'السر', login: 'الدخول', last: 'آخر', locked: 'مقفل', failed: 'الفاشلة', delegate: 'المفوّض', logo: 'الشعار',
  guarantees: 'الضمانات', documents: 'المستندات', grace: 'فترة السماح', exposure: 'الانكشاف', overdue: 'المتأخر', checked: 'التحقق', rep: 'المندوب',
  portal: 'البوابة', onboarding: 'التسجيل', application: 'الطلب', contact: 'جهة الاتصال', contacts: 'جهات الاتصال',
  cogs: 'تكلفة البضاعة', parent: 'الأب', control: 'ضبط', posting: 'الترحيل', allow: 'السماح', side: 'الجانب', expr: 'المعادلة', seq: 'التسلسل',
  environment: 'البيئة', csr: 'طلب الشهادة', certificate: 'الشهادة', csid: 'CSID', issued: 'الصادر', expires: 'ينتهي', counter: 'العداد',
  accepted: 'مقبول', submitted: 'مُقدّم', cleared: 'مصرّح', reported: 'مُبلَّغ', original: 'الأصلي', simplified: 'مبسطة', standard: 'ضريبية', pih: 'البصمة السابقة',
  merged: 'مدموج', into: 'في', oem: 'الأصلي', xref: 'المرادف', aftermarket: 'بديل', superseded: 'مستبدل', fit: 'التوافق', image: 'الصورة', weight: 'الوزن',
  track: 'تتبع', rows: 'الصفوف', ok: 'ناجح', dry: 'تجريبي', run: 'تشغيل', schedule: 'الجدولة', cron: 'التوقيت', recipients: 'المستلمون', format: 'الصيغة', filters: 'الفلاتر',
  result: 'النتيجة', scan: 'المسح', barcode: 'الباركود', device: 'الجهاز', event: 'الحدث', events: 'الأحداث', client: 'العميل', idempotency: 'منع التكرار', synced: 'تمت المزامنة',
  seen: 'شوهد', revoked: 'ملغى', shipment: 'الشحنة', courier: 'شركة الشحن', tracking: 'التتبع', label: 'الملصق', transfer: 'التحويل', shipped: 'الشحن',
  approver: 'المعتمد', decided: 'القرار', decision: 'القرار', step: 'الخطوة', steps: 'الخطوات', escalate: 'التصعيد', escalated: 'مصعّد',
  requested: 'المطلوب', current: 'الحالي', first: 'الأول', score: 'النتيجة', overall: 'الإجمالي', rate: 'النسبة',
  open: 'مفتوح', closed: 'مغلق', done: 'منجز', cancelled: 'ملغى', completed: 'مكتمل', posted: 'مرحّل', reversed: 'معكوس', confirmed: 'مؤكد', delivered: 'مسلّم',
  invoiced: 'مفوتر', partially: 'جزئياً', partial: 'جزئي', unpaid: 'غير مدفوع', new: 'جديد', in: 'قيد', progress: 'التنفيذ', out: 'خارج', for: 'ل',
  manual: 'يدوي', import: 'استيراد', export: 'تصدير', online: 'عبر الإنترنت', walkin: 'حضوري', whatsapp: 'واتساب', sms: 'رسالة نصية',
  inapp: 'داخل التطبيق', info: 'معلومة', warning: 'تحذير', other: 'أخرى', good: 'جيدة', mada: 'مدى', summer: 'صيفي', winter: 'شتوي', all: 'الكل',
  workshop: 'ورشة', fleet: 'أسطول', rental: 'تأجير', dealer: 'وكيل', individual: 'فرد', retail: 'تجزئة', staff: 'موظف',
  expired: 'منتهي', lost: 'مفقود', quoted: 'مسعّر', sourcing: 'التوريد', verify: 'تحقق', receive: 'استلام', deliver: 'تسليم', stock_in: 'متوفر',
  on: 'على', unavailable: 'غير متوفر', unmatched: 'غير مطابق', mfg: 'التصنيع', per: 'لكل', hijri: 'هجري', egs: 'وحدة الفوترة',
  paid_amount: 'المدفوع', pct_: '%', today: 'اليوم', week: 'الأسبوع', month: 'الشهر', quarter: 'الربع', segment: 'الشريحة', mape: 'نسبة الخطأ',
  recorded: 'المسجل', version: 'الإصدار', permission: 'الصلاحية', global: 'عام', hidden: 'مخفي', sys: 'نظام', mapped: 'مربوط', rolled: 'مُرجع', back: 'للخلف',
  validated: 'تم التحقق', dryrun: 'تجريبي', stale: 'قديم', feed: 'الخلاصة', file_: 'ملف', api: 'واجهة برمجية', url: 'الرابط', session: 'الجلسة',
};

const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

const UP: Record<string, string> = {
  qty: 'Qty', vat: 'VAT', vin: 'VIN', po: 'PO', pct: '%', uom: 'UoM', cr: 'CR', rfq: 'RFQ', ai: 'AI', zatca: 'ZATCA', qr: 'QR', iban: 'IBAN', oem: 'OEM', pos: 'POS',
  dot: 'DOT', sla: 'SLA', gps: 'GPS', cca: 'CCA', cogs: 'COGS', pih: 'PIH', icv: 'ICV', csr: 'CSR', csid: 'CSID', egs: 'EGS', uuid: 'UUID', xml: 'XML', mfa: 'MFA',
  api: 'API', url: 'URL', mape: 'MAPE', sms: 'SMS', km: 'km', lat: 'Lat', lng: 'Lng', json: 'JSON', mfg: 'Mfg', gl: 'GL', ar: 'AR', ap: 'AP', sku: 'SKU', id: 'ID',
};

export function labelEn(name: string): string {
  const w = words(name.replace(/Id$/, ''));
  return w.map((x) => UP[x] ?? cap(x)).join(' ');
}

export function labelAr(name: string): string {
  const w = words(name.replace(/Id$/, ''));
  const out = w.map((x) => (x in AR ? AR[x] : labelEn(x))).filter(Boolean);
  return out.join(' ') || labelEn(name);
}

export function enumLabel(v: string, lang: 'en' | 'ar'): string {
  const w = v.split('_');
  return lang === 'ar' ? w.map((x) => (x in AR ? AR[x] : x)).join(' ') : w.map((x) => UP[x] ?? cap(x)).join(' ');
}
