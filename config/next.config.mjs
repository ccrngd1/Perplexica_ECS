import pkg from './package.json' with { type: 'json' };

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        hostname: 's2.googleusercontent.com',
      },
    ],
  },
  serverExternalPackages: ['pdf-parse'],
  outputFileTracingIncludes: {
    '/api/**': [
      './node_modules/@napi-rs/canvas/**',
      './node_modules/@napi-rs/canvas-linux-x64-gnu/**',
      './node_modules/@napi-rs/canvas-linux-x64-musl/**',
    ],
  },
  env: {
    NEXT_PUBLIC_VERSION: pkg.version,
  },

  // Enable source maps for production builds to get full error traces
  productionBrowserSourceMaps: true,

  // Enable detailed error traces for server-side code
  webpack: (config, { dev, isServer }) => {
    // Use source-map for full error traces in production
    if (!dev && isServer) {
      config.devtool = 'source-map';
    }

    return config;
  },
};

export default nextConfig;
