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
  const shortLabels = data.length > 0 && data.every((d) => String(d[xKey] ?? '').length <= 6);
  return <Shell {...p} empty={!data.length}><ResponsiveContainer><BarChart data={data} margin={{ left: 0, right: 8 }}><defs><linearGradient id="bar-navy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#183A66" /><stop offset="100%" stopColor={NAVY} /></linearGradient><linearGradient id="bar-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E9C063" /><stop offset="100%" stopColor="#C48F29" /></linearGradient></defs><CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} /><XAxis dataKey={xKey} {...axis} interval={0} height={shortLabels ? 28 : 44} angle={shortLabels ? 0 : -12} textAnchor={shortLabels ? 'middle' : 'end'} axisLine={false} /><YAxis {...axis} axisLine={false} width={48} tickFormatter={fmtCompact} /><Tooltip content={<Tip lang={lang} />} cursor={{ fill: '#F1F5F9', opacity: 0.7 }} />{series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />}
    {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color ?? [NAVY, GOLD, NAVY_LIGHT][i]} radius={[3, 3, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={36}>{i === 0 && series.length === 1 && data.map((_, j) => <Cell key={j} fill={highlightLast !== false && j === data.length - 1 && data.length > 3 ? 'url(#bar-gold)' : 'url(#bar-navy)'} />)}</Bar>)}</BarChart></ResponsiveContainer></Shell>;
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
  const rows = data.map((v, i) => ({ i, v })); const lo = Math.min(...data, 0), hi = Math.max(...data, 1), pad = (hi - lo) * 0.1; // pad the domain so a flat run at the minimum isn't clipped by the chart edge
  return <div style={{ height: h }} dir="ltr" aria-hidden><ResponsiveContainer><AreaChart data={rows} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}><defs><linearGradient id={`sp-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.25} /><stop offset="100%" stopColor={color} stopOpacity={0} /></linearGradient></defs><YAxis hide domain={[lo - pad, hi + pad]} /><Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#sp-${color.slice(1)})`} dot={false} isAnimationActive={false} /></AreaChart></ResponsiveContainer></div>;
}
/** Half-ring gauge (system §5.8) */
export function Gauge({ value, label, size = 200, marker, showBounds }: { value: number; label?: string; size?: number; marker?: number; showBounds?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  const r = 82, cx = 110, cy = 102, c = Math.PI * r;
  const pctText = v > 0 && v < 10 ? v.toFixed(1) : String(Math.round(v));
  const m = marker != null ? Math.max(0, Math.min(100, marker)) : null;
  const rad = m != null ? Math.PI * (1 - m / 100) : 0;
  const h = Math.round(size * (showBounds ? 0.58 : 0.55));
  return (
    <div className="relative mx-auto" style={{ width: size, height: h }} dir="ltr" role="img" aria-label={`${pctText}%`}>
      <svg viewBox={showBounds ? '0 0 220 128' : '0 0 220 116'} width={size} height={h} className="overflow-visible">
        <defs>
          <linearGradient id="gauge-gold" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#E4B85B" />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
        </defs>
        <path d="M 42 102 A 68 68 0 0 1 178 102" fill="none" stroke="#E2E8F0" strokeWidth="1.25" strokeDasharray="2 5" />
        <path d="M 28 102 A 82 82 0 0 1 192 102" fill="none" stroke={GRID} strokeWidth="14" strokeLinecap="round" />
        {v > 0 && (
          <path d="M 28 102 A 82 82 0 0 1 192 102" fill="none" stroke="url(#gauge-gold)" strokeWidth="14" strokeLinecap="round" strokeDasharray={`${Math.max(0.01, v / 100) * c} ${c}`} />
        )}
        {m != null && (
          <line x1={cx + 71 * Math.cos(rad)} y1={cy - 71 * Math.sin(rad)} x2={cx + 93 * Math.cos(rad)} y2={cy - 93 * Math.sin(rad)} stroke={NAVY} strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        )}
        {showBounds && (
          <>
            <text x="28" y="122" textAnchor="middle" fill={SLATE} fontSize="10" fontWeight="500">0%</text>
            <text x="192" y="122" textAnchor="middle" fill={SLATE} fontSize="10" fontWeight="500">100%</text>
          </>
        )}
      </svg>
      <div className={showBounds ? 'absolute inset-x-0 bottom-4 text-center' : 'absolute inset-x-0 bottom-0.5 text-center'}>
        <p className="num text-[30px] font-bold leading-none tracking-tight text-fg">{pctText}%</p>
        {label && <p className="num mt-1.5 text-caption font-medium text-muted">{label}</p>}
      </div>
    </div>
  );
}
