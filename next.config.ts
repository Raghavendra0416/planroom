import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['mongoose'],
  allowedDevOrigins: ['192.168.10.4'],
};

export default nextConfig;
