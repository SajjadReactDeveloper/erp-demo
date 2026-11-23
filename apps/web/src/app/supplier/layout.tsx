import type { Metadata } from 'next';
import { PortalShell } from '@/components/erp/portal-shell';

export const metadata: Metadata = { title: 'Supplier portal', robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) { return <PortalShell kind="supplier">{children}</PortalShell>; }
