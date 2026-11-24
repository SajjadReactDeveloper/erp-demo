'use client';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { Badge, Card, Icon, Skeleton, Star, cn } from '@/components/ui';

/** Shared dashboard kit: staff, customer and supplier homes all render with these so they look identical. */

export const Ar = ({ children }: { children: ReactNode }) => <bdi lang="ar" dir="rtl" className="font-arabic">{children}</bdi>;

export function DashHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0"><h1 className="text-page-title">{title}</h1>{sub && <p className="mt-0.5 text-small text-muted">{sub}</p>}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TILE = { primary: 'bg-gold-light text-gold-text', danger: 'bg-soft text-navy', success: 'bg-soft text-navy', warn: 'bg-soft text-navy', info: 'bg-soft text-navy' };

export function Kpi({ loading, icon, tone = 'primary', label, sub, value, chip, spark, href, featured }: { loading?: boolean; icon: string; tone?: keyof typeof TILE; label: string; sub?: ReactNode; value?: ReactNode; chip?: ReactNode; spark?: ReactNode; href?: string; featured?: boolean }) {
  if (loading) return <Card className="h-full min-h-[192px] space-y-4 p-5"><div className="flex items-center gap-3"><Skeleton className="h-9 w-9" /><Skeleton className="h-3 w-24" /></div><Skeleton className="h-8 w-28" /><Skeleton className="h-7 w-full" /></Card>;
  const inner = (
    <Card
      className={cn(
        'group relative flex h-full min-h-[192px] flex-col overflow-hidden transition-all duration-200 animate-in',
        href && 'cursor-pointer',
        featured
          ? 'border-navy bg-gradient-to-br from-[#0F2A4F] via-[#0B1F3A] to-[#08162B] text-white shadow-[0_12px_28px_rgba(11,31,58,0.18)] before:absolute before:inset-x-0 before:top-0 before:h-[2px] before:bg-gradient-to-r before:from-gold before:via-[#F3CD77] before:to-gold/20 hover:shadow-[0_16px_34px_rgba(11,31,58,0.24)]'
          : 'border-line/90 bg-card shadow-[0_1px_2px_rgba(11,31,58,0.03)] hover:border-gold-border hover:shadow-[0_12px_26px_rgba(11,31,58,0.07)]'
      )}
    >
      {featured && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_92%_10%,rgba(214,161,58,0.2),transparent_55%)]" aria-hidden />}
      <div className="relative flex flex-1 flex-col p-5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-sm transition-colors',
                featured ? 'border border-gold/25 bg-gold/15 text-gold' : cn(TILE[tone], 'group-hover:bg-gold-light group-hover:text-gold-text')
              )}
            >
              <Icon name={icon} size={16} />
            </span>
            <div className="min-w-0">
              <p className={cn('truncate text-[13.5px] font-bold leading-tight', featured ? 'text-white' : 'text-fg')}>{label}</p>
              {sub && <p className={cn('mt-0.5 truncate text-[11px] leading-tight', featured ? 'text-onnavy-muted' : 'text-muted')}>{sub}</p>}
            </div>
          </div>
          {href && (
            <ArrowUpRight
              size={15}
              className={cn(
                'shrink-0 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-scale-x-100',
                featured ? 'text-onnavy-muted group-hover:text-gold' : 'text-muted/45 group-hover:text-navy'
              )}
            />
          )}
        </div>
        <div className="mt-4 flex items-baseline justify-between gap-2">
          <p className={cn('num text-[27px] font-bold leading-none tracking-[-0.025em]', featured ? 'text-white' : 'text-navy')}>{value ?? '—'}</p>
          {chip}
        </div>
      </div>
      {spark && (
        <div className={cn('relative mt-auto border-t px-5 py-3', featured ? 'border-white/10 bg-white/[0.03]' : 'border-line/70 bg-soft/35')}>
          {spark}
        </div>
      )}
    </Card>
  );
  return href ? <Link href={href} className="block h-full">{inner}</Link> : inner;
}

/** The big navy card at the start of every home. `aside` is an optional chart pinned to the right half. */
export function Hero({ loading, icon, label, value, delta, stats, children, aside }: { loading?: boolean; icon: string; label: ReactNode; value: ReactNode; delta?: ReactNode; stats?: [ReactNode, ReactNode][]; children?: ReactNode; aside?: ReactNode }) {
  return (
    <Card className="relative flex h-full min-h-[176px] flex-col overflow-hidden border-navy bg-gradient-to-br from-[#0F294D] via-[#0B1F3A] to-[#08172E] p-5 text-white shadow-[0_8px_24px_rgba(11,31,58,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_88%_14%,rgba(214,161,58,0.18),transparent_52%)]" aria-hidden />
      <Star className="pointer-events-none absolute -end-8 -top-12 text-gold opacity-[0.07]" size={170} />
      <div className="relative flex items-center justify-between gap-2"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-md border border-gold/20 bg-navy-light/90 text-gold"><Icon name={icon} size={18} /></span><p className="text-small font-medium text-onnavy-secondary">{label}</p></div>{delta}</div>
      {loading ? <Skeleton className="mt-4 h-9 w-48 !bg-navy-light" /> : <p className="relative mt-4 text-[34px] font-semibold leading-10 tracking-tight">{value}</p>}
      {stats && <div className="relative mt-auto grid grid-cols-3 gap-3 border-t border-white/10 pt-3.5 md:max-w-[60%]">{stats.map(([l, v], i) => <div key={i}><p className="text-[11px] font-medium text-onnavy-muted">{l}</p><p className="num mt-0.5 truncate text-small font-semibold">{v}</p></div>)}</div>}
      {children && <div className="relative mt-auto pt-3">{children}</div>}
      {aside && <div className="relative mt-3 h-16 md:absolute md:bottom-0 md:end-0 md:mt-0 md:h-[58%] md:w-[40%]">{aside}</div>}
    </Card>
  );
}

export const Chip = ({ tone, children }: { tone: 'success' | 'warn' | 'danger' | 'info' | 'gold' | 'muted'; children: ReactNode }) => <Badge tone={tone}>{children}</Badge>;

/** Column grids used by every home. */
export const ROW1 = 'grid gap-4 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr] [&>*]:min-w-0 md:[&>:first-child]:col-span-2 xl:[&>:first-child]:col-span-1';
export const ROW2 = 'grid gap-4 xl:grid-cols-[2fr_1fr] [&>*]:min-w-0';
export const th = 'px-4 py-2.5 text-start';

/** Record header used by the hand-built portal pages: same look as the generic detail header. */
export function DocHeader({ onBack, icon, kicker, title, badge, sub, actions, facts }: { onBack?: () => void; icon: string; kicker?: ReactNode; title: ReactNode; badge?: ReactNode; sub?: ReactNode; actions?: ReactNode; facts?: { label: ReactNode; value: ReactNode }[] }) {
  const { dir } = useT(); const B = dir === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-start gap-4">
          {onBack && <button onClick={onBack} aria-label="Back" className="mt-1 grid h-9 w-9 shrink-0 place-items-center border border-line text-muted transition-colors hover:bg-soft hover:text-fg"><B size={16} /></button>}
          <span className="grid h-12 w-12 shrink-0 place-items-center bg-navy text-gold"><Icon name={icon} size={24} /></span>
          <div className="min-w-0">{kicker && <p className="overline text-muted">{kicker}</p>}
            <div className="mt-0.5 flex flex-wrap items-center gap-3"><h1 className="truncate text-page-title">{title}</h1>{badge}</div>
            {sub && <p className="mt-1 text-small text-muted">{sub}</p>}</div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {facts && facts.length > 0 && <dl className="grid border-t border-line bg-soft/40 sm:grid-cols-2 lg:grid-cols-4">{facts.map((f, i) => <div key={i} className="min-w-0 border-e border-line px-5 py-3.5 last:border-e-0"><dt className="text-caption font-medium text-muted">{f.label}</dt><dd className="num mt-1 truncate text-[15px] font-semibold">{f.value}</dd></div>)}</dl>}
    </Card>
  );
}

const BANNER = { warn: 'border-warn/30 bg-warn-bg text-warn', danger: 'border-danger/30 bg-danger-bg text-danger', info: 'border-info/30 bg-info-bg text-info', gold: 'border-gold-border bg-gold-light text-gold-text' };
export const Banner = ({ tone = 'gold', icon = 'info', children }: { tone?: keyof typeof BANNER; icon?: string; children: ReactNode }) => <div role="alert" className={cn('flex items-start gap-3 border px-5 py-3.5 text-small font-medium', BANNER[tone])}><Icon name={icon} size={18} className="mt-0.5 shrink-0" /><div className="min-w-0">{children}</div></div>;

/** Titled card wrapper for tables and lists. */
export function Panel({ title, icon, actions, children }: { title: ReactNode; icon?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-line bg-soft/60 px-5 py-3">{icon && <span className="grid h-7 w-7 place-items-center bg-gold-light text-gold-text"><Icon name={icon} size={15} /></span>}<h3 className="text-small font-bold">{title}</h3><div className="ms-auto flex items-center gap-2">{actions}</div></div>
      {children}
    </Card>
  );
}
/** Table cell classes so every portal table lines up the same way. */
export const TH = 'px-4 py-2.5 text-start text-caption font-semibold text-strong';
export const TD = 'px-4 py-3.5';
