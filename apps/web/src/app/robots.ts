import type { MetadataRoute } from 'next';

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/', '/login', '/register', '/vendor'], disallow: ['/app', '/portal', '/supplier', '/m', '/pay', '/api'] }], sitemap: `${SITE}/sitemap.xml`, host: SITE };
}
