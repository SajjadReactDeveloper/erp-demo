'use client';
import type { ReactNode } from 'react';
import { Shell } from './shell';

export const PortalShell = ({ kind, children }: { kind: 'customer' | 'supplier'; children: ReactNode }) => <Shell kind={kind}>{children}</Shell>;
