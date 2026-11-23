import type { Metadata } from 'next';
import { LandingPage } from '@/components/erp/landing';

export const metadata: Metadata = {
  title: 'AutocQuick ERP — Auto parts sourcing, delivery and credit in one platform',
  description:
    'AutocQuick ERP: request parts by VIN, compare supplier quotations, protect margins, control credit, deliver with offline signature and issue ZATCA Phase 2 e-invoices.',
  alternates: { canonical: '/' },
};

export default function Landing() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'AutocQuick ERP',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description:
      'ERP for automotive spare-parts trading with AI VIN decoding, supplier RFQ comparison, drop-shipping, credit management, offline delivery proof and ZATCA Phase 2 e-invoicing.',
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\u003c') }}
      />
      <LandingPage />
    </>
  );
}
