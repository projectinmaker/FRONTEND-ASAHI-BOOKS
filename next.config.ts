import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true
  },
  reactStrictMode: false,
  allowedDevOrigins: ['192.168.10.10']
};

export default nextConfig;
