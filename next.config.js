const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/auth\/.*/i,
      handler: 'NetworkOnly',
    },
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/.*/i,
      handler: 'CacheFirst',
      options: {
        cacheName: 'ff-storage',
        expiration: { maxEntries: 100, maxAgeSeconds: 604800 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
      handler: 'NetworkFirst',
      method: 'GET',
      options: {
        cacheName: 'ff-api',
        networkTimeoutSeconds: 6,
        expiration: { maxEntries: 300, maxAgeSeconds: 86400 },
        cacheableResponse: { statuses: [0, 200] },
      },
    },
    // Offline write queue — replayed automatically on reconnect.
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
      handler: 'NetworkOnly',
      method: 'POST',
      options: { backgroundSync: { name: 'ff-mutations', options: { maxRetentionTime: 1440 } } },
    },
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
      handler: 'NetworkOnly',
      method: 'PATCH',
      options: { backgroundSync: { name: 'ff-mutations', options: { maxRetentionTime: 1440 } } },
    },
    {
      urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
      handler: 'NetworkOnly',
      method: 'DELETE',
      options: { backgroundSync: { name: 'ff-mutations', options: { maxRetentionTime: 1440 } } },
    },
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
      handler: 'CacheFirst',
      options: { cacheName: 'ff-fonts', expiration: { maxEntries: 20, maxAgeSeconds: 31536000 } },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { remotePatterns: [{ protocol: 'https', hostname: '**.supabase.co' }] },
  // Only pull in the recharts submodules a page actually imports, instead of
  // bundling the whole library — recharts has no per-page tree-shaking win
  // without this since its package entrypoint re-exports everything.
  experimental: { optimizePackageImports: ['recharts'] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
