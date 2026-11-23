'use client';
import { useId } from 'react';
import { cn } from './index';

/** Architectural brushed-gold & midnight-navy AQ monogram crest. */
export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  const gid = useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={`aq-g-${gid}`} x1="4" y1="2" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F3CD77" />
          <stop offset="52%" stopColor="#D6A13A" />
          <stop offset="100%" stopColor="#B57E20" />
        </linearGradient>
      </defs>
      {/* Chamfered architectural badge */}
      <path d="M8 2 H36 L42 8 V36 L36 42 H8 L2 36 V8 Z" fill={`url(#aq-g-${gid})`} />
      <path d="M9.2 4.2 H34.8 L39.8 9.2 V34.8 L34.8 39.8 H9.2 L4.2 34.8 V9.2 Z" stroke="#0B1F3A" strokeOpacity="0.18" strokeWidth="1" />
      {/* Precision tachometer / Q ring */}
      <path d="M33.2 16.5 A12.5 12.5 0 1 0 32.8 28.4" stroke="#0B1F3A" strokeWidth="2.8" strokeLinecap="square" />
      {/* Precision A apex + integrated Q speed tail */}
      <path d="M15.8 29.8 L22 13.8 L28.2 29.8" stroke="#0B1F3A" strokeWidth="3" strokeLinecap="square" strokeLinejoin="miter" />
      <path d="M18.4 24.4 H26.2 L33.2 32.2" stroke="#0B1F3A" strokeWidth="2.8" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

export function BrandLogo({
  size = 40,
  subtitle = 'ERP PLATFORM',
  dark = true,
  className,
}: {
  size?: number;
  subtitle?: string;
  dark?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <BrandMark size={size} className="drop-shadow-[0_4px_14px_rgba(214,161,58,0.28)]" />
      <span className="min-w-0 leading-tight">
        <span className={cn('block truncate text-[18px] font-extrabold tracking-tight', dark ? 'text-white' : 'text-navy')}>
          Autoc<span className={dark ? 'text-gold' : 'text-gold-text'}>Quick</span>
        </span>
        {subtitle && (
          <span className={cn('block text-[10.5px] font-semibold uppercase tracking-[0.14em]', dark ? 'text-onnavy-muted' : 'text-muted')}>
            {subtitle}
          </span>
        )}
      </span>
    </span>
  );
}
