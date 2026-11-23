'use client';
import { useState } from 'react';
import { useT } from '@/lib/i18n';
import { dropEvent, flush, retryEvent, useOnline, useQueue } from '@/lib/offline';
import { fmtDateTime } from '@/lib/format';
import { Badge, Button, Card, EmptyState, toast } from '@/components/ui';

export default function SyncPage() {
  const { t, lang } = useT(); const { queue } = useQueue(); const online = useOnline(); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await flush(); toast.success(`${t('Synced')}: ${r.ok}${r.errors ? ` · ${r.errors} ${t('need attention')}` : ''}`); } catch (e: any) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <div className="space-y-3"><div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">{t('Sync queue')}</h1><Button size="sm" loading={busy} disabled={!online || !queue.length} onClick={run}>{t('Sync now')}</Button></div>
      {queue.length === 0 ? <Card><EmptyState icon="cloud-check" title={t('Everything is synced')} /></Card> : queue.map((e) => (
        <Card key={e.clientEventId} className="space-y-2 p-4"><div className="flex items-center justify-between"><b>{e.type}</b><Badge tone={e.status === 'error' ? 'danger' : 'warn'}>{e.status}</Badge></div><p className="text-xs text-muted">{fmtDateTime(e.at, lang)}</p>{e.error && <p className="text-sm text-danger">{e.error}</p>}
          <div className="flex gap-2">{e.status === 'error' && <Button size="sm" variant="secondary" onClick={() => retryEvent(e.clientEventId)}>{t('Retry')}</Button>}<Button size="sm" variant="ghost" className="text-danger" onClick={() => confirm(t('Discard this action? It will not be sent.')) && dropEvent(e.clientEventId)}>{t('Discard')}</Button></div></Card>))}</div>
  );
}
