'use client';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

/** Executive 12-month composed chart: slender Navy/Gold columns + smooth brushed-gold trend + dashed average line. */
export function SalesOverviewChart({
  data = [],
  loading,
  h = 265,
  avgLabel,
}: {
  data?: { name: string; value: number }[];
  loading?: boolean;
  h?: number;
  avgLabel?: string;
}) {
  const { lang, t } = useT();
  const avg = data.length ? data.reduce((s, d) => s + Number(d.value ?? 0), 0) / data.length : 0;
  return (
    <Shell bare title="" loading={loading} empty={!data.length} h={h}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 14, left: 0, right: 10, bottom: 2 }}>
          <defs>
            <linearGradient id="so-navy" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4A74A8" />
              <stop offset="100%" stopColor="#264C7D" />
            </linearGradient>
            <linearGradient id="so-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F3CD77" />
              <stop offset="100%" stopColor="#D6A13A" />
            </linearGradient>
            <linearGradient id="so-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.14} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0.0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" {...axis} interval={0} height={26} axisLine={false} />
          <YAxis {...axis} axisLine={false} width={44} tickFormatter={fmtCompact} />
          <Tooltip
            content={<Tip lang={lang} />}
            cursor={{ fill: '#0B1F3A', opacity: 0.045 }}
          />
          {avg > 0 && (
            <ReferenceLine
              y={avg}
              stroke="#94A3B8"
              strokeDasharray="4 4"
              strokeWidth={1}
              label={{
                value: `${avgLabel ?? t('Avg')} ${fmtCompact(avg)}`,
                position: 'insideTopRight',
                fill: AXIS,
                fontSize: 10.5,
                fontWeight: 600,
              }}
            />
          )}
          <Area
            type="monotone"
            dataKey="value"
            stroke={GOLD}
            strokeWidth={1.75}
            strokeOpacity={0.7}
            fill="url(#so-area)"
            dot={false}
            activeDot={{ r: 4, fill: GOLD, stroke: '#FFFFFF', strokeWidth: 2 }}
            tooltipType="none"
          />
          <Bar dataKey="value" name={t('Value')} radius={[3, 3, 0, 0]} maxBarSize={22}>
            {data.map((_, j) => (
              <Cell
                key={j}
                fill={j === data.length - 1 && data.length > 3 ? 'url(#so-gold)' : 'url(#so-navy)'}
              />
            ))}
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/** Crisp architectural micro-bar sparkline for KPI cards (replaces wavy monotone area blobs). */
export function Sparkline({
  data,
  color = NAVY,
  h = 34,
  labels,
  target,
  format,
  dark,
}: {
  data: number[];
  color?: string;
  h?: number;
  labels?: string[];
  target?: number;
  format?: (v: number) => string;
  dark?: boolean;
}) {
  const vals = data.length ? data : [0];
  const hi = Math.max(...vals, target ?? 0, 1);
  const peakIdx = vals.reduce((bi, v, i) => (v > vals[bi] ? i : bi), 0);
  const lastIdx = vals.length - 1;
  const targetPct = target != null && hi > 0 ? Math.max(4, Math.min(96, (target / hi) * 100)) : null;

  return (
    <div
      className={`relative flex w-full items-end gap-[4px] border-b pb-[2px] ${dark ? 'border-white/15' : 'border-line/70'}`}
      style={{ height: h }}
      dir="ltr"
    >
      {targetPct != null && (
        <div
          className={`pointer-events-none absolute inset-x-0 border-t border-dashed ${dark ? 'border-white/25' : 'border-navy/25'}`}
          style={{ bottom: `calc(${targetPct}% + 2px)` }}
          aria-hidden
        />
      )}
      {vals.map((v, i) => {
        const pct = v > 0 ? Math.max(16, Math.round((v / hi) * 100)) : 0;
        const isLast = i === lastIdx;
        const isPeak = i === peakIdx && v > 0;
        const tip = `${labels?.[i] ? `${labels[i]}: ` : ''}${format ? format(v) : fmtCompact(v)}`;
        return (
          <div key={i} title={tip} className="group/bar relative flex h-full flex-1 items-end">
            <span
              className="block w-full rounded-t-[1.5px] transition-opacity duration-150 group-hover/bar:opacity-100"
              style={{
                height: v > 0 ? `${pct}%` : '2px',
                backgroundColor: color,
                opacity: v <= 0 ? (dark ? 0.18 : 0.14) : isLast ? 1 : isPeak ? (dark ? 0.72 : 0.55) : dark ? 0.36 : 0.24,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** Precision horizontal benchmark bar with subtle target notch and two-sided caption. */
export function KpiMeter({
  value,
  target,
  max,
  color,
  left,
  right,
  rightTone = 'muted',
}: {
  value: number;
  target: number;
  max: number;
  color: string;
  left: React.ReactNode;
  right: React.ReactNode;
  rightTone?: 'success' | 'danger' | 'warn' | 'muted';
}) {
  const safeMax = Math.max(max, target, value, 1);
  const valPct = Math.max(2, Math.min(100, (value / safeMax) * 100));
  const targetPct = Math.max(4, Math.min(96, (target / safeMax) * 100));
  const toneCls =
    rightTone === 'success'
      ? 'text-success font-semibold'
      : rightTone === 'danger'
        ? 'text-danger font-semibold'
        : rightTone === 'warn'
          ? 'text-warn font-semibold'
          : 'text-strong font-medium';

  return (
    <div className="space-y-2">
      <div className="relative flex h-3.5 items-center" dir="ltr">
        <div className="relative h-1.5 w-full overflow-hidden rounded-xs bg-soft">
          <div
            className="relative h-full rounded-xs transition-all duration-300"
            style={{ width: `${valPct}%`, backgroundColor: color }}
          />
        </div>
        <span
          className="pointer-events-none absolute top-0.5 h-2.5 w-[1.5px] -translate-x-1/2 rounded-xs bg-navy/75 ring-1 ring-white"
          style={{ left: `${targetPct}%` }}
          aria-hidden
        />
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
        <span className="num truncate text-muted">{left}</span>
        <span className={`num shrink-0 ${toneCls}`}>{right}</span>
      </div>
    </div>
  );
}

/** Clean segmented breakdown bar with calm two-sided footer caption. */
export function KpiSplitBar({
  segments,
  left,
  right,
  rightTone = 'muted',
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  left: React.ReactNode;
  right: React.ReactNode;
  rightTone?: 'success' | 'danger' | 'warn' | 'muted';
}) {
  const total = segments.reduce((s, x) => s + Math.max(0, x.value), 0);
  const active = segments.filter((x) => x.value > 0);
  const toneCls =
    rightTone === 'success'
      ? 'text-success font-semibold'
      : rightTone === 'danger'
        ? 'text-danger font-semibold'
        : rightTone === 'warn'
          ? 'text-warn font-semibold'
          : 'text-strong font-medium';

  return (
    <div className="space-y-2">
      <div className="flex h-3.5 items-center">
        <div className="flex h-1.5 w-full gap-[2px] overflow-hidden rounded-xs bg-soft" dir="ltr" role="img" aria-label="Distribution">
          {total > 0 ? (
            active.map((x) => (
              <div
                key={x.key}
                title={`${x.label}: ${Math.round((x.value / total) * 100)}%`}
                style={{ width: `${(x.value / total) * 100}%`, backgroundColor: x.color }}
                className="h-full min-w-[3px] first:rounded-s-xs last:rounded-e-xs"
              />
            ))
          ) : (
            <div className="h-full w-full bg-success/30" />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
        <span className="num truncate text-muted">{left}</span>
        <span className={`num shrink-0 ${toneCls}`}>{right}</span>
      </div>
    </div>
  );
}
/** Half-ring gauge (system §5.8), with luminous dark Midnight Navy variant. */
export function Gauge({ value, label, size = 200, marker, showBounds, dark }: { value: number; label?: string; size?: number; marker?: number; showBounds?: boolean; dark?: boolean }) {
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
          <linearGradient id={dark ? 'gauge-gold-dark' : 'gauge-gold'} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#F6D88C" />
            <stop offset="100%" stopColor={GOLD} />
          </linearGradient>
        </defs>
        <path
          d="M 42 102 A 68 68 0 0 1 178 102"
          fill="none"
          stroke={dark ? 'rgba(255,255,255,0.14)' : '#E2E8F0'}
          strokeWidth="1.25"
          strokeDasharray="2 5"
        />
        <path
          d="M 28 102 A 82 82 0 0 1 192 102"
          fill="none"
          stroke={dark ? 'rgba(255,255,255,0.11)' : GRID}
          strokeWidth="14"
          strokeLinecap="round"
        />
        {v > 0 && (
          <path
            d="M 28 102 A 82 82 0 0 1 192 102"
            fill="none"
            stroke={dark ? 'url(#gauge-gold-dark)' : 'url(#gauge-gold)'}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0.015, v / 100) * c} ${c}`}
            style={dark ? { filter: 'drop-shadow(0 0 8px rgba(214,161,58,0.45))' } : undefined}
          />
        )}
        {m != null && (
          <line
            x1={cx + 71 * Math.cos(rad)}
            y1={cy - 71 * Math.sin(rad)}
            x2={cx + 93 * Math.cos(rad)}
            y2={cy - 93 * Math.sin(rad)}
            stroke={dark ? '#FFFFFF' : NAVY}
            strokeWidth="2"
            strokeLinecap="round"
            opacity={dark ? '0.65' : '0.45'}
          />
        )}
        {showBounds && (
          <>
            <text x="28" y="122" textAnchor="middle" fill={dark ? '#9FB0C8' : SLATE} fontSize="10" fontWeight="500">0%</text>
            <text x="192" y="122" textAnchor="middle" fill={dark ? '#9FB0C8' : SLATE} fontSize="10" fontWeight="500">100%</text>
          </>
        )}
      </svg>
      <div className={showBounds ? 'absolute inset-x-0 bottom-4 text-center' : 'absolute inset-x-0 bottom-0.5 text-center'}>
        <p className={`num text-[32px] font-bold leading-none tracking-tight ${dark ? 'text-white' : 'text-fg'}`}>{pctText}%</p>
        {label && <p className={`num mt-1.5 text-caption font-medium ${dark ? 'text-onnavy-muted' : 'text-muted'}`}>{label}</p>}
      </div>
    </div>
  );
}
