import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AutocQuick Logistics', short_name: 'AQ Logistics', description: 'Receiving, delivery and proof of delivery for warehouse staff and drivers', start_url: '/m', scope: '/', display: 'standalone', orientation: 'portrait',
    background_color: '#f5f7fa', theme_color: '#0f766e', lang: 'ar', dir: 'rtl',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }, { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' }],
  };
}
