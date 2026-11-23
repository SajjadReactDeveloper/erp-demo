import type { Metadata } from 'next';
import { Shell } from '@/components/erp/shell';

export const metadata: Metadata = { title: 'ERP', robots: { index: false, follow: false } };
export default function AppLayout({ children }: { children: React.ReactNode }) { return <Shell>{children}</Shell>; }
