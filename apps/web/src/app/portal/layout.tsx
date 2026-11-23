import type { Metadata } from 'next';
import { PortalShell } from '@/components/erp/portal-shell';

export const metadata: Metadata = { title: 'Customer portal', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <PortalShell kind="customer">{children}</PortalShell>; }
