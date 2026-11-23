'use client';
import { use, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { BY_SLUG } from '@erp/shared';
import { ResourceList } from '@/components/erp/list';
import { Button, EmptyState, toast } from '@/components/ui';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';

export default function SupplierList({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params); const res = BY_SLUG[slug]; const { t } = useT(); const qc = useQueryClient(); const file = useRef<HTMLInputElement>(null);
  if (!res || res.portal !== 'supplier') return <EmptyState icon="file-question" title={t('Page not found')} />;
  const upload = async (f: File) => { try { const fd = new FormData(); fd.append('file', f); const r = await api<any>('/api/v1/portal/supplier/catalogue/import', { method: 'POST', form: fd }); r.status === 'failed' ? toast.error(`${r.message} (${r.errors[0]?.message ?? ''})`) : toast.success(r.message); qc.invalidateQueries({ queryKey: ['list', 'catalogue-item'] }); } catch (e: any) { toast.error(e.message); } finally { if (file.current) file.current.value = ''; } };
  return <ResourceList res={res} actionsExtra={slug === 'catalogue-item' ? <><input ref={file} type="file" hidden accept=".csv" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /><Button variant="secondary" icon="upload" onClick={() => file.current?.click()}>{t('Upload price list (CSV)')}</Button></> : undefined} />;
}
