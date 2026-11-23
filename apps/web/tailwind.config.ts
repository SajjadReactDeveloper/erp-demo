import type { Config } from 'tailwindcss';

const v = (n: string) => `hsl(var(--${n}) / <alpha-value>)`;
// Navy & Gold design system (see docs/DESIGN_SYSTEM.md). Legacy token names (bg, card, fg, muted, line, primary…) are remapped to it.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: v('navy'), hover: v('navy-hover'), light: v('navy-light') },
        gold: { DEFAULT: v('gold'), hover: v('gold-hover'), light: v('gold-light'), text: v('gold-text'), border: v('gold-border') },
        onnavy: { DEFAULT: '#FFFFFF', secondary: '#C5D0DF', muted: '#9FB0C8', subtle: '#8CA0BD' },
        bg: v('bg'), card: v('surface'), soft: v('surface-muted'), fg: v('text'), muted: v('text-secondary'), strong: v('text-strong'), line: v('border'), grid: v('gridline'),
        primary: v('navy'), 'primary-fg': '#FFFFFF',
        success: { DEFAULT: v('success'), bg: v('success-bg') }, positive: '#4ADE80', warn: { DEFAULT: v('warning'), bg: v('warning-bg') }, danger: { DEFAULT: v('error'), bg: v('error-bg') }, info: { DEFAULT: v('info'), bg: v('info-bg') },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'var(--font-arabic)', 'system-ui', 'sans-serif'],
        arabic: ['var(--font-arabic)', 'var(--font-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        display: ['40px', { lineHeight: '46px', letterSpacing: '-0.03em', fontWeight: '700' }],
        'page-title': ['24px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '700' }],
        kpi: ['24px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '600' }],
        metric: ['19px', { lineHeight: '26px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'card-title': ['17px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '700' }],
        body: ['14px', { lineHeight: '22px' }], small: ['13px', { lineHeight: '20px' }], caption: ['12px', { lineHeight: '16px' }],
        overline: ['11px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      borderRadius: { xs: '2px', sm: '2px', md: '3px', lg: '4px', xl: '4px', '2xl': '6px' },
      boxShadow: { soft: 'none', card: '0 1px 2px rgba(11,31,58,.04), 0 1px 1px rgba(11,31,58,.02)', seg: '0 1px 3px rgba(11,31,58,.12)', pop: '0 12px 32px rgba(11,31,58,.14), 0 2px 6px rgba(11,31,58,.08)', '2xl': '0 12px 32px rgba(11,31,58,.14), 0 2px 6px rgba(11,31,58,.08)' },
      width: { sidebar: '264px', rail: '76px' }, maxWidth: { content: '1340px' },
      keyframes: { shimmer: { '100%': { transform: 'translateX(100%)' } }, in: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'none' } } },
      animation: { in: 'in .25s ease-out' },
    },
  },
  plugins: [],
};
export default config;
