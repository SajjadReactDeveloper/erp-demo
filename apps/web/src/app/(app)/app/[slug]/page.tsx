'use client';
import { use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BY_SLUG } from '@erp/shared';
import { ResourceList } from '@/components/erp/list';
import { EmptyState, NoAccess } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';

export default function ListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const router = useRouter();
  // the raw settings table is edited on the Settings console, not through the generic list
  const REDIRECT: Record<string, string> = { setting: '/app/settings', user: '/app/users', role: '/app/roles' };
  useEffect(() => { if (REDIRECT[slug]) router.replace(REDIRECT[slug]); }, [slug, router]); const { can, ready } = useAuth(); const { t } = useT();
  if (REDIRECT[slug]) return null;
  if (!res) return <EmptyState icon="file-question" title={t('Page not found')} />;
  if (ready && !can(res, 'read')) return <NoAccess />;
  return <ResourceList res={res} />;
}
