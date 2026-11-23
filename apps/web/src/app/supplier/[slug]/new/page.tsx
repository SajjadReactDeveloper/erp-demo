'use client';
import { use } from 'react';
import { useRouter } from 'next/navigation';
import { BY_SLUG } from '@erp/shared';
import { ResourceForm } from '@/components/erp/detail';
import { EmptyState, PageHeader } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function SupplierNew({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { t, rl } = useT(); const { can } = useAuth(); const router = useRouter();
  if (!res || res.portal !== 'supplier' || !can(res, 'create')) return <EmptyState icon="lock" title={t('Page not found')} />;
  return (<><PageHeader title={`${t('New ')}${rl(res)}`} back={() => router.push(`/supplier/${slug}`)} /><ResourceForm res={res} mode="create" onCancel={() => router.push(`/supplier/${slug}`)} onSaved={(row) => router.replace(`/supplier/${slug}/${row.id}`)} /></>);
}
