// Branded, bilingual transactional e-mail (HTML + plain text). Pure functions, no I/O.
// Layout is table-based with inline styles so it renders in Gmail, Outlook and mobile clients.

export interface MailCompany { name?: string | null; nameAr?: string | null; address?: string | null; phone?: string | null; email?: string | null; vatNumber?: string | null; crNumber?: string | null; primaryColor?: string | null }
type Lang = 'ar' | 'en';
type Row = [en: string, ar: string, key: string];
interface Meta { title: [string, string]; intro: [string, string]; rows: Row[]; cta?: [string, string]; code?: boolean }

const META: Record<string, Meta> = {
  quotation_sent: { title: ['Your quotation is ready', 'عرض السعر جاهز'], intro: ['Thank you for your request. Your quotation is ready for review and approval.', 'شكراً لطلبك. عرض السعر جاهز للمراجعة والاعتماد.'], rows: [['Quotation', 'عرض السعر', 'number'], ['Total (SAR)', 'الإجمالي (ريال)', 'total']], cta: ['Review & approve', 'مراجعة واعتماد'] },
  rfq_invite: { title: ['New request for quotation', 'طلب عرض أسعار جديد'], intro: ['You are invited to quote on the request below.', 'ندعوكم لتقديم عرض سعر على الطلب أدناه.'], rows: [['Request', 'الطلب', 'number'], ['Reply by', 'آخر موعد للرد', 'deadline']], cta: ['Submit your quote', 'تقديم العرض'] },
  rfq_reminder: { title: ['Reminder: quotation request closing soon', 'تذكير: طلب عرض الأسعار يغلق قريباً'], intro: ['We have not yet received your quotation.', 'لم يصلنا عرض السعر الخاص بكم بعد.'], rows: [['Request', 'الطلب', 'number'], ['Closes', 'يغلق في', 'deadline']], cta: ['Submit your quote', 'تقديم العرض'] },
  po_sent: { title: ['New purchase order', 'أمر شراء جديد'], intro: ['A purchase order has been issued to you. Please confirm it.', 'صدر لكم أمر شراء. يرجى تأكيده.'], rows: [['Purchase order', 'أمر الشراء', 'number'], ['Total (SAR)', 'الإجمالي (ريال)', 'total']], cta: ['Confirm order', 'تأكيد الأمر'] },
  delivery_note: { title: ['Your order is out for delivery', 'طلبك في الطريق إليك'], intro: ['Your order has left our warehouse and is on its way.', 'غادر طلبك المستودع وهو في الطريق إليك.'], rows: [['Delivery note', 'إشعار التسليم', 'number']], cta: ['Track delivery', 'تتبّع التسليم'] },
  invoice_issued: { title: ['Your invoice is ready', 'فاتورتك جاهزة'], intro: ['A new invoice has been issued on your account.', 'صدرت فاتورة جديدة على حسابكم.'], rows: [['Invoice', 'الفاتورة', 'number'], ['Amount (SAR)', 'المبلغ (ريال)', 'total'], ['Due date', 'تاريخ الاستحقاق', 'due']], cta: ['View invoice', 'عرض الفاتورة'] },
  pre_due: { title: ['Payment reminder', 'تذكير بالسداد'], intro: ['This is a friendly reminder that the invoice below is coming due.', 'تذكير ودّي بأن موعد استحقاق الفاتورة أدناه يقترب.'], rows: [['Invoice', 'الفاتورة', 'number'], ['Balance (SAR)', 'المتبقي (ريال)', 'balance'], ['Due date', 'تاريخ الاستحقاق', 'due']], cta: ['View statement', 'عرض كشف الحساب'] },
  due_today: { title: ['Invoice due today', 'فاتورة مستحقة اليوم'], intro: ['The invoice below is due today.', 'الفاتورة أدناه مستحقة اليوم.'], rows: [['Invoice', 'الفاتورة', 'number'], ['Balance (SAR)', 'المتبقي (ريال)', 'balance']], cta: ['Pay now', 'ادفع الآن'] },
  overdue: { title: ['Overdue invoice', 'فاتورة متأخرة السداد'], intro: ['Our records show the invoice below is overdue. Please arrange payment, or contact us if you have already paid.', 'تُظهر سجلاتنا أن الفاتورة أدناه متأخرة. يرجى ترتيب السداد، أو التواصل معنا إن كنتم قد سددتموها.'], rows: [['Invoice', 'الفاتورة', 'number'], ['Balance (SAR)', 'المتبقي (ريال)', 'balance'], ['Days overdue', 'أيام التأخير', 'days']], cta: ['View statement & pay', 'عرض كشف الحساب والسداد'] },
  otp: { title: ['Your verification code', 'رمز التحقق الخاص بك'], intro: ['Use this code to continue. It expires shortly. Never share it with anyone.', 'استخدم هذا الرمز للمتابعة. تنتهي صلاحيته قريباً. لا تشاركه مع أي شخص.'], rows: [], code: true },
  vehicle_service: { title: ['Vehicle service reminder', 'تذكير بصيانة المركبة'], intro: ['Your vehicle is due for service.', 'حان موعد صيانة مركبتك.'], rows: [['Vehicle', 'المركبة', 'vehicle'], ['Service', 'الخدمة', 'service'], ['Due', 'الموعد', 'due']] },
  report_ready: { title: ['Your scheduled report', 'التقرير المجدول'], intro: ['Your scheduled report is attached to this email.', 'التقرير المجدول مرفق بهذه الرسالة.'], rows: [['Report', 'التقرير', 'title']] },
  welcome_portal: { title: ['Welcome to AutocQuick', 'مرحباً بك في أوتوكويك'], intro: ['Your portal account is ready. Sign in to send requests, review quotations and track deliveries.', 'حساب البوابة جاهز. سجّل الدخول لإرسال الطلبات ومراجعة عروض الأسعار وتتبّع التسليم.'], rows: [], cta: ['Open your portal', 'فتح البوابة'] },
};

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hex = (c?: string | null) => (c && /^#[0-9a-f]{6}$/i.test(c) ? c : '#0b1b3a');
const isUrl = (u: unknown) => typeof u === 'string' && /^https?:\/\//i.test(u);

export function emailSubject(template: string, vars: Record<string, any>, lang: Lang, fallback: string): string {
  const m = META[template];
  if (!m) return fallback;
  const t = m.title[lang === 'ar' ? 1 : 0];
  return (vars.number ? `${t} — ${vars.number}` : t).slice(0, 90);
}

function block(m: Meta, vars: Record<string, any>, lang: Lang, brand: string, primary: boolean): string {
  const ar = lang === 'ar', i = ar ? 1 : 0, dir = ar ? 'rtl' : 'ltr', align = ar ? 'right' : 'left';
  const rows = m.rows.filter(([, , k]) => vars[k] != null && vars[k] !== '').map(([en, arl, k]) =>
    `<tr><td style="padding:9px 0;border-bottom:1px solid #e8eaf0;color:#667085;font-size:13px;text-align:${align}">${esc(ar ? arl : en)}</td><td style="padding:9px 0;border-bottom:1px solid #e8eaf0;color:#101828;font-size:14px;font-weight:600;text-align:${ar ? 'left' : 'right'}" dir="ltr">${esc(vars[k])}</td></tr>`).join('');
  const code = m.code && vars.code ? `<div style="margin:18px 0;padding:16px;background:#f6f7fb;border-radius:10px;text-align:center;font-size:30px;letter-spacing:8px;font-weight:700;color:#101828" dir="ltr">${esc(vars.code)}</div>` : '';
  const cta = m.cta && isUrl(vars.link) ? `<div style="margin:22px 0 6px;text-align:${align}"><a href="${esc(vars.link)}" style="display:inline-block;background:${brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:8px">${esc(m.cta[i])}</a></div>` : '';
  return `<div dir="${dir}" style="text-align:${align};${primary ? '' : 'opacity:.92;'}">
    <h1 style="margin:0 0 10px;font-size:${primary ? 22 : 16}px;line-height:1.3;color:#101828">${esc(m.title[i])}</h1>
    <p style="margin:0 0 14px;font-size:${primary ? 15 : 13}px;line-height:1.65;color:#344054">${esc(m.intro[i])}</p>
    ${code}${rows ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 4px">${rows}</table>` : ''}${primary ? cta : ''}
  </div>`;
}

export function emailHtml(template: string, vars: Record<string, any>, lang: Lang, co: MailCompany, fallbackBody: string, subject: string): string {
  const brand = hex(co.primaryColor);
  const name = (lang === 'ar' ? co.nameAr || co.name : co.name || co.nameAr) || 'AutocQuick';
  const other: Lang = lang === 'ar' ? 'en' : 'ar';
  const m = META[template];
  const main = m ? block(m, vars, lang, brand, true) + `<div style="height:1px;background:#e8eaf0;margin:26px 0 20px"></div>` + block(m, vars, other, brand, false)
    : `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="font-size:15px;line-height:1.7;color:#344054;white-space:pre-line;text-align:${lang === 'ar' ? 'right' : 'left'}">${esc(fallbackBody)}</div>`;
  const foot = [co.address, co.phone, co.email].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
  const ids = [co.vatNumber ? `VAT ${esc(co.vatNumber)}` : '', co.crNumber ? `CR ${esc(co.crNumber)}` : ''].filter(Boolean).join(' &nbsp;·&nbsp; ');
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f4f8;font-family:'Segoe UI',Tahoma,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(m ? m.title[lang === 'ar' ? 1 : 0] : subject)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f8"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e7ec">
    <tr><td style="background:${brand};padding:22px 28px;border-bottom:4px solid #c9a227"><span style="font-size:20px;font-weight:700;color:#ffffff;letter-spacing:.3px">${esc(name)}</span></td></tr>
    <tr><td style="padding:28px">${main}</td></tr>
    <tr><td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #eaecf0;font-size:12px;line-height:1.7;color:#667085;text-align:center">
      <div style="font-weight:600;color:#475467">${esc(name)}</div>
      ${foot ? `<div>${foot}</div>` : ''}${ids ? `<div>${ids}</div>` : ''}
      <div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="margin-top:8px">${lang === 'ar' ? 'هذه رسالة آلية من نظام ' + esc(name) + '. للاستفسار تواصل معنا عبر البيانات أعلاه.' : 'This is an automated message from ' + esc(name) + '. For questions, contact us using the details above.'}</div>
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

export function emailText(template: string, vars: Record<string, any>, lang: Lang, co: MailCompany, fallbackBody: string): string {
  const name = (lang === 'ar' ? co.nameAr || co.name : co.name || co.nameAr) || 'AutocQuick';
  const m = META[template];
  if (!m) return `${fallbackBody}\n\n— ${name}`;
  const i = lang === 'ar' ? 1 : 0;
  const lines = [m.title[i], '', m.intro[i], ''];
  if (m.code && vars.code) lines.push(`${vars.code}`, '');
  for (const [en, ar, k] of m.rows) if (vars[k] != null && vars[k] !== '') lines.push(`${i ? ar : en}: ${vars[k]}`);
  if (m.cta && isUrl(vars.link)) lines.push('', `${m.cta[i]}: ${vars.link}`);
  lines.push('', `— ${name}`, [co.address, co.phone, co.email].filter(Boolean).join(' · '));
  return lines.join('\n').trim();
}
