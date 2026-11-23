'use client';
import { use } from 'react';
import { BY_SLUG } from '@erp/shared';
import { ResourceDetail } from '@/components/erp/detail';
import { EmptyState, NoAccess } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function DetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = use(params); const res = BY_SLUG[slug]; const { can, ready } = useAuth(); const { t } = useT();
  if (!res) return <EmptyState icon="file-question" title={t('Page not found')} />;
  if (ready && !can(res, 'read')) return <NoAccess />;
  return <ResourceDetail res={res} id={id} />;
}
