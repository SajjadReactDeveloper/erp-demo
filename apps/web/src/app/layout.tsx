import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import { cookies } from 'next/headers';
import { Providers } from '@/components/providers';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-jakarta', display: 'swap' });
const arabic = IBM_Plex_Sans_Arabic({ subsets: ['arabic'], weight: ['400', '500', '600'], variable: '--font-arabic', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['500'], variable: '--font-mono', display: 'swap' });
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'AutocQuick ERP — Auto parts sourcing, delivery and credit in one platform', template: '%s · AutocQuick ERP' },
  description: 'Request, quote, source, deliver and invoice auto spare parts in one place: RFQ comparison, margin control, credit management, ZATCA e-invoicing and live delivery tracking.',
  applicationName: 'AutocQuick ERP', manifest: '/manifest.webmanifest',
  openGraph: { type: 'website', siteName: 'AutocQuick ERP', title: 'AutocQuick ERP', description: 'Auto spare parts sourcing, delivery and credit management.', locale: 'ar_SA', alternateLocale: ['en_US'] },
  twitter: { card: 'summary_large_image', title: 'AutocQuick ERP' },
  alternates: { canonical: '/' },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: '#0B1F3A', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const lang = jar.get('locale')?.value === 'en' ? 'en' : 'ar';
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`${jakarta.variable} ${arabic.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="font-sans"><Providers lang={lang}>{children}</Providers></body>
    </html>
  );
}
