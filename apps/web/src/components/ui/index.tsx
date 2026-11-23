'use client';
import { Children, forwardRef, isValidElement, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { icons, Loader2, AlertTriangle, X, Check, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight, type LucideIcon } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useT } from '@/lib/i18n';

export const cn = clsx;
export { toast };
export const AppToaster = () => { const { dir } = useT(); return <Toaster position={dir === 'rtl' ? 'bottom-left' : 'bottom-right'} richColors closeButton dir={dir} toastOptions={{ duration: 4500, style: { borderRadius: 12, fontFamily: 'inherit' } }} />; };

const ALIAS: Record<string, string> = { 'alert-triangle': 'triangle-alert', 'bar-chart-3': 'chart-column', 'check-circle': 'circle-check', 'check-circle-2': 'circle-check', 'cloud-check': 'cloud-upload', 'file-bar-chart': 'file-chart-column', 'line-chart': 'chart-line', 'x-circle': 'circle-x' };
export function Icon({ name, className, size = 18 }: { name?: string; className?: string; size?: number }) {
  const key = (ALIAS[name ?? ''] ?? name ?? 'circle').split('-').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  const C = ((icons as Record<string, LucideIcon>)[key] ?? icons.Circle) as LucideIcon;
  return <C size={size} strokeWidth={1.8} className={className} aria-hidden />;
}

/** Eight-point star outline: decorative motif used at low opacity on featured surfaces. */
export const Star = ({ className, size = 160 }: { className?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="1.2" className={className} aria-hidden><rect x="22" y="22" width="56" height="56" /><rect x="22" y="22" width="56" height="56" transform="rotate(45 50 50)" /><circle cx="50" cy="50" r="14" /></svg>
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'soft'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: string };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(({ variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...p }, ref) => (
  <button ref={ref} disabled={disabled || loading} aria-busy={loading || undefined}
    className={cn('inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap border font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'h-8 rounded-xs px-3 text-[13px]' : size === 'lg' ? 'h-12 rounded-sm px-6 text-[15px]' : 'h-10 rounded-sm px-4 text-sm',
      variant === 'primary' && 'border-navy bg-navy text-white hover:bg-navy-hover', variant === 'accent' && 'border-gold bg-gold text-navy hover:bg-gold-hover',
      variant === 'secondary' && 'border-line bg-card text-fg hover:bg-soft', variant === 'ghost' && 'border-transparent bg-transparent text-navy hover:bg-soft',
      variant === 'danger' && 'border-danger bg-danger text-white hover:brightness-90', variant === 'soft' && 'border-transparent bg-soft text-navy hover:bg-line', className)} {...p}>
    {loading ? <Loader2 size={16} className="animate-spin" /> : icon ? <Icon name={icon} size={16} /> : null}
    {children}
  </button>
));
Button.displayName = 'Button';

export function Field({ label, error, hint, required, children, className }: { label?: string; error?: string; hint?: string; required?: boolean; children: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <label htmlFor={id} className="block text-small font-semibold text-fg">{label}{required && <span className="text-danger"> *</span>}</label>}
      <div id={id}>{children}</div>
      {error ? <p role="alert" className="flex items-center gap-1 text-caption text-danger"><AlertTriangle size={12} />{error}</p> : hint ? <p className="text-caption text-muted">{hint}</p> : null}
    </div>
  );
}
const ctl = 'w-full rounded-md border border-line bg-soft px-3 text-body text-fg transition placeholder:text-muted/80 hover:border-muted/40 focus:border-navy focus:bg-card disabled:cursor-not-allowed disabled:opacity-60';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => <input ref={ref} className={cn(ctl, 'h-[42px]', invalid && 'border-danger bg-danger-bg/40', className)} {...p} />);
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...p }, ref) => <textarea ref={ref} rows={3} className={cn(ctl, 'py-2.5', invalid && 'border-danger bg-danger-bg/40', className)} {...p} />);
Textarea.displayName = 'Textarea';
type SelectOpt = { value: string; label: string; disabled?: boolean };
function optText(n: ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(optText).join('');
  if (isValidElement<{ children?: ReactNode }>(n)) return optText(n.props.children);
  return '';
}
function extractOpts(children: ReactNode): SelectOpt[] {
  const out: SelectOpt[] = [];
  const walk = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return;
      const props = child.props as Record<string, any>;
      if (child.type === 'option') {
        const label = optText(props.children);
        const value = props.value !== undefined ? String(props.value) : label;
        out.push({ value, label, disabled: !!props.disabled });
      } else if (props?.children) {
        walk(props.children);
      }
    });
  };
  walk(children);
  return out;
}

export const Select = forwardRef<HTMLButtonElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(
  ({ className, invalid, children, value, defaultValue, onChange, disabled, name, id, 'aria-label': ariaLabel, 'aria-labelledby': ariaLabelledBy, title }, ref) => {
    const { dir } = useT();
    const listId = useId();
    const opts = useMemo(() => extractOpts(children), [children]);
    const controlled = value !== undefined;
    const [inner, setInner] = useState<string>(() => (defaultValue !== undefined ? String(defaultValue) : opts[0]?.value ?? ''));
    const current = controlled ? String(value ?? '') : inner;
    const selected = opts.find((o) => o.value === current) ?? opts[0];

    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(-1);
    const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number }>({ top: 0, left: 0, minWidth: 120, maxHeight: 256 });
    const btnRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const typeBuf = useRef({ s: '', t: 0 });

    const setRefs = useCallback(
      (el: HTMLButtonElement | null) => {
        btnRef.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = el;
      },
      [ref]
    );

    const place = useCallback(() => {
      const el = btnRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const gap = 4;
      const est = Math.min(264, opts.length * 36 + 10);
      const below = window.innerHeight - r.bottom - 8;
      const above = r.top - 8;
      const up = below < est && above > below;
      const minWidth = Math.min(Math.max(r.width, 96), window.innerWidth - 16);
      const left = Math.min(Math.max(8, dir === 'rtl' ? r.right - minWidth : r.left), window.innerWidth - minWidth - 8);
      setPos({
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
        left,
        minWidth,
        maxHeight: Math.max(120, Math.min(264, (up ? above : below) - gap)),
      });
    }, [opts.length, dir]);

    useLayoutEffect(() => {
      if (!open) return;
      place();
      const onResize = () => place();
      const onScroll = (e: Event) => {
        if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) return;
        setOpen(false);
      };
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onScroll, true);
      return () => {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll, true);
      };
    }, [open, place]);

    useEffect(() => {
      if (!open) return;
      const onDown = (e: MouseEvent) => {
        const t = e.target as Node;
        if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
        setOpen(false);
      };
      document.addEventListener('mousedown', onDown);
      return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    useEffect(() => {
      if (!open || hi < 0) return;
      menuRef.current?.querySelector<HTMLElement>(`[data-idx="${hi}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [open, hi]);

    const choose = (opt: SelectOpt) => {
      if (opt.disabled) return;
      if (!controlled) setInner(opt.value);
      onChange?.({ target: { value: opt.value, name: name ?? '' }, currentTarget: { value: opt.value, name: name ?? '' } } as any);
      setOpen(false);
      btnRef.current?.focus();
    };

    const nextIdx = (from: number, step: 1 | -1) => {
      for (let i = from + step; i >= 0 && i < opts.length; i += step) if (!opts[i].disabled) return i;
      return from;
    };

    const openMenu = (fallback?: 'first' | 'last') => {
      if (disabled || !opts.length) return;
      const curIdx = opts.findIndex((o) => o.value === current && !o.disabled);
      const start = curIdx >= 0 ? curIdx : fallback === 'last' ? nextIdx(opts.length, -1) : nextIdx(-1, 1);
      setHi(start);
      setOpen(true);
    };

    const onKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) openMenu('first');
        else setHi((i) => nextIdx(i < 0 ? -1 : i, 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (!open) openMenu('last');
        else setHi((i) => nextIdx(i < 0 ? opts.length : i, -1));
      } else if (e.key === 'Home' && open) {
        e.preventDefault();
        setHi(nextIdx(-1, 1));
      } else if (e.key === 'End' && open) {
        e.preventDefault();
        setHi(nextIdx(opts.length, -1));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!open) openMenu('first');
        else if (hi >= 0 && opts[hi]) choose(opts[hi]);
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'Tab' && open) {
        setOpen(false);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        const s = now - typeBuf.current.t < 500 ? typeBuf.current.s + e.key.toLowerCase() : e.key.toLowerCase();
        typeBuf.current = { s, t: now };
        const hit = opts.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(s));
        if (hit >= 0) {
          if (open) setHi(hit);
          else choose(opts[hit]);
        }
      }
    };

    const hasW = /\b!?w-/.test(className ?? '');
    const hasH = /\b!?h-/.test(className ?? '');
    const display = selected?.label?.trim() ? selected.label : '—';

    return (
      <>
        {name && <input type="hidden" name={name} value={current} />}
        <button
          ref={setRefs}
          id={id}
          type="button"
          role="combobox"
          dir={dir}
          disabled={disabled}
          title={title}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid || undefined}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          className={cn(
            'inline-flex items-center justify-between gap-2 rounded-md border border-line bg-soft px-3 text-body text-fg transition hover:border-muted/40 disabled:cursor-not-allowed disabled:opacity-60',
            !hasW && 'w-full',
            !hasH && 'h-[42px]',
            open && 'border-navy bg-card',
            invalid && 'border-danger bg-danger-bg/40',
            className
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate text-start', !selected?.label?.trim() && 'text-muted')}>{display}</span>
          <ChevronDown size={15} className={cn('shrink-0 text-muted transition-transform duration-150', open && 'rotate-180 text-navy')} aria-hidden />
        </button>
        {open &&
          typeof document !== 'undefined' &&
          createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              dir={dir}
              style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.minWidth, maxWidth: 'calc(100vw - 16px)' }}
              className="z-[90] overflow-hidden rounded-md border border-line bg-card p-1 shadow-pop"
            >
              <div className="overflow-y-auto" style={{ maxHeight: pos.maxHeight }}>
                {opts.map((o, i) => {
                  const isSel = o.value === current;
                  const isHi = i === hi;
                  return (
                    <button
                      key={`${o.value}-${i}`}
                      type="button"
                      role="option"
                      data-idx={i}
                      disabled={o.disabled}
                      aria-selected={isSel}
                      onMouseEnter={() => !o.disabled && setHi(i)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => choose(o)}
                      className={cn(
                        'flex w-full items-center justify-between gap-3 rounded-sm px-2.5 py-2 text-start text-small transition-colors',
                        isSel ? 'bg-navy/[0.07] font-semibold text-navy' : isHi ? 'bg-soft text-fg' : 'text-fg hover:bg-soft',
                        o.disabled && 'cursor-not-allowed opacity-45'
                      )}
                    >
                      <span className={cn('min-w-0 flex-1 truncate', !o.label.trim() && 'text-muted')}>{o.label.trim() || '—'}</span>
                      {isSel && <Check size={14} className="shrink-0 text-gold-text" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body
          )}
      </>
    );
  }
);
Select.displayName = 'Select';
export const Checkbox = ({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) => (
  <label className="inline-flex cursor-pointer select-none items-center gap-2 text-body"><input type="checkbox" className="h-4 w-4 rounded border-line accent-[hsl(var(--navy))]" {...p} />{label}</label>
);

export const Card = ({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => <div className={cn('rounded-2xl border border-line bg-card shadow-card', className)} {...p}>{children}</div>;
export const CardHeader = ({ title, actions, sub }: { title: ReactNode; actions?: ReactNode; sub?: ReactNode }) => (
  <div className="flex flex-wrap items-start justify-between gap-3 px-6 pb-1 pt-5"><div className="min-w-0"><h3 className="text-card-title text-fg">{title}</h3>{sub && <p className="mt-0.5 text-small text-muted">{sub}</p>}</div>{actions}</div>
);

// chips: status colours carry meaning only (system §1.2)
const TONES: Record<string, string> = {
  success: 'bg-success-bg text-success', warn: 'bg-warn-bg text-warn', danger: 'bg-danger-bg text-danger', info: 'bg-info-bg text-info', muted: 'bg-soft text-strong', primary: 'bg-navy text-white', gold: 'bg-gold-light text-gold-text',
};
const S = (s: string) => s.split(',');
const TONE_MAP: [string, string[]][] = [
  ['success', S('paid,cleared,reported,approved,approved_full,approved_internal,confirmed,delivered,completed,active,posted,accepted,accepted_warnings,matched,kept,released,received,ok,resolved,done,production,clean,customer,approved_partial,credited,reconciled')],
  ['warn', S('pending,pending_margin_approval,pending_approval,pending_zatca,viewed,partially_delivered,partially_received,partially_paid,partial,on_hold,under_review,awaiting_approval,collecting,in_progress,escalated,variance,captured_review,counting,review,compliance,upcoming,partially_approved,requested,suggested,warning')],
  ['danger', S('rejected,failed,cancelled,blocked,expired,overdue,bounced,broken,error,dead,revoked,voided,lost,critical,infected,suspended,wrong_item,refunded,no_response,declined,rolled_back,held')],
  ['info', S('in_sourcing,quoted,assigned,out_for_delivery,in_transit,picked_up,checked_in,inspection,invited,retry,info,simulation,sandbox,validated,reconciling,ordered,billed,sent,submitted,open,booked')],
  ['primary', S('invoiced')],
  ['muted', S('draft,closed,inactive,unmatched,none,paused,merged,dismissed,ack,no_show,planned,read')],
];
export const toneOf = (v?: string) => TONE_MAP.find(([, l]) => l.includes(String(v)))?.[0] ?? 'muted';
export function Badge({ children, tone = 'muted', className, dot }: { children: ReactNode; tone?: string; className?: string; dot?: boolean }) {
  return <span className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-xs px-2.5 text-caption font-semibold', TONES[tone] ?? TONES.muted, className)}>{dot && <span className={cn('h-1.5 w-1.5 rounded-full', tone === 'primary' ? 'bg-gold' : 'bg-current')} />}{children}</span>;
}
export function StatusBadge({ value }: { value?: string | null }) { const { el } = useT(); if (!value) return null; return <Badge tone={toneOf(value)} dot>{el(value)}</Badge>; }

export const Skeleton = ({ className }: { className?: string }) => <div className={cn('skeleton h-4', className)} aria-hidden />;
export const SkeletonRows = ({ rows = 8, cols = 5 }: { rows?: number; cols?: number }) => (
  <div role="status" aria-label="Loading" className="divide-y divide-line">{Array.from({ length: rows }).map((_, i) => <div key={i} className="flex items-center gap-4 px-6 py-3.5">{Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className={cn('h-4', j === 0 ? 'w-28' : 'flex-1')} />)}</div>)}</div>
);
export const SkeletonCards = ({ n = 4 }: { n?: number }) => <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: n }).map((_, i) => <Card key={i} className="space-y-3 p-[22px]"><Skeleton className="h-11 w-11 rounded-md" /><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-32" /></Card>)}</div>;
export const SkeletonBlock = ({ h = 'h-64' }: { h?: string }) => <Card className={cn('p-6', h)}><Skeleton className="mb-4 h-5 w-40" /><Skeleton className="h-[80%] w-full" /></Card>;
export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cn('animate-spin text-navy', className)} aria-label="Loading" />;

export function EmptyState({ icon = 'inbox', title, desc, action }: { icon?: string; title: string; desc?: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center animate-in"><div className="grid h-14 w-14 place-items-center rounded-lg bg-gold-light text-gold-text"><Icon name={icon} size={26} /></div><h3 className="text-card-title">{title}</h3>{desc && <p className="max-w-sm text-small text-muted">{desc}</p>}{action}</div>;
}
export function ErrorState({ error, onRetry, compact }: { error?: unknown; onRetry?: () => void; compact?: boolean }) {
  const { t } = useT(); const msg = (error as any)?.message;
  return <div role="alert" className={cn('flex flex-col items-center justify-center gap-3 text-center', compact ? 'p-6' : 'px-6 py-14')}><div className="grid h-12 w-12 place-items-center rounded-lg bg-danger-bg text-danger"><AlertTriangle size={24} /></div><h3 className="font-bold">{t('Could not load data')}</h3>{msg && <p className="max-w-md text-small text-muted">{msg}</p>}{onRetry && <Button variant="secondary" size="sm" icon="refresh-cw" onClick={onRetry}>{t('Retry')}</Button>}</div>;
}
export const NoAccess = () => { const { t } = useT(); return <EmptyState icon="lock" title={t('You do not have access to this page')} desc={t('Ask an administrator to grant you the required permission.')} />; };

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 50);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-navy/50 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} className={cn('relative flex max-h-[90vh] w-full flex-col rounded-2xl border border-line bg-card shadow-pop animate-in', wide ? 'max-w-3xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between px-6 pb-3 pt-5"><h2 className="text-card-title">{title}</h2><button onClick={onClose} className="rounded-xs p-1.5 text-muted hover:bg-soft" aria-label="Close"><X size={18} /></button></div>
        <div className="overflow-y-auto px-6 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
      </div>
    </div>
  );
}
export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger, loading, confirmText }: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; message?: string; danger?: boolean; loading?: boolean; confirmText?: string }) {
  const { t } = useT();
  return <Modal open={open} onClose={onClose} title={title} footer={<><Button variant="secondary" onClick={onClose} disabled={loading}>{t('Cancel')}</Button><Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>{confirmText ?? t('Confirm')}</Button></>}><p className="text-body text-muted">{message ?? t('Are you sure?')}</p></Modal>;
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number; icon?: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {tabs.map((t) => { const on = value === t.key; return (
        <button key={t.key} role="tab" aria-selected={on} onClick={() => onChange(t.key)} className={cn('group relative flex h-12 shrink-0 items-center gap-2 whitespace-nowrap px-4 text-small font-semibold transition-colors', on ? 'text-navy' : 'text-muted hover:bg-soft hover:text-fg')}>
          {t.icon && <Icon name={t.icon} size={17} className={cn('transition-colors', on ? 'text-gold' : 'text-muted/70 group-hover:text-fg')} />}
          {t.label}
          {t.count != null && <span className={cn('num grid h-5 min-w-5 place-items-center px-1.5 text-[11px] font-bold leading-none', on ? 'bg-navy text-white' : 'bg-soft text-strong')}>{t.count}</span>}
          <span className={cn('absolute inset-x-0 -bottom-px h-[3px] bg-gold transition-opacity', on ? 'opacity-100' : 'opacity-0')} />
        </button>); })}
    </div>
  );
}

/** Segmented control (system §5.7) */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: { key: T; label: string }[]; value: T; onChange: (k: T) => void; label?: string }) {
  return <div role="radiogroup" aria-label={label} className="inline-flex rounded-sm bg-soft p-1">{options.map((o) => <button key={o.key} role="radio" aria-checked={value === o.key} onClick={() => onChange(o.key)} className={cn('h-[30px] rounded-xs px-3 text-small font-semibold transition', value === o.key ? 'bg-card text-navy shadow-seg' : 'text-strong hover:text-fg')}>{o.label}</button>)}</div>;
}

export function Pagination({ page, pages, total, limit, onPage, onLimit }: { page: number; pages: number; total: number; limit: number; onPage: (p: number) => void; onLimit?: (n: number) => void }) {
  const { t, dir } = useT(); const Prev = dir === 'rtl' ? ChevronRight : ChevronLeft; const Next = dir === 'rtl' ? ChevronLeft : ChevronRight;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3 text-small">
      <div className="num text-muted">{total ? `${(page - 1) * limit + 1}–${Math.min(page * limit, total)} ${t('of')} ${total} ${t('results')}` : `0 ${t('results')}`}</div>
      <div className="flex items-center gap-2">
        {onLimit && <Select aria-label={t('Rows per page')} value={limit} onChange={(e) => onLimit(Number(e.target.value))} className="!h-8 w-[76px] rounded-xs text-caption">{[10, 25, 50, 100].map((n) => <option key={n}>{n}</option>)}</Select>}
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('Previous')}><Prev size={16} /></Button>
        <span className="num min-w-14 text-center text-caption font-semibold">{page} / {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label={t('Next')}><Next size={16} /></Button>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions, back, badge }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; back?: () => void; badge?: ReactNode }) {
  const { dir, t } = useT(); const B = dir === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {back && <Button variant="secondary" onClick={back} aria-label={t('Back')} className="w-10 !px-0"><B size={16} /></Button>}
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2.5"><h1 className="truncate text-page-title">{title}</h1>{badge}</div>{sub && <p className="mt-0.5 text-small text-muted">{sub}</p>}</div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TILE: Record<string, string> = { primary: 'bg-gold-light text-gold-text', success: 'bg-success-bg text-success', danger: 'bg-danger-bg text-danger', warn: 'bg-warn-bg text-warn', info: 'bg-info-bg text-info' };
/** KPI card (system §5.3): 44px icon tile on a soft background, label, value, optional sub / chip. */
export function Stat({ label, value, sub, icon, loading, tone, chip }: { label: string; value?: ReactNode; sub?: ReactNode; icon?: string; loading?: boolean; tone?: 'success' | 'danger' | 'warn' | 'primary' | 'info'; chip?: ReactNode }) {
  if (loading) return <Card className="space-y-3 p-[22px]"><Skeleton className="h-11 w-11 rounded-md" /><Skeleton className="h-3 w-20" /><Skeleton className="h-7 w-32" /></Card>;
  return (
    <Card className="p-[22px] animate-in">
      <div className="flex items-start justify-between">{icon && <span className={cn('grid h-11 w-11 place-items-center rounded-md', TILE[tone ?? 'primary'])}><Icon name={icon} size={22} /></span>}{chip}</div>
      <p className="mt-4 text-small text-muted">{label}</p><p className="num text-kpi">{value ?? '—'}</p>{sub && <p className="mt-0.5 text-caption text-muted">{sub}</p>}
    </Card>
  );
}
export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="rounded-xs border border-line bg-card px-1.5 py-0.5 text-[10px] font-semibold text-muted">{children}</kbd>;
function avatarInitials(name?: string) {
  const clean = (name ?? '').replace(/\s*\([^)]*\)/g, '').trim();
  const letters = clean.split(/\s+/).map((w) => w.match(/[\p{L}\p{N}]/u)?.[0] ?? '').filter(Boolean);
  return letters.length ? letters.slice(0, 2).join('').toUpperCase() : '?';
}
export const Avatar = ({ name, size = 30, dark }: { name?: string; size?: number; dark?: boolean }) => <span style={{ width: size, height: size }} className={cn('grid shrink-0 select-none place-items-center rounded-full font-bold leading-none', size <= 24 ? 'text-[10px]' : 'text-caption', dark ? 'bg-gold-light text-gold-text' : 'bg-soft text-navy')}>{avatarInitials(name)}</span>;
/** Progress bar (system §5.8) */
export const Progress = ({ value, tone = 'gold', className }: { value: number; tone?: 'gold' | 'navy'; className?: string }) => <div role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100} className={cn('h-1.5 overflow-hidden rounded-xs bg-soft', className)}><div className={cn('h-full rounded-xs', tone === 'gold' ? 'bg-gold' : 'bg-navy')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
