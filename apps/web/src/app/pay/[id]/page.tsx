'use client';
import { Suspense, use, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, CreditCard, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { fmtMoney } from '@/lib/format';
import { Button, Card, Field, Input, Spinner } from '@/components/ui';

// Development stand-in for the payment gateway's hosted checkout (Mada / card). Replaced by the real provider URL in production.
function Checkout({ id }: { id: string }) {
  const { t, lang } = useT(); const sp = useSearchParams(); const invoice = sp.get('invoice'); const amount = Number(sp.get('amount') ?? 0);
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(false); const [err, setErr] = useState<string>();
  const pay = async (e: React.FormEvent) => { e.preventDefault(); setBusy(true); setErr(undefined); try { await api(`/api/v1/public/fake-gateway/${id}/complete`, { method: 'POST', auth: false, body: { invoiceId: invoice, amount } }); setDone(true); } catch (x: any) { setErr(x.message); } finally { setBusy(false); } };
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center p-5">
      <Card className="space-y-5 p-6">
        {done ? <div className="grid place-items-center gap-3 py-6 text-center"><CheckCircle2 size={56} className="text-success" /><h1 className="text-2xl font-extrabold">{t('Payment received')}</h1><p className="text-sm text-muted">{t('Your receipt was issued and the invoice updated.')}</p><Link href="/portal/invoices"><Button>{t('Back to invoices')}</Button></Link></div> : (
          <form onSubmit={pay} className="space-y-4"><div className="flex items-center gap-2 text-primary"><CreditCard /><b>{t('Secure payment')}</b><span className="ms-auto rounded bg-warn/15 px-2 py-0.5 text-[10px] font-bold text-warn">TEST MODE</span></div>
            <div className="rounded-xl bg-line/40 p-4 text-center"><p className="text-xs text-muted">{t('Amount to pay')}</p><p className="num text-3xl font-extrabold">{fmtMoney(amount, lang)}</p></div>
            <Field label={t('Card number')}><Input defaultValue="4111 1111 1111 1111" inputMode="numeric" dir="ltr" /></Field><div className="grid grid-cols-2 gap-3"><Field label={t('Expiry')}><Input defaultValue="12/30" dir="ltr" /></Field><Field label="CVV"><Input defaultValue="123" dir="ltr" /></Field></div>
            {err && <p role="alert" className="rounded-xl bg-danger/10 p-3 text-sm text-danger">{err}</p>}
            <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!invoice || !amount}><Lock size={16} />{t('Pay')} {fmtMoney(amount, lang)}</Button></form>)}
      </Card>
    </main>
  );
}
export default function PayPage({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense fallback={<div className="grid min-h-screen place-items-center"><Spinner className="h-8 w-8" /></div>}><Checkout id={id} /></Suspense>; }
