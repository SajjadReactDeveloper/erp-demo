import type { Metadata } from 'next';
import { PublicApplication } from '@/components/erp/public-form';

export const metadata: Metadata = { title: 'Register your company', description: 'Apply for a customer account: request auto parts, receive quotations, track deliveries and pay invoices online.', alternates: { canonical: '/register' } };
export default function Page() { return <PublicApplication kind="customer" />; }
