/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',     // Creates a self-contained Node.js server in .next/standalone
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
};

export default nextConfig;
