import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongoose'],
  allowedDevOrigins: ['127.0.0.1'],
};

export default nextConfig;
