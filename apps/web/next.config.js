/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@feedglow/shared', '@feedglow/ui'],
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    // When NEXT_PUBLIC_API_URL is not set, proxy /api/* to the API server.
    // This enables zero-config Docker deployments — no need to know the host IP.
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (apiUrl) return [];
    const apiDest = process.env.API_PROXY_URL || 'http://localhost:3001';
    return [
      {
        source: '/api/:path*',
        destination: `${apiDest}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
