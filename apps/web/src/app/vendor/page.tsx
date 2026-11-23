import type { Metadata } from 'next';
import { PublicApplication } from '@/components/erp/public-form';

export const metadata: Metadata = { title: 'Become a supplier', description: 'Apply to supply auto spare parts: receive RFQs, quote online, confirm purchase orders and track payments.', alternates: { canonical: '/vendor' } };
export default function Page() { return <PublicApplication kind="vendor" />; }
