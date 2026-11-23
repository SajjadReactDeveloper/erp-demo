'use client';
import { use } from 'react';
import { BY_SLUG } from '@erp/shared';
import { ResourceList } from '@/components/erp/list';
import { EmptyState, NoAccess } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function ListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { can, ready } = useAuth(); const { t } = useT();
  if (!res) return <EmptyState icon="file-question" title={t('Page not found')} />;
  if (ready && !can(res, 'read')) return <NoAccess />;
  return <ResourceList res={res} />;
}
