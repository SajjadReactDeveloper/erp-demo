const prod = process.env.NODE_ENV === 'production';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4010';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@erp/shared'],
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    const csp = [
      "default-src 'self'", `connect-src 'self' ${api}`, "img-src 'self' data: blob:", "style-src 'self' 'unsafe-inline'",
      `script-src 'self' 'unsafe-inline'${prod ? '' : " 'unsafe-eval'"}`, "font-src 'self' data:", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'",
    ].join('; ');
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'X-Frame-Options', value: 'DENY' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=()' },
        ...(prod ? [{ key: 'Content-Security-Policy', value: csp }, { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }] : []),
      ],
    }];
  },
};
export default nextConfig;
