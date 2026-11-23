'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { ErrorState, PageHeader, SkeletonCards, Stat } from '@/components/ui';

export default function SupplierHome() {
  const { me } = useAuth(); const { t, lang } = useT();
  const q = useQuery({ queryKey: ['supplier-dash'], queryFn: () => api<any>('/api/v1/portal/supplier/dashboard') }); const d = q.data;
  return (
    <>
      <PageHeader title={`${lang === 'ar' ? 'أهلاً' : 'Hello'}, ${me?.name?.split(' ')[0]}`} sub={t('Supplier portal')} />
      {q.isLoading ? <SkeletonCards n={4} /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : d && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Link href="/supplier/rfqs"><Stat label={t('Open RFQs to quote')} value={d.openRfqs} icon="send" tone={d.openRfqs ? 'warn' : 'primary'} /></Link><Link href="/supplier/purchase-order"><Stat label={t('POs to confirm')} value={d.posToConfirm} icon="shopping-basket" tone={d.posToConfirm ? 'warn' : 'primary'} /></Link><Link href="/supplier/supplier-quote"><Stat label={t('Draft quotes')} value={d.draftQuotes} icon="file-input" /></Link><Stat label={t('Awaiting payment')} value={fmtMoney(d.unpaid, lang)} icon="wallet" /></div>}
    </>
  );
}
