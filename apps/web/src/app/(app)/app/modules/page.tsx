'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { MODULES, RESOURCES } from '@erp/shared';
import { Search } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useAuth } from '@/lib/auth';
import { Badge, Card, EmptyState, Icon, Input, PageHeader, cn } from '@/components/ui';
import { DASH, REPORTS } from '@/components/erp/shell';

/** Directory of every screen, kept out of the sidebar so the daily menu stays short. */
export default function ModulesPage() {
  const { t, lang } = useT(); const { can } = useAuth(); const [q, setQ] = useState('');
  const childKeys = useMemo(() => new Set(RESOURCES.flatMap((r) => r.children.map((c) => c.key))), []);
  const n = q.trim().toLowerCase();
  const hit = (...s: string[]) => !n || s.some((x) => x.toLowerCase().includes(n));
  const groups = [
    { key: 'dash', name: t('Dashboards'), icon: 'layout-dashboard', release: 'R1', items: DASH.map(([k, en, ar]) => ({ href: `/app/dashboards/${k}`, label: lang === 'ar' ? ar : en, all: [en, ar] })) },
    { key: 'rep', name: t('Reports'), icon: 'bar-chart-3', release: 'R1', items: REPORTS.map(([k, en, ar]) => ({ href: `/app/reports/${k}`, label: lang === 'ar' ? ar : en, all: [en, ar] })) },
    ...MODULES.map((m) => ({ key: m.key, name: lang === 'ar' ? m.ar : m.en, icon: m.icon, release: m.release, items: RESOURCES.filter((r) => r.mod === m.key && !r.sys && !childKeys.has(r.key) && can(r, 'read')).map((r) => ({ href: `/app/${r.slug}`, label: lang === 'ar' ? r.arPlural : r.enPlural, all: [r.enPlural, r.arPlural] })) })),
  ].map((g) => ({ ...g, items: g.items.filter((i) => hit(g.name, ...i.all)) })).filter((g) => g.items.length);
  return (
    <>
      <PageHeader title={t('All modules')} sub={t('Every screen in the system, grouped by area.')} />
      <div className="relative mb-5 max-w-md"><Search size={16} className="pointer-events-none absolute start-3.5 top-3.5 text-muted" /><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Search screens...')} className="ps-10" aria-label={t('Search screens...')} autoFocus /></div>
      {groups.length === 0 ? <Card><EmptyState icon="search-x" title={t('No results found')} /></Card> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <Card key={g.key} className="overflow-hidden">
              <div className="flex items-center gap-3 border-b border-line bg-soft/60 px-5 py-3.5"><span className="grid h-8 w-8 place-items-center bg-navy text-gold"><Icon name={g.icon} size={17} /></span><h3 className="flex-1 text-card-title">{g.name}</h3>{g.release !== 'R1' && <Badge tone="muted">{g.release}</Badge>}<span className="num text-caption font-semibold text-muted">{g.items.length}</span></div>
              <ul className="grid gap-px p-2 sm:grid-cols-2">{g.items.map((i) => <li key={i.href}><Link href={i.href} className={cn('block truncate rounded-xs px-3 py-2 text-small font-medium text-strong transition-colors hover:bg-soft hover:text-navy')}>{i.label}</Link></li>)}</ul>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
