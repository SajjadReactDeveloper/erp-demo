'use client';
import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LocaleProvider, type Lang } from '@/lib/i18n';
import { AuthProvider } from '@/lib/auth';
import { AppToaster } from '@/components/ui';
import { ApiError } from '@/lib/api';

export function Providers({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 20_000, refetchOnWindowFocus: false, retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2 }, mutations: { retry: false } } }));
  return (
    <QueryClientProvider client={qc}><LocaleProvider initial={lang}><AuthProvider>{children}<AppToaster /></AuthProvider></LocaleProvider></QueryClientProvider>
  );
}
