'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useT } from '@/lib/i18n';
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, toast } from '@/components/ui';

export default function ProfilePage() {
  const { t } = useT(); const { me, refresh } = useAuth();
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' }); const [mfa, setMfa] = useState<{ secret: string; otpauthUrl: string } | null>(null); const [code, setCode] = useState('');
  const change = useMutation({ mutationFn: () => api('/api/v1/auth/change-password', { method: 'POST', body: { current: pw.current, next: pw.next } }), onSuccess: () => { toast.success(t('Password changed')); setPw({ current: '', next: '', confirm: '' }); }, onError: (e: any) => toast.error(e.message) });
  const setup = useMutation({ mutationFn: () => api<any>('/api/v1/auth/mfa/setup', { method: 'POST' }), onSuccess: (r) => setMfa(r), onError: (e: any) => toast.error(e.message) });
  const enable = useMutation({ mutationFn: () => api('/api/v1/auth/mfa/enable', { method: 'POST', body: { code } }), onSuccess: async () => { toast.success(t('Two-factor authentication enabled')); setMfa(null); setCode(''); await refresh(); }, onError: (e: any) => toast.error(e.message) });
  const disable = useMutation({ mutationFn: () => api('/api/v1/auth/mfa/disable', { method: 'POST' }), onSuccess: async () => { toast.success(t('Two-factor authentication disabled')); await refresh(); }, onError: (e: any) => toast.error(e.message) });
  const weak = pw.next.length > 0 && pw.next.length < 10; const mismatch = pw.confirm.length > 0 && pw.confirm !== pw.next;
  return (
    <>
      <PageHeader title={t('Profile')} sub={`${me?.name} · ${me?.email} · ${me?.role}`} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card><CardHeader title={t('Change password')} /><form className="space-y-4 p-5" onSubmit={(e) => { e.preventDefault(); change.mutate(); }}>
          <Field label={t('Current password')}><Input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" /></Field>
          <Field label={t('New password')} error={weak ? t('At least 10 characters') : undefined}><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" /></Field>
          <Field label={t('Confirm new password')} error={mismatch ? t('Passwords do not match') : undefined}><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" /></Field>
          <Button type="submit" loading={change.isPending} disabled={!pw.current || weak || mismatch || !pw.next}>{t('Change password')}</Button></form></Card>
        <Card><CardHeader title={t('Two-factor authentication')} actions={<Badge tone={me?.mfaEnabled ? 'success' : 'warn'}>{me?.mfaEnabled ? t('Enabled') : t('Not enabled')}</Badge>} />
          <div className="space-y-4 p-5">
            {['admin', 'finance', 'manager'].includes(me?.role ?? '') && !me?.mfaEnabled && <p className="rounded-xl bg-warn/10 p-3 text-sm text-warn">{t('Two-factor authentication is mandatory for your role. Please enable it.')}</p>}
            {!mfa && !me?.mfaEnabled && <Button loading={setup.isPending} onClick={() => setup.mutate()}>{t('Set up authenticator app')}</Button>}
            {mfa && <div className="space-y-3"><p className="text-sm text-muted">{t('Add this key to Google Authenticator, Microsoft Authenticator or similar, then enter the 6-digit code.')}</p><div className="rounded-xl bg-line/40 p-3"><p className="text-xs text-muted">{t('Secret key')}</p><p className="num break-all text-lg font-bold tracking-wider" dir="ltr">{mfa.secret}</p></div><details className="text-xs text-muted"><summary className="cursor-pointer">otpauth URL</summary><p className="mt-1 break-all" dir="ltr">{mfa.otpauthUrl}</p></details><Field label={t('Verification code')}><Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" dir="ltr" className="text-center tracking-[0.4em]" /></Field><Button loading={enable.isPending} disabled={code.length !== 6} onClick={() => enable.mutate()}>{t('Enable')}</Button></div>}
            {me?.mfaEnabled && !['admin', 'finance', 'manager'].includes(me.role) && <Button variant="secondary" loading={disable.isPending} onClick={() => disable.mutate()}>{t('Disable')}</Button>}
          </div></Card>
      </div>
    </>
  );
}
