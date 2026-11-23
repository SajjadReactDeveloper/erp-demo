'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Columns3,
  CreditCard,
  FileCheck2,
  Globe,
  Layers,
  Lock,
  MapPin,
  Menu,
  MessageSquare,
  PackageCheck,
  Percent,
  ReceiptText,
  ScanSearch,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  Users,
  Wallet,
  X,
  Zap,
} from 'lucide-react';
import { useT } from '@/lib/i18n';
import { BrandLogo, BrandMark } from '@/components/ui/brand';
import { Star, cn } from '@/components/ui';

type Bi = { en: string; ar: string };

const NAV_LINKS: { href: string; label: Bi }[] = [
  { href: '#workflow', label: { en: 'Workflow', ar: 'سير العمل' } },
  { href: '#platform', label: { en: 'Platform', ar: 'المنصة' } },
  { href: '#portals', label: { en: 'Portals', ar: 'البوابات' } },
  { href: '#compliance', label: { en: 'KSA & ZATCA', ar: 'السعودية وزاتكا' } },
  { href: '#faq', label: { en: 'FAQ', ar: 'الأسئلة الشائعة' } },
];

const METRICS: { value: Bi; label: Bi; sub: Bi }[] = [
  {
    value: { en: '< 60 sec', ar: '< 60 ثانية' },
    label: { en: 'VIN to multi-supplier RFQ', ar: 'من رقم الهيكل لطلبات التسعير' },
    sub: { en: 'AI decoding & auto-dispatch', ar: 'فك ترميز ذكي وإرسال تلقائي' },
  },
  {
    value: { en: '100%', ar: '100%' },
    label: { en: 'Margin & credit guarded', ar: 'حماية الهامش والائتمان' },
    sub: { en: 'Automated floor & limit checks', ar: 'فحص تلقائي للحدود قبل الاعتماد' },
  },
  {
    value: { en: '4 Portals', ar: '4 بوابات' },
    label: { en: 'Unified operational core', ar: 'نواة تشغيلية موحّدة' },
    sub: { en: 'ERP, Customer, Supplier & Driver', ar: 'إدارة، عملاء، موردين وسائقين' },
  },
  {
    value: { en: 'ZATCA P2', ar: 'المرحلة 2' },
    label: { en: 'Native Saudi e-invoicing', ar: 'فوترة إلكترونية أصلية' },
    sub: { en: 'UBL 2.1 XML, QR & live GL', ar: 'ربط XML ورمز QR وأستاذ عام' },
  },
];

interface Stage {
  id: string;
  num: string;
  icon: typeof ScanSearch;
  short: Bi;
  title: Bi;
  desc: Bi;
  engine: Bi;
  points: Bi[];
}

const STAGES: Stage[] = [
  {
    id: 'vin',
    num: '01',
    icon: ScanSearch,
    short: { en: 'VIN & AI Match', ar: 'الهيكل والذكاء' },
    title: { en: 'Decode VIN & identify exact OEM parts in seconds', ar: 'فك ترميز رقم الهيكل وتحديد القطع الأصلية في ثوانٍ' },
    desc: {
      en: 'Customers or sales reps submit a 17-character VIN, vehicle details, or part photos. AutocQuick extracts make, model, engine, and suggests verified OEM part numbers and compatible alternatives.',
      ar: 'يُرسل العميل أو موظف المبيعات رقم الهيكل (17 حرفاً) أو صورة القطعة، فيستخرج النظام بيانات المركبة ويقترح أرقام القطع الأصلية والبدائل المتوافقة فوراً.',
    },
    engine: { en: 'AI VIN Decoder + OEM Supersession', ar: 'محرك فك الهيكل والأرقام الأصلية' },
    points: [
      { en: 'Instant 17-digit VIN decoding with saved fleet vehicles', ar: 'فك فوري لرقم الهيكل مع حفظ أسطول مركبات العميل' },
      { en: 'Multi-line requests with OEM & aftermarket alternatives', ar: 'طلبات متعددة البنود مع بدائل أصلية وتجارية' },
      { en: 'WhatsApp, Customer Portal, or direct counter intake', ar: 'استقبال الطلبات من واتساب أو بوابة العملاء أو الكاونتر' },
    ],
  },
  {
    id: 'rfq',
    num: '02',
    icon: Columns3,
    short: { en: 'Supplier RFQs', ar: 'عروض الموردين' },
    title: { en: 'Broadcast RFQs & compare quotes side by side', ar: 'إرسال طلبات الأسعار ومقارنة العروض جنباً إلى جنب' },
    desc: {
      en: 'Stop chasing suppliers across scattered WhatsApp chats. Dispatch structured RFQs to vetted vendors and rank incoming offers by landed cost, lead time, stock availability, and warranty.',
      ar: 'وداعاً لمتابعة الموردين عبر محادثات مبعثرة. أرسل طلبات تسعير منظّمة للموردين المعتمدين وقارن العروض حسب التكلفة ومدة التوريد والضمان.',
    },
    engine: { en: 'Best-Value Quote Scoring Engine', ar: 'محرك تقييم أفضل قيمة للموردين' },
    points: [
      { en: 'Automated RFQ fan-out to Supplier Portal & WhatsApp', ar: 'إرسال تلقائي لطلبات التسعير عبر بوابة الموردين وواتساب' },
      { en: 'Weighted best-value scoring across price, ETA & warranty', ar: 'تقييم ذكي يوازن بين السعر ومدة التوصيل والضمان' },
      { en: 'Line-by-line award splitting across multiple suppliers', ar: 'ترسية مرنة لكل صنف على المورد الأنسب تلقائياً' },
    ],
  },
  {
    id: 'guardrails',
    num: '03',
    icon: Percent,
    short: { en: 'Margin & Credit', ar: 'الهامش والائتمان' },
    title: { en: 'Protect gross margin & credit limits before release', ar: 'حماية هامش الربح والحد الائتماني قبل اعتماد الطلب' },
    desc: {
      en: 'Every quotation enforces minimum margin floors automatically. Every sales order checks live customer exposure against credit limits and routes exceptions to managers with one-click approvals.',
      ar: 'يفرض كل عرض سعر حداً أدنى للهامش تلقائياً، ويفحص كل أمر بيع الانكشاف الائتماني للعميل ويحيل الاستثناءات للمدير للاعتماد الفوري.',
    },
    engine: { en: 'Policy Engine + Multi-Step Approvals', ar: 'محرك السياسات والاعتمادات متعددة المراحل' },
    points: [
      { en: 'Automatic minimum-margin checks on every quoted item', ar: 'فحص تلقائي للحد الأدنى للهامش على كل بند' },
      { en: 'Real-time credit exposure & 30/60/90-day ageing checks', ar: 'مراقبة فورية للانكشاف الائتماني وأعمار الديون' },
      { en: 'Escalation SLAs with full approval audit trail', ar: 'تصعيد تلقائي للاعتمادات مع سجل تدقيق كامل' },
    ],
  },
  {
    id: 'pos',
    num: '04',
    icon: Store,
    short: { en: 'Drop-Ship & POS', ar: 'التوريد ونقاط البيع' },
    title: { en: 'Zero-inventory drop-shipping meets counter POS', ar: 'توريد مباشر بدون مخزون متكامل مع نقاط البيع' },
    desc: {
      en: 'Convert approved quotes into split supplier purchase orders automatically, or serve walk-in workshops through a fast counter POS with cash-shift floats, Mada payments, and thermal receipts.',
      ar: 'حوّل العروض المعتمدة إلى أوامر شراء موزعة على الموردين تلقائياً، أو اخدم عملاء الكاونتر عبر نقطة بيع سريعة بإدارة الورديات ومدى.',
    },
    engine: { en: 'Auto PO Splitting + Shift-Controlled POS', ar: 'توزيع أوامر الشراء + نقطة بيع بالورديات' },
    points: [
      { en: 'One-click conversion from accepted quote to supplier POs', ar: 'تحويل بضغطة زر من عرض السعر المقبول إلى أوامر شراء' },
      { en: 'Cash shift open/close reconciliation & drawer variance', ar: 'فتح وإغلاق ورديات الكاش مع مطابقة الصندوق' },
      { en: 'Barcode lookup, split tenders & instant return notes', ar: 'بحث بالباركود وتعدد وسائل الدفع وإشعارات المرتجع' },
    ],
  },
  {
    id: 'delivery',
    num: '05',
    icon: Truck,
    short: { en: 'Offline Delivery', ar: 'التسليم الميداني' },
    title: { en: 'Verify receipts & deliver with signed proof — even offline', ar: 'استلام جزئي وتسليم بإثبات وتوقيع حتى بدون إنترنت' },
    desc: {
      en: 'Drivers and warehouse staff use the installable mobile PWA to scan parts, log damaged or partial deliveries, and capture customer signature, photo, and GPS coordinates with automatic offline sync.',
      ar: 'يستخدم السائقون والمستلمون تطبيق الويب للجوال لمسح القطع وتوثيق الاستلام الجزئي والتقاط التوقيع والصورة والموقع الجغرافي مع مزامنة تلقائية.',
    },
    engine: { en: 'Offline-First Mobile PWA + GPS POD', ar: 'تطبيق جوال دون اتصال + إثبات تسليم بالموقع' },
    points: [
      { en: 'Partial receiving & damage reporting against supplier POs', ar: 'استلام جزئي وتسجيل التوالف مقابل أوامر الشراء' },
      { en: 'Digital signature, delivery photo & verified GPS stamp', ar: 'توقيع رقمي وصورة تسليم وإحداثيات الموقع الجغرافي' },
      { en: 'Resilient background sync queue for low-signal garages', ar: 'قائمة مزامنة ذكية للمواقع ضعيفة التغطية' },
    ],
  },
  {
    id: 'zatca',
    num: '06',
    icon: ReceiptText,
    short: { en: 'ZATCA & Ledger', ar: 'زاتكا والأستاذ العام' },
    title: { en: 'ZATCA Phase 2 e-invoicing reconciled to the general ledger', ar: 'فوترة زاتكا المرحلة الثانية مطابقة للأستاذ العام لحظياً' },
    desc: {
      en: 'Every invoice is cryptographically stamped for ZATCA Phase 2, paired with an online Mada/card pay link, and posted automatically to double-entry accounting, VAT returns, and live P&L dashboards.',
      ar: 'تُختم كل فاتورة إلكترونياً وفق زاتكا المرحلة الثانية مع رابط دفع مدى وبطاقات، وتُرحّل فوراً للقيود المزدوجة وإقرار الضريبة ولوحات الأرباح.',
    },
    engine: { en: 'Fatoora Phase 2 + Automated Double-Entry GL', ar: 'فاتورة المرحلة 2 + قيود محاسبية مزدوجة' },
    points: [
      { en: 'ZATCA Phase 2 XML, cryptographic hash & QR generation', ar: 'توليد ملفات XML والختم التشفيري ورمز QR لزاتكا' },
      { en: 'Hosted online payment links for faster B2B collections', ar: 'روابط دفع إلكترونية لتسريع تحصيل فواتير الشركات' },
      { en: 'Real-time trial balance, VAT summary & bank reconciliation', ar: 'ميزان مراجعة وإقرار ضريبة وتسوية بنكية لحظية' },
    ],
  },
];

interface PortalDef {
  id: string;
  route: string;
  ctaHref: string;
  ctaLabel: Bi;
  icon: typeof Building2;
  name: Bi;
  role: Bi;
  headline: Bi;
  desc: Bi;
  bullets: Bi[];
  kpis: { label: Bi; val: string }[];
}

const PORTALS: PortalDef[] = [
  {
    id: 'erp',
    route: '/app',
    ctaHref: '/login',
    ctaLabel: { en: 'Open ERP workspace', ar: 'دخول مساحة العمل' },
    icon: BarChart3,
    name: { en: 'Internal ERP Command', ar: 'مركز القيادة الداخلي' },
    role: { en: 'Management, Sales, Procurement & Finance', ar: 'الإدارة، المبيعات، المشتريات والمالية' },
    headline: { en: 'Complete operational control across 9 live executive dashboards', ar: 'تحكم تشغيلي كامل عبر 9 لوحات تنفيذية مباشرة' },
    desc: {
      en: 'Manage parts requests, supplier RFQs, multi-step credit approvals, counter POS shifts, general ledger, and an embedded AI analyst that answers business questions directly from live SQL data.',
      ar: 'أدر طلبات القطع وعروض الموردين واعتمادات الائتمان وورديات نقاط البيع والأستاذ العام، مع مساعد ذكي يجيب عن أسئلتك التجارية من البيانات الحية.',
    },
    bullets: [
      { en: 'Sales, Profitability, Procurement, Ageing & Cash dashboards', ar: 'لوحات المبيعات والربحية والمشتريات وأعمار الديون والنقدية' },
      { en: 'Natural-language AI Assistant with CSV export & SQL audit', ar: 'مساعد ذكي باللغتين مع تصدير CSV ومراجعة الاستعلامات' },
      { en: 'Granular role permissions & complete record version history', ar: 'صلاحيات دقيقة حسب الدور وسجل إصدارات كامل لكل مستند' },
    ],
    kpis: [
      { label: { en: 'Live dashboards', ar: 'لوحات مباشرة' }, val: '9' },
      { label: { en: 'Approval latency', ar: 'سرعة الاعتماد' }, val: '< 4m' },
      { label: { en: 'GL reconciliation', ar: 'مطابقة الأستاذ' }, val: '100%' },
    ],
  },
  {
    id: 'customer',
    route: '/portal',
    ctaHref: '/register',
    ctaLabel: { en: 'Register as a company', ar: 'سجّل شركتك الآن' },
    icon: Users,
    name: { en: 'B2B Customer Portal', ar: 'بوابة عملاء الشركات' },
    role: { en: 'Workshops, Fleets & Corporate Buyers', ar: 'الورش، الأساطيل ومشترو الشركات' },
    headline: { en: 'Self-service VIN requests, transparent quotes & account statements', ar: 'طلبات برقم الهيكل، عروض أسعار شفافة وكشف حساب لحظي' },
    desc: {
      en: 'Give fleet managers and repair workshops a branded portal to manage their vehicles, submit parts requests in seconds, approve quotations online, track deliveries, and pay ZATCA invoices.',
      ar: 'امنح مديري الأساطيل والورش بوابة متكاملة لإدارة مركباتهم وإرسال طلبات القطع واعتماد العروض وتتبع التوصيل وسداد الفواتير إلكترونياً.',
    },
    bullets: [
      { en: 'Saved fleet garage with decoded VIN vehicle profiles', ar: 'ملف أسطول مركبات محفوظ مع بيانات أرقام الهياكل' },
      { en: 'One-click quotation review, alternative comparison & approval', ar: 'مراجعة عروض الأسعار ومقارنة البدائل والاعتماد بنقرة' },
      { en: 'Live statement of account, credit usage & Mada pay links', ar: 'كشف حساب حي وحد الائتمان وروابط سداد مدى' },
    ],
    kpis: [
      { label: { en: 'Self-service orders', ar: 'طلبات ذاتية' }, val: '24/7' },
      { label: { en: 'Quote approval', ar: 'اعتماد العرض' }, val: '1-Click' },
      { label: { en: 'Online settlement', ar: 'سداد فوري' }, val: 'Mada' },
    ],
  },
  {
    id: 'supplier',
    route: '/supplier',
    ctaHref: '/vendor',
    ctaLabel: { en: 'Apply as a supplier', ar: 'تقدّم كمورّد معتمد' },
    icon: PackageCheck,
    name: { en: 'Supplier Network Portal', ar: 'بوابة شبكة الموردين' },
    role: { en: 'OEM Distributors & Spare-Parts Vendors', ar: 'موزعو القطع الأصلية والموردون' },
    headline: { en: 'Structured RFQs, instant PO awards & transparent settlement', ar: 'طلبات تسعير منظّمة، ترسية فورية ومتابعة واضحة للمستحقات' },
    desc: {
      en: 'Onboard vetted suppliers into a dedicated workspace where they receive live RFQs with exact VINs and part numbers, submit competitive quotes with lead times, and track awarded purchase orders.',
      ar: 'ضم الموردين المعتمدين إلى مساحة عمل مخصصة لاستقبال طلبات التسعير بأرقام الهياكل والقطع، وتقديم العروض بمدة التوريد وتتبع أوامر الشراء.',
    },
    bullets: [
      { en: 'Real-time RFQ inbox with vehicle VIN & part specs', ar: 'صندوق طلبات تسعير مباشر ببيانات المركبة والقطع' },
      { en: 'Quote OEM or alternative items with warranty & ETA', ar: 'تسعير القطع الأصلية والبدائل مع الضمان ومدة التوريد' },
      { en: 'Automated PO confirmation, dispatch & invoice matching', ar: 'تأكيد تلقائي لأوامر الشراء والشحن ومطابقة الفواتير' },
    ],
    kpis: [
      { label: { en: 'RFQ response', ar: 'استجابة التسعير' }, val: '3x Faster' },
      { label: { en: 'Quote accuracy', ar: 'دقة العروض' }, val: '99.4%' },
      { label: { en: 'PO visibility', ar: 'شفافية الأوامر' }, val: 'Live' },
    ],
  },
  {
    id: 'driver',
    route: '/m',
    ctaHref: '/login',
    ctaLabel: { en: 'Launch mobile ops', ar: 'تشغيل تطبيق العمليات' },
    icon: Smartphone,
    name: { en: 'Driver & Receiving PWA', ar: 'تطبيق السائقين والاستلام' },
    role: { en: 'Field Drivers & Dispatch Runners', ar: 'السائقون الميدانيون ومناديب التوريد' },
    headline: { en: 'Offline-capable mobile execution from supplier pickup to garage door', ar: 'تنفيذ ميداني يعمل دون اتصال من استلام المورد حتى باب الورشة' },
    desc: {
      en: 'Built as a lightweight installable web app for daily field operations. Verify items at supplier pickup, record partial or damaged quantities, and collect legally verifiable delivery proof at drop-off.',
      ar: 'مصمم كتطبيق ويب خفيف للعمليات اليومية: تحقق من القطع عند المورد، وسجّل الاستلام الجزئي أو التالف، واجمع إثبات التسليم عند العميل.',
    },
    bullets: [
      { en: 'Barcode & quantity verification against supplier POs', ar: 'التحقق من الباركود والكميات مقابل أوامر الشراء' },
      { en: 'Customer signature pad, photo proof & GPS coordinates', ar: 'لوحة توقيع العميل وصورة التسليم والموقع الجغرافي' },
      { en: 'Automatic sync queue — zero lost deliveries offline', ar: 'مزامنة خلفية تلقائية دون فقدان أي تسليم عند انقطاع الشبكة' },
    ],
    kpis: [
      { label: { en: 'Offline mode', ar: 'عمل دون اتصال' }, val: '100%' },
      { label: { en: 'POD capture', ar: 'إثبات التسليم' }, val: 'GPS + Sig' },
      { label: { en: 'App install', ar: 'التثبيت' }, val: 'PWA' },
    ],
  },
];

const COMPLIANCE_ITEMS: { icon: typeof ShieldCheck; title: Bi; desc: Bi }[] = [
  {
    icon: FileCheck2,
    title: { en: 'ZATCA Phase 2 (Fatoora)', ar: 'زاتكا المرحلة الثانية (فاتورة)' },
    desc: { en: 'Native UBL 2.1 XML generation, cryptographic stamps, TLV QR codes, and credit/debit notes.', ar: 'توليد ملفات UBL 2.1 XML والختم التشفيري ورموز QR والإشعارات الدائنة والمدينة.' },
  },
  {
    icon: Globe,
    title: { en: 'Native Arabic RTL & Hijri', ar: 'عربي أصيل مع التاريخ الهجري' },
    desc: { en: 'Instant Arabic/English switching across every screen, invoice PDF, and dual Gregorian/Hijri date display.', ar: 'تبديل فوري بين العربية والإنجليزية في كل شاشة وفاتورة مع التاريخ الهجري والميلادي.' },
  },
  {
    icon: CreditCard,
    title: { en: 'Saudi Payment Rails', ar: 'وسائل الدفع السعودية' },
    desc: { en: 'Hosted Mada, card, and bank-transfer links attached directly to invoices for faster B2B collection.', ar: 'روابط سداد لمدى والبطاقات والتحويل البنكي مرتبطة مباشرة بالفواتير لتسريع التحصيل.' },
  },
  {
    icon: MessageSquare,
    title: { en: 'WhatsApp Business Automation', ar: 'أتمتة واتساب للأعمال' },
    desc: { en: 'Send RFQs to suppliers, deliver quote summaries to buyers, and trigger live dispatch alerts.', ar: 'إرسال طلبات التسعير للموردين وملخصات العروض للعملاء وتنبيهات التوصيل تلقائياً.' },
  },
  {
    icon: Lock,
    title: { en: 'Role Security & Full Audit', ar: 'صلاحيات دقيقة وسجل تدقيق' },
    desc: { en: 'Granular role matrices, immutable document versions, and complete user attribution on every action.', ar: 'مصفوفة صلاحيات متقدمة وإصدارات غير قابلة للتعديل وتوثيق كامل لكل إجراء.' },
  },
  {
    icon: Layers,
    title: { en: 'Guided Daftra & CSV Transition', ar: 'انتقال سلس من دفترة وملفات CSV' },
    desc: { en: 'Structured import wizards for customers, suppliers, items, vehicles, and opening balances with zero downtime.', ar: 'أدوات استيراد منظمة للعملاء والموردين والأصناف والمركبات والأرصدة الافتتاحية دون توقف.' },
  },
];

const FAQS: { q: Bi; a: Bi }[] = [
  {
    q: { en: 'Is AutocQuick built only for drop-shipping, or does it handle stocked parts too?', ar: 'هل أوتوكويك مخصص للتوريد المباشر فقط أم يدعم المخزون أيضاً؟' },
    a: {
      en: 'Both. AutocQuick excels at zero-inventory drop-shipping (VIN request → multi-supplier RFQ → auto split PO → direct delivery), while also supporting stocked items, partial receiving, warehouse verification, and counter Point of Sale.',
      ar: 'كلاهما. يتفوق أوتوكويك في التوريد المباشر بدون مخزون (طلب بالهيكل ← تسعير متعدد الموردين ← أمر شراء تلقائي ← توصيل مباشر)، كما يدعم الأصناف المخزنة والاستلام الجزئي ونقاط البيع للكاونتر.',
    },
  },
  {
    q: { en: 'How does ZATCA Phase 2 e-invoicing work inside the platform?', ar: 'كيف تعمل الفوترة الإلكترونية (زاتكا المرحلة الثانية) داخل النظام؟' },
    a: {
      en: 'Invoices and credit notes are generated on the same unified ledger model with compliant VAT calculation, UBL 2.1 XML structure, cryptographic hash chain, and scannable TLV QR codes—eliminating double entry into external accounting tools.',
      ar: 'تصدر الفواتير والإشعارات على نفس نموذج الأستاذ العام بحساب ضريبة القيمة المضافة وبنية XML والختم التشفيري ورمز QR دون الحاجة لإعادة إدخالها في برنامج محاسبي خارجي.',
    },
  },
  {
    q: { en: 'Can our team work simultaneously in Arabic and English?', ar: 'هل يمكن لفريقنا العمل بالعربية والإنجليزية في الوقت نفسه؟' },
    a: {
      en: 'Yes. Every user can switch between Arabic (full RTL with Cairo typography and Hijri dates) and English (LTR) in one click without reloading or changing company settings.',
      ar: 'نعم، يمكن لكل مستخدم التبديل بين العربية (RTL كاملة مع التاريخ الهجري) والإنجليزية (LTR) بنقرة واحدة دون التأثير على بقية الفريق.',
    },
  },
  {
    q: { en: 'How do suppliers submit quotations without calling our sales team?', ar: 'كيف يقدم الموردون عروض الأسعار دون مكالمات متكررة مع المبيعات؟' },
    a: {
      en: 'Suppliers sign in to the dedicated Supplier Portal (or respond via structured links) where every RFQ lists the decoded vehicle, VIN, and part lines. Their prices, lead times, and warranties feed directly into your comparison matrix.',
      ar: 'يدخل الموردون إلى بوابة الموردين المخصصة حيث يعرض كل طلب تسعير بيانات المركبة ورقم الهيكل والقطع، فتظهر أسعارهم ومدة التوريد والضمان مباشرة في جدول المقارنة لديك.',
    },
  },
  {
    q: { en: 'What happens when a driver delivers parts in a garage with no internet?', ar: 'ماذا يحدث عند تسليم القطع في ورشة لا تتوفر فيها تغطية إنترنت؟' },
    a: {
      en: 'The Driver Mobile PWA caches assigned deliveries locally. Drivers can scan items, take delivery photos, capture customer signatures, and record GPS stamps completely offline—everything syncs automatically once connectivity returns.',
      ar: 'يحتفظ تطبيق السائقين ببيانات التسليم محلياً، فيمكنه مسح القطع والتقاط الصورة والتوقيع والموقع دون اتصال، وتتم المزامنة تلقائياً فور عودة الشبكة.',
    },
  },
  {
    q: { en: 'Can we migrate our existing customers and balances from Daftra or Excel?', ar: 'هل يمكننا نقل عملائنا وأرصدتنا الحالية من دفترة أو إكسل؟' },
    a: {
      en: 'Yes. AutocQuick includes built-in import pipelines and a guided Daftra transition workflow under Integrations so you can bring over customers, vendors, vehicle records, and opening ledger balances cleanly.',
      ar: 'نعم، يتضمن أوتوكويك مسارات استيراد مدمجة وخطة انتقال منظّمة من دفترة ضمن التكاملات لنقل العملاء والموردين والمركبات والأرصدة الافتتاحية بسلاسة.',
    },
  },
];

const AI_PROMPTS: { q: Bi; answer: Bi; metric: string; tag: Bi }[] = [
  {
    q: { en: 'Overdue receivables > 30 days?', ar: 'الذمم المتأخرة أكثر من 30 يوماً؟' },
    answer: {
      en: '4 B2B fleet accounts total SAR 64,250 overdue (68% in 31–60d bucket). Top exposure: Al-Riyadh Fleet Maintenance at SAR 28,400.',
      ar: '4 حسابات أساطيل متأخرة بإجمالي 64,250 ر.س (68% ضمن شريحة 31–60 يوماً). أعلى انكشاف: صيانة أسطول الرياض بمبلغ 28,400 ر.س.',
    },
    metric: 'SAR 64,250',
    tag: { en: 'Collections · SQL verified', ar: 'التحصيل · موثّق من SQL' },
  },
  {
    q: { en: 'Best margin supplier this month?', ar: 'أعلى مورد هامش ربح هذا الشهر؟' },
    answer: {
      en: 'Al-Majd OEM Parts leads with 26.4% average gross margin across 42 fulfilled POs and a 98.1% on-time delivery rate.',
      ar: 'شركة المجد للقطع الأصلية في الصدارة بمتوسط هامش ربح 26.4% عبر 42 أمر شراء وبنسبة التزام تسليم 98.1%.',
    },
    metric: '26.4% GM',
    tag: { en: 'Procurement · Live GL', ar: 'المشتريات · بيانات حية' },
  },
  {
    q: { en: 'Pending credit approvals right now?', ar: 'اعتمادات الائتمان المعلقة الآن؟' },
    answer: {
      en: '3 credit-limit overrides totaling SAR 18,335 awaiting Manager review. None overdue; average SLA remaining is 3h 40m.',
      ar: '3 طلبات تجاوز حد ائتماني بإجمالي 18,335 ر.س بانتظار اعتماد المدير دون أي تأخير، بمتوسط مهلة متبقية 3 ساعات و40 دقيقة.',
    },
    metric: '3 Pending',
    tag: { en: 'Approvals · Real-time', ar: 'الاعتمادات · لحظي' },
  },
];

export function LandingPage() {
  const { lang, setLang } = useT();
  const ar = lang === 'ar';
  const pick = (b: Bi) => (ar ? b.ar : b.en);

  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [activeStage, setActiveStage] = useState(0);
  const [activePortal, setActivePortal] = useState(0);
  const [activePrompt, setActivePrompt] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [heroTab, setHeroTab] = useState<'rfq' | 'credit' | 'zatca'>('rfq');

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const stage = STAGES[activeStage] ?? STAGES[0];
  const portal = PORTALS[activePortal] ?? PORTALS[0];
  const promptItem = AI_PROMPTS[activePrompt] ?? AI_PROMPTS[0];

  return (
    <div className="min-h-screen bg-bg text-fg selection:bg-gold/30">
      {/* ═══════════════════════════════════════════════════════════════════════
          1. STICKY ARCHITECTURAL NAVIGATION BAR
      ═══════════════════════════════════════════════════════════════════════ */}
      <header
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-200',
          scrolled
            ? 'border-b border-white/10 bg-[#08162B]/92 shadow-[0_8px_30px_rgba(4,12,26,0.35)] backdrop-blur-md'
            : 'border-b border-white/[0.06] bg-[#08162B]/65 backdrop-blur-sm'
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-[1320px] items-center justify-between gap-4 px-5 lg:px-8">
          <Link href="/" className="shrink-0 focus-visible:outline-gold">
            <BrandLogo size={36} subtitle={ar ? 'منصة تخطيط الموارد' : 'ERP PLATFORM'} dark />
          </Link>

          <nav aria-label={ar ? 'التنقل الرئيسي' : 'Primary'} className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-sm px-3.5 py-2 text-[13.5px] font-medium text-onnavy-secondary transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                {pick(item.label)}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLang(ar ? 'en' : 'ar')}
              className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-white/15 bg-white/[0.05] px-3 text-[12.5px] font-semibold text-onnavy-secondary transition-colors hover:border-gold/50 hover:bg-white/10 hover:text-white"
              aria-label={ar ? 'Switch to English' : 'التبديل إلى العربية'}
            >
              <Globe size={14} className="text-gold" />
              <span className={!ar ? 'font-arabic' : undefined}>{ar ? 'English' : 'العربية'}</span>
            </button>

            <Link
              href="/register"
              className="hidden h-9 items-center rounded-sm border border-white/15 px-3.5 text-[13px] font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/[0.08] sm:inline-flex"
            >
              {ar ? 'تسجيل شركة' : 'Register'}
            </Link>

            <Link
              href="/login"
              className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-gold px-4 text-[13px] font-bold text-navy transition-all hover:bg-gold-hover"
            >
              <span>{ar ? 'تسجيل الدخول' : 'Sign in'}</span>
              <ArrowRight size={14} className="rtl:rotate-180" />
            </Link>

            <button
              type="button"
              onClick={() => setMobileMenu((v) => !v)}
              className="grid h-9 w-9 place-items-center rounded-sm border border-white/15 text-white hover:bg-white/10 lg:hidden"
              aria-label={ar ? 'القائمة' : 'Menu'}
            >
              {mobileMenu ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile Nav Drawer */}
        {mobileMenu && (
          <div className="border-t border-white/10 bg-[#08162B] px-5 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenu(false)}
                  className="rounded-sm px-3 py-2.5 text-small font-semibold text-onnavy-secondary hover:bg-white/[0.06] hover:text-white"
                >
                  {pick(item.label)}
                </a>
              ))}
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3">
                <Link
                  href="/register"
                  onClick={() => setMobileMenu(false)}
                  className="inline-flex h-10 items-center justify-center rounded-sm border border-white/20 text-small font-semibold text-white"
                >
                  {ar ? 'تسجيل شركة' : 'Register'}
                </Link>
                <Link
                  href="/vendor"
                  onClick={() => setMobileMenu(false)}
                  className="inline-flex h-10 items-center justify-center rounded-sm border border-gold/40 bg-gold/10 text-small font-semibold text-gold"
                >
                  {ar ? 'كن مورداً' : 'Become supplier'}
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* ═══════════════════════════════════════════════════════════════════════
            2. FULL-BLEED EDITORIAL MIDNIGHT NAVY HERO + LIVE COMMAND PREVIEW
        ═══════════════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden bg-[#071428] pb-20 pt-[112px] text-white lg:pb-24 lg:pt-[132px]">
          {/* Subtle luxury photography + precision blueprint grid + gold glow */}
          <img
            src="/images/login-hero.jpg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right opacity-[0.22] mix-blend-luminosity"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(110deg,rgba(7,20,40,0.97)_0%,rgba(11,31,58,0.88)_52%,rgba(7,20,40,0.82)_100%)]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgba(214,161,58,0.22) 1px, transparent 1px), linear-gradient(to bottom, rgba(214,161,58,0.22) 1px, transparent 1px)',
              backgroundSize: '64px 64px',
              maskImage: 'radial-gradient(ellipse 80% 70% at 70% 35%, black, transparent)',
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 end-1/4 h-[420px] w-[420px] rounded-full bg-gold/[0.12] blur-[110px]"
          />
          <Star className="pointer-events-none absolute -bottom-24 -start-16 text-gold opacity-[0.045]" size={340} />

          <div className="relative mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-12 lg:gap-10">
              {/* Hero Left Column */}
              <div className="lg:col-span-6">
                <div className="inline-flex items-center gap-2 rounded-xs border border-gold/30 bg-gold/[0.1] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold" />
                  <span>{ar ? 'مصمّم لتجارة قطع الغيار في السعودية · زاتكا المرحلة الثانية' : 'BUILT FOR SAUDI AUTO PARTS TRADING · ZATCA PHASE 2'}</span>
                </div>

                <h1 className="mt-6 text-[36px] font-extrabold leading-[1.12] tracking-[-0.03em] text-white sm:text-[48px] lg:text-[54px]">
                  {ar ? (
                    <>
                      قطع غيار السيارات،
                      <span className="block text-gold">من رقم الهيكل إلى التحصيل</span>
                      في مركز قيادة واحد.
                    </>
                  ) : (
                    <>
                      Auto parts trading,
                      <span className="block text-gold">from VIN to cash</span>
                      in one command center.
                    </>
                  )}
                </h1>

                <p className="mt-5 max-w-xl text-[16px] leading-[1.7] text-onnavy-secondary sm:text-[17px]">
                  {ar
                    ? 'منصة ERP متكاملة لتجارة قطع الغيار والتوريد المباشر بدون مخزون: فك رقم الهيكل بالذكاء الاصطناعي، مقارنة عروض الموردين، حماية الهامش والائتمان، تسليم بإثبات دون اتصال، وفوترة زاتكا المرحلة الثانية.'
                    : 'The unified ERP built for drop-shipping and stocked spare-parts distributors: AI VIN decoding, automated supplier RFQs, margin & credit guardrails, offline proof of delivery, and ZATCA Phase 2 accounting.'}
                </p>

                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex h-12 items-center gap-2 rounded-sm bg-gold px-6 text-[14.5px] font-bold text-navy shadow-[0_8px_24px_rgba(214,161,58,0.28)] transition-all hover:-translate-y-0.5 hover:bg-gold-hover"
                  >
                    <span>{ar ? 'الدخول إلى المنصة' : 'Launch workspace'}</span>
                    <ArrowRight size={16} className="rtl:rotate-180" />
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-12 items-center gap-2 rounded-sm border border-white/20 bg-white/[0.06] px-6 text-[14.5px] font-semibold text-white transition-colors hover:border-gold/50 hover:bg-white/10"
                  >
                    <Building2 size={16} className="text-gold" />
                    <span>{ar ? 'تسجيل شركة' : 'Register company'}</span>
                  </Link>
                  <Link
                    href="/vendor"
                    className="inline-flex h-12 items-center gap-1.5 px-3 text-[13.5px] font-semibold text-onnavy-secondary transition-colors hover:text-gold"
                  >
                    <span>{ar ? 'انضم كمورّد' : 'Become a supplier'}</span>
                    <ArrowUpRight size={15} className="rtl:-scale-x-100" />
                  </Link>
                </div>

                {/* Grounded Trust Strip */}
                <div className="mt-10 grid grid-cols-2 gap-x-6 gap-y-2.5 border-t border-white/10 pt-6 text-[12.5px] text-onnavy-muted sm:flex sm:flex-wrap sm:items-center sm:gap-x-6">
                  {[
                    { en: 'ZATCA Phase 2 Ready', ar: 'جاهز لزاتكا المرحلة 2' },
                    { en: 'Arabic RTL & Hijri', ar: 'عربي RTL والتقويم الهجري' },
                    { en: 'Offline Mobile POD', ar: 'إثبات تسليم دون اتصال' },
                    { en: 'Double-Entry Ledger', ar: 'أستاذ عام بالقيد المزدوج' },
                  ].map((item) => (
                    <span key={item.en} className="inline-flex items-center gap-2">
                      <CheckCircle2 size={14} className="shrink-0 text-gold" />
                      <span>{pick(item)}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Hero Right Column: Interactive Live Command Cockpit */}
              <div className="lg:col-span-6">
                <div className="relative rounded-md border border-white/15 bg-[#0A1C36]/95 shadow-[0_24px_64px_rgba(3,10,22,0.65)] backdrop-blur-md">
                  {/* Top gold architectural hairline */}
                  <div className="h-[2px] w-full bg-gradient-to-r from-gold via-[#F3CD77] to-gold/30" />

                  {/* Window Chrome & Live Request Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <BrandMark size={24} />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="mono text-[11.5px] text-gold">REQ-2026-0418</span>
                          <span className="inline-flex h-4 items-center gap-1 rounded-xs bg-positive/15 px-1.5 text-[10px] font-semibold text-positive">
                            <span className="h-1.5 w-1.5 rounded-full bg-positive" />
                            {ar ? 'مباشر' : 'LIVE'}
                          </span>
                        </div>
                        <p className="text-[12px] text-onnavy-muted">
                          {ar ? 'تويوتا لاندكروزر 2024 · هيكل JTMHY05J…4812' : '2024 Toyota Land Cruiser · VIN JTMHY05J…4812'}
                        </p>
                      </div>
                    </div>

                    {/* Interactive Cockpit Mode Switch */}
                    <div className="inline-flex rounded-xs border border-white/10 bg-[#071428] p-0.5 text-[11px] font-semibold">
                      {(
                        [
                          { id: 'rfq', label: { en: 'RFQ Matrix', ar: 'العروض' } },
                          { id: 'credit', label: { en: 'Guardrails', ar: 'الائتمان' } },
                          { id: 'zatca', label: { en: 'ZATCA & POD', ar: 'زاتكا' } },
                        ] as const
                      ).map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setHeroTab(tab.id)}
                          className={cn(
                            'rounded-xs px-2.5 py-1 transition-colors',
                            heroTab === tab.id ? 'bg-gold text-navy' : 'text-onnavy-muted hover:text-white'
                          )}
                        >
                          {pick(tab.label)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Cockpit Body */}
                  <div className="p-5">
                    {heroTab === 'rfq' && (
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span className="font-semibold text-white">
                            {ar ? 'طقم هوبات وفحمات أمامية أصلية · OEM 43512-60191' : 'Front Brake Rotor & Ceramic Kit · OEM 43512-60191'}
                          </span>
                          <span className="rounded-xs border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10.5px] font-semibold text-gold">
                            {ar ? '3 عروض موردين' : '3 Quotes In'}
                          </span>
                        </div>

                        <div className="space-y-2">
                          {[
                            {
                              supplier: { en: 'Al-Majd OEM Genuine', ar: 'المجد للقطع الأصلية' },
                              eta: { en: 'Same day · 3h', ar: 'نفس اليوم · 3س' },
                              cost: 'SAR 1,140',
                              score: '96',
                              winner: true,
                            },
                            {
                              supplier: { en: 'Gulf Auto Distributors', ar: 'موزعو الخليج للسيارات' },
                              eta: { en: 'Next day · 18h', ar: 'اليوم التالي · 18س' },
                              cost: 'SAR 1,185',
                              score: '88',
                              winner: false,
                            },
                            {
                              supplier: { en: 'Riyadh Parts Hub', ar: 'مركز الرياض للقطع' },
                              eta: { en: '2 days · 36h', ar: 'يومان · 36س' },
                              cost: 'SAR 1,120',
                              score: '81',
                              winner: false,
                            },
                          ].map((q) => (
                            <div
                              key={q.supplier.en}
                              className={cn(
                                'flex items-center justify-between gap-3 rounded-sm border px-3.5 py-2.5 transition-colors',
                                q.winner
                                  ? 'border-gold/55 bg-gold/[0.09]'
                                  : 'border-white/10 bg-white/[0.03]'
                              )}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-[13px] font-semibold text-white">{pick(q.supplier)}</span>
                                  {q.winner && (
                                    <span className="rounded-xs bg-gold px-1.5 py-0.5 text-[10px] font-bold uppercase text-navy">
                                      {ar ? 'الأفضل' : 'Best Value'}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 text-[11.5px] text-onnavy-muted">{pick(q.eta)}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-3 text-end">
                                <div>
                                  <p className="num text-[13.5px] font-bold text-white">{q.cost}</p>
                                  <p className="num text-[10.5px] text-onnavy-muted">{ar ? `التقييم ${q.score}/100` : `Score ${q.score}/100`}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="grid grid-cols-3 gap-2.5 border-t border-white/10 pt-3.5">
                          <div className="rounded-sm border border-white/10 bg-white/[0.03] px-3 py-2">
                            <p className="text-[10.5px] uppercase tracking-wider text-onnavy-muted">{ar ? 'سعر البيع' : 'Quote Price'}</p>
                            <p className="num mt-0.5 text-[15px] font-bold text-white">SAR 1,515</p>
                          </div>
                          <div className="rounded-sm border border-positive/25 bg-positive/[0.08] px-3 py-2">
                            <p className="text-[10.5px] uppercase tracking-wider text-positive/90">{ar ? 'صافي الهامش' : 'Gross Margin'}</p>
                            <p className="num mt-0.5 text-[15px] font-bold text-positive">24.8%</p>
                          </div>
                          <div className="rounded-sm border border-gold/25 bg-gold/[0.08] px-3 py-2">
                            <p className="text-[10.5px] uppercase tracking-wider text-gold/90">{ar ? 'حد الائتمان' : 'Credit Check'}</p>
                            <p className="mt-0.5 text-[13.5px] font-bold text-gold">{ar ? 'مُجاز تلقائياً' : 'Cleared'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {heroTab === 'credit' && (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[13.5px] font-bold text-white">{ar ? 'شركة الصالح لصيانة الأساطيل' : 'Al-Saleh Fleet Workshops'}</p>
                            <p className="text-[11.5px] text-onnavy-muted">{ar ? 'فحص سياسات الهامش والائتمان التلقائي' : 'Automated Margin Floor & Credit Exposure Gate'}</p>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-xs bg-positive/15 px-2 py-1 text-[11px] font-semibold text-positive">
                            <ShieldCheck size={13} />
                            {ar ? 'مطابق للسياسة' : 'Policy Passed'}
                          </span>
                        </div>

                        <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3.5">
                          <div className="flex items-center justify-between text-[12px]">
                            <span className="text-onnavy-secondary">{ar ? 'الانكشاف الائتماني المستخدم' : 'Active Credit Exposure'}</span>
                            <span className="num font-bold text-white">SAR 42,800 / 80,000</span>
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-xs bg-white/10">
                            <div className="h-full w-[53.5%] rounded-xs bg-gradient-to-r from-gold to-[#F3CD77]" />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-[11px] text-onnavy-muted">
                            <span className="num">53.5% {ar ? 'مستخدم' : 'utilized'}</span>
                            <span className="num text-positive">{ar ? 'المتاح: SAR 37,200' : 'Available: SAR 37,200'}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5 text-[12px]">
                          <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
                            <p className="text-[10.5px] uppercase tracking-wider text-onnavy-muted">{ar ? 'الحد الأدنى للهامش' : 'Minimum Margin Floor'}</p>
                            <p className="num mt-1 text-[15px] font-bold text-white">18.0% <span className="text-[11.5px] font-semibold text-positive">(+6.8%)</span></p>
                          </div>
                          <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
                            <p className="text-[10.5px] uppercase tracking-wider text-onnavy-muted">{ar ? 'مسار الاعتماد' : 'Approval Routing'}</p>
                            <p className="mt-1 text-[14px] font-bold text-gold">{ar ? 'موافقة آلية · خطوة 1/1' : 'Auto-approved · Step 1/1'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {heroTab === 'zatca' && (
                      <div className="space-y-3.5">
                        <div className="flex items-center justify-between rounded-sm border border-positive/25 bg-positive/[0.07] px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <FileCheck2 size={18} className="text-positive" />
                            <div>
                              <p className="text-[13px] font-bold text-white">{ar ? 'فاتورة زاتكا معتمدة · INV-2026-1094' : 'ZATCA Cleared · INV-2026-1094'}</p>
                              <p className="mono text-[10.5px] text-onnavy-muted">UBL 2.1 · SHA-256 · VAT 15% (SAR 227.25)</p>
                            </div>
                          </div>
                          <span className="num text-[14px] font-bold text-white">SAR 1,742.25</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-gold">
                              <MapPin size={12} />
                              <span>{ar ? 'إثبات التسليم (POD)' : 'Proof of Delivery'}</span>
                            </div>
                            <p className="mt-1.5 text-[12.5px] font-semibold text-white">{ar ? 'وقّعها: أحمد الصالح' : 'Signed: Ahmed Al-Saleh'}</p>
                            <p className="num mt-0.5 text-[11px] text-onnavy-muted">24.7136° N, 46.6753° E · {ar ? 'الرياض' : 'Riyadh'}</p>
                          </div>
                          <div className="rounded-sm border border-white/10 bg-white/[0.03] p-3">
                            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-positive">
                              <Wallet size={12} />
                              <span>{ar ? 'القيد المحاسبي التلقائي' : 'Auto GL Journal'}</span>
                            </div>
                            <p className="num mt-1.5 text-[12px] text-onnavy-secondary">DR 1130 AR · 1,742.25</p>
                            <p className="num text-[12px] text-onnavy-muted">CR 4100 Sales · 1,515.00</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Cockpit Status Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-[#071428]/70 px-5 py-2.5 text-[11.5px] text-onnavy-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <Zap size={12} className="text-gold" />
                      <span>{ar ? 'زمن دورة التسعير: 4.2 دقيقة' : 'Avg RFQ turnaround: 4.2 min'}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-onnavy-secondary">
                      <Clock size={12} />
                      <span>{ar ? 'متزامن لحظياً مع الأستاذ العام' : 'Synced live to General Ledger'}</span>
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            3. ARCHITECTURAL 4-COLUMN METRICS BAND
        ═══════════════════════════════════════════════════════════════════════ */}
        <section className="relative z-10 border-b border-line bg-card">
          <div className="mx-auto grid max-w-[1320px] divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x rtl:lg:divide-x-reverse">
            {METRICS.map((m) => (
              <div key={m.label.en} className="px-6 py-7 lg:px-8">
                <p className="num text-[28px] font-extrabold tracking-tight text-navy">{pick(m.value)}</p>
                <p className="mt-1 text-[14px] font-bold text-fg">{pick(m.label)}</p>
                <p className="mt-0.5 text-caption text-muted">{pick(m.sub)}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            4. INTERACTIVE 6-STAGE "VIN TO CASH" LIFECYCLE EXPLORER
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="workflow" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="overline text-gold-text">{ar ? 'سير العمل المتكامل' : 'END-TO-END OPERATING SYSTEM'}</p>
                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-navy sm:text-[36px]">
                  {ar ? 'ست مراحل مترابطة من طلب القطعة حتى الإيداع البنكي' : 'Six connected stages from part request to bank reconciliation'}
                </h2>
              </div>
              <p className="max-w-md text-[14.5px] leading-relaxed text-muted">
                {ar
                  ? 'كل مستند يرث بيانات المرحلة السابقة تلقائياً — بدون نسخ يدوي بين الجداول أو ضياع في محادثات واتساب.'
                  : 'Every document inherits data from the previous stage automatically — zero copy-pasting between spreadsheets or lost WhatsApp threads.'}
              </p>
            </div>

            {/* 6-Step Selector Rail */}
            <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {STAGES.map((s, idx) => {
                const IconCmp = s.icon;
                const active = idx === activeStage;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveStage(idx)}
                    className={cn(
                      'group relative flex flex-col items-start rounded-md border p-4 text-start transition-all',
                      active
                        ? 'border-navy bg-navy text-white shadow-[0_10px_24px_rgba(11,31,58,0.16)]'
                        : 'border-line bg-card text-fg hover:border-gold-border hover:bg-soft/50'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute inset-x-0 top-0 h-[2px] transition-opacity',
                        active ? 'bg-gold opacity-100' : 'bg-gold/60 opacity-0 group-hover:opacity-100'
                      )}
                    />
                    <div className="flex w-full items-center justify-between">
                      <span className={cn('mono text-[11px] font-semibold', active ? 'text-gold' : 'text-muted')}>{s.num}</span>
                      <IconCmp size={16} className={active ? 'text-gold' : 'text-navy/70'} />
                    </div>
                    <span className="mt-3 text-[13.5px] font-bold leading-snug">{pick(s.short)}</span>
                  </button>
                );
              })}
            </div>

            {/* Active Stage Architectural Showcase Card */}
            <div className="mt-5 overflow-hidden rounded-md border border-line bg-card shadow-card">
              <div className="grid lg:grid-cols-12">
                {/* Left Narrative */}
                <div className="flex flex-col justify-between p-6 sm:p-8 lg:col-span-6 lg:p-10">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-xs border border-gold-border bg-gold-light px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-gold-text">
                      <span className="num">{stage.num} / 06</span>
                      <span>·</span>
                      <span>{pick(stage.engine)}</span>
                    </div>

                    <h3 className="mt-4 text-[22px] font-extrabold leading-snug tracking-tight text-navy sm:text-[26px]">
                      {pick(stage.title)}
                    </h3>
                    <p className="mt-3 text-[15px] leading-relaxed text-muted">{pick(stage.desc)}</p>

                    <ul className="mt-6 space-y-3">
                      {stage.points.map((pt) => (
                        <li key={pt.en} className="flex items-start gap-2.5 text-[14px] font-medium text-strong">
                          <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-xs bg-gold-light text-gold-text">
                            <Check size={13} strokeWidth={2.6} />
                          </span>
                          <span>{pick(pt)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveStage((i) => (i === 0 ? STAGES.length - 1 : i - 1))}
                        className="inline-flex h-9 items-center rounded-sm border border-line bg-card px-3 text-caption font-semibold text-strong hover:border-navy hover:text-navy"
                      >
                        {ar ? 'السابق' : 'Previous'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveStage((i) => (i + 1) % STAGES.length)}
                        className="inline-flex h-9 items-center gap-1 rounded-sm bg-navy px-3.5 text-caption font-semibold text-white hover:bg-navy-hover"
                      >
                        <span>{ar ? 'المرحلة التالية' : 'Next stage'}</span>
                        <ArrowRight size={13} className="rtl:rotate-180" />
                      </button>
                    </div>
                    <Link href="/login" className="inline-flex items-center gap-1 text-caption font-bold text-navy hover:text-gold-text">
                      <span>{ar ? 'جرّبها مباشرة' : 'Try it live'}</span>
                      <ArrowUpRight size={13} className="rtl:-scale-x-100" />
                    </Link>
                  </div>
                </div>

                {/* Right Live Stage Visual Preview */}
                <div className="relative flex items-center justify-center border-t border-line bg-gradient-to-br from-[#0F2A4F] via-[#0B1F3A] to-[#08162B] p-6 text-white sm:p-8 lg:col-span-6 lg:border-s lg:border-t-0 lg:p-10">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-[0.12]"
                    style={{
                      backgroundImage:
                        'linear-gradient(to right, rgba(214,161,58,0.28) 1px, transparent 1px), linear-gradient(to bottom, rgba(214,161,58,0.28) 1px, transparent 1px)',
                      backgroundSize: '36px 36px',
                    }}
                  />
                  <div className="relative w-full max-w-md rounded-md border border-white/15 bg-[#08172E]/95 p-5 shadow-[0_18px_40px_rgba(3,10,22,0.5)]">
                    <StageVisual stageId={stage.id} ar={ar} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            5. ASYMMETRIC BENTO CAPABILITIES GRID
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="platform" className="scroll-mt-20 border-y border-line bg-card py-20 lg:py-24">
          <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="max-w-2xl">
              <p className="overline text-gold-text">{ar ? 'قدرات المنصة' : 'PLATFORM CAPABILITIES'}</p>
              <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-navy sm:text-[36px]">
                {ar ? 'كل أداة يحتاجها موزّع قطع الغيار الحديث — بدون برامج متفرقة' : 'Every capability a modern parts distributor needs — zero stitched-together tools'}
              </h2>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-12">
              {/* Bento 1: Wide AI Operations Assistant (7 cols) */}
              <div className="relative flex flex-col overflow-hidden rounded-md border border-line bg-bg transition-all before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gold lg:col-span-7">
                <div className="grid flex-1 sm:grid-cols-12">
                  <div className="flex flex-col justify-between p-6 sm:col-span-7">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-xs bg-gold-light px-2 py-0.5 text-[11px] font-bold text-gold-text">
                        <Sparkles size={12} />
                        <span>{ar ? 'مساعد العمليات الذكي' : 'AI Operations Analyst'}</span>
                      </span>
                      <h3 className="mt-3 text-[20px] font-extrabold tracking-tight text-navy">
                        {ar ? 'اسأل بياناتك بالعربية أو الإنجليزية' : 'Ask your live ERP data in Arabic or English'}
                      </h3>
                      <p className="mt-2 text-small text-muted">
                        {ar
                          ? 'تحليلات فورية للمبيعات والذمم والموردين مع تصدير CSV ومعاينة استعلام SQL.'
                          : 'Instant executive answers across sales, receivables, and supplier performance with CSV export and inspectable SQL.'}
                      </p>

                      {/* Interactive Prompt Selector */}
                      <div className="mt-4 flex flex-wrap gap-1.5">
                        {AI_PROMPTS.map((p, idx) => (
                          <button
                            key={p.q.en}
                            type="button"
                            onClick={() => setActivePrompt(idx)}
                            className={cn(
                              'rounded-xs border px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
                              activePrompt === idx
                                ? 'border-navy bg-navy text-white'
                                : 'border-line bg-card text-strong hover:border-gold-border'
                            )}
                          >
                            {pick(p.q)}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 rounded-sm border border-line bg-card p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-gold-text">{pick(promptItem.tag)}</span>
                        <span className="num rounded-xs bg-soft px-2 py-0.5 text-[11.5px] font-bold text-navy">{promptItem.metric}</span>
                      </div>
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-strong">{pick(promptItem.answer)}</p>
                    </div>
                  </div>

                  <div className="relative min-h-[200px] overflow-hidden bg-navy sm:col-span-5">
                    <img
                      src="/images/assistant-hero.jpg"
                      alt={ar ? 'مساعد أوتوكويك الذكي' : 'AutocQuick AI Assistant'}
                      className="h-full w-full object-cover opacity-90"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/80 via-transparent to-transparent" />
                    <div className="absolute bottom-3 inset-x-3 rounded-sm border border-white/15 bg-[#08162B]/85 px-3 py-2 text-[11px] text-white backdrop-blur-sm">
                      <p className="font-semibold text-gold">{ar ? 'وصول آمن للقراءة فقط' : 'Read-Only Verified SQL'}</p>
                      <p className="mt-0.5 text-onnavy-muted">{ar ? 'يحترم صلاحيات دور المستخدم تلقائياً' : 'Respects user RBAC permissions'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bento 2: Midnight Navy Credit & Approvals Engine (5 cols) */}
              <div className="relative flex flex-col justify-between overflow-hidden rounded-md border border-navy bg-gradient-to-br from-[#0F2A4F] via-[#0B1F3A] to-[#071428] p-6 text-white lg:col-span-5">
                <div className="pointer-events-none absolute -end-10 -top-10 h-44 w-44 rounded-full bg-gold/15 blur-3xl" />
                <div className="relative">
                  <span className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-gold/10 px-2 py-0.5 text-[11px] font-bold text-gold">
                    <ShieldCheck size={12} />
                    <span>{ar ? 'الرقابة الائتمانية' : 'Credit & Risk Engine'}</span>
                  </span>
                  <h3 className="mt-3 text-[20px] font-extrabold tracking-tight text-white">
                    {ar ? 'أوقف البيع الخاسر والديون المتعثرة قبل حدوثها' : 'Stop margin leaks & credit overruns before fulfillment'}
                  </h3>
                  <p className="mt-2 text-small text-onnavy-secondary">
                    {ar
                      ? 'حدود ائتمانية لحظية، تتبع أعمار الذمم (30/60/90 يوماً)، واعتمادات مدير فورية بنقرة واحدة.'
                      : 'Live credit exposure limits, automated 30/60/90+ day ageing buckets, and one-click manager exception approvals.'}
                  </p>
                </div>

                <div className="relative mt-6 space-y-2.5 rounded-sm border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="font-semibold text-onnavy-secondary">{ar ? 'توزيع أعمار الذمم' : 'Receivables Ageing Radar'}</span>
                    <span className="num font-bold text-gold">SAR 348,900</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 pt-1 text-center">
                    {[
                      { k: { en: 'Current', ar: 'جاري' }, v: '64%', bar: 'bg-positive' },
                      { k: { en: '31–60d', ar: '31–60ي' }, v: '21%', bar: 'bg-gold' },
                      { k: { en: '61–90d', ar: '61–90ي' }, v: '10%', bar: 'bg-[#FB923C]' },
                      { k: { en: '90d+', ar: '+90ي' }, v: '5%', bar: 'bg-[#F87171]' },
                    ].map((b) => (
                      <div key={b.k.en} className="rounded-xs border border-white/10 bg-[#071428]/70 p-2">
                        <div className={cn('mx-auto mb-1.5 h-1 w-full rounded-xs', b.bar)} />
                        <p className="num text-[13px] font-bold text-white">{b.v}</p>
                        <p className="text-[10px] text-onnavy-muted">{pick(b.k)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bento 3: Counter POS (4 cols) */}
              <div className="flex flex-col overflow-hidden rounded-md border border-line bg-bg transition-all hover:border-gold-border lg:col-span-4">
                <div className="relative h-36 overflow-hidden bg-navy">
                  <img
                    src="/images/pos-hero.jpg"
                    alt={ar ? 'نقطة بيع قطع الغيار' : 'Auto parts Point of Sale'}
                    className="h-full w-full object-cover object-center opacity-90"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#08162B]/85 via-transparent to-transparent" />
                  <span className="absolute bottom-3 start-4 inline-flex items-center gap-1.5 rounded-xs bg-gold px-2 py-0.5 text-[10.5px] font-bold uppercase text-navy">
                    <Store size={11} />
                    <span>{ar ? 'نقطة البيع POS' : 'Counter POS'}</span>
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-between p-5">
                  <div>
                    <h3 className="text-[17px] font-extrabold text-navy">{ar ? 'مبيعات الكاونتر وإدارة الورديات' : 'Walk-in counter sales & shift control'}</h3>
                    <p className="mt-1.5 text-small text-muted">
                      {ar
                        ? 'افتح الوردية بعهدة نقدية، امسح القطع، اقبل مدى والكاش، وأصدر فاتورة حرارية فورية.'
                        : 'Open cash shifts with preset floats, scan items, accept Mada & cash split tenders, and print instant receipts.'}
                    </p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5 text-[11px] font-semibold text-strong">
                    <span className="rounded-xs border border-line bg-card px-2 py-0.5">{ar ? 'عهدة الوردية' : 'Cash float'}</span>
                    <span className="rounded-xs border border-line bg-card px-2 py-0.5">{ar ? 'مدى وبطاقات' : 'Mada / Card'}</span>
                    <span className="rounded-xs border border-line bg-card px-2 py-0.5">{ar ? 'زاتكا فوري' : 'Instant ZATCA'}</span>
                  </div>
                </div>
              </div>

              {/* Bento 4: Unified Double-Entry Ledger (4 cols) */}
              <div className="flex flex-col justify-between rounded-md border border-line bg-bg p-6 transition-all hover:border-gold-border lg:col-span-4">
                <div>
                  <span className="grid h-10 w-10 place-items-center rounded-md bg-navy text-gold">
                    <Wallet size={19} />
                  </span>
                  <h3 className="mt-4 text-[17px] font-extrabold text-navy">{ar ? 'محاسبة مزدوجة القيد على نفس البيانات' : 'Double-entry accounting on one data model'}</h3>
                  <p className="mt-1.5 text-small text-muted">
                    {ar
                      ? 'كل فاتورة ومرتجع وسند قبض ومصروف يُرحّل تلقائياً لشجرة الحسابات وإقرار ضريبة القيمة المضافة.'
                      : 'Every invoice, return, receipt, and expense posts automatically to your chart of accounts, VAT return, and P&L.'}
                  </p>
                </div>

                <div className="mt-5 space-y-2 rounded-sm border border-line bg-card p-3.5 text-[12px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{ar ? 'هامش الربح الإجمالي' : 'Gross Profit Margin'}</span>
                    <span className="num font-bold text-success">25.4%</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line/70 pt-2">
                    <span className="text-muted">{ar ? 'إقرار الضريبة (15%)' : 'VAT Return (15%)'}</span>
                    <span className="font-semibold text-navy">{ar ? 'مطابق آلياً' : 'Auto-reconciled'}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-line/70 pt-2">
                    <span className="text-muted">{ar ? 'التسوية البنكية' : 'Bank Reconciliation'}</span>
                    <span className="font-semibold text-gold-text">{ar ? 'تطابق يومي' : 'Daily Match'}</span>
                  </div>
                </div>
              </div>

              {/* Bento 5: Live Integrations & Automation (4 cols) */}
              <div className="flex flex-col justify-between rounded-md border border-line bg-bg p-6 transition-all hover:border-gold-border lg:col-span-4">
                <div>
                  <span className="grid h-10 w-10 place-items-center rounded-md bg-gold-light text-gold-text">
                    <Zap size={19} />
                  </span>
                  <h3 className="mt-4 text-[17px] font-extrabold text-navy">{ar ? 'تكاملات جاهزة وأتمتة تنبيهات' : 'Connected integrations & smart alerts'}</h3>
                  <p className="mt-1.5 text-small text-muted">
                    {ar
                      ? 'اربط واتساب، زاتكا، بوابات الدفع، وجدولة التقارير التلقائية للمديرين عبر البريد.'
                      : 'Connect WhatsApp, ZATCA, payment gateways, webhooks, and scheduled executive report digests out of the box.'}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 text-[12px] font-semibold">
                  {[
                    { en: 'ZATCA Fatoora', ar: 'زاتكا فاتورة' },
                    { en: 'WhatsApp Cloud', ar: 'واتساب سحابي' },
                    { en: 'Mada / Tap Pay', ar: 'مدى / تاب' },
                    { en: 'Daftra Bridge', ar: 'انتقال دفترة' },
                  ].map((intg) => (
                    <div key={intg.en} className="flex items-center gap-2 rounded-sm border border-line bg-card px-3 py-2 text-strong">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                      <span className="truncate">{pick(intg)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            6. INTERACTIVE 4-PORTAL ECOSYSTEM SHOWCASE
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="portals" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="max-w-2xl">
                <p className="overline text-gold-text">{ar ? 'منظومة البوابات الأربع' : 'ONE CORE · FOUR DEDICATED PORTALS'}</p>
                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-navy sm:text-[36px]">
                  {ar ? 'تجربة مخصّصة لكل طرف في سلسلة قطع الغيار' : 'Purpose-built experiences for every participant in the chain'}
                </h2>
              </div>
            </div>

            {/* Portal Selector Tabs */}
            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PORTALS.map((p, idx) => {
                const PIcon = p.icon;
                const active = idx === activePortal;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setActivePortal(idx)}
                    className={cn(
                      'flex items-start gap-3.5 rounded-md border p-4 text-start transition-all',
                      active
                        ? 'border-navy bg-navy text-white shadow-[0_10px_24px_rgba(11,31,58,0.16)]'
                        : 'border-line bg-card text-fg hover:border-gold-border'
                    )}
                  >
                    <span
                      className={cn(
                        'grid h-10 w-10 shrink-0 place-items-center rounded-md',
                        active ? 'bg-gold text-navy' : 'bg-soft text-navy'
                      )}
                    >
                      <PIcon size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-bold">{pick(p.name)}</p>
                      <p className={cn('mt-0.5 line-clamp-1 text-[11.5px]', active ? 'text-onnavy-muted' : 'text-muted')}>
                        {pick(p.role)}
                      </p>
                      <span className={cn('mono mt-1.5 inline-block text-[10.5px]', active ? 'text-gold' : 'text-gold-text')}>
                        {p.route}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Active Portal Showcase */}
            <div className="mt-5 overflow-hidden rounded-md border border-line bg-card shadow-card">
              <div className="grid lg:grid-cols-12">
                <div className="p-6 sm:p-8 lg:col-span-7 lg:p-10">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-xs bg-navy px-2.5 py-0.5 text-[11px] font-bold text-gold">{pick(portal.name)}</span>
                    <span className="mono rounded-xs border border-line bg-soft px-2 py-0.5 text-[11px] text-muted">{portal.route}</span>
                  </div>
                  <h3 className="mt-4 text-[22px] font-extrabold leading-snug text-navy sm:text-[26px]">
                    {pick(portal.headline)}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{pick(portal.desc)}</p>

                  <div className="mt-6 space-y-3">
                    {portal.bullets.map((b) => (
                      <div key={b.en} className="flex items-start gap-2.5 text-[14px] font-medium text-strong">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-gold-text" />
                        <span>{pick(b)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Link
                      href={portal.ctaHref}
                      className="inline-flex h-11 items-center gap-2 rounded-sm bg-navy px-5 text-[13.5px] font-bold text-white transition-colors hover:bg-navy-hover"
                    >
                      <span>{pick(portal.ctaLabel)}</span>
                      <ArrowRight size={15} className="rtl:rotate-180" />
                    </Link>
                    <span className="text-caption text-muted">{pick(portal.role)}</span>
                  </div>
                </div>

                {/* Portal Right KPI & Architectural Summary Panel */}
                <div className="flex flex-col justify-between border-t border-line bg-soft/60 p-6 sm:p-8 lg:col-span-5 lg:border-s lg:border-t-0 lg:p-10">
                  <div>
                    <p className="overline text-muted">{ar ? 'مؤشرات البوابة' : 'PORTAL HIGHLIGHTS'}</p>
                    <div className="mt-4 grid grid-cols-3 gap-3">
                      {portal.kpis.map((k) => (
                        <div key={k.label.en} className="rounded-md border border-line bg-card p-3.5">
                          <p className="num text-[18px] font-extrabold text-navy">{k.val}</p>
                          <p className="mt-1 text-[11px] font-medium leading-tight text-muted">{pick(k.label)}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="mt-6 rounded-md border border-navy/15 bg-navy p-5 text-white">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
                        {ar ? 'مزامنة موحّدة' : 'UNIFIED DATA MODEL'}
                      </span>
                      <span className="mono text-[11px] text-onnavy-muted">{portal.route}</span>
                    </div>
                    <p className="mt-2.5 text-[13.5px] leading-relaxed text-onnavy-secondary">
                      {ar
                        ? 'كل إجراء في هذه البوابة ينعكس فوراً في الطلبات والموافقات والأستاذ العام دون أي ترحيل يدوي.'
                        : 'Every action inside this portal writes directly to the shared ERP core — orders, approvals, inventory, and ledger stay 100% synchronized.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            7. SAUDI ENTERPRISE READINESS & ZATCA BAND (MIDNIGHT NAVY)
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="compliance" className="relative scroll-mt-20 overflow-hidden bg-[#08162B] py-20 text-white lg:py-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(214,161,58,0.14),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(214,161,58,0.1),transparent_45%)]"
          />
          <Star className="pointer-events-none absolute -end-20 -top-20 text-gold opacity-[0.05]" size={300} />

          <div className="relative mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="grid items-end gap-6 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <p className="overline text-gold">{ar ? 'جاهزية المؤسسات السعودية' : 'SAUDI ENTERPRISE ARCHITECTURE'}</p>
                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-white sm:text-[36px]">
                  {ar ? 'مبني من الصفر لسوق المملكة — وليس نظاماً عاماً مترجماً' : 'Engineered natively for Saudi trade — not a patched generic ERP'}
                </h2>
              </div>
              <p className="text-[15px] leading-relaxed text-onnavy-secondary lg:col-span-5">
                {ar
                  ? 'من الامتثال التشفيري لهيئة الزكاة والضريبة والجمارك، إلى دعم اللغة العربية الكامل والتاريخ الهجري ووسائل الدفع المحلية.'
                  : 'From ZATCA Phase 2 cryptographic e-invoicing to native Arabic RTL typography, Hijri dates, Mada payments, and guided Daftra migration.'}
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COMPLIANCE_ITEMS.map((item) => {
                const CIcon = item.icon;
                return (
                  <div
                    key={item.title.en}
                    className="group relative rounded-md border border-white/10 bg-white/[0.04] p-6 transition-all hover:border-gold/45 hover:bg-white/[0.07]"
                  >
                    <span className="grid h-10 w-10 place-items-center rounded-md border border-gold/25 bg-gold/10 text-gold">
                      <CIcon size={19} />
                    </span>
                    <h3 className="mt-4 text-[16px] font-bold text-white">{pick(item.title)}</h3>
                    <p className="mt-2 text-small leading-relaxed text-onnavy-muted">{pick(item.desc)}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            8. EXECUTIVE FAQ ACCORDION
        ═══════════════════════════════════════════════════════════════════════ */}
        <section id="faq" className="scroll-mt-20 py-20 lg:py-24">
          <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-12">
              <div className="lg:col-span-4">
                <p className="overline text-gold-text">{ar ? 'الأسئلة الشائعة' : 'FREQUENTLY ASKED'}</p>
                <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-navy sm:text-[32px]">
                  {ar ? 'إجابات واضحة لفرق المبيعات والمشتريات والمالية' : 'Straight answers for sales, sourcing & finance teams'}
                </h2>
                <p className="mt-3 text-small leading-relaxed text-muted">
                  {ar
                    ? 'هل لديك متطلبات مخصصة لأسطولك أو فروعك؟ سجّل شركتك وسيساعدك فريقنا في الإعداد.'
                    : 'Running multiple branches, B2B fleets, or migrating from legacy accounting? Register your workspace and get started.'}
                </p>
                <Link
                  href="/register"
                  className="mt-6 inline-flex h-10 items-center gap-2 rounded-sm border border-navy bg-card px-4 text-small font-bold text-navy transition-colors hover:bg-navy hover:text-white"
                >
                  <span>{ar ? 'تسجيل شركة جديدة' : 'Register your company'}</span>
                  <ArrowRight size={14} className="rtl:rotate-180" />
                </Link>
              </div>

              <div className="divide-y divide-line overflow-hidden rounded-md border border-line bg-card shadow-card lg:col-span-8">
                {FAQS.map((item, idx) => {
                  const open = openFaq === idx;
                  return (
                    <div key={item.q.en}>
                      <button
                        type="button"
                        onClick={() => setOpenFaq(open ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-start transition-colors hover:bg-soft/45"
                        aria-expanded={open}
                      >
                        <span className="text-[15px] font-bold text-navy">{pick(item.q)}</span>
                        <ChevronDown
                          size={18}
                          className={cn('shrink-0 text-gold-text transition-transform duration-200', open && 'rotate-180')}
                        />
                      </button>
                      {open && (
                        <div className="px-6 pb-5 pt-0.5 text-[14.5px] leading-relaxed text-muted">
                          {pick(item.a)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════════
            9. HIGH-IMPACT CLOSING CTA BANNER
        ═══════════════════════════════════════════════════════════════════════ */}
        <section className="pb-20 lg:pb-24">
          <div className="mx-auto max-w-[1320px] px-5 lg:px-8">
            <div className="relative overflow-hidden rounded-md border border-navy bg-[#08162B] px-6 py-12 text-white shadow-[0_20px_50px_rgba(11,31,58,0.22)] sm:px-12 sm:py-16">
              <img
                src="/images/signup-hero.jpg"
                alt=""
                aria-hidden
                className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.22] mix-blend-luminosity"
              />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#071428]/95 via-[#0B1F3A]/90 to-[#08162B]/80"
              />
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-gold via-[#F3CD77] to-transparent" />

              <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
                <div className="max-w-2xl">
                  <p className="overline text-gold">{ar ? 'ابدأ اليوم' : 'GET STARTED TODAY'}</p>
                  <h2 className="mt-2 text-[28px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[38px]">
                    {ar
                      ? 'وحّد مبيعاتك ومشترياتك ومحاسبتك في منصة واحدة.'
                      : 'Unify your auto-parts sourcing, credit, delivery and accounting.'}
                  </h2>
                  <p className="mt-3 text-[15.5px] text-onnavy-secondary">
                    {ar
                      ? 'ادخل مباشرة إلى مساحة عملك، أو سجّل حساب شركة B2B، أو انضم إلى شبكة الموردين المعتمدين.'
                      : 'Sign in to your ERP workspace, register a B2B corporate account, or apply to join our vetted supplier network.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Link
                    href="/login"
                    className="inline-flex h-12 items-center gap-2 rounded-sm bg-gold px-6 text-[14.5px] font-bold text-navy shadow-[0_8px_24px_rgba(214,161,58,0.28)] transition-all hover:bg-gold-hover"
                  >
                    <span>{ar ? 'تسجيل الدخول' : 'Sign in now'}</span>
                    <ArrowRight size={16} className="rtl:rotate-180" />
                  </Link>
                  <Link
                    href="/register"
                    className="inline-flex h-12 items-center rounded-sm border border-white/25 bg-white/[0.06] px-5 text-[14px] font-semibold text-white transition-colors hover:border-gold/50 hover:bg-white/10"
                  >
                    {ar ? 'تسجيل شركة' : 'Register company'}
                  </Link>
                  <Link
                    href="/vendor"
                    className="inline-flex h-12 items-center rounded-sm border border-gold/40 bg-gold/10 px-5 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/20"
                  >
                    {ar ? 'تقديم كمورّد' : 'Become supplier'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════════════════════════════════════════════════════════════════
          10. ARCHITECTURAL MULTI-COLUMN FOOTER
      ═══════════════════════════════════════════════════════════════════════ */}
      <footer className="border-t border-white/10 bg-[#071428] text-white">
        <div className="mx-auto max-w-[1320px] px-5 py-14 lg:px-8">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <BrandLogo size={38} subtitle={ar ? 'منصة تخطيط الموارد' : 'ERP PLATFORM'} dark />
              <p className="mt-4 max-w-sm text-small leading-relaxed text-onnavy-muted">
                {ar
                  ? 'النظام التشغيلي والمحاسبي المتكامل لتجارة قطع غيار السيارات في المملكة العربية السعودية — من رقم الهيكل حتى التحصيل وزاتكا.'
                  : 'The unified operational and financial ERP for automotive spare-parts distributors in Saudi Arabia — from VIN request to cash and ZATCA Phase 2.'}
              </p>
              <button
                type="button"
                onClick={() => setLang(ar ? 'en' : 'ar')}
                className="mt-5 inline-flex h-9 items-center gap-2 rounded-sm border border-white/15 bg-white/[0.04] px-3 text-caption font-semibold text-onnavy-secondary hover:border-gold/50 hover:text-white"
              >
                <Globe size={13} className="text-gold" />
                <span className={!ar ? 'font-arabic' : undefined}>{ar ? 'Switch to English' : 'التبديل إلى العربية'}</span>
              </button>
            </div>

            <div className="lg:col-span-2">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">{ar ? 'المنصة' : 'Platform'}</p>
              <ul className="mt-4 space-y-2.5 text-small text-onnavy-muted">
                {NAV_LINKS.map((l) => (
                  <li key={l.href}>
                    <a href={l.href} className="transition-colors hover:text-white">
                      {pick(l.label)}
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-2">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">{ar ? 'البوابات' : 'Access'}</p>
              <ul className="mt-4 space-y-2.5 text-small text-onnavy-muted">
                <li>
                  <Link href="/login" className="transition-colors hover:text-white">{ar ? 'تسجيل الدخول (ERP)' : 'Sign in (ERP)'}</Link>
                </li>
                <li>
                  <Link href="/register" className="transition-colors hover:text-white">{ar ? 'تسجيل شركة (B2B)' : 'Register company'}</Link>
                </li>
                <li>
                  <Link href="/vendor" className="transition-colors hover:text-white">{ar ? 'بوابة الموردين' : 'Supplier onboarding'}</Link>
                </li>
                <li>
                  <Link href="/app/pos" className="transition-colors hover:text-white">{ar ? 'نقطة البيع POS' : 'Point of sale'}</Link>
                </li>
              </ul>
            </div>

            <div className="lg:col-span-3">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.1em] text-gold">{ar ? 'المعايير والامتثال' : 'Standards'}</p>
              <ul className="mt-4 space-y-2.5 text-small text-onnavy-muted">
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-gold" />
                  <span>{ar ? 'متوافق مع زاتكا المرحلة الثانية' : 'ZATCA Phase 2 (Fatoora)'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-gold" />
                  <span>{ar ? 'ثنائي اللغة عربي / إنجليزي' : 'Bilingual Arabic RTL & English'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-gold" />
                  <span>{ar ? 'دعم العمل دون اتصال (PWA)' : 'Offline-first Mobile PWA'}</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 size={13} className="text-gold" />
                  <span>{ar ? 'أستاذ عام بالقيد المزدوج' : 'Double-entry General Ledger'}</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-caption text-onnavy-muted">
            <p>© {new Date().getFullYear()} AutocQuick ERP. {ar ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</p>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-positive" />
              <span>{ar ? 'جميع الأنظمة تعمل بكفاءة · الرياض، المملكة العربية السعودية' : 'All systems operational · Riyadh, Saudi Arabia'}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Dedicated live-UI miniature card rendered for each of the 6 workflow stages. */
function StageVisual({ stageId, ar }: { stageId: string; ar: boolean }) {
  if (stageId === 'vin') {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'فك ترميز رقم الهيكل' : 'AI VIN DECODER'}</span>
          <span className="rounded-xs bg-positive/15 px-2 py-0.5 text-[10.5px] font-semibold text-positive">{ar ? 'تم التعرف 99%' : 'Matched 99%'}</span>
        </div>
        <div className="rounded-sm border border-gold/40 bg-white/[0.04] px-3 py-2.5">
          <p className="text-[10px] uppercase text-onnavy-muted">VIN (17)</p>
          <p className="mono mt-0.5 text-[13.5px] tracking-widest text-white">JTMHY05J4R4094812</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <div className="rounded-xs border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-[10px] text-onnavy-muted">{ar ? 'المركبة' : 'Vehicle'}</p>
            <p className="mt-0.5 font-semibold text-white">Toyota Land Cruiser</p>
          </div>
          <div className="rounded-xs border border-white/10 bg-white/[0.03] p-2.5">
            <p className="text-[10px] text-onnavy-muted">{ar ? 'السنة / المحرك' : 'Year / Engine'}</p>
            <p className="mt-0.5 font-semibold text-white">2024 · 3.5L V6 TT</p>
          </div>
        </div>
        <div className="space-y-1.5 border-t border-white/10 pt-3">
          <p className="text-[11px] font-semibold text-onnavy-secondary">{ar ? 'أرقام القطع المقترحة:' : 'AI-Suggested OEM Parts:'}</p>
          <div className="flex items-center justify-between rounded-xs bg-white/[0.05] px-3 py-2 text-[12px]">
            <span className="font-medium text-white">{ar ? 'هوب فرامل أمامي أصلي' : 'Front Brake Disc Rotor'}</span>
            <span className="mono text-gold">43512-60191</span>
          </div>
          <div className="flex items-center justify-between rounded-xs bg-white/[0.05] px-3 py-2 text-[12px]">
            <span className="font-medium text-white">{ar ? 'فحمات فرامل سيراميك' : 'Ceramic Brake Pad Kit'}</span>
            <span className="mono text-gold">04465-60370</span>
          </div>
        </div>
      </div>
    );
  }

  if (stageId === 'rfq') {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'مصفوفة عروض الموردين' : 'RFQ COMPARISON MATRIX'}</span>
          <span className="mono text-[11px] text-onnavy-muted">RFQ-2026-0891</span>
        </div>
        {[
          { name: ar ? 'المجد للقطع الأصلية' : 'Al-Majd OEM', price: 'SAR 1,140', eta: ar ? '3 ساعات' : '3 hrs', warranty: ar ? '12 شهر' : '12 mo', best: true },
          { name: ar ? 'موزعو الخليج' : 'Gulf Auto', price: 'SAR 1,185', eta: ar ? '18 ساعة' : '18 hrs', warranty: ar ? '12 شهر' : '12 mo', best: false },
          { name: ar ? 'توريد الرياض' : 'Riyadh Supply', price: 'SAR 1,120', eta: ar ? '48 ساعة' : '48 hrs', warranty: ar ? '6 أشهر' : '6 mo', best: false },
        ].map((row) => (
          <div
            key={row.name}
            className={cn(
              'flex items-center justify-between rounded-sm border px-3 py-2.5 text-[12px]',
              row.best ? 'border-gold/60 bg-gold/10' : 'border-white/10 bg-white/[0.03]'
            )}
          >
            <div>
              <p className="font-bold text-white">{row.name}</p>
              <p className="text-[11px] text-onnavy-muted">{row.eta} · {row.warranty}</p>
            </div>
            <div className="text-end">
              <p className="num font-bold text-white">{row.price}</p>
              {row.best && <span className="text-[10px] font-bold text-gold">{ar ? '★ أفضل قيمة' : '★ Best value'}</span>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (stageId === 'guardrails') {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'بوابة الهامش والائتمان' : 'APPROVAL & RISK GATE'}</span>
          <span className="rounded-xs bg-gold/15 px-2 py-0.5 text-[10.5px] font-semibold text-gold">{ar ? 'اعتماد المدير' : 'Manager Step 1/1'}</span>
        </div>
        <div className="rounded-sm border border-white/10 bg-white/[0.04] p-3.5">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-bold text-white">{ar ? 'أحمد الصالح' : 'Ahmed Al-Saleh'}</span>
            <span className="num font-bold text-gold">SAR 6,111.92</span>
          </div>
          <p className="mt-1 text-[11.5px] text-[#FCA5A5]">{ar ? 'تجاوز الحد الائتماني: 6,111.92 > الحد 5,000.00' : 'Credit limit exceeded: 6,111.92 > limit 5,000.00'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xs border border-positive/30 bg-positive/10 px-3 py-2 text-center text-[12px] font-bold text-positive">
            ✓ {ar ? 'اعتماد الطلب' : 'Approve Order'}
          </div>
          <div className="rounded-xs border border-white/15 bg-white/[0.04] px-3 py-2 text-center text-[12px] font-semibold text-onnavy-secondary">
            ✕ {ar ? 'رفض مع سبب' : 'Reject w/ Note'}
          </div>
        </div>
      </div>
    );
  }

  if (stageId === 'pos') {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'نقطة البيع وأوامر الشراء' : 'COUNTER POS & AUTO PO'}</span>
          <span className="rounded-xs bg-positive/15 px-2 py-0.5 text-[10.5px] font-semibold text-positive">{ar ? 'وردية مفتوحة' : 'Shift Open'}</span>
        </div>
        <div className="space-y-2 rounded-sm border border-white/10 bg-white/[0.03] p-3 text-[12px]">
          <div className="flex justify-between">
            <span className="text-onnavy-secondary">{ar ? 'أمر شراء تلقائي #PO-412' : 'Auto Split PO #PO-412'}</span>
            <span className="mono text-gold">Al-Majd OEM</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-onnavy-secondary">{ar ? 'عهدة الصندوق الافتتاحية' : 'Opening Cash Float'}</span>
            <span className="num font-bold text-white">SAR 1,000.00</span>
          </div>
          <div className="flex justify-between border-t border-white/10 pt-2">
            <span className="text-onnavy-secondary">{ar ? 'مبيعات الكاونتر (مدى + كاش)' : 'Shift Sales (Mada + Cash)'}</span>
            <span className="num font-bold text-positive">SAR 14,820.00</span>
          </div>
        </div>
      </div>
    );
  }

  if (stageId === 'delivery') {
    return (
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'تطبيق التسليم الميداني' : 'MOBILE DRIVER POD'}</span>
          <span className="rounded-xs border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10.5px] font-semibold text-gold">{ar ? 'جاهز دون اتصال' : 'Offline Ready'}</span>
        </div>
        <div className="space-y-2 rounded-sm border border-white/10 bg-white/[0.04] p-3.5 text-[12px]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">{ar ? 'ورشة الدرعية المركزية' : 'Diriyah Central Garage'}</span>
            <span className="text-positive">{ar ? 'تم التسليم ✓' : 'Delivered ✓'}</span>
          </div>
          <p className="num text-[11px] text-onnavy-muted">GPS: 24.7341° N, 46.5728° E · 2/2 {ar ? 'قطع ممسوحة' : 'parts scanned'}</p>
          <div className="mt-2 flex items-center justify-between rounded-xs border border-dashed border-gold/40 bg-[#071428] px-3 py-2.5">
            <span className="text-[11px] text-onnavy-muted">{ar ? 'توقيع المستلم الرقمي' : 'Customer Digital Signature'}</span>
            <span className="font-serif text-[15px] italic text-gold">A. Al-Saleh</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gold">{ar ? 'زاتكا والأستاذ العام' : 'ZATCA P2 & LEDGER'}</span>
        <span className="rounded-xs bg-positive/15 px-2 py-0.5 text-[10.5px] font-semibold text-positive">{ar ? 'معتمدة' : 'Cleared'}</span>
      </div>
      <div className="rounded-sm border border-white/10 bg-white/[0.04] p-3.5 text-[12px]">
        <div className="flex items-center justify-between">
          <span className="mono text-gold">INV-2026-1094</span>
          <span className="num font-bold text-white">SAR 6,111.92</span>
        </div>
        <p className="mt-1 text-[11px] text-onnavy-muted">{ar ? 'شامل 15% ضريبة القيمة المضافة · رمز QR مشفّر' : 'Incl. 15% VAT · Cryptographic TLV QR'}</p>
      </div>
      <div className="space-y-1.5 rounded-sm border border-white/10 bg-[#071428]/80 p-3 font-mono text-[11px]">
        <div className="flex justify-between text-onnavy-secondary">
          <span>DR 1130 Accounts Receivable</span>
          <span>6,111.92</span>
        </div>
        <div className="flex justify-between text-onnavy-muted">
          <span>CR 4100 Parts Revenue</span>
          <span>5,314.71</span>
        </div>
        <div className="flex justify-between text-gold">
          <span>CR 2140 Output VAT (15%)</span>
          <span>797.21</span>
        </div>
      </div>
    </div>
  );
}
