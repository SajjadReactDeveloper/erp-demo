'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Button, Card, CardHeader, Checkbox, ErrorState, Icon, Input, NoAccess, PageHeader, SkeletonRows, Textarea, cn, toast } from '@/components/ui';

const LINKS = [['company', 'building', 'Company profile'], ['branch', 'git-branch', 'Branches'], ['role', 'shield', 'Roles & permissions'], ['user', 'user', 'Users'], ['approval-rule', 'check-circle', 'Approval matrix'], ['price-rule', 'percent', 'Margin rules'], ['tax-code', 'receipt-text', 'Tax codes'], ['template', 'file-text', 'Document templates'], ['notification-rule', 'bell-ring', 'Notification rules'], ['reminder-rule', 'alarm-clock', 'Reminder rules'], ['posting-rule', 'workflow', 'Posting rules'], ['account', 'book', 'Chart of accounts'], ['report-schedule', 'calendar-clock', 'Report schedules'], ['zatca-credential', 'key-round', 'ZATCA credentials']];

// Turn machine keys ("credit.grace_days") into readable labels; known groups/words get proper names.
const GROUP_NAMES: Record<string, string> = { ai: 'AI & part matching', ageing: 'Receivables ageing', bestvalue: 'Best-value scoring', credit: 'Credit control', daftra: 'Daftra accounting', invoice: 'Invoicing', zatca: 'ZATCA e-invoicing', pos: 'Point of sale', rfq: 'RFQs & sourcing', quote: 'Quotations', sla: 'Service levels (SLA)', margin: 'Margins & pricing', vat: 'VAT & tax', delivery: 'Delivery & logistics', notification: 'Notifications', security: 'Security & access', company: 'Company', approval: 'Approvals', payment: 'Payments', inventory: 'Inventory', procurement: 'Procurement' };
const WORDS: Record<string, string> = { ai: 'AI', vat: 'VAT', sla: 'SLA', po: 'PO', rfq: 'RFQ', zatca: 'ZATCA', pos: 'POS', id: 'ID', url: 'URL', api: 'API', min: 'Minimum', max: 'Maximum', pct: '%', qty: 'Quantity', ar: 'Arabic', en: 'English' };
const words = (x: string) => x.split(/[._]/).filter(Boolean).map((w, i) => WORDS[w.toLowerCase()] ?? (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(' ');
const groupName = (g: string) => GROUP_NAMES[g] ?? words(g);
// [English label, English help, Arabic label, Arabic help, unit]
const INFO: Record<string, [string, string, string, string, string?]> = {
  'ageing.buckets': ['Ageing buckets', 'Day thresholds that split overdue invoices into ageing bands, e.g. [30, 60, 90].', 'فئات أعمار الديون', 'حدود الأيام التي تُقسّم الفواتير المتأخرة إلى فئات، مثل [30, 60, 90].'],
  'ai.min_confidence': ['Minimum match confidence', 'Part matches below this score (0 to 1) are flagged for manual review.', 'الحد الأدنى لثقة المطابقة', 'المطابقات الأقل من هذه الدرجة (من 0 إلى 1) تُحال للمراجعة اليدوية.'],
  'ai.provider': ['AI provider', 'Which engine powers part matching and the assistant (local runs on your own server).', 'مزوّد الذكاء الاصطناعي', 'المحرك المستخدم لمطابقة القطع والمساعد (المحلي يعمل على خادمك).'],
  'bestvalue.weights': ['Best-value weights', 'How supplier quotes are scored: price, delivery lead time, supplier rating and warranty. Weights should add up to 1.', 'أوزان أفضل قيمة', 'كيفية تقييم عروض الموردين: السعر والمدة والتقييم والضمان. يجب أن يكون مجموع الأوزان 1.'],
  'credit.exposure_quote_weight': ['Open quotes in credit exposure', 'Share of unconfirmed quotations counted toward the customer credit exposure (1 = fully, 0 = ignored).', 'وزن العروض المفتوحة في الانكشاف الائتماني', 'نسبة العروض غير المؤكدة المحسوبة ضمن انكشاف العميل (1 = كاملة، 0 = تُهمل).'],
  'credit.grace_days': ['Credit grace period', 'Days after the due date before a customer is put on credit hold.', 'مهلة السماح الائتمانية', 'عدد الأيام بعد تاريخ الاستحقاق قبل إيقاف ائتمان العميل.', 'days'],
  'daftra.mode': ['Daftra sync mode', 'How accounting data is exchanged with Daftra: push (send only), pull, or two-way.', 'وضع مزامنة دفترة', 'طريقة تبادل البيانات المحاسبية مع دفترة: إرسال أو سحب أو في الاتجاهين.'],
  'invoice.due_days': ['Default payment terms', 'Days after the invoice date that payment is due.', 'شروط الدفع الافتراضية', 'عدد الأيام من تاريخ الفاتورة حتى استحقاق السداد.', 'days'],
  'margin.default_min_pct': ['Minimum margin', 'Lowest allowed margin as a fraction (0.10 = 10%). Quotes below it need approval.', 'الحد الأدنى للهامش', 'أقل هامش مسموح كنسبة (0.10 = 10%). العروض الأقل تحتاج موافقة.'],
  'margin.default_target_pct': ['Target margin', 'Margin the system aims for when pricing, as a fraction (0.25 = 25%).', 'الهامش المستهدف', 'الهامش الذي يستهدفه النظام عند التسعير كنسبة (0.25 = 25%).'],
  'match.tolerance_price_pct': ['Price tolerance (3-way match)', 'Allowed price difference, in percent, between purchase order and supplier bill before it is flagged.', 'تفاوت السعر في المطابقة الثلاثية', 'فرق السعر المسموح بالنسبة المئوية بين أمر الشراء وفاتورة المورد قبل التنبيه.', '%'],
  'match.tolerance_qty_pct': ['Quantity tolerance (3-way match)', 'Allowed quantity difference, in percent, between order, receipt and bill.', 'تفاوت الكمية في المطابقة الثلاثية', 'فرق الكمية المسموح بالنسبة المئوية بين الطلب والاستلام والفاتورة.', '%'],
  'quotation.validity_days': ['Quotation validity', 'How many days a new quotation stays valid.', 'مدة صلاحية عرض السعر', 'عدد الأيام التي يبقى فيها عرض السعر الجديد صالحاً.', 'days'],
  'reminder.enabled': ['Payment reminders', 'Automatically remind customers about invoices that are due or overdue.', 'تذكيرات السداد', 'تذكير العملاء تلقائياً بالفواتير المستحقة أو المتأخرة.'],
  'rfq.default_deadline_hours': ['RFQ reply deadline', 'Hours suppliers have to answer a new request for quotation.', 'مهلة الرد على طلب السعر', 'عدد الساعات المتاحة للموردين للرد على طلب سعر جديد.', 'hours'],
  'security.idle_timeout_min': ['Idle sign-out', 'Minutes of inactivity before a user is signed out automatically.', 'تسجيل الخروج عند الخمول', 'عدد دقائق عدم النشاط قبل تسجيل خروج المستخدم تلقائياً.', 'min'],
  'sla.request_hours': ['Request response time', 'Target hours to send a quotation after a customer request arrives.', 'مهلة الرد على الطلب', 'عدد الساعات المستهدفة لإرسال عرض السعر بعد وصول طلب العميل.', 'hours'],
  'vat.default_pct': ['Default VAT rate', 'VAT percentage applied to new documents.', 'نسبة ضريبة القيمة المضافة', 'نسبة الضريبة المطبقة على المستندات الجديدة.', '%'],
  'whatsapp.enabled': ['WhatsApp messaging', 'Allow quotations and reminders to be sent to customers over WhatsApp.', 'رسائل واتساب', 'السماح بإرسال العروض والتذكيرات للعملاء عبر واتساب.'],
  'zatca.mode': ['ZATCA e-invoicing mode', 'fake = test mode, nothing is sent to ZATCA. Switch to the live mode only when going into production.', 'وضع الفوترة الإلكترونية (زاتكا)', 'fake = وضع تجريبي ولا يُرسل شيء إلى زاتكا. بدّل إلى الوضع الحقيقي عند التشغيل الفعلي.'],
};
const keyLabel = (k: string, ar?: boolean) => (INFO[k] ? INFO[k][ar ? 2 : 0] : words(k.split('.').slice(1).join('.') || k));
const keyHelp = (k: string, ar?: boolean) => (INFO[k] ? INFO[k][ar ? 3 : 1] : '');

export default function SettingsPage() {
  const { t, lang } = useT(); const { can, ready } = useAuth(); const qc = useQueryClient(); const ar = lang === 'ar';
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ data: any[] }>('/api/v1/r/setting', { query: { limit: 100, sort: 'key:asc' } }) });
  const [vals, setVals] = useState<Record<string, any>>({}); const [dirty, setDirty] = useState<Set<string>>(new Set());
  useEffect(() => { if (q.data) setVals(Object.fromEntries(q.data.data.map((s) => [s.key, s.value?.v ?? s.value]))); }, [q.data]);
  const save = useMutation({ mutationFn: () => api('/api/v1/settings/bulk', { method: 'PUT', body: { settings: Object.fromEntries([...dirty].map((k) => [k, vals[k]])) } }), onSuccess: () => { toast.success(t('Settings saved')); setDirty(new Set()); qc.invalidateQueries({ queryKey: ['settings'] }); }, onError: (e: any) => toast.error(e.message) });
  const groups = useMemo(() => { const g: Record<string, any[]> = {}; for (const s of q.data?.data ?? []) (g[s.key.split('.')[0]] ??= []).push(s); return g; }, [q.data]);
  if (ready && !can({ mod: 'platform', slug: 'setting' })) return <NoAccess />;
  const set = (k: string, v: any) => { setVals({ ...vals, [k]: v }); setDirty(new Set(dirty).add(k)); };
  return (
    <>
      <PageHeader title={t('Settings console')} sub={t('Business rules live here, not in code. Changes take effect immediately and are audited.')} actions={<Button loading={save.isPending} disabled={!dirty.size || !can({ mod: 'platform', slug: 'setting' }, 'update')} onClick={() => save.mutate()}>{t('Save changes')} {dirty.size ? `(${dirty.size})` : ''}</Button>} />
      <Card className="mb-5"><CardHeader title={t('Manage')} /><div className="grid gap-2 p-4 sm:grid-cols-2 lg:grid-cols-4">{LINKS.map(([slug, icon, label]) => <Link key={slug} href={`/app/${slug}`} className="flex items-center gap-3 rounded-xl border border-line p-3 text-sm font-semibold transition hover:border-primary/50 hover:bg-primary/5"><Icon name={icon} className="text-primary" />{t(label)}</Link>)}</div></Card>
      {q.isLoading ? <Card><SkeletonRows rows={8} cols={3} /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : (
        <div className="grid gap-5 lg:grid-cols-2">{Object.entries(groups).map(([g, rows]) => (
          <Card key={g}><CardHeader title={groupName(g)} sub={`${rows.length} ${rows.length === 1 ? t('setting') : t('settings')}`} /><div className="divide-y divide-line">{rows.map((s) => { const v = vals[s.key]; return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div className="min-w-0"><p className="text-sm font-semibold" title={s.key}>{keyLabel(s.key, ar)}</p>{keyHelp(s.key, ar) && <p className="mt-0.5 max-w-md text-caption leading-5 text-muted">{keyHelp(s.key, ar)}</p>}</div>
              <div className="w-60">{typeof v === 'boolean' ? <Checkbox checked={v} onChange={(e) => set(s.key, e.target.checked)} label={v ? t('On') : t('Off')} /> : typeof v === 'number' ? <div className="relative"><Input type="number" step="any" value={v} onChange={(e) => set(s.key, Number(e.target.value))} dir="ltr" className={cn('h-9', INFO[s.key]?.[4] && 'pe-14')} />{INFO[s.key]?.[4] && <span className="pointer-events-none absolute end-3 top-2 text-caption font-medium text-muted">{t(INFO[s.key]![4]!)}</span>}</div> : typeof v === 'string' ? <Input value={v} onChange={(e) => set(s.key, e.target.value)} dir="ltr" className="h-9" /> : <JsonCell key={`${s.id}-${v === undefined}`} v={v} onChange={(x) => set(s.key, x)} />}</div></div>); })}</div></Card>))}</div>
      )}
    </>
  );
}
function JsonCell({ v, onChange }: { v: any; onChange: (x: any) => void }) {
  const [raw, setRaw] = useState(JSON.stringify(v)); const [bad, setBad] = useState(false);
  return <Textarea rows={2} value={raw} dir="ltr" className={bad ? 'border-danger font-mono text-xs' : 'font-mono text-xs'} onChange={(e) => { setRaw(e.target.value); try { onChange(JSON.parse(e.target.value)); setBad(false); } catch { setBad(true); } }} />;
}
