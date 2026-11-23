'use client';
import { use } from 'react';
import { BY_SLUG } from '@erp/shared';
import { ResourceList } from '@/components/erp/list';
import { EmptyState } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function PortalList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { t } = useT();
  if (!res || res.portal !== 'customer') return <EmptyState icon="file-question" title={t('Page not found')} />;
  return <ResourceList res={res} hideStatusChips={false} />;
}
