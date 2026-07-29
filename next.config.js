/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable React Strict Mode
  reactStrictMode: true,

  // Enable TypeScript type checking in development
  typescript: {
    ignoreBuildErrors: false,
  },

  // Enable ESLint in development
  eslint: {
    ignoreDuringBuilds: false,
  },

  // API routes configuration
  experimental: {
    // Enable server actions (for future use)
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },

  // Headers for security
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      // Example: redirect old API versions
      // {
      //   source: '/api/v0/:path*',
      //   destination: '/api/v1/:path*',
      //   permanent: true,
      // },
    ];
  },

  // Environment variables exposed to the browser
  env: {
    // These will be available as process.env.NEXT_PUBLIC_*
  },

  // Webpack configuration
  webpack: (config, { isServer }) => {
    // Add custom webpack rules if needed
    
    // Ensure node modules are properly resolved
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        // Add any required polyfills here
      };
    }

    return config;
  },

  // Image optimization
  images: {
    remotePatterns: [
      // Add allowed image domains here
      // {
      //   protocol: 'https',
      //   hostname: '*.example.com',
      // },
    ],
    // Disable image optimization for now (can be enabled later)
    unoptimized: true,
  },
};

module.exports = nextConfig;