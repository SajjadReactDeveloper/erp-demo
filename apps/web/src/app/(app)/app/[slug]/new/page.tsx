'use client';
import { use, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BY_SLUG } from '@erp/shared';
import { ResourceForm } from '@/components/erp/detail';
import { EmptyState, NoAccess, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function NewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { can, ready } = useAuth(); const { t, rl } = useT(); const router = useRouter(); const sp = useSearchParams();
  const initial = useMemo(() => { const o: Record<string, any> = {}; if (res) for (const f of res.fields) { const v = sp.get(f.name); if (v) o[f.name] = f.type === 'int' ? Number(v) : v; } return o; }, [res, sp]);
  if (!res) return <EmptyState icon="file-question" title={t('Page not found')} />;
  if (ready && (!can(res, 'create') || res.sys || res.immutable)) return <NoAccess />;
  return (
    <>
      <PageHeader title={`${t('New')} ${rl(res)}`} back={() => router.push(`/app/${slug}`)} />
      <ResourceForm res={res} mode="create" initial={initial} onCancel={() => router.push(`/app/${slug}`)} onSaved={(row) => router.replace(`/app/${slug}/${row.id}`)} />
    </>
  );
}
