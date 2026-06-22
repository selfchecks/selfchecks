/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  transpilePackages: ["@selfchecks/core", "@selfchecks/db"],
};

export default nextConfig;
