'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUp,
  ArrowUpRight,
  BarChart3,
  Check,
  Clock,
  Code2,
  Copy,
  Info,
  History,
  Inbox,
  Languages,
  Loader2,
  Percent,
  PieChart,
  Receipt,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtNum } from '@/lib/format';
import { BarCard, LineCard, PieCard } from '@/components/charts';
import { Avatar, Badge, Button, Star, cn, toast } from '@/components/ui';

interface Msg {
  id: string;
  role: 'user' | 'bot';
  text?: string;
  result?: any;
  suggestions?: string[];
  error?: string;
  retryQuestion?: string;
  ts: string;
}

const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const fmtTime = (iso: string, lang: 'en' | 'ar') =>
  new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-GB-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const PROMPTS = [
  {
    icon: AlertCircle,
    tone: 'bg-danger-bg text-danger',
    catEn: 'Collections',
    catAr: 'التحصيل',
    viz: 'bar' as const,
    en: 'Top 10 overdue customers',
    ar: 'أعلى 10 عملاء متأخرين',
    subEn: 'Ranked overdue balances, invoice count & days late',
    subAr: 'أرصدة متأخرة مرتبة مع عدد الفواتير وأيام التأخير',
  },
  {
    icon: TrendingUp,
    tone: 'bg-gold-light text-gold-text',
    catEn: 'Revenue',
    catAr: 'الإيرادات',
    viz: 'line' as const,
    en: 'Sales this month',
    ar: 'مبيعات هذا الشهر',
    subEn: 'Daily revenue trend across the current month',
    subAr: 'اتجاه الإيرادات اليومية خلال الشهر الحالي',
  },
  {
    icon: Users,
    tone: 'bg-info-bg text-info',
    catEn: 'Sales',
    catAr: 'المبيعات',
    viz: 'bar' as const,
    en: 'Sales by customer',
    ar: 'المبيعات حسب العميل',
    subEn: 'Top billing accounts for this month',
    subAr: 'أعلى العملاء مبيعاً خلال هذا الشهر',
  },
  {
    icon: Percent,
    tone: 'bg-success-bg text-success',
    catEn: 'Profitability',
    catAr: 'الربحية',
    viz: 'bar' as const,
    en: 'Gross margin by category',
    ar: 'الهامش حسب الفئة',
    subEn: 'Revenue, cost and margin % per parts category',
    subAr: 'الإيراد والتكلفة ونسبة الهامش لكل فئة قطع',
  },
  {
    icon: Clock,
    tone: 'bg-warn-bg text-warn',
    catEn: 'Receivables',
    catAr: 'الذمم المدينة',
    viz: 'pie' as const,
    en: 'Receivables ageing',
    ar: 'أعمار الذمم',
    subEn: 'Open invoice balances grouped by ageing bucket',
    subAr: 'توزيع الذمم المفتوحة حسب فترات الاستحقاق',
  },
  {
    icon: ShoppingBag,
    tone: 'bg-soft text-navy',
    catEn: 'Procurement',
    catAr: 'المشتريات',
    viz: 'bar' as const,
    en: 'Top suppliers by spend',
    ar: 'أعلى الموردين إنفاقاً',
    subEn: 'Purchasing spend and order volume by vendor',
    subAr: 'إجمالي المشتريات وعدد الطلبات لكل مورد',
  },
  {
    icon: Inbox,
    tone: 'bg-info-bg text-info',
    catEn: 'Operations',
    catAr: 'العمليات',
    viz: 'bar' as const,
    en: 'Open requests',
    ar: 'الطلبات المفتوحة',
    subEn: 'Active customer requests grouped by workflow status',
    subAr: 'طلبات العملاء النشطة مصنفة حسب الحالة',
  },
  {
    icon: Receipt,
    tone: 'bg-soft text-strong',
    catEn: 'Finance',
    catAr: 'المالية',
    viz: 'pie' as const,
    en: 'Expenses this month',
    ar: 'المصروفات هذا الشهر',
    subEn: 'Approved and posted expenses by category',
    subAr: 'المصروفات المعتمدة والمرحّلة حسب الفئة',
  },
];

export default function AssistantPage() {
  const { me } = useAuth();
  const { t, lang } = useT();
  const [q, setQ] = useState('');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastQuestionRef = useRef<string>('');

  const ask = useMutation({
    mutationFn: (question: string) => api<any>('/api/v1/ai/assistant', { method: 'POST', body: { question } }),
    onSuccess: (r) =>
      setMsgs((m) => [
        ...m,
        r.ok
          ? { id: uid(), role: 'bot', result: r.result, ts: new Date().toISOString() }
          : { id: uid(), role: 'bot', text: r.answer, suggestions: r.suggestions, ts: new Date().toISOString() },
      ]),
    onError: (e: any) =>
      setMsgs((m) => [
        ...m,
        { id: uid(), role: 'bot', error: e.message, retryQuestion: lastQuestionRef.current, ts: new Date().toISOString() },
      ]),
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [msgs, ask.isPending]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!q) {
      el.style.height = '';
      return;
    }
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 32), 120)}px`;
  }, [q]);

  const send = (text: string) => {
    const clean = text.trim();
    if (!clean || ask.isPending) return;
    lastQuestionRef.current = clean;
    setMsgs((m) => [...m, { id: uid(), role: 'user', text: clean, ts: new Date().toISOString() }]);
    setRecent((prev) => [clean, ...prev.filter((x) => x !== clean)].slice(0, 6));
    setQ('');
    ask.mutate(clean);
  };

  const reset = () => {
    if (ask.isPending) return;
    setMsgs([]);
    setQ('');
    inputRef.current?.focus();
  };

  const firstName = me?.name?.split(' ')[0];
  const starters = useMemo(() => PROMPTS.slice(0, 6), []);
  const quickFollowUps = useMemo(
    () =>
      lang === 'ar'
        ? ['أعلى 10 عملاء متأخرين', 'مبيعات هذا الشهر', 'الهامش حسب الفئة', 'أعمار الذمم']
        : ['Top 10 overdue customers', 'Sales this month', 'Gross margin by category', 'Receivables ageing'],
    [lang]
  );

  return (
    <div className="-mx-4 -mb-10 -mt-5 flex h-[calc(100vh-65px)] min-h-[540px] bg-card sm:-mx-6 sm:-mt-6">
      {/* Main full-height chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Crisp chat workspace header */}
        <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-md bg-navy text-gold">
              <Sparkles size={17} />
              <span className="absolute -bottom-0.5 -end-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-positive" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-bold leading-5 text-fg">{t('AutocQuick Assistant')}</h1>
                <Badge tone="gold" className="hidden sm:inline-flex">{t('Live ERP')}</Badge>
              </div>
              <p className="truncate text-caption text-muted">{t('Ask about your data in Arabic or English. It only reads what you are allowed to see.')}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-xs border border-line bg-soft px-2.5 py-1 text-[11px] font-semibold text-strong md:inline-flex">
              <ShieldCheck size={13} className="text-success" />
              {t('Read-only')}
            </span>
            {msgs.length > 0 && (
              <Button variant="secondary" size="sm" onClick={reset} disabled={ask.isPending} className="gap-1.5">
                <RotateCcw size={13} />
                <span>{t('New chat')}</span>
              </Button>
            )}
          </div>
        </div>

        {/* Scrollable conversation stream */}
        <div className="no-scrollbar flex-1 overflow-y-auto bg-bg/40 px-4 py-5 sm:px-8">
          <div className="flex min-h-full w-full flex-col">
            {msgs.length === 0 ? (
              <div className="my-auto flex w-full flex-col py-3 animate-in">
                {/* Editorial Navy & Gold hero banner with custom illustration */}
                <div className="relative overflow-hidden rounded-lg border border-navy bg-[#0B1F3A] text-white shadow-card">
                  <img
                    src="/images/assistant-hero.jpg"
                    alt=""
                    aria-hidden
                    className="pointer-events-none absolute -top-[8%] end-0 hidden h-[116%] w-auto max-w-none object-contain md:block rtl:-scale-x-100"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0B1F3A] via-[#0B1F3A]/90 via-[55%] to-transparent rtl:bg-gradient-to-l" />
                  <Star size={180} className="pointer-events-none absolute -bottom-16 -start-10 text-gold opacity-[0.06]" />
                  <div className="relative z-10 max-w-2xl px-6 py-7 sm:px-8 sm:py-8">
                    <div className="inline-flex items-center gap-1.5 rounded-xs border border-gold/30 bg-navy-light/80 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-gold">
                      <Sparkles size={12} />
                      <span>{t('Live ERP intelligence')}</span>
                    </div>
                    <h2 className="mt-3.5 text-[22px] font-bold leading-tight tracking-tight sm:text-[26px]">
                      {firstName
                        ? lang === 'ar'
                          ? `كيف يمكنني مساعدتك اليوم، ${firstName}؟`
                          : `How can I help with your numbers, ${firstName}?`
                        : t('How can I help with your numbers today?')}
                    </h2>
                    <p className="mt-2 max-w-xl text-small leading-relaxed text-onnavy-secondary">
                      {t('Ask a question in plain English or Arabic to get instant charts, tables, and live financial insights.')}
                    </p>
                    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 pt-4 text-caption text-onnavy-muted">
                      <span className="inline-flex items-center gap-1.5">
                        <BarChart3 size={14} className="text-gold" />
                        <span>{t('Charts, CSV & SQL')}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Languages size={14} className="text-gold" />
                        <span>{t('Arabic & English')}</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <ShieldCheck size={14} className="text-gold" />
                        <span>{t('Permission-aware')}</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Starter prompt grid */}
                <div className="mt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="overline text-muted">{t('Try asking')}</p>
                    <span className="text-caption text-muted">{t('Click any card to run live')}</span>
                  </div>
                  <div className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {starters.map((p) => {
                      const IconCmp = p.icon;
                      const VizIcon = p.viz === 'line' ? TrendingUp : p.viz === 'pie' ? PieChart : BarChart3;
                      const vizLabel = p.viz === 'line' ? t('Trend chart') : p.viz === 'pie' ? t('Breakdown chart') : t('Bar chart');
                      const title = lang === 'ar' ? p.ar : p.en;
                      const desc = lang === 'ar' ? p.subAr : p.subEn;
                      const cat = lang === 'ar' ? p.catAr : p.catEn;
                      return (
                        <button
                          key={p.en}
                          type="button"
                          onClick={() => send(title)}
                          className="group relative flex flex-col justify-between overflow-hidden rounded-lg border border-line bg-card p-4 text-start shadow-card transition-all before:absolute before:inset-y-0 before:start-0 before:w-[3px] before:bg-transparent before:transition-colors hover:border-gold-border hover:bg-soft/30 hover:before:bg-gold"
                        >
                          <div>
                            <div className="flex w-full items-center justify-between gap-2">
                              <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', p.tone)}>
                                <IconCmp size={17} />
                              </span>
                              <span className="rounded-xs bg-soft px-2 py-0.5 text-[11px] font-semibold text-muted">
                                {cat}
                              </span>
                            </div>
                            <p className="mt-3 text-[14px] font-bold leading-snug text-fg">{title}</p>
                            <p className="mt-1 line-clamp-2 text-caption leading-relaxed text-muted">{desc}</p>
                          </div>
                          <div className="mt-3.5 flex items-center justify-between border-t border-line/70 pt-2.5 text-[11px]">
                            <span className="inline-flex items-center gap-1.5 text-muted">
                              <VizIcon size={12} className="text-muted/80" />
                              <span>{vizLabel} · {t('Table')}</span>
                            </span>
                            <span className="inline-flex items-center gap-0.5 font-semibold text-muted transition-colors group-hover:text-navy">
                              <span>{t('Run')}</span>
                              <ArrowUpRight size={12} className="rtl:-scale-x-100" />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Quick natural-language tip bar */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-card px-4 py-2.5 text-caption text-muted">
                  <span className="flex items-center gap-2">
                    <Sparkles size={13} className="shrink-0 text-gold" />
                    <span>{t('Tip: Include a count in your question for custom rankings, or ask directly in Arabic.')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => send(lang === 'ar' ? 'أعلى 5 عملاء متأخرين' : 'Top 5 overdue customers')}
                    className="inline-flex items-center gap-1 rounded-xs border border-line bg-soft/70 px-2.5 py-1 text-[11px] font-semibold text-navy transition-colors hover:border-gold-border hover:bg-gold-light/50"
                  >
                    <span>{lang === 'ar' ? '«أعلى 5 عملاء متأخرين»' : '"Top 5 overdue customers"'}</span>
                    <ArrowUpRight size={11} className="rtl:-scale-x-100" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-6 pb-2">
                {msgs.map((m, idx) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex items-end justify-end gap-2.5 animate-in">
                      <div className="flex max-w-[78%] flex-col items-end">
                        <div className="rounded-lg bg-navy px-4 py-2.5 text-body leading-relaxed text-white shadow-card">
                          {m.text}
                        </div>
                        <span className="num mt-1 px-0.5 text-[11px] text-muted">{fmtTime(m.ts, lang)}</span>
                      </div>
                      <Avatar name={me?.name} size={30} />
                    </div>
                  ) : (
                    <div key={m.id} className="flex items-start gap-3 animate-in">
                      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-navy text-gold">
                        <Sparkles size={15} />
                      </div>
                      <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-caption font-semibold text-fg">{t('AutocQuick Assistant')}</span>
                          <span className="num text-[11px] text-muted">{fmtTime(m.ts, lang)}</span>
                        </div>

                        {m.error && (
                          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/25 bg-danger-bg/70 px-4 py-3 text-small text-danger">
                            <span className="flex items-center gap-2">
                              <AlertCircle size={16} className="shrink-0" />
                              <span>{m.error}</span>
                            </span>
                            {m.retryQuestion && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => send(m.retryQuestion!)}
                                className="!h-7 bg-card text-xs"
                              >
                                {t('Retry')}
                              </Button>
                            )}
                          </div>
                        )}

                        {m.text && (
                          <div className="rounded-lg border border-line bg-card px-4 py-3 text-body leading-relaxed text-fg shadow-card">
                            <p>{m.text}</p>
                            {m.suggestions && m.suggestions.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
                                {m.suggestions.map((s) => (
                                  <button
                                    key={s}
                                    type="button"
                                    onClick={() => send(s)}
                                    className="inline-flex items-center gap-1 rounded-sm border border-line bg-soft/60 px-2.5 py-1 text-caption font-semibold text-strong transition-colors hover:border-navy hover:bg-card hover:text-navy"
                                  >
                                    <span>{s}</span>
                                    <ArrowUpRight size={12} className="text-muted rtl:-scale-x-100" />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {m.result && <Answer r={m.result} />}

                        {/* Contextual follow-up chips on the latest bot message */}
                        {idx === msgs.length - 1 && !ask.isPending && m.result && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="me-1 text-[11px] font-medium text-muted">{t('Ask next')}:</span>
                            {quickFollowUps.slice(0, 3).map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => send(s)}
                                className="inline-flex items-center gap-1 rounded-sm border border-line bg-card px-2.5 py-1 text-[11.5px] font-medium text-strong transition-colors hover:border-gold-border hover:bg-gold-light/40 hover:text-navy"
                              >
                                <span>{s}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}

                {/* Animated thinking indicator */}
                {ask.isPending && (
                  <div className="flex items-start gap-3 animate-in">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-navy text-gold">
                      <Sparkles size={15} className="animate-pulse" />
                    </div>
                    <div className="rounded-lg border border-line bg-card px-4 py-3 shadow-card">
                      <div className="flex items-center gap-2.5">
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gold" />
                        </span>
                        <span className="text-caption font-medium text-muted">{t('Analyzing live ERP data...')}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </div>

        {/* Full-width docked composer */}
        <div className="shrink-0 border-t border-line bg-card px-4 py-2.5 sm:px-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(q);
            }}
            className="w-full"
          >
            <div className="flex items-end gap-2 rounded-md border border-line bg-soft/60 p-1 ps-3 transition-colors focus-within:border-navy focus-within:bg-card">
              <textarea
                ref={inputRef}
                rows={1}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(q);
                  }
                }}
                placeholder={t('Message AutocQuick Assistant...')}
                maxLength={300}
                aria-label={t('Ask a question')}
                className="no-scrollbar h-8 max-h-[120px] flex-1 resize-none bg-transparent py-1 text-body leading-6 text-fg outline-none focus-visible:!outline-none placeholder:text-muted/80"
              />
              <button
                type="submit"
                disabled={!q.trim() || ask.isPending}
                aria-label={t('Send')}
                className={cn(
                  'grid h-8 w-8 shrink-0 place-items-center rounded-sm transition-colors',
                  q.trim() && !ask.isPending
                    ? 'bg-navy text-white hover:bg-navy-hover'
                    : 'cursor-not-allowed bg-line/70 text-muted/70'
                )}
              >
                {ask.isPending ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={16} strokeWidth={2.2} />}
              </button>
            </div>
            <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
              <span>{t('Press Enter to send · Results reflect your current permissions')}</span>
              {q.length > 220 && <span className="num">{q.length}/300</span>}
            </div>
          </form>
        </div>
      </div>

      {/* Right quick-prompts & session history rail (full-page ERP cockpit feel) */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-s border-line bg-bg/60 xl:flex">
        <div className="flex h-16 shrink-0 flex-col justify-center border-b border-line bg-card px-4">
          <p className="overline text-muted">{t('Suggested queries')}</p>
          <p className="mt-0.5 text-caption text-muted">{t('Click any query to run it live')}</p>
        </div>
        <div className="no-scrollbar flex-1 space-y-5 overflow-y-auto p-3.5">
          <div className="space-y-1.5">
            {PROMPTS.map((p) => {
              const IconCmp = p.icon;
              const label = lang === 'ar' ? p.ar : p.en;
              return (
                <button
                  key={p.en}
                  type="button"
                  disabled={ask.isPending}
                  onClick={() => send(label)}
                  className="group flex w-full items-center gap-2.5 rounded-md border border-transparent bg-card px-2.5 py-2 text-start text-small font-medium text-fg shadow-[0_1px_1px_rgba(11,31,58,0.03)] ring-1 ring-inset ring-line transition-colors hover:border-gold-border hover:bg-soft/40 disabled:opacity-50"
                >
                  <span className={cn('grid h-7 w-7 shrink-0 place-items-center rounded-sm', p.tone)}>
                    <IconCmp size={14} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{label}</span>
                  <ArrowUpRight size={13} className="shrink-0 text-muted/50 transition-colors group-hover:text-navy rtl:-scale-x-100" />
                </button>
              );
            })}
          </div>

          {recent.length > 0 && (
            <div className="border-t border-line pt-4">
              <p className="overline mb-2 flex items-center gap-1.5 px-1 text-muted">
                <History size={12} />
                <span>{t('Recent questions')}</span>
              </p>
              <div className="space-y-1">
                {recent.map((item) => (
                  <button
                    key={item}
                    type="button"
                    disabled={ask.isPending}
                    onClick={() => send(item)}
                    className="block w-full truncate rounded-sm px-2 py-1.5 text-start text-caption font-medium text-strong transition-colors hover:bg-card hover:text-navy disabled:opacity-50"
                    title={item}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function Answer({ r }: { r: any }) {
  const { t, lang } = useT();
  const [showSql, setShowSql] = useState(false);
  const [copied, setCopied] = useState(false);

  const cols: string[] = r.columns ?? [];
  const rows: any[][] = r.rows ?? [];

  const metricIdx = useMemo(() => {
    const preferred = cols.findIndex((c, i) => i > 0 && /sar|sales|revenue|spend|amount|overdue|margin/i.test(c));
    return preferred > 0 ? preferred : 1;
  }, [cols]);

  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        name: String(row[0] ?? '—'),
        value: Number(row[metricIdx]) || 0,
        ...Object.fromEntries(cols.slice(1).map((c, i) => [c, row[i + 1]])),
      })),
    [rows, cols, metricIdx]
  );

  const primaryTotal = useMemo(() => {
    if (!rows.length || metricIdx >= cols.length) return null;
    const isPct = /%|margin/i.test(cols[metricIdx] ?? '');
    if (isPct) return null;
    const vals = rows.map((row) => Number(row[metricIdx])).filter((v) => !isNaN(v));
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0);
  }, [rows, cols, metricIdx]);

  const copyTable = async () => {
    const csv = [cols, ...rows].map((line) => line.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    try {
      await navigator.clipboard.writeText(csv);
      setCopied(true);
      toast.success(t('Copied'));
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-card shadow-card">
      {/* Result header bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-soft/60 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="truncate text-[14px] font-bold text-fg">{r.title}</h3>
          <span className="num rounded-xs border border-line bg-card px-2 py-0.5 text-[11px] font-semibold text-muted">
            {rows.length} {rows.length === 1 ? t('row') : t('rows')}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {rows.length > 0 && (
            <button
              type="button"
              onClick={copyTable}
              className="inline-flex items-center gap-1 rounded-xs border border-line bg-card px-2 py-1 text-[11px] font-semibold text-strong transition-colors hover:bg-soft hover:text-navy"
            >
              {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
              <span>{copied ? t('Copied') : t('Copy CSV')}</span>
            </button>
          )}
          {r.query && (
            <button
              type="button"
              onClick={() => setShowSql((s) => !s)}
              className={cn(
                'inline-flex items-center gap-1 rounded-xs border px-2 py-1 text-[11px] font-semibold transition-colors',
                showSql ? 'border-navy bg-navy text-white' : 'border-line bg-card text-strong hover:bg-soft hover:text-navy'
              )}
            >
              <Code2 size={12} />
              <span>SQL</span>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center text-small text-muted">{t('No data found for that question.')}</div>
      ) : (
        <div className="space-y-4 p-4">
          {/* Quick summary strip */}
          {primaryTotal != null && (
            <div className="grid divide-y divide-line border border-line bg-soft/35 sm:grid-cols-2 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
              <div className="px-4 py-2.5">
                <p className="text-[11px] font-medium text-muted">{t('Total')} · {cols[metricIdx]}</p>
                <p className="num mt-0.5 text-[18px] font-bold text-fg">{fmtNum(primaryTotal, lang)}</p>
              </div>
              <div className="px-4 py-2.5">
                <p className="text-[11px] font-medium text-muted">{t('Top result')}</p>
                <p className="mt-0.5 truncate text-[15px] font-bold text-fg">
                  {String(rows[0][0])}{' '}
                  <span className="num text-small font-semibold text-gold-text">
                    ({typeof rows[0][metricIdx] === 'number' ? fmtNum(rows[0][metricIdx], lang) : String(rows[0][metricIdx])})
                  </span>
                </p>
              </div>
            </div>
          )}

          {/* Chart */}
          {r.chart && (
            <div className="overflow-hidden rounded-md border border-line bg-card">
              {r.chart === 'bar' && <BarCard bare title="" data={chartData} h={220} />}
              {r.chart === 'pie' && <PieCard bare title="" data={chartData} h={220} />}
              {r.chart === 'line' && <LineCard bare title="" data={chartData} xKey="name" area h={220} />}
            </div>
          )}

          {/* Data table */}
          <div className="max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full text-small">
              <thead className="sticky top-0 z-10 bg-soft">
                <tr className="border-b border-line text-caption font-semibold text-strong">
                  {cols.map((c, idx) => (
                    <th key={c} className={cn('px-3.5 py-2.5', idx > 0 ? 'text-end' : 'text-start')}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-card">
                {rows.map((row, i) => (
                  <tr key={i} className="transition-colors hover:bg-soft/50">
                    {row.map((v, j) => (
                      <td
                        key={j}
                        className={cn(
                          'px-3.5 py-2.5',
                          j === 0 ? 'font-medium text-fg' : 'text-end',
                          typeof v === 'number' && 'num font-semibold text-fg'
                        )}
                      >
                        {typeof v === 'number' ? fmtNum(v, lang) : String(v ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {r.note && (
        <p className="flex items-start gap-2 border-t border-line bg-gold-light px-4 py-2 text-[12px] font-medium text-gold-text"><Info size={14} className="mt-0.5 shrink-0" />{r.note}</p>
      )}

      {/* Collapsible SQL code drawer */}
      {showSql && r.query && (
        <div className="border-t border-line bg-navy p-3.5">
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-semibold text-onnavy-muted">
            <span>{t('Executed SQL (read-only)')}</span>
          </div>
          <pre dir="ltr" className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-onnavy-secondary">
            {r.query}
          </pre>
        </div>
      )}
    </div>
  );
}
