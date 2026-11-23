'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useT } from '@/lib/i18n';
import { fmtCompact, fmtNum } from '@/lib/format';
import { Card, CardHeader, EmptyState, ErrorState, SkeletonBlock } from '@/components/ui';

// system §1.4: navy primary, gold highlight, navy-light / slate secondary
export const NAVY = '#0B1F3A', GOLD = '#D6A13A', NAVY_LIGHT = '#1D3B5C', SLATE = '#94A3B8', GRID = '#EEF2F6', AXIS = '#64748B';
export const PALETTE = [NAVY, GOLD, NAVY_LIGHT, SLATE, '#C2410C', '#1D4ED8', '#15803D', '#B91C1C'];

function Shell({ title, sub, loading, error, onRetry, empty, h = 280, children, actions, bare }: { bare?: boolean; title: string; sub?: string; loading?: boolean; error?: unknown; onRetry?: () => void; empty?: boolean; h?: number; children: React.ReactNode; actions?: React.ReactNode }) {
  const { t } = useT();
  if (loading) return bare ? <div className="p-6"><div className="skeleton w-full" style={{ height: h }} /></div> : <SkeletonBlock h={`h-[${h + 70}px]`} />;
  const Wrap: any = bare ? "div" : Card;
  return (
    <Wrap className={bare ? "" : "overflow-hidden rounded-2xl border border-line bg-card"}>{!bare && (title || actions) && <CardHeader title={title} sub={sub} actions={actions} />}
      {error ? <ErrorState error={error} onRetry={onRetry} compact /> : empty ? <EmptyState icon="bar-chart-3" title={t('No data for this period')} desc={t('Try a different date range.')} /> : <div style={{ height: h }} className="px-3 pb-3 pt-4 pe-5" dir="ltr">{children}</div>}
    </Wrap>
  );
}
/** Navy tooltip with gold figure (system §1.4) */
const Tip = ({ active, payload, label, lang }: any) => active && payload?.length ? (
  <div className="rounded-sm bg-navy px-3 py-2 text-caption text-white shadow-pop"><p className="mb-0.5 text-onnavy-muted">{label}</p>{payload.map((p: any, i: number) => <p key={i} className="num font-semibold">{payload.length > 1 && <span className="me-2 font-normal text-onnavy-secondary">{p.name}</span>}<span className="text-gold">{fmtNum(p.value, lang)}</span></p>)}</div>
) : null;
const axis = { tick: { fontSize: 11, fill: AXIS }, tickLine: false } as const;

interface P { title: string; sub?: string; data?: any[]; loading?: boolean; error?: unknown; onRetry?: () => void; h?: number; xKey?: string; series?: { key: string; label: string; color?: string }[]; stacked?: boolean; actions?: React.ReactNode; highlightLast?: boolean; bare?: boolean }
export function BarCard({ data = [], xKey = 'name', series = [{ key: 'value', label: 'Value' }], stacked, highlightLast, ...p }: P) {
  const { lang } = useT();
  return <Shell {...p} empty={!data.length}><ResponsiveContainer><BarChart data={data} margin={{ left: 0, right: 8 }}><CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey={xKey} {...axis} interval={0} height={44} angle={-12} textAnchor="end" axisLine={false} /><YAxis {...axis} axisLine={false} width={48} tickFormatter={fmtCompact} /><Tooltip content={<Tip lang={lang} />} cursor={{ fill: '#F1F5F9' }} />{series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
    {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? [NAVY, GOLD, NAVY_LIGHT][i]} radius={[6, 6, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={40}>{i === 0 && series.length === 1 && data.map((_, j) => <Cell key={j} fill={highlightLast !== false && j === data.length - 1 && data.length > 3 ? GOLD : NAVY} />)}</Bar>)}</BarChart></ResponsiveContainer></Shell>;
}
export function LineCard({ data = [], xKey = 'month', series = [{ key: 'value', label: 'Value' }], area, ...p }: P & { area?: boolean }) {
  const { lang } = useT();
  const Chart: any = area ? AreaChart : LineChart; const Ser: any = area ? Area : Line;
  return <Shell {...p} empty={!data.length}><ResponsiveContainer><Chart data={data} margin={{ left: 0, right: 8 }}><defs>{series.map((s, i) => { const c = s.color ?? [NAVY, GOLD, NAVY_LIGHT, SLATE][i % 4]; return <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={c} stopOpacity={0.3} /><stop offset="100%" stopColor={c} stopOpacity={0} /></linearGradient>; })}</defs>
    <CartesianGrid stroke={GRID} vertical={false} /><XAxis dataKey={xKey} {...axis} axisLine={false} /><YAxis {...axis} axisLine={false} width={48} tickFormatter={fmtCompact} /><Tooltip content={<Tip lang={lang} />} />{series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
    {series.map((s, i) => { const c = s.color ?? [NAVY, GOLD, NAVY_LIGHT, SLATE][i % 4]; return <Ser key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={c} fill={area ? `url(#g-${s.key})` : c} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: c }} />; })}</Chart></ResponsiveContainer></Shell>;
}
export function PieCard({ data = [], ...p }: P) {
  const { lang } = useT();
  return <Shell {...p} empty={!data.length || data.every((d) => !d.value)}><ResponsiveContainer><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="84%" paddingAngle={2} stroke="none" label={(e: any) => e.name}>{data.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><Tooltip content={<Tip lang={lang} />} /></PieChart></ResponsiveContainer></Shell>;
}

/** Tiny sparkline for KPI cards (system §5.3) */
export function Sparkline({ data, color = NAVY, h = 38 }: { data: number[]; color?: string; h?: number }) {
  const rows = data.map((v, i) => ({ i, v }));
  return <div style={{ height: h }} dir="ltr" aria-hidden><ResponsiveContainer><AreaChart data={rows} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}><defs><linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.slice(1)})`} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}
/** Half-ring gauge (system §5.8) */
export function Gauge({ value, label, size = 200 }: { value: number; label?: string; size?: number }) {
  const v = Math.max(0, Math.min(100, value)); const r = 78, c = Math.PI * r;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size / 2 + 12 }} dir="ltr" role="img" aria-label={`${Math.round(v)}%`}>
      <svg viewBox="0 0 200 110" width={size} height={size * 0.55}><path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke="#F1F5F9" strokeWidth="16" strokeLinecap="round" /><path d="M 22 100 A 78 78 0 0 1 178 100" fill="none" stroke={GOLD} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} /></svg>
      <div className="absolute inset-x-0 bottom-0 text-center"><p className="num text-kpi leading-none">{Math.round(v)}%</p>{label && <p className="mt-1 text-caption text-muted">{label}</p>}</div>
    </div>
  );
}
