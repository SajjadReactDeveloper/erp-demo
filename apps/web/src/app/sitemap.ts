import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export default function sitemap(): MetadataRoute.Sitemap {
  return ['/', '/login', '/register', '/vendor'].map((p) => ({ url: `${SITE}${p}`, lastModified: new Date(), changeFrequency: 'monthly', priority: p === '/' ? 1 : 0.6 }));
}
