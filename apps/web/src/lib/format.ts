import type { Lang } from './i18n';

const loc = (l: Lang) => (l === 'ar' ? 'ar-SA' : 'en-GB');
export const fmtNum = (n: any, l: Lang = 'en', d = 2) => (n == null || n === '' || isNaN(Number(n)) ? '—' : Number(n).toLocaleString(loc(l) + '-u-nu-latn', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtInt = (n: any, l: Lang = 'en') => fmtNum(n, l, 0);
export const fmtMoney = (n: any, l: Lang = 'en') => (n == null || n === '' ? '—' : `${l === 'ar' ? 'ر.س' : 'SAR'} ${fmtNum(n, l)}`);
export const fmtCompact = (n: any) => { const x = Number(n ?? 0); const a = Math.abs(x); const t = (v: number, d: number) => (d > 0 ? v.toFixed(d).replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1') : v.toFixed(0)); return a >= 1e6 ? t(x / 1e6, 2) + 'M' : a >= 1e4 ? t(x / 1e3, 0) + 'K' : a >= 1e3 ? t(x / 1e3, 1) + 'K' : String(Math.round(x)); };
export const fmtPct = (n: any, l: Lang = 'en') => (n == null || n === '' ? '—' : `${fmtNum(n, l, 1)}%`);
const parse = (d: any) => (d instanceof Date ? d : new Date(d));
export const fmtDate = (d: any, l: Lang = 'en') => (!d || isNaN(parse(d).getTime()) ? '—' : new Intl.DateTimeFormat(loc(l) + '-u-nu-latn', { year: 'numeric', month: 'short', day: '2-digit' }).format(parse(d)));
export const fmtHijri = (d: any, l: Lang = 'ar') => (!d || isNaN(parse(d).getTime()) ? '' : new Intl.DateTimeFormat((l === 'ar' ? 'ar-SA' : 'en-GB') + '-u-ca-islamic-umalqura-nu-latn', { year: 'numeric', month: 'short', day: '2-digit' }).format(parse(d)));
export const fmtDateTime = (d: any, l: Lang = 'en') => (!d || isNaN(parse(d).getTime()) ? '—' : new Intl.DateTimeFormat(loc(l) + '-u-nu-latn', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(parse(d)));
export const timeAgo = (d: any, l: Lang = 'en') => {
  const s = Math.round((Date.now() - parse(d).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat(loc(l), { numeric: 'auto' });
  const a = Math.abs(s);
  if (a < 60) return rtf.format(-s, 'second'); if (a < 3600) return rtf.format(-Math.round(s / 60), 'minute'); if (a < 86400) return rtf.format(-Math.round(s / 3600), 'hour'); return rtf.format(-Math.round(s / 86400), 'day');
};
export const toInputDate = (d: any) => (d ? new Date(d).toISOString().slice(0, 10) : '');
export const toInputDateTime = (d: any) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
export const slugTitle = (s: string) => s.replace(/-/g, ' ');
