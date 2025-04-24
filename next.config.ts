import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  basePath: '/media-pipe',
  assetPrefix: '/media-pipe',
  output: 'export',
  distDir: 'docs'
};

export default nextConfig;
