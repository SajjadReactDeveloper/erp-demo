import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { Icon } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Auto parts sourcing, delivery and credit in one platform',
  description: 'AutocQuick ERP: request parts by VIN, compare supplier quotations, protect margins, control credit, deliver with signature and issue ZATCA e-invoices.',
  alternates: { canonical: '/' },
};

const FEATURES = [
  { icon: 'scan-search', en: ['Request by VIN', 'Customers submit vehicle, VIN and parts; AI suggests the right part numbers.'], ar: ['اطلب برقم الهيكل', 'يرسل العميل المركبة ورقم الهيكل والقطع، ويقترح الذكاء الاصطناعي أرقام القطع الصحيحة.'] },
  { icon: 'columns-3', en: ['Compare supplier quotes', 'RFQs go out automatically; quotes are compared side by side with a best-value score.'], ar: ['قارن عروض الموردين', 'تُرسل طلبات الأسعار تلقائياً وتُقارن العروض جنباً إلى جنب مع تقييم أفضل قيمة.'] },
  { icon: 'percent', en: ['Margin and credit control', 'Every price follows margin rules; every order is checked against the credit limit.'], ar: ['تحكم بالهامش والائتمان', 'كل سعر يتبع قواعد الهامش، وكل طلب يُفحص مقابل الحد الائتماني.'] },
  { icon: 'truck', en: ['Deliver with proof', 'Scan, verify, partial receive and capture the customer signature, photo and GPS — even offline.'], ar: ['سلّم بإثبات', 'امسح وتحقق واستلم جزئياً والتقط توقيع العميل والصورة والموقع حتى بدون إنترنت.'] },
  { icon: 'receipt-text', en: ['ZATCA e-invoicing', 'Phase 2 compliant invoices, VAT, ledger and bank reconciliation on one data model.'], ar: ['الفوترة الإلكترونية', 'فواتير متوافقة مع المرحلة الثانية وضريبة القيمة المضافة والأستاذ العام والتسوية البنكية في نموذج بيانات واحد.'] },
  { icon: 'bar-chart-3', en: ['Live dashboards', 'Sales, profitability, expenses, receivables and procurement — reconciled to the ledger.'], ar: ['لوحات مباشرة', 'المبيعات والربحية والمصروفات والذمم والمشتريات متوافقة مع الأستاذ العام.'] },
];

export default async function Landing() {
  const lang = (await cookies()).get('locale')?.value === 'en' ? 'en' : 'ar';
  const ar = lang === 'ar';
  const jsonLd = { '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'AutocQuick ERP', applicationCategory: 'BusinessApplication', operatingSystem: 'Web', description: 'ERP for automotive spare-parts trading with drop-shipping, credit management and ZATCA e-invoicing.' };
  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }} />
      <header className="mx-auto flex max-w-6xl items-center justify-between p-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-fg"><Icon name="cog" size={22} /></span><b className="text-lg">AutocQuick</b></div><nav aria-label="Primary" className="flex items-center gap-2 text-sm font-semibold"><Link href="/register" className="rounded-xl px-4 py-2 hover:bg-line/50">{ar ? 'تسجيل شركة' : 'Register'}</Link><Link href="/login" className="rounded-xl bg-primary px-5 py-2.5 text-primary-fg shadow-soft hover:brightness-110">{ar ? 'تسجيل الدخول' : 'Sign in'}</Link></nav></header>
      <main>
        <section className="mx-auto max-w-6xl px-5 py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-6xl">{ar ? 'قطع غيار السيارات: من الطلب إلى التحصيل في منصة واحدة' : 'Auto parts, from request to cash — on one platform'}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted">{ar ? 'نظام متكامل للمبيعات والمشتريات والتوصيل والمحاسبة والائتمان، مصمم لتجارة قطع الغيار بدون مخزون.' : 'A unified ERP for drop-shipping spare-parts trading: sales, sourcing, logistics, accounting and credit.'}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/login" className="rounded-xl bg-primary px-7 py-3.5 font-bold text-primary-fg shadow-soft hover:brightness-110">{ar ? 'ابدأ الآن' : 'Get started'}</Link><Link href="/vendor" className="rounded-xl border border-line px-7 py-3.5 font-bold hover:bg-line/40">{ar ? 'كن موردًا' : 'Become a supplier'}</Link></div>
        </section>
        <section aria-labelledby="features" className="mx-auto max-w-6xl px-5 pb-20"><h2 id="features" className="sr-only">Features</h2><div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{FEATURES.map((f) => <article key={f.icon} className="rounded-2xl border border-line bg-card p-6 shadow-soft"><span className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Icon name={f.icon} size={22} /></span><h3 className="text-lg font-bold">{(ar ? f.ar : f.en)[0]}</h3><p className="mt-1.5 text-sm text-muted">{(ar ? f.ar : f.en)[1]}</p></article>)}</div></section>
      </main>
      <footer className="border-t border-line py-8 text-center text-sm text-muted">© {new Date().getFullYear()} AutocQuick</footer>
    </div>
  );
}
