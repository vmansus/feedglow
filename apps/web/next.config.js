/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@feedglow/shared', '@feedglow/ui'],
};

module.exports = nextConfig;
