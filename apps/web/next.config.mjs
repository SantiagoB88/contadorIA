/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // `@dashgobo/contracts` ships as TS source compiled to dist; transpile it here
  // so Next handles it uniformly with app code.
  transpilePackages: ['@dashgobo/contracts'],
  typedRoutes: true,
};

export default nextConfig;
