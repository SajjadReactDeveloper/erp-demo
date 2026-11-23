'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Skeleton } from '@/components/ui';
import { DashHeader } from '@/components/erp/dash';

type Role = { id: string; name: string; description?: string; permissions: string[]; isSystem: boolean; users: number };
const summarize = (p: string[]) => p.includes('*') ? 'all' : `${p.length}`;

export default function RolesPage() {
  const { t } = useT(); const { can, me } = useAuth(); const router = useRouter();
  const q = useQuery({ queryKey: ['admin-roles'], queryFn: () => api<{ data: Role[] }>('/api/v1/admin/roles') });
  const admin = !!me?.permissions.includes('*'); const canCreate = admin && can({ mod: 'platform', slug: 'role' }, 'create');
  return (
    <div className="space-y-5">
      <DashHeader title={t('Roles & permissions')} sub={t('A role decides what a staff member can see and do. Built-in roles are fixed; duplicate one to customise it.')} actions={canCreate && <Button icon="plus" onClick={() => router.push('/app/roles/new')}>{t('New role')}</Button>} />
      {q.isLoading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2, 3, 4, 5].map((i) => <Card key={i} className="space-y-3 p-5"><Skeleton className="h-10 w-10" /><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-full" /></Card>)}</div>
        : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : q.data!.data.length === 0 ? <Card><EmptyState icon="shield" title={t('No roles yet')} /></Card> : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data!.data.filter((r) => !['customer', 'supplier'].includes(r.name)).map((r) => (
            <Link key={r.id} href={`/app/roles/${r.id}`} className="group block">
              <Card className="flex h-full flex-col p-5 transition-colors group-hover:border-navy/40">
                <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center bg-navy text-gold"><Icon name={r.permissions.includes('*') ? 'crown' : 'shield'} size={21} /></span>{r.isSystem ? <Badge tone="muted">{t('Built-in')}</Badge> : <Badge tone="gold">{t('Custom')}</Badge>}</div>
                <h3 className="mt-4 text-card-title capitalize">{r.name}</h3>
                <p className="mt-1 min-h-[40px] text-small text-muted">{r.description || t('No description')}</p>
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-small"><span className="inline-flex items-center gap-1.5 text-strong"><Icon name="users" size={15} className="text-muted" /><b className="num">{r.users}</b> {t('active users')}</span><span className="text-caption text-muted">{summarize(r.permissions) === 'all' ? t('Full access') : `${summarize(r.permissions)} ${t('rules')}`}</span></div>
              </Card>
            </Link>))}</div>)}
    </div>
  );
}
