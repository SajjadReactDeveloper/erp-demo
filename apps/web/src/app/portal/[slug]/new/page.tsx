'use client';
import { use, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BY_SLUG } from '@erp/shared';
import { ResourceForm } from '@/components/erp/detail';
import { EmptyState, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function PortalNew({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { t, rl } = useT(); const { can } = useAuth(); const router = useRouter(); const sp = useSearchParams();
  const initial = useMemo(() => { const o: Record<string, any> = {}; if (res) for (const f of res.fields) { const v = sp.get(f.name); if (v) o[f.name] = v; } return o; }, [res, sp]);
  if (!res || res.portal !== 'customer' || !can(res, 'create')) return <EmptyState icon="lock" title={t('Page not found')} />;
  return (<><PageHeader title={`${t('New')} ${rl(res)}`} back={() => router.push(`/portal/${slug}`)} /><ResourceForm res={res} mode="create" initial={initial} onCancel={() => router.push(`/portal/${slug}`)} onSaved={(row) => router.replace(`/portal/${slug}/${row.id}`)} /></>);
}
