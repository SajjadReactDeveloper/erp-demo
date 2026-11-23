'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Card, EmptyState, ErrorState, Select, SkeletonCards } from '@/components/ui';
import { DashHeader } from '@/components/erp/dash';
import { VehicleDashboard } from '@/components/erp/extras';
import { ResourceList } from '@/components/erp/list';
import { BY_KEY } from '@erp/shared';

export default function PortalVehicles() {
  const { t } = useT(); const { me } = useAuth(); const [v, setV] = useState('all');
  const list = useQuery({ queryKey: ['my-vehicles'], queryFn: () => api<{ data: any[] }>('/api/v1/r/vehicle', { query: { limit: 100 } }) });
  if (list.isLoading) return <SkeletonCards n={3} />; if (list.isError) return <ErrorState error={list.error} onRetry={() => list.refetch()} />;
  return (
    <div className="space-y-5">
      <DashHeader title={t('Vehicles & expenses')} sub={t('Spend, maintenance history and upcoming service needs per vehicle or for the whole fleet.')} actions={list.data!.data.length > 1 ? <Select value={v} onChange={(e) => setV(e.target.value)} className="w-56"><option value="all">{t('Whole fleet')}</option>{list.data!.data.map((x) => <option key={x.id} value={x.id}>{x.make} {x.model} · {x.plate ?? x.vin}</option>)}</Select> : undefined} />
      {list.data!.data.length === 0 ? <Card><EmptyState icon="car" title={t('No vehicles yet')} desc={t('Add a vehicle by creating a parts request with its VIN.')} /></Card> : <><VehicleDashboard url={v === 'all' ? `/api/v1/customers/${me?.customerId}/vehicle-dashboard` : `/api/v1/vehicles/${v}/dashboard`} /><ResourceList res={BY_KEY.Vehicle} embedded limit={10} /></>}
    </div>
  );
}
