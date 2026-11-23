'use client';
import { use } from 'react';
import { BY_SLUG } from '@erp/shared';
import { ResourceDetail } from '@/components/erp/detail';
import { EmptyState } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function PortalDetail({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = use(params); const res = BY_SLUG[slug]; const { t } = useT();
  if (!res || res.portal !== 'customer') return <EmptyState icon="file-question" title={t('Page not found')} />;
  return <ResourceDetail res={res} id={id} />;
}
